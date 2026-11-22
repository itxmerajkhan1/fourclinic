import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
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
  generateGuestVisitSecret,
  getCoveredLockIds,
  getCoveredTimes,
  getSlotsNeededForDuration,
  MAX_SLOT_LOCKS,
  sanitizeId,
  saveLocalGuestVisitSecret,
  sha256Hex,
  validateBookingInput,
} from '../lib/validation';
import type {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  BusySlot,
  ClinicSettings,
  Doctor,
  ScheduleOverride,
  ServiceItem,
  VisitLookup,
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
  honeypot?: string;
}

export type BookedAppointmentResult = Appointment & {
  guestSecret?: string;
};

export function useAppointments() {
  const { user, profile, role, authReady, ensureGuestSession } = useAuth();
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
    slotLocks: BusySlot[] = [],
    availabilityVerified = true,
    availabilityError: string | null = null
  ): Promise<BookedAppointmentResult> {
    if (!availabilityVerified || availabilityError) {
      throw new Error(
        availabilityError ||
          'Live slot availability is still loading or could not be verified from Firestore. Booking is blocked until availability is verified.'
      );
    }
    if (!catalogSeeded) {
      throw new Error(
        'Clinic catalog is not initialized in Firestore yet. An Admin must sign in to initialize doctors & services.'
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

    const slotsNeeded = getSlotsNeededForDuration(service.durationMins, settings.slotDurationMins);
    if (slotsNeeded > MAX_SLOT_LOCKS) {
      throw new Error(
        `This service (${service.durationMins}m) requires ${slotsNeeded} grid slots, exceeding the ${MAX_SLOT_LOCKS}-slot atomic lock limit. Please contact clinic admin to adjust slot duration.`
      );
    }

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

    const activeUser = user || (await ensureGuestSession());
    const isStaffCreator =
      !activeUser.isAnonymous && (role === 'admin' || role === 'receptionist');

    if (
      activeUser.isAnonymous &&
      appointments.filter((a) => a.status === 'pending' || a.status === 'confirmed').length >= 5
    ) {
      throw new Error(
        'Active guest session limit (5 upcoming bookings) reached. Manage existing visits in My Visits or create a patient account.'
      );
    }

    // Server-side anti-spam & rate-limit gate before writing to Firestore
    if (!isStaffCreator) {
      const idToken = await activeUser.getIdToken();
      const gateRes = await fetch('/api/guest/gate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'booking',
          hp: input.honeypot || '',
        }),
      });
      if (!gateRes.ok) {
        const errBody = (await gateRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          errBody.error || 'Booking temporarily rate-limited. Please wait and try again.'
        );
      }
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
    const guestSecret = generateGuestVisitSecret();
    const guestTokenHash = await sha256Hex(guestSecret);

    const targetStatus: AppointmentStatus =
      isStaffCreator && input.initialStatus === 'confirmed' ? 'confirmed' : 'pending';

    const apptRef = doc(db, 'appointments', apptId);
    const lookupRef = doc(db, 'visitLookups', guestTokenHash);
    const busyRefs = coveredLockIds.map((id) => doc(db, 'busySlots', id));
    const patientDocId = isStaffCreator
      ? sanitizeId(`pt_${input.patientPhone.replace(/\D/g, '') || apptId}`)
      : activeUser.uid;
    const patientRef = doc(db, 'patients', patientDocId);
    const auditId = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const auditRef = doc(db, 'auditLogs', auditId);

    const resolvedEmail = (input.patientEmail || activeUser.email || '').trim().slice(0, 160);
    const apptData: Omit<Appointment, 'createdAt' | 'updatedAt'> = {
      id: apptId,
      referenceCode: refCode,
      patientUid: activeUser.uid,
      patientName: input.patientName.trim(),
      patientPhone: input.patientPhone.trim(),
      ...(resolvedEmail ? { patientEmail: resolvedEmail } : {}),
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
      guestTokenHash,
      isSample: false,
    };

    try {
      await runTransaction(db, async (tx) => {
        // Read all covered public busySlots + patient record BEFORE writes
        const busySnaps = await Promise.all(busyRefs.map((ref) => tx.get(ref)));
        if (busySnaps.some((snap) => snap.exists())) {
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
            bookedByUid: activeUser.uid,
            createdAt: now,
          });
          tx.set(doc(db, 'busySlots', lockId), {
            doctorId: doctor.id,
            date: input.date,
            time: coveredTimes[idx],
            createdAt: now,
          });
        });

        tx.set(lookupRef, {
          id: guestTokenHash,
          appointmentId: apptId,
          ownerUid: activeUser.uid,
          referenceCode: refCode,
          serviceName: service.name,
          doctorId: doctor.id,
          doctorName: doctor.name,
          date: input.date,
          time: input.time,
          durationMins: service.durationMins,
          status: targetStatus,
          createdAt: now,
          updatedAt: now,
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
            ...(isStaffCreator ? {} : { uid: activeUser.uid }),
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
            actorUid: activeUser.uid,
            actorEmail: activeUser.email || 'staff',
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
          err.message.includes('unavailable') ||
          err.message.includes('limit') ||
          err.message.includes('rate-limited'))
      ) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, `appointments/${apptId}`);
    }

    saveLocalGuestVisitSecret({
      appointmentId: apptId,
      referenceCode: refCode,
      secret: guestSecret,
      serviceName: service.name,
      doctorName: doctor.name,
      date: input.date,
      time: input.time,
      createdAtIso: new Date().toISOString(),
    });

    return {
      ...(apptData as Appointment),
      guestSecret,
    };
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
    const lookupRef = appt.guestTokenHash
      ? doc(db, 'visitLookups', appt.guestTokenHash)
      : null;
    const lockIdsToRelease =
      Array.isArray(appt.slotLockIds) && appt.slotLockIds.length > 0
        ? appt.slotLockIds
        : [appt.slotLockId || expectedLockId(appt.doctorId, appt.date, appt.time)];
    const lockRefs = lockIdsToRelease.map((id) => doc(db, 'slotLocks', id));
    const busyRefs = lockIdsToRelease.map((id) => doc(db, 'busySlots', id));

    const auditId = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const auditRef = doc(db, 'auditLogs', auditId);
    const isStaffActor = role === 'admin' || role === 'receptionist' || role === 'doctor';
    const shouldReleaseLock =
      nextStatus === 'cancelled' || nextStatus === 'no_show' || nextStatus === 'completed';

    try {
      await runTransaction(db, async (tx) => {
        const apptSnap = await tx.get(apptRef);
        if (!apptSnap.exists()) throw new Error('Appointment no longer exists.');
        const lookupSnap = lookupRef ? await tx.get(lookupRef) : null;
        const lockSnaps = shouldReleaseLock
          ? await Promise.all(lockRefs.map((ref) => tx.get(ref)))
          : [];
        const busySnaps = shouldReleaseLock
          ? await Promise.all(busyRefs.map((ref) => tx.get(ref)))
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

        if (lookupRef && lookupSnap?.exists()) {
          tx.update(lookupRef, {
            status: nextStatus,
            updatedAt: now,
          });
        }

        if (shouldReleaseLock) {
          lockSnaps.forEach((snap, idx) => {
            if (snap.exists()) {
              tx.delete(lockRefs[idx]);
            }
          });
          busySnaps.forEach((snap, idx) => {
            if (snap.exists()) {
              tx.delete(busyRefs[idx]);
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
    slotLocks: BusySlot[] = [],
    availabilityVerified = true,
    availabilityError: string | null = null
  ): Promise<void> {
    if (!user) throw new Error('Authentication required.');
    if (!availabilityVerified || availabilityError) {
      throw new Error(
        availabilityError ||
          'Live slot availability is still loading or could not be verified from Firestore. Rescheduling is blocked until availability is verified.'
      );
    }
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

    const oldLockIds =
      Array.isArray(appt.slotLockIds) && appt.slotLockIds.length > 0
        ? appt.slotLockIds
        : [appt.slotLockId || expectedLockId(appt.doctorId, appt.date, appt.time)];

    const openSlots = generateAvailableSlotsForDoctor({
      dateStr: newDate,
      doctor: newDoctor,
      schedules,
      slotLocks,
      settings,
      serviceDurationMins: appt.durationMins,
      ignoreAppointmentId: appt.id,
      ignoreLockIds: oldLockIds,
    });
    if (!openSlots.includes(newTime)) {
      throw new Error(
        'Selected new time is unavailable for the full visit duration. Please choose another open slot.'
      );
    }

    const slotsNeeded = getSlotsNeededForDuration(appt.durationMins, settings.slotDurationMins);
    if (slotsNeeded > MAX_SLOT_LOCKS) {
      throw new Error(
        `Visit duration (${appt.durationMins}m) requires ${slotsNeeded} grid slots, exceeding the ${MAX_SLOT_LOCKS}-slot lock limit.`
      );
    }

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
    const lookupRef = appt.guestTokenHash
      ? doc(db, 'visitLookups', appt.guestTokenHash)
      : null;
    const isStaffActor = role === 'admin' || role === 'receptionist';
    const nextStatus: AppointmentStatus = isStaffActor ? appt.status : 'pending';
    const auditId = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const auditRef = doc(db, 'auditLogs', auditId);

    const uniqueIds = Array.from(new Set([...oldLockIds, ...newLockIds]));
    const lockIdsToRelease = oldLockIds.filter((oldId) => !newLockIds.includes(oldId));

    try {
      await runTransaction(db, async (tx) => {
        const apptSnap = await tx.get(apptRef);
        if (!apptSnap.exists()) throw new Error('Appointment no longer exists.');
        const lookupSnap = lookupRef ? await tx.get(lookupRef) : null;

        const busySnaps = await Promise.all(
          uniqueIds.map((id) => tx.get(doc(db, 'busySlots', id)))
        );
        const busyById = new Map(uniqueIds.map((id, idx) => [id, busySnaps[idx]]));

        const releaseLockSnaps = await Promise.all(
          lockIdsToRelease.map((id) => tx.get(doc(db, 'slotLocks', id)))
        );
        const releaseLockById = new Map(
          lockIdsToRelease.map((id, idx) => [id, releaseLockSnaps[idx]])
        );

        for (const targetLockId of newLockIds) {
          const snap = busyById.get(targetLockId);
          if (snap?.exists() && !oldLockIds.includes(targetLockId)) {
            throw new Error('The selected new time window overlaps another reserved slot.');
          }
        }

        const now = serverTimestamp();

        lockIdsToRelease.forEach((oldId) => {
          if (releaseLockById.get(oldId)?.exists()) {
            tx.delete(doc(db, 'slotLocks', oldId));
          }
          if (busyById.get(oldId)?.exists()) {
            tx.delete(doc(db, 'busySlots', oldId));
          }
        });

        newLockIds.forEach((newId, idx) => {
          if (!oldLockIds.includes(newId)) {
            tx.set(doc(db, 'slotLocks', newId), {
              doctorId: newDoctor.id,
              date: newDate,
              time: newCoveredTimes[idx],
              appointmentId: appt.id,
              bookedByUid: user.uid,
              createdAt: now,
            });
            tx.set(doc(db, 'busySlots', newId), {
              doctorId: newDoctor.id,
              date: newDate,
              time: newCoveredTimes[idx],
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

        if (lookupRef && lookupSnap?.exists()) {
          tx.update(lookupRef, {
            date: newDate,
            time: newTime,
            status: nextStatus,
            ...(isStaffActor ? { doctorId: newDoctor.id, doctorName: newDoctor.name } : {}),
            updatedAt: now,
          });
        }

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

  async function lookupVisitBySecret(secret: string): Promise<VisitLookup | null> {
    const clean = secret.trim();
    if (clean.length < 16) {
      throw new Error(
        'Enter your full private tracking code (for example FCV-...). Short reference codes like FC-1001 cannot be looked up alone.'
      );
    }
    await ensureGuestSession();
    const tokenHash = await sha256Hex(clean);
    const ref = doc(db, 'visitLookups', tokenHash);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return snap.data() as VisitLookup;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `visitLookups/${tokenHash}`);
    }
  }

  return {
    appointments,
    loading,
    bookAppointment,
    updateAppointmentStatus,
    rescheduleAppointment,
    lookupVisitBySecret,
  };
}
