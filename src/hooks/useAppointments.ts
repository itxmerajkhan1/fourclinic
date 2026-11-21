import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ALLOWED_STATUS_TRANSITIONS,
  expectedLockId,
  generateAvailableSlotsForDoctor,
  getCoveredLockIds,
  getCoveredTimes,
  sanitizeId,
  validateBookingInput,
} from '../lib/validation';
import type {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  ClinicSettings,
  Doctor,
  ScheduleOverride,
  ServiceItem,
  SlotLock,
} from '../types/clinic';

export interface CreateAppointmentInput {
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  serviceId: string;
  doctorId: string;
  date: string;
  time: string;
  notes: string;
  source: AppointmentSource;
  initialStatus?: 'pending' | 'confirmed';
}

export function useAppointments() {
  const { user, profile, role, authReady } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setAppointments([]);
      setLoading(false);
      return;
    }

    let q;
    if (role === 'admin' || role === 'receptionist') {
      q = query(collection(db, 'appointments'));
    } else if (role === 'doctor' && profile?.doctorId) {
      q = query(
        collection(db, 'appointments'),
        where('doctorId', '==', profile.doctorId)
      );
    } else {
      q = query(
        collection(db, 'appointments'),
        where('patientUid', '==', user.uid)
      );
    }

    setLoading(true);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Appointment)
          .sort((a, b) => {
            const dCmp = a.date.localeCompare(b.date);
            return dCmp !== 0 ? dCmp : a.time.localeCompare(b.time);
          });
        setAppointments(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'appointments');
      }
    );

    return () => unsub();
  }, [authReady, user, role, profile?.doctorId]);

  async function bookAppointment(
    input: CreateAppointmentInput,
    doctors: Doctor[],
    services: ServiceItem[],
    settings: ClinicSettings,
    catalogSeeded: boolean,
    schedules: ScheduleOverride[] = [],
    slotLocks: SlotLock[] = []
  ): Promise<Appointment> {
    if (!user) {
      throw new Error('Please sign in with Google to confirm your appointment request.');
    }
    if (!catalogSeeded) {
      throw new Error(
        'Clinic catalog is not initialized in Firestore yet. Sign in as Admin to initialize doctors & services.'
      );
    }

    const validationError = validateBookingInput({
      patientName: input.patientName,
      patientPhone: input.patientPhone,
      date: input.date,
      time: input.time,
      notes: input.notes,
      maxDaysAhead: settings.maxBookingDaysAhead,
      minLeadTimeMins: settings.minLeadTimeMins,
    });
    if (validationError) {
      throw new Error(validationError);
    }

    const doctor = doctors.find((d) => d.id === input.doctorId && d.active);
    const service = services.find((s) => s.id === input.serviceId && s.active);
    if (!doctor) throw new Error('Selected dentist is unavailable.');
    if (!service) throw new Error('Selected dental service is unavailable.');

    const openSlots = generateAvailableSlotsForDoctor({
      dateStr: input.date,
      doctor,
      schedules,
      slotLocks,
      settings,
      serviceDurationMins: service.durationMins,
    });
    if (!openSlots.includes(input.time)) {
      throw new Error(
        'Selected time is unavailable for the full visit duration (closed hours, lunch break, holiday, or overlapping booking). Please choose another open slot.'
      );
    }

    const coveredTimes = getCoveredTimes(
      input.time,
      service.durationMins,
      settings.slotDurationMins
    );
    const coveredLockIds = getCoveredLockIds(
      doctor.id,
      input.date,
      input.time,
      service.durationMins,
      settings.slotDurationMins
    );

    const apptId = `appt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const refCode = `FC-${Math.floor(1000 + Math.random() * 9000)}`;
    const isStaffCreator = role === 'admin' || role === 'receptionist';
    const targetStatus: AppointmentStatus =
      isStaffCreator && input.initialStatus === 'confirmed' ? 'confirmed' : 'pending';

    const apptRef = doc(db, 'appointments', apptId);
    const lockRefs = coveredLockIds.map((id) => doc(db, 'slotLocks', id));
    const patientDocId = isStaffCreator
      ? sanitizeId(`pt_${input.patientPhone.replace(/\D/g, '') || apptId}`)
      : user.uid;
    const patientRef = doc(db, 'patients', patientDocId);
    const auditId = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const auditRef = doc(db, 'auditLogs', auditId);

    const apptData: Omit<Appointment, 'createdAt' | 'updatedAt'> = {
      id: apptId,
      referenceCode: refCode,
      patientUid: user.uid,
      patientName: input.patientName.trim(),
      patientPhone: input.patientPhone.trim(),
      ...(input.patientEmail || user.email
        ? { patientEmail: (input.patientEmail || user.email || '').slice(0, 160) }
        : {}),
      serviceId: service.id,
      serviceName: service.name,
      doctorId: doctor.id,
      doctorName: doctor.name,
      date: input.date,
      time: input.time,
      durationMins: service.durationMins,
      estimatedValue: service.basePrice,
      status: targetStatus,
      source: input.source,
      notes: input.notes.trim(),
      staffNotes: '',
      slotLockId: coveredLockIds[0],
      slotLockIds: coveredLockIds,
      isSample: false,
    };

    try {
      await runTransaction(db, async (tx) => {
        // Read all covered slotLocks + patient record BEFORE writes
        const lockSnaps = await Promise.all(lockRefs.map((ref) => tx.get(ref)));
        if (lockSnaps.some((snap) => snap.exists())) {
          throw new Error(
            'That doctor & time window overlaps another reservation. Please pick another time.'
          );
        }
        const patientSnap = await tx.get(patientRef);

        const now = serverTimestamp();
        tx.set(apptRef, { ...apptData, createdAt: now, updatedAt: now });

        coveredLockIds.forEach((lockId, idx) => {
          tx.set(doc(db, 'slotLocks', lockId), {
            doctorId: doctor.id,
            date: input.date,
            time: coveredTimes[idx],
            appointmentId: apptId,
            bookedByUid: user.uid,
            createdAt: now,
          });
        });

        if (patientSnap.exists()) {
          const prevCount = Number(patientSnap.data().totalAppointments || 0);
          tx.update(patientRef, {
            fullName: apptData.patientName,
            phone: apptData.patientPhone,
            ...(apptData.patientEmail ? { email: apptData.patientEmail } : {}),
            preferredDoctorId: doctor.id,
            totalAppointments: prevCount + 1,
            updatedAt: now,
          });
        } else {
          tx.set(patientRef, {
            id: patientDocId,
            ...(isStaffCreator ? {} : { uid: user.uid }),
            fullName: apptData.patientName,
            phone: apptData.patientPhone,
            ...(apptData.patientEmail ? { email: apptData.patientEmail } : {}),
            preferredDoctorId: doctor.id,
            totalAppointments: 1,
            notes: '',
            isSample: false,
            createdAt: now,
            updatedAt: now,
          });
        }

        if (isStaffCreator) {
          tx.set(auditRef, {
            id: auditId,
            actorUid: user.uid,
            actorEmail: user.email || 'staff',
            actorRole: role === 'admin' ? 'admin' : 'receptionist',
            action: 'appointment.create',
            targetCollection: 'appointments',
            targetId: apptId,
            summary: `Created ${targetStatus} appointment ${refCode} for ${apptData.patientName} (${doctor.name} on ${input.date} ${input.time}, ${service.durationMins}m)`,
            createdAt: now,
          });
        }
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('overlaps') ||
          err.message.includes('Please') ||
          err.message.includes('unavailable'))
      ) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, `appointments/${apptId}`);
    }

    return apptData as Appointment;
  }

  async function updateAppointmentStatus(
    appt: Appointment,
    nextStatus: AppointmentStatus,
    staffNotes?: string
  ): Promise<void> {
    if (!user) throw new Error('Authentication required.');
    if (
      nextStatus !== appt.status &&
      !ALLOWED_STATUS_TRANSITIONS[appt.status].includes(nextStatus)
    ) {
      throw new Error(`Cannot transition from ${appt.status} to ${nextStatus}.`);
    }

    const apptRef = doc(db, 'appointments', appt.id);
    const lockIdsToRelease =
      Array.isArray(appt.slotLockIds) && appt.slotLockIds.length > 0
        ? appt.slotLockIds
        : [appt.slotLockId || expectedLockId(appt.doctorId, appt.date, appt.time)];
    const lockRefs = lockIdsToRelease.map((id) => doc(db, 'slotLocks', id));

    const auditId = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const auditRef = doc(db, 'auditLogs', auditId);
    const isStaffActor = role === 'admin' || role === 'receptionist' || role === 'doctor';
    const shouldReleaseLock =
      nextStatus === 'cancelled' || nextStatus === 'no_show' || nextStatus === 'completed';

    try {
      await runTransaction(db, async (tx) => {
        const apptSnap = await tx.get(apptRef);
        if (!apptSnap.exists()) throw new Error('Appointment no longer exists.');
        const lockSnaps = shouldReleaseLock
          ? await Promise.all(lockRefs.map((ref) => tx.get(ref)))
          : [];

        const now = serverTimestamp();
        const updates: Record<string, unknown> = {
          status: nextStatus,
          updatedAt: now,
        };
        if (typeof staffNotes === 'string' && isStaffActor) {
          updates.staffNotes = staffNotes.slice(0, 400);
        }

        tx.update(apptRef, updates);

        if (shouldReleaseLock) {
          lockSnaps.forEach((snap, idx) => {
            if (snap.exists()) {
              tx.delete(lockRefs[idx]);
            }
          });
        }

        if (isStaffActor) {
          tx.set(auditRef, {
            id: auditId,
            actorUid: user.uid,
            actorEmail: user.email || 'staff',
            actorRole:
              role === 'admin' || role === 'receptionist' || role === 'doctor'
                ? role
                : 'receptionist',
            action: `appointment.${nextStatus}`,
            targetCollection: 'appointments',
            targetId: appt.id,
            summary: `Changed ${appt.referenceCode} (${appt.patientName}) from ${appt.status} to ${nextStatus}`,
            createdAt: now,
          });
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Cannot transition')) {
        throw err;
      }
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${appt.id}`);
    }
  }

  async function rescheduleAppointment(
    appt: Appointment,
    newDate: string,
    newTime: string,
    newDoctor: Doctor,
    settings: ClinicSettings,
    schedules: ScheduleOverride[] = [],
    slotLocks: SlotLock[] = []
  ): Promise<void> {
    if (!user) throw new Error('Authentication required.');
    if (appt.status === 'completed' || appt.status === 'cancelled' || appt.status === 'no_show') {
      throw new Error('Terminal appointments cannot be rescheduled.');
    }

    const validationError = validateBookingInput({
      patientName: appt.patientName,
      patientPhone: appt.patientPhone,
      date: newDate,
      time: newTime,
      notes: appt.notes,
      maxDaysAhead: settings.maxBookingDaysAhead,
      minLeadTimeMins: settings.minLeadTimeMins,
    });
    if (validationError) throw new Error(validationError);

    const openSlots = generateAvailableSlotsForDoctor({
      dateStr: newDate,
      doctor: newDoctor,
      schedules,
      slotLocks,
      settings,
      serviceDurationMins: appt.durationMins,
      ignoreAppointmentId: appt.id,
    });
    if (!openSlots.includes(newTime)) {
      throw new Error(
        'Selected new time is unavailable for the full visit duration. Please choose another open slot.'
      );
    }

    const oldLockIds =
      Array.isArray(appt.slotLockIds) && appt.slotLockIds.length > 0
        ? appt.slotLockIds
        : [appt.slotLockId || expectedLockId(appt.doctorId, appt.date, appt.time)];
    const newCoveredTimes = getCoveredTimes(
      newTime,
      appt.durationMins,
      settings.slotDurationMins
    );
    const newLockIds = getCoveredLockIds(
      newDoctor.id,
      newDate,
      newTime,
      appt.durationMins,
      settings.slotDurationMins
    );

    const apptRef = doc(db, 'appointments', appt.id);
    const isStaffActor = role === 'admin' || role === 'receptionist';
    const nextStatus: AppointmentStatus = isStaffActor ? appt.status : 'pending';
    const auditId = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const auditRef = doc(db, 'auditLogs', auditId);

    const uniqueIds = Array.from(new Set([...oldLockIds, ...newLockIds]));

    try {
      await runTransaction(db, async (tx) => {
        const apptSnap = await tx.get(apptRef);
        if (!apptSnap.exists()) throw new Error('Appointment no longer exists.');

        const lockSnaps = await Promise.all(
          uniqueIds.map((id) => tx.get(doc(db, 'slotLocks', id)))
        );
        const snapById = new Map(uniqueIds.map((id, idx) => [id, lockSnaps[idx]]));

        for (const targetLockId of newLockIds) {
          const snap = snapById.get(targetLockId);
          if (snap?.exists() && snap.data()?.appointmentId !== appt.id) {
            throw new Error('The selected new time window overlaps another reserved slot.');
          }
        }

        const now = serverTimestamp();

        // Delete old locks no longer in new window
        oldLockIds.forEach((oldId) => {
          if (!newLockIds.includes(oldId) && snapById.get(oldId)?.exists()) {
            tx.delete(doc(db, 'slotLocks', oldId));
          }
        });

        // Create new locks not already owned/present
        newLockIds.forEach((newId, idx) => {
          if (!snapById.get(newId)?.exists()) {
            tx.set(doc(db, 'slotLocks', newId), {
              doctorId: newDoctor.id,
              date: newDate,
              time: newCoveredTimes[idx],
              appointmentId: appt.id,
              bookedByUid: appt.patientUid,
              createdAt: now,
            });
          }
        });

        const payload: Record<string, unknown> = {
          date: newDate,
          time: newTime,
          slotLockId: newLockIds[0],
          slotLockIds: newLockIds,
          status: nextStatus,
          updatedAt: now,
        };
        if (isStaffActor) {
          payload.doctorId = newDoctor.id;
          payload.doctorName = newDoctor.name;
        }
        tx.update(apptRef, payload);

        if (isStaffActor) {
          tx.set(auditRef, {
            id: auditId,
            actorUid: user.uid,
            actorEmail: user.email || 'staff',
            actorRole: role === 'admin' ? 'admin' : 'receptionist',
            action: 'appointment.reschedule',
            targetCollection: 'appointments',
            targetId: appt.id,
            summary: `Rescheduled ${appt.referenceCode} (${appt.patientName}) to ${newDate} ${newTime} with ${newDoctor.name}`,
            createdAt: now,
          });
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('overlaps')) {
        throw err;
      }
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${appt.id}`);
    }
  }

  return {
    appointments,
    loading,
    bookAppointment,
    updateAppointmentStatus,
    rescheduleAppointment,
  };
}
