import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { addDaysIso, getCoveredLockIds, getCoveredTimes, sanitizeId, todayIso } from '../lib/validation';
import type {
  AuditLog,
  ClinicSettings,
  Doctor,
  Inquiry,
  InquiryPriority,
  InquiryStatus,
  PatientRecord,
  ScheduleOverride,
  ServiceItem,
  UserProfile,
  UserRole,
} from '../types/clinic';

export function useStaffDashboard() {
  const { user, role, authReady } = useAuth();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdminOrRecep = role === 'admin' || role === 'receptionist';
  const isStaff = isAdminOrRecep || role === 'doctor';

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setInquiries([]);
      setPatients([]);
      setUsersList([]);
      setAuditLogs([]);
      setLoading(false);
      return;
    }

    const unsubs: Array<() => void> = [];

    // Inquiries: Admin/Receptionist see all; patients see their own
    if (isAdminOrRecep || role === 'patient') {
      const inqQuery = isAdminOrRecep
        ? query(collection(db, 'inquiries'))
        : query(collection(db, 'inquiries'), where('patientUid', '==', user.uid));
      unsubs.push(
        onSnapshot(
          inqQuery,
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as Inquiry)
              .sort((a, b) => {
                const ta = typeof a.createdAt === 'string' ? a.createdAt : '';
                const tb = typeof b.createdAt === 'string' ? b.createdAt : '';
                return tb.localeCompare(ta);
              });
            setInquiries(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'inquiries')
        )
      );
    } else {
      setInquiries([]);
    }

    // Patients Directory: All staff
    if (isStaff) {
      unsubs.push(
        onSnapshot(
          collection(db, 'patients'),
          (snap) => {
            setPatients(snap.docs.map((d) => d.data() as PatientRecord));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'patients')
        )
      );
    } else {
      setPatients([]);
    }

    // Users & Audit Logs: Admin / Receptionist
    if (isAdminOrRecep) {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            setUsersList(snap.docs.map((d) => d.data() as UserProfile));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'auditLogs'),
          (snap) => {
            const logs = snap.docs
              .map((d) => d.data() as AuditLog)
              .sort((a, b) => b.id.localeCompare(a.id));
            setAuditLogs(logs);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
        )
      );
    } else {
      setUsersList([]);
      setAuditLogs([]);
    }

    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [authReady, user, role, isAdminOrRecep, isStaff]);

  async function writeAudit(action: string, targetCollection: string, targetId: string, summary: string) {
    if (!user || !isStaff) return;
    const id = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const actorRole =
      role === 'admin' || role === 'receptionist' || role === 'doctor' ? role : 'receptionist';
    try {
      await setDoc(doc(db, 'auditLogs', id), {
        id,
        actorUid: user.uid,
        actorEmail: (user.email || 'staff').slice(0, 160),
        actorRole,
        action: action.slice(0, 80),
        targetCollection,
        targetId: sanitizeId(targetId),
        summary: summary.slice(0, 300),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `auditLogs/${id}`);
    }
  }

  async function submitInquiry(input: {
    name: string;
    contact: string;
    topic: string;
    message: string;
    channel: 'website' | 'chatbot';
    priority?: InquiryPriority;
  }): Promise<Inquiry> {
    if (!user) {
      throw new Error('Please sign in with Google to send a message so we can track replies.');
    }
    const id = `inq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const record: Omit<Inquiry, 'createdAt' | 'updatedAt'> = {
      id,
      patientUid: user.uid,
      channel: input.channel,
      name: input.name.trim().slice(0, 80),
      contact: input.contact.trim().slice(0, 120),
      topic: (input.topic || 'general').slice(0, 40),
      status: 'new',
      priority: input.priority || 'normal',
      estimatedValue: 100,
      internalNotes: '',
      unread: true,
      messages: [
        {
          from: 'user',
          text: input.message.trim().slice(0, 500),
          ts: nowIso,
        },
      ],
      isSample: false,
    };

    try {
      await setDoc(doc(db, 'inquiries', id), {
        ...record,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `inquiries/${id}`);
    }
    return record as Inquiry;
  }

  async function updateInquiry(
    inquiry: Inquiry,
    patch: {
      status?: InquiryStatus;
      priority?: InquiryPriority;
      assignedToUid?: string;
      assignedToName?: string;
      internalNotes?: string;
      unread?: boolean;
      appendStaffReply?: string;
    }
  ) {
    if (!isAdminOrRecep) throw new Error('Staff permission required.');
    const nextMessages = patch.appendStaffReply?.trim()
      ? [
          ...inquiry.messages.slice(-48),
          {
            from: 'staff' as const,
            text: patch.appendStaffReply.trim().slice(0, 500),
            ts: new Date().toISOString(),
          },
        ]
      : inquiry.messages;

    const payload: Record<string, unknown> = {
      status: patch.status ?? inquiry.status,
      priority: patch.priority ?? inquiry.priority,
      internalNotes: (patch.internalNotes ?? inquiry.internalNotes).slice(0, 500),
      unread: patch.unread ?? false,
      messages: nextMessages,
      updatedAt: serverTimestamp(),
    };
    if (patch.assignedToUid !== undefined) {
      payload.assignedToUid = patch.assignedToUid;
      payload.assignedToName = patch.assignedToName || '';
    }

    try {
      await updateDoc(doc(db, 'inquiries', inquiry.id), payload);
      await writeAudit(
        'inquiry.update',
        'inquiries',
        inquiry.id,
        `Updated inquiry from ${inquiry.name} -> status: ${String(payload.status)}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `inquiries/${inquiry.id}`);
    }
  }

  async function saveDoctor(doctor: Doctor, isNew: boolean) {
    if (role !== 'admin') throw new Error('Admin permission required.');
    const id = sanitizeId(doctor.id);
    try {
      const now = serverTimestamp();
      await setDoc(
        doc(db, 'doctors', id),
        {
          ...doctor,
          id,
          createdAt: isNew ? now : doctor.createdAt || now,
          updatedAt: now,
        },
        { merge: !isNew }
      );
      await writeAudit(
        isNew ? 'doctor.create' : 'doctor.update',
        'doctors',
        id,
        `${isNew ? 'Added' : 'Updated'} doctor ${doctor.name} (${doctor.specialty})`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `doctors/${id}`);
    }
  }

  async function saveDoctorScheduleOnly(
    doctorId: string,
    workingHours: Doctor['workingHours'],
    blockedDates: string[]
  ) {
    try {
      await updateDoc(doc(db, 'doctors', doctorId), {
        workingHours,
        blockedDates: blockedDates.slice(0, 60),
        updatedAt: serverTimestamp(),
      });
      await writeAudit(
        'doctor.schedule_update',
        'doctors',
        doctorId,
        `Updated working hours / blocked dates for doctor ${doctorId}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `doctors/${doctorId}`);
    }
  }

  async function addScheduleOverride(override: Omit<ScheduleOverride, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>) {
    if (!user) throw new Error('Authentication required.');
    const id = sanitizeId(`sched_${override.doctorId}_${override.date}_${Date.now().toString(36)}`);
    try {
      const now = serverTimestamp();
      await setDoc(doc(db, 'schedules', id), {
        ...override,
        id,
        createdByUid: user.uid,
        createdAt: now,
        updatedAt: now,
      });
      await writeAudit(
        'schedule.block',
        'schedules',
        id,
        `Added schedule block for ${override.doctorId} on ${override.date}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `schedules/${id}`);
    }
  }

  async function deleteScheduleOverride(scheduleId: string) {
    try {
      await deleteDoc(doc(db, 'schedules', scheduleId));
      await writeAudit('schedule.delete', 'schedules', scheduleId, `Removed schedule override ${scheduleId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `schedules/${scheduleId}`);
    }
  }

  async function saveService(service: ServiceItem, isNew: boolean) {
    if (role !== 'admin') throw new Error('Admin permission required.');
    const id = sanitizeId(service.id);
    try {
      const now = serverTimestamp();
      await setDoc(
        doc(db, 'services', id),
        {
          ...service,
          id,
          createdAt: isNew ? now : service.createdAt || now,
          updatedAt: now,
        },
        { merge: !isNew }
      );
      await writeAudit(
        isNew ? 'service.create' : 'service.update',
        'services',
        id,
        `${isNew ? 'Created' : 'Updated'} service ${service.name} (${service.priceLabel})`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `services/${id}`);
    }
  }

  async function updatePatientNotes(patient: PatientRecord, notes: string) {
    if (!isAdminOrRecep) throw new Error('Staff permission required.');
    try {
      await updateDoc(doc(db, 'patients', patient.id), {
        notes: notes.slice(0, 300),
        updatedAt: serverTimestamp(),
      });
      await writeAudit(
        'patient.notes_update',
        'patients',
        patient.id,
        `Updated scheduling notes for ${patient.fullName}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `patients/${patient.id}`);
    }
  }

  async function saveClinicSettings(settings: ClinicSettings) {
    if (role !== 'admin' || !user) throw new Error('Admin permission required.');
    try {
      await setDoc(doc(db, 'clinicSettings', 'main'), {
        ...settings,
        id: 'main',
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      await writeAudit(
        'settings.update',
        'clinicSettings',
        'main',
        `Updated clinic settings (slot ${settings.slotDurationMins}m, holidays: ${settings.holidays.length})`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'clinicSettings/main');
    }
  }

  async function updateUserRole(targetUser: UserProfile, nextRole: UserRole, doctorId?: string) {
    if (role !== 'admin') throw new Error('Only Admin can change staff roles.');
    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        role: nextRole,
        doctorId: nextRole === 'doctor' ? doctorId || 'd1' : '',
        updatedAt: serverTimestamp(),
      });
      await writeAudit(
        'user.role_update',
        'users',
        targetUser.uid,
        `Set ${targetUser.email} role to ${nextRole}${nextRole === 'doctor' ? ` (${doctorId || 'd1'})` : ''}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
    }
  }

  async function seedSampleDemoRecords(slotDurationMins = 30) {
    if (role !== 'admin' || !user) throw new Error('Admin permission required.');
    const t0 = todayIso();
    let d1 = addDaysIso(t0, 1);
    if (new Date(d1).getDay() === 0) d1 = addDaysIso(d1, 1);
    let d2 = addDaysIso(t0, 2);
    if (new Date(d2).getDay() === 0) d2 = addDaysIso(d2, 1);

    const batch = writeBatch(db);
    const now = serverTimestamp();

    const sampleAppts = [
      {
        id: 'sample_appt_1',
        referenceCode: 'FC-S101',
        patientUid: user.uid,
        patientName: 'Amara Johnson (Sample)',
        patientPhone: '+1 555 010 1011',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        date: d1,
        time: '10:00',
        durationMins: 60,
        estimatedValue: 240,
        status: 'pending',
        source: 'chatbot',
        notes: 'Fictional sample pending booking for testing confirmation workflow.',
        staffNotes: '',
        slotLockIds: getCoveredLockIds('d1', d1, '10:00', 60, slotDurationMins),
        isSample: true,
      },
      {
        id: 'sample_appt_2',
        referenceCode: 'FC-S102',
        patientUid: user.uid,
        patientName: 'Liam Carter (Sample)',
        patientPhone: '+1 555 010 1012',
        serviceId: 'braces',
        serviceName: 'Orthodontics / Braces',
        doctorId: 'd2',
        doctorName: 'Dr. Daniel Reyes',
        date: d2,
        time: '11:00',
        durationMins: 45,
        estimatedValue: 1800,
        status: 'confirmed',
        source: 'form',
        notes: 'Fictional sample confirmed orthodontic assessment.',
        staffNotes: 'Verified PPO coverage.',
        slotLockIds: getCoveredLockIds('d2', d2, '11:00', 45, slotDurationMins),
        isSample: true,
      },
      {
        id: 'sample_appt_3',
        referenceCode: 'FC-S103',
        patientUid: user.uid,
        patientName: 'Sofia Alvarez (Sample)',
        patientPhone: '+1 555 010 1013',
        serviceId: 'cleaning',
        serviceName: 'Teeth Cleaning',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        date: addDaysIso(t0, -2),
        time: '09:30',
        durationMins: 60,
        estimatedValue: 90,
        status: 'completed',
        source: 'form',
        notes: 'Fictional sample completed visit.',
        staffNotes: '6-month recall suggested.',
        slotLockIds: getCoveredLockIds('d1', addDaysIso(t0, -2), '09:30', 60, slotDurationMins),
        isSample: true,
      },
    ];

    sampleAppts.forEach((a) => {
      batch.set(doc(db, 'appointments', a.id), {
        ...a,
        slotLockId: a.slotLockIds[0],
        createdAt: now,
        updatedAt: now,
      });
      if (a.status === 'pending' || a.status === 'confirmed') {
        const coveredTimes = getCoveredTimes(a.time, a.durationMins, slotDurationMins);
        a.slotLockIds.forEach((lockId, idx) => {
          batch.set(doc(db, 'slotLocks', lockId), {
            doctorId: a.doctorId,
            date: a.date,
            time: coveredTimes[idx],
            appointmentId: a.id,
            bookedByUid: user.uid,
            createdAt: now,
          });
        });
      }
    });

    const samplePatients = [
      {
        id: 'sample_pt_1',
        fullName: 'Amara Johnson (Sample)',
        phone: '+1 555 010 1011',
        preferredDoctorId: 'd1',
        totalAppointments: 1,
        notes: 'Sample fictional patient — prefers morning appointments.',
        isSample: true,
      },
      {
        id: 'sample_pt_2',
        fullName: 'Liam Carter (Sample)',
        phone: '+1 555 010 1012',
        preferredDoctorId: 'd2',
        totalAppointments: 1,
        notes: 'Sample fictional patient — teen braces consultation.',
        isSample: true,
      },
    ];
    samplePatients.forEach((p) => {
      batch.set(doc(db, 'patients', p.id), { ...p, createdAt: now, updatedAt: now });
    });

    const sampleInquiries = [
      {
        id: 'sample_inq_1',
        patientUid: user.uid,
        channel: 'chatbot',
        name: 'Zara Ahmed (Sample)',
        contact: '+1 555 020 3031',
        topic: 'urgent',
        status: 'new',
        priority: 'urgent',
        estimatedValue: 480,
        internalNotes: 'Sample urgent toothache escalation for front-desk demo.',
        unread: true,
        messages: [
          {
            from: 'user',
            text: 'My back molar started hurting sharply this morning.',
            ts: new Date().toISOString(),
          },
          {
            from: 'bot',
            text: 'I have flagged this as urgent for our dental front desk. Please call +1 555 010 0000 for immediate triage.',
            ts: new Date().toISOString(),
          },
        ],
        isSample: true,
      },
      {
        id: 'sample_inq_2',
        patientUid: user.uid,
        channel: 'website',
        name: 'Noah Kim (Sample)',
        contact: 'noah.sample@example.com',
        topic: 'insurance',
        status: 'contacted',
        priority: 'normal',
        estimatedValue: 90,
        internalNotes: 'Sample PPO benefit check request.',
        unread: false,
        messages: [
          {
            from: 'user',
            text: 'Do you accept Harbor PPO for preventive cleanings?',
            ts: new Date().toISOString(),
          },
        ],
        isSample: true,
      },
    ];
    sampleInquiries.forEach((q) => {
      batch.set(doc(db, 'inquiries', q.id), { ...q, createdAt: now, updatedAt: now });
    });

    const auditId = `log_${Date.now().toString(36)}_seed`;
    batch.set(doc(db, 'auditLogs', auditId), {
      id: auditId,
      actorUid: user.uid,
      actorEmail: user.email || 'admin',
      actorRole: 'admin',
      action: 'sample_data.seed',
      targetCollection: 'appointments',
      targetId: 'sample_batch',
      summary: 'Seeded clearly labeled fictional sample records (3 appointments, 2 patients, 2 inquiries)',
      createdAt: now,
    });

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sample_seed');
    }
  }

  return {
    inquiries,
    patients,
    usersList,
    auditLogs,
    loading,
    submitInquiry,
    updateInquiry,
    saveDoctor,
    saveDoctorScheduleOnly,
    addScheduleOverride,
    deleteScheduleOverride,
    saveService,
    updatePatientNotes,
    saveClinicSettings,
    updateUserRole,
    seedSampleDemoRecords,
  };
}
