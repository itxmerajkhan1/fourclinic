/**
 * FourClinic Firestore Security Rules Specification & Emulator Test Suite
 *
 * Covers both ALLOW and DENY scenarios across all 10 required security domains:
 *  1. Anonymous guest booking (including 15/30/45/60m grids, catalog/hours checks & anti-hijack lock binding)
 *  2. Anonymous inquiry submission
 *  3. Anonymous user's own appointment access
 *  4. Unauthorized access to another patient's records
 *  5. Secure cross-device tracking (visitLookups/{sha256Hash})
 *  6. Doctor appointment access
 *  7. Receptionist permissions
 *  8. Admin permissions & privilege boundaries
 *  9. Concurrent booking conflicts & private slotLocks isolation
 * 10. Cancellation, rescheduling & slot release
 *
 * Run against Firebase Firestore Emulator (requires Java JRE + @firebase/rules-unit-testing):
 *   firebase emulators:exec --only firestore "npx tsx firestore.rules.test.ts"
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { DEFAULT_CLINIC_SETTINGS, DEFAULT_WORKING_HOURS, SAMPLE_DOCTORS, SAMPLE_SERVICES } from './src/data/sampleSeed';
import {
  addDaysIso,
  getCoveredLockIds,
  getCoveredTimes,
  sha256Hex,
  todayIso,
} from './src/lib/validation';

export interface RulesTestCase {
  id: number;
  category:
    | 'anonymous_guest_booking'
    | 'anonymous_inquiry_submission'
    | 'anonymous_own_access'
    | 'unauthorized_cross_patient'
    | 'secure_cross_device_tracking'
    | 'doctor_access'
    | 'receptionist_permissions'
    | 'admin_permissions'
    | 'concurrent_booking_conflicts'
    | 'cancellation_and_slot_release';
  name: string;
  actor: {
    uid: string | null;
    email?: string;
    email_verified?: boolean;
    sign_in_provider?: 'anonymous' | 'password' | 'google.com';
    roleInDb?: 'patient' | 'doctor' | 'receptionist' | 'admin';
    doctorIdInDb?: string;
  };
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'transaction';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

export const SECURITY_RULES_CASES: readonly RulesTestCase[] = [
  // 1. Anonymous guest booking
  {
    id: 1,
    category: 'anonymous_guest_booking',
    name: 'Anonymous Guest Atomic Pending Booking Transaction (appointments + slotLocks + busySlots + visitLookups + patients)',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'transaction',
    path: 'appointments/appt_anon_1',
    payload: {
      id: 'appt_anon_1',
      patientUid: 'anon_guest_1',
      status: 'pending',
      source: 'form',
      staffNotes: '',
      slotLockId: 'd1_2026-12-01_1000',
      slotLockIds: ['d1_2026-12-01_1000', 'd1_2026-12-01_1030'],
      isSample: false,
    },
    expected: 'ALLOW',
  },
  {
    id: 2,
    category: 'anonymous_guest_booking',
    name: 'Anonymous Guest Creating Pre-Confirmed Appointment',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'create',
    path: 'appointments/appt_anon_fake',
    payload: {
      id: 'appt_anon_fake',
      patientUid: 'anon_guest_1',
      status: 'confirmed',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    category: 'anonymous_guest_booking',
    name: 'Orphaned Appointment or Cross-Patient SlotLock Hijack Denied',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'create',
    path: 'appointments/appt_nolock',
    payload: {
      id: 'appt_nolock',
      patientUid: 'anon_guest_1',
      status: 'pending',
      slotLockId: 'd1_2026-12-01_1000',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    category: 'anonymous_guest_booking',
    name: 'SlotLockIds Exceeding Verified Atomic Bound (>4 slots) or Tampered Duration/Price Denied',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'create',
    path: 'appointments/appt_over4',
    payload: {
      id: 'appt_over4',
      patientUid: 'anon_guest_1',
      status: 'pending',
      slotLockIds: ['s1', 's2', 's3', 's4', 's5'],
    },
    expected: 'PERMISSION_DENIED',
  },

  // 2. Anonymous inquiry submission
  {
    id: 5,
    category: 'anonymous_inquiry_submission',
    name: 'Anonymous Guest Valid Contact Inquiry Create (messages[0].from == user)',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'create',
    path: 'inquiries/inq_anon_1',
    payload: {
      id: 'inq_anon_1',
      patientUid: 'anon_guest_1',
      channel: 'website',
      status: 'new',
      unread: true,
      internalNotes: '',
      estimatedValue: 100,
      messages: [{ from: 'user', text: 'Do you offer Saturday cleanings?', ts: '2026-11-21T10:00:00Z' }],
    },
    expected: 'ALLOW',
  },
  {
    id: 6,
    category: 'anonymous_inquiry_submission',
    name: 'Anonymous Guest Spoofing Staff Reply on Inquiry Create',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'create',
    path: 'inquiries/inq_spoof_staff',
    payload: {
      id: 'inq_spoof_staff',
      patientUid: 'anon_guest_1',
      status: 'new',
      messages: [{ from: 'staff', text: 'Confirmed!', ts: '2026-11-21T10:00:00Z' }],
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    category: 'anonymous_inquiry_submission',
    name: 'Shadow / Ghost Field Injection on Inquiry',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'create',
    path: 'inquiries/inq_ghost',
    payload: {
      id: 'inq_ghost',
      patientUid: 'anon_guest_1',
      status: 'new',
      isAdminApproved: true,
    },
    expected: 'PERMISSION_DENIED',
  },

  // 3. Anonymous user's own appointment access & post-link persistence
  {
    id: 8,
    category: 'anonymous_own_access',
    name: 'Anonymous Guest Reading & Listing Own Appointments/Inquiries (uid-scoped)',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'get',
    path: 'appointments/appt_anon_1',
    expected: 'ALLOW',
  },
  {
    id: 9,
    category: 'anonymous_own_access',
    name: 'Anonymous Guest Reopening Terminal Completed Appointment Denied',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'update',
    path: 'appointments/appt_completed_1',
    payload: { status: 'pending' },
    expected: 'PERMISSION_DENIED',
  },

  // 4. Unauthorized access to another patient's records
  {
    id: 10,
    category: 'unauthorized_cross_patient',
    name: 'Cross-Patient Appointment Get Denied',
    actor: { uid: 'patient_2', email: 'p2@example.com', email_verified: true, sign_in_provider: 'password' },
    operation: 'get',
    path: 'appointments/appt_belonging_to_patient_1',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    category: 'unauthorized_cross_patient',
    name: 'Unscoped Appointments List Scrape Denied',
    actor: { uid: 'patient_2', email: 'p2@example.com', email_verified: true, sign_in_provider: 'password' },
    operation: 'list',
    path: 'appointments',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    category: 'unauthorized_cross_patient',
    name: 'Unscoped Inquiries List Scrape Denied',
    actor: { uid: 'anon_guest_2', sign_in_provider: 'anonymous' },
    operation: 'list',
    path: 'inquiries',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 13,
    category: 'unauthorized_cross_patient',
    name: 'Guest Listing Patients Directory Denied',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'list',
    path: 'patients',
    expected: 'PERMISSION_DENIED',
  },

  // 5. Secure cross-device tracking
  {
    id: 14,
    category: 'secure_cross_device_tracking',
    name: 'Cross-Device Signed-In Get on visitLookups/{sha256Hash} Allowed',
    actor: { uid: 'anon_guest_device_b', sign_in_provider: 'anonymous' },
    operation: 'get',
    path: 'visitLookups/a'.padEnd(76, '0').slice(0, 12 + 64),
    expected: 'ALLOW',
  },
  {
    id: 15,
    category: 'secure_cross_device_tracking',
    name: 'Listing visitLookups Collection Forbidden',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'list',
    path: 'visitLookups',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 16,
    category: 'secure_cross_device_tracking',
    name: 'Tampering visitLookups Status Out of Sync With Appointment Denied',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'update',
    path: 'visitLookups/' + 'b'.repeat(64),
    payload: { status: 'confirmed' },
    expected: 'PERMISSION_DENIED',
  },

  // 6. Doctor appointment access
  {
    id: 17,
    category: 'doctor_access',
    name: 'Verified Doctor Marking Own Confirmed Appointment Completed Allowed',
    actor: { uid: 'doc_user_1', email: 'd1@clinic.example', email_verified: true, roleInDb: 'doctor', doctorIdInDb: 'd1' },
    operation: 'update',
    path: 'appointments/appt_assigned_to_d1_confirmed',
    payload: { status: 'completed', staffNotes: 'Follow up in 6 months.' },
    expected: 'ALLOW',
  },
  {
    id: 18,
    category: 'doctor_access',
    name: 'Doctor Accessing Another Doctor Appointment Denied',
    actor: { uid: 'doc_user_1', email: 'd1@clinic.example', email_verified: true, roleInDb: 'doctor', doctorIdInDb: 'd1' },
    operation: 'get',
    path: 'appointments/appt_assigned_to_d2',
    expected: 'PERMISSION_DENIED',
  },

  // 7. Receptionist permissions
  {
    id: 19,
    category: 'receptionist_permissions',
    name: 'Verified Receptionist Confirming Pending Appointment & Replying to Inquiry Allowed',
    actor: { uid: 'recep_1', email: 'r1@clinic.example', email_verified: true, roleInDb: 'receptionist' },
    operation: 'update',
    path: 'appointments/appt_pending_1',
    payload: { status: 'confirmed', staffNotes: 'Confirmed via phone.' },
    expected: 'ALLOW',
  },
  {
    id: 20,
    category: 'receptionist_permissions',
    name: 'Receptionist Modifying ClinicSettings or Deleting AuditLog Denied',
    actor: { uid: 'recep_1', email: 'r1@clinic.example', email_verified: true, roleInDb: 'receptionist' },
    operation: 'delete',
    path: 'auditLogs/log_1',
    expected: 'PERMISSION_DENIED',
  },

  // 8. Admin permissions & privilege boundaries
  {
    id: 21,
    category: 'admin_permissions',
    name: 'Verified Admin Updating ClinicSettings or Promoting Staff Role Allowed',
    actor: { uid: 'admin_1', email: 'itxmerajkhan3109@gmail.com', email_verified: true, roleInDb: 'admin' },
    operation: 'update',
    path: 'clinicSettings/main',
    payload: { slotDurationMins: 30 },
    expected: 'ALLOW',
  },
  {
    id: 22,
    category: 'admin_permissions',
    name: 'Unverified Email Admin Spoof Denied',
    actor: { uid: 'spoof_1', email: 'itxmerajkhan3109@gmail.com', email_verified: false, sign_in_provider: 'password' },
    operation: 'update',
    path: 'clinicSettings/main',
    payload: { clinicName: 'Hacked Clinic' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 23,
    category: 'admin_permissions',
    name: 'Self-Assigned Admin Role on Patient Sign-Up Denied',
    actor: { uid: 'patient_1', email: 'p1@example.com', email_verified: true, sign_in_provider: 'password' },
    operation: 'create',
    path: 'users/patient_1',
    payload: { uid: 'patient_1', email: 'p1@example.com', displayName: 'Mallory', role: 'admin', active: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 24,
    category: 'admin_permissions',
    name: 'Role Escalation on User Update Denied',
    actor: { uid: 'patient_1', email: 'p1@example.com', email_verified: true, roleInDb: 'patient' },
    operation: 'update',
    path: 'users/patient_1',
    payload: { role: 'receptionist' },
    expected: 'PERMISSION_DENIED',
  },

  // 9. Concurrent booking conflicts & private slotLocks isolation
  {
    id: 25,
    category: 'concurrent_booking_conflicts',
    name: 'Duplicate SlotLock Overwrite Denied',
    actor: { uid: 'patient_2', email: 'p2@example.com', email_verified: true },
    operation: 'create',
    path: 'slotLocks/d1_2026-12-01_1000',
    payload: {
      doctorId: 'd1',
      date: '2026-12-01',
      time: '10:00',
      appointmentId: 'appt_2',
      bookedByUid: 'patient_2',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 26,
    category: 'concurrent_booking_conflicts',
    name: 'Full-Duration Overlapping Secondary SlotLock Collision Denied',
    actor: { uid: 'patient_2', email: 'p2@example.com', email_verified: true },
    operation: 'create',
    path: 'slotLocks/d1_2026-12-01_0930',
    payload: {
      doctorId: 'd1',
      date: '2026-12-01',
      time: '09:30',
      appointmentId: 'appt_overlap_90m',
      bookedByUid: 'patient_2',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 27,
    category: 'concurrent_booking_conflicts',
    name: 'Unauthenticated Public SlotLocks Enumeration Denied (busySlots is PII-free)',
    actor: { uid: null },
    operation: 'list',
    path: 'slotLocks',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 28,
    category: 'concurrent_booking_conflicts',
    name: 'Unauthenticated Public BusySlots Availability Read Allowed (zero UID/appointmentId)',
    actor: { uid: null },
    operation: 'list',
    path: 'busySlots',
    expected: 'ALLOW',
  },

  // 10. Cancellation and slot release
  {
    id: 29,
    category: 'cancellation_and_slot_release',
    name: 'Owning Anonymous Guest Cancelling Pending Visit & Releasing SlotLocks + BusySlots Allowed',
    actor: { uid: 'anon_guest_1', sign_in_provider: 'anonymous' },
    operation: 'transaction',
    path: 'appointments/appt_anon_1',
    payload: { status: 'cancelled' },
    expected: 'ALLOW',
  },
  {
    id: 30,
    category: 'cancellation_and_slot_release',
    name: 'Non-Owner Deleting Another Patient SlotLock or BusySlot Denied',
    actor: { uid: 'anon_guest_2', sign_in_provider: 'anonymous' },
    operation: 'delete',
    path: 'slotLocks/d1_2026-12-01_1000',
    expected: 'PERMISSION_DENIED',
  },
] as const;

type FirestoreCompat = firebase.firestore.Firestore;

function nextWeekdayIso(daysOffset: number): string {
  let d = addDaysIso(todayIso(), daysOffset);
  for (let i = 0; i < 10; i++) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow >= 1 && dow <= 5) return d;
    d = addDaysIso(d, 1);
  }
  return d;
}

async function seedCatalogAndUsers(
  testEnv: RulesTestEnvironment,
  blockedDateStr: string,
  slotDurationMins: 15 | 30 | 45 | 60 = 30
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = firebase.firestore.FieldValue.serverTimestamp();

    await db.collection('clinicSettings').doc('main').set({
      ...DEFAULT_CLINIC_SETTINGS,
      slotDurationMins,
      updatedByUid: 'admin_1',
      updatedAt: now,
    });

    for (const docItem of SAMPLE_DOCTORS) {
      await db.collection('doctors').doc(docItem.id).set({
        ...docItem,
        workingHours: DEFAULT_WORKING_HOURS,
        blockedDates: docItem.id === 'd1' ? [blockedDateStr] : [],
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const svc of SAMPLE_SERVICES) {
      await db.collection('services').doc(svc.id).set({
        ...svc,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.collection('services').doc('long120').set({
      id: 'long120',
      name: 'Full Implant Rehab',
      description: 'Extended restorative dental implant session.',
      includes: 'Includes: 3D scan · surgical placement',
      durationMins: 120,
      priceLabel: '$1,500',
      basePrice: 1500,
      iconKey: 'implant',
      defaultDoctorId: 'd4',
      active: true,
      sortOrder: 7,
      isSample: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection('users').doc('admin_1').set({
      uid: 'admin_1',
      email: 'itxmerajkhan3109@gmail.com',
      displayName: 'Clinic Admin',
      role: 'admin',
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection('users').doc('recep_1').set({
      uid: 'recep_1',
      email: 'r1@clinic.example',
      displayName: 'Front Desk',
      role: 'receptionist',
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection('users').doc('doc_user_1').set({
      uid: 'doc_user_1',
      email: 'd1@clinic.example',
      displayName: 'Dr. Maya Okafor',
      role: 'doctor',
      doctorId: 'd1',
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection('users').doc('patient_1').set({
      uid: 'patient_1',
      email: 'p1@example.com',
      displayName: 'Patient One',
      role: 'patient',
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function performBookingTx(
  db: FirestoreCompat,
  params: {
    apptId: string;
    patientUid: string;
    doctorId: string;
    doctorName: string;
    serviceId: string;
    serviceName: string;
    durationMins: number;
    estimatedValue: number;
    date: string;
    time: string;
    stepMins: number;
    status: 'pending' | 'confirmed';
    source: 'form' | 'walkin';
    tokenHash: string;
    staffActorRole?: 'admin' | 'receptionist';
    overrideLockIds?: string[];
    overrideLockTimes?: string[];
    skipSlotLocks?: boolean;
  }
) {
  const times = params.overrideLockTimes ?? getCoveredTimes(params.time, params.durationMins, params.stepMins);
  const lockIds =
    params.overrideLockIds ?? getCoveredLockIds(params.doctorId, params.date, params.time, params.durationMins, params.stepMins);

  await db.runTransaction(async (tx) => {
    const patientRef = db
      .collection('patients')
      .doc(params.staffActorRole ? `pt_${params.apptId}` : params.patientUid);
    await tx.get(patientRef);

    const now = firebase.firestore.FieldValue.serverTimestamp();
    tx.set(db.collection('appointments').doc(params.apptId), {
      id: params.apptId,
      referenceCode: 'FC-9001',
      patientUid: params.patientUid,
      patientName: 'Jordan Rivera',
      patientPhone: '+1 555 010 2030',
      serviceId: params.serviceId,
      serviceName: params.serviceName,
      doctorId: params.doctorId,
      doctorName: params.doctorName,
      date: params.date,
      time: params.time,
      durationMins: params.durationMins,
      estimatedValue: params.estimatedValue,
      status: params.status,
      source: params.source,
      notes: 'Emulator verification booking',
      staffNotes: '',
      slotLockId: lockIds[0],
      slotLockIds: lockIds,
      guestTokenHash: params.tokenHash,
      isSample: false,
      createdAt: now,
      updatedAt: now,
    });

    if (!params.skipSlotLocks) {
      lockIds.forEach((lockId, idx) => {
        tx.set(db.collection('slotLocks').doc(lockId), {
          doctorId: params.doctorId,
          date: params.date,
          time: times[idx] || params.time,
          appointmentId: params.apptId,
          bookedByUid: params.patientUid,
          createdAt: now,
        });
        tx.set(db.collection('busySlots').doc(lockId), {
          doctorId: params.doctorId,
          date: params.date,
          time: times[idx] || params.time,
          createdAt: now,
        });
      });
    }

    tx.set(db.collection('visitLookups').doc(params.tokenHash), {
      id: params.tokenHash,
      appointmentId: params.apptId,
      ownerUid: params.patientUid,
      referenceCode: 'FC-9001',
      serviceName: params.serviceName,
      doctorId: params.doctorId,
      doctorName: params.doctorName,
      date: params.date,
      time: params.time,
      durationMins: params.durationMins,
      status: params.status,
      createdAt: now,
      updatedAt: now,
    });

    tx.set(patientRef, {
      id: patientRef.id,
      ...(params.staffActorRole ? {} : { uid: params.patientUid }),
      fullName: 'Jordan Rivera',
      phone: '+1 555 010 2030',
      preferredDoctorId: params.doctorId,
      totalAppointments: 1,
      notes: '',
      isSample: false,
      createdAt: now,
      updatedAt: now,
    });

    if (params.staffActorRole) {
      tx.set(db.collection('auditLogs').doc(`log_${params.apptId}`), {
        id: `log_${params.apptId}`,
        actorUid: params.patientUid,
        actorEmail: 'r1@clinic.example',
        actorRole: params.staffActorRole,
        action: 'appointment.create',
        targetCollection: 'appointments',
        targetId: params.apptId,
        summary: `Staff created ${params.apptId}`,
        createdAt: now,
      });
    }
  });
}

export async function runEmulatorTests(): Promise<void> {
  const rulesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-fourclinic-rules-test',
    firestore: {
      rules,
    },
  });

  try {
    const testDate = nextWeekdayIso(3);
    const secondDate = nextWeekdayIso(5);
    const blockedDate = nextWeekdayIso(10);
    const pastDate = addDaysIso(todayIso(), -3);

    await testEnv.clearFirestore();
    await seedCatalogAndUsers(testEnv, blockedDate, 30);

    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    const anon1Db = testEnv
      .authenticatedContext('anon_guest_1', {
        provider_id: 'anonymous',
        firebase: { sign_in_provider: 'anonymous' },
      })
      .firestore();
    const anon2Db = testEnv
      .authenticatedContext('anon_guest_2', {
        provider_id: 'anonymous',
        firebase: { sign_in_provider: 'anonymous' },
      })
      .firestore();
    const patient1Db = testEnv
      .authenticatedContext('patient_1', {
        email: 'p1@example.com',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();
    const recepDb = testEnv
      .authenticatedContext('recep_1', {
        email: 'r1@clinic.example',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();
    const doctor1Db = testEnv
      .authenticatedContext('doc_user_1', {
        email: 'd1@clinic.example',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext('admin_1', {
        email: 'itxmerajkhan3109@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const unverifiedAdminSpoofDb = testEnv
      .authenticatedContext('spoof_admin', {
        email: 'itxmerajkhan3109@gmail.com',
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();

    const hash1 = await sha256Hex('FCV-ANON01-AAAAAA-BBBBBB-CCCCCC');
    const hash2 = await sha256Hex('FCV-ANON02-AAAAAA-BBBBBB-CCCCCC');
    const hashStaff = await sha256Hex('FCV-STAFF1-AAAAAA-BBBBBB-CCCCCC');

    // 1. Anonymous guest valid 2-slot atomic pending booking (30m grid, 60m service)
    await assertSucceeds(
      performBookingTx(anon1Db, {
        apptId: 'appt_anon_1',
        patientUid: 'anon_guest_1',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        durationMins: 60,
        estimatedValue: 240,
        date: testDate,
        time: '10:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash1,
      })
    );

    // 2. Deny pre-confirmed booking, tampered duration/price, doctor mismatch, orphan, hijack, past-date, lunch & blocked dates
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_confirmed_spoof',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'checkup',
        serviceName: 'Check-up & Consultation',
        durationMins: 30,
        estimatedValue: 50,
        date: testDate,
        time: '14:00',
        stepMins: 30,
        status: 'confirmed',
        source: 'form',
        tokenHash: hash2,
      })
    );
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_tamper_dur',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        durationMins: 30,
        estimatedValue: 240,
        date: testDate,
        time: '14:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash2,
      })
    );
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_tamper_price',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        durationMins: 60,
        estimatedValue: 1,
        date: testDate,
        time: '14:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash2,
      })
    );
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_orphan',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'checkup',
        serviceName: 'Check-up & Consultation',
        durationMins: 30,
        estimatedValue: 50,
        date: testDate,
        time: '14:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash2,
        skipSlotLocks: true,
      })
    );
    // Anti-hijack test: Attacker points appointments doc at Victim's existing slotLocks without writing slotLocks
    await assertFails(
      anon2Db.collection('appointments').doc('appt_hijack').set({
        id: 'appt_hijack',
        referenceCode: 'FC-9999',
        patientUid: 'anon_guest_2',
        patientName: 'Attacker Mallory',
        patientPhone: '+1 555 999 0000',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        date: testDate,
        time: '10:00',
        durationMins: 60,
        estimatedValue: 240,
        status: 'pending',
        source: 'form',
        notes: '',
        staffNotes: '',
        slotLockId: `d1_${testDate}_1000`,
        slotLockIds: [`d1_${testDate}_1000`, `d1_${testDate}_1030`],
        isSample: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    // Non-contiguous slotLocks test
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_noncontig',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        durationMins: 60,
        estimatedValue: 240,
        date: testDate,
        time: '14:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash2,
        overrideLockIds: [`d1_${testDate}_1400`, `d1_${testDate}_1500`],
        overrideLockTimes: ['14:00', '15:00'],
      })
    );
    // Past date, lunch overlap (11:30 for 60m), outside hours (07:00), blockedDate
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_past',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'checkup',
        serviceName: 'Check-up & Consultation',
        durationMins: 30,
        estimatedValue: 50,
        date: pastDate,
        time: '10:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash2,
      })
    );
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_lunch',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        durationMins: 60,
        estimatedValue: 240,
        date: testDate,
        time: '11:30',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash2,
      })
    );
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_early',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'checkup',
        serviceName: 'Check-up & Consultation',
        durationMins: 30,
        estimatedValue: 50,
        date: testDate,
        time: '07:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash2,
      })
    );
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_blocked',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'checkup',
        serviceName: 'Check-up & Consultation',
        durationMins: 30,
        estimatedValue: 50,
        date: blockedDate,
        time: '10:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash2,
      })
    );

    // 3. Overlapping conflict + public busySlots vs private slotLocks
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_overlap',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        durationMins: 60,
        estimatedValue: 240,
        date: testDate,
        time: '09:30',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hash2,
      })
    );
    await assertSucceeds(unauthedDb.collection('busySlots').get());
    await assertFails(unauthedDb.collection('slotLocks').get());

    // 4. Test 15m, 45m, 60m slot grids + 90m on 15m grid incomplete lock rejection
    await assertSucceeds(
      adminDb.collection('clinicSettings').doc('main').update({
        slotDurationMins: 15,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    await assertSucceeds(
      performBookingTx(anon2Db, {
        apptId: 'appt_15m_ok',
        patientUid: 'anon_guest_2',
        doctorId: 'd2',
        doctorName: 'Dr. Daniel Reyes',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        durationMins: 60,
        estimatedValue: 240,
        date: secondDate,
        time: '09:00',
        stepMins: 15,
        status: 'pending',
        source: 'form',
        tokenHash: await sha256Hex('FCV-GRID15-AAAAAA-BBBBBB-CCCCCC'),
      })
    );
    // Incomplete 4 locks for 90m on 15m grid (needs 6) must be DENIED
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_15m_90m_incomplete',
        patientUid: 'anon_guest_2',
        doctorId: 'd3',
        doctorName: 'Dr. Priya Nair',
        serviceId: 'rootcanal',
        serviceName: 'Root Canal (Endodontics)',
        durationMins: 90,
        estimatedValue: 480,
        date: secondDate,
        time: '14:00',
        stepMins: 15,
        status: 'pending',
        source: 'form',
        tokenHash: await sha256Hex('FCV-GRID15-90MFAIL-BBBBBB-CCCCCC'),
        overrideLockIds: [
          `d3_${secondDate}_1400`,
          `d3_${secondDate}_1415`,
          `d3_${secondDate}_1430`,
          `d3_${secondDate}_1445`,
        ],
        overrideLockTimes: ['14:00', '14:15', '14:30', '14:45'],
      })
    );

    await assertSucceeds(
      adminDb.collection('clinicSettings').doc('main').update({
        slotDurationMins: 45,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    await assertSucceeds(
      performBookingTx(anon2Db, {
        apptId: 'appt_45m_ok',
        patientUid: 'anon_guest_2',
        doctorId: 'd3',
        doctorName: 'Dr. Priya Nair',
        serviceId: 'whitening',
        serviceName: 'Teeth Whitening',
        durationMins: 60,
        estimatedValue: 240,
        date: secondDate,
        time: '09:45',
        stepMins: 45,
        status: 'pending',
        source: 'form',
        tokenHash: await sha256Hex('FCV-GRID45-AAAAAA-BBBBBB-CCCCCC'),
      })
    );
    // Unaligned 10:00 on 45m grid must be DENIED
    await assertFails(
      performBookingTx(anon2Db, {
        apptId: 'appt_45m_unaligned',
        patientUid: 'anon_guest_2',
        doctorId: 'd4',
        doctorName: 'Dr. Lucas Meyer',
        serviceId: 'checkup',
        serviceName: 'Check-up & Consultation',
        durationMins: 30,
        estimatedValue: 50,
        date: secondDate,
        time: '10:00',
        stepMins: 45,
        status: 'pending',
        source: 'form',
        tokenHash: await sha256Hex('FCV-GRID45-BAD000-BBBBBB-CCCCCC'),
        overrideLockIds: [`d4_${secondDate}_1000`],
        overrideLockTimes: ['10:00'],
      })
    );

    await assertSucceeds(
      adminDb.collection('clinicSettings').doc('main').update({
        slotDurationMins: 60,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    await assertSucceeds(
      performBookingTx(anon2Db, {
        apptId: 'appt_60m_ok',
        patientUid: 'anon_guest_2',
        doctorId: 'd4',
        doctorName: 'Dr. Lucas Meyer',
        serviceId: 'rootcanal',
        serviceName: 'Root Canal (Endodontics)',
        durationMins: 90,
        estimatedValue: 480,
        date: secondDate,
        time: '14:00',
        stepMins: 60,
        status: 'pending',
        source: 'form',
        tokenHash: await sha256Hex('FCV-GRID60-AAAAAA-BBBBBB-CCCCCC'),
      })
    );

    // Restore 30m grid
    await assertSucceeds(
      adminDb.collection('clinicSettings').doc('main').update({
        slotDurationMins: 30,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );

    // 5. Inquiries ALLOW / DENY
    await assertSucceeds(
      anon1Db.collection('inquiries').doc('inq_anon_1').set({
        id: 'inq_anon_1',
        patientUid: 'anon_guest_1',
        channel: 'website',
        name: 'Jordan Rivera',
        contact: '+1 555 010 2030',
        topic: 'general',
        status: 'new',
        priority: 'normal',
        estimatedValue: 100,
        internalNotes: '',
        unread: true,
        messages: [{ from: 'user', text: 'Do you accept Harbor PPO?', ts: '2026-11-22T10:00:00Z' }],
        isSample: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    await assertFails(
      anon1Db.collection('inquiries').doc('inq_spoof_staff').set({
        id: 'inq_spoof_staff',
        patientUid: 'anon_guest_1',
        channel: 'website',
        name: 'Jordan Rivera',
        contact: '+1 555 010 2030',
        topic: 'general',
        status: 'new',
        priority: 'normal',
        estimatedValue: 100,
        internalNotes: '',
        unread: true,
        messages: [{ from: 'staff', text: 'Confirmed!', ts: '2026-11-22T10:00:00Z' }],
        isSample: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    await assertFails(
      anon1Db.collection('inquiries').doc('inq_ghost').set({
        id: 'inq_ghost',
        patientUid: 'anon_guest_1',
        channel: 'website',
        name: 'Jordan Rivera',
        contact: '+1 555 010 2030',
        topic: 'general',
        status: 'new',
        priority: 'normal',
        estimatedValue: 100,
        internalNotes: '',
        unread: true,
        isAdminApproved: true,
        messages: [{ from: 'user', text: 'Hi', ts: '2026-11-22T10:00:00Z' }],
        isSample: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );

    // 6. Own access, cross-patient denial & visitLookups tracking
    await assertSucceeds(anon1Db.collection('appointments').doc('appt_anon_1').get());
    await assertSucceeds(
      anon1Db.collection('appointments').where('patientUid', '==', 'anon_guest_1').get()
    );
    await assertFails(patient1Db.collection('appointments').doc('appt_anon_1').get());
    await assertFails(patient1Db.collection('appointments').get());
    await assertFails(anon2Db.collection('inquiries').get());
    await assertFails(anon1Db.collection('patients').get());

    await assertSucceeds(anon2Db.collection('visitLookups').doc(hash1).get());
    await assertFails(anon2Db.collection('visitLookups').get());
    await assertFails(
      anon1Db.collection('visitLookups').doc(hash1).update({
        status: 'confirmed',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );

    // 7. Receptionist 4-slot confirmed booking + pending confirmation; Doctor completion; Admin vs Spoof
    await assertSucceeds(
      performBookingTx(recepDb, {
        apptId: 'appt_staff_4slot',
        patientUid: 'recep_1',
        doctorId: 'd4',
        doctorName: 'Dr. Lucas Meyer',
        serviceId: 'long120',
        serviceName: 'Full Implant Rehab',
        durationMins: 120,
        estimatedValue: 1500,
        date: secondDate,
        time: '14:00',
        stepMins: 30,
        status: 'confirmed',
        source: 'walkin',
        tokenHash: hashStaff,
        staffActorRole: 'receptionist',
      })
    );
    await assertSucceeds(
      recepDb.collection('appointments').doc('appt_anon_1').update({
        status: 'confirmed',
        staffNotes: 'Confirmed by front desk',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    await assertFails(
      recepDb.collection('clinicSettings').doc('main').update({
        clinicName: 'Renamed',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    await assertFails(recepDb.collection('auditLogs').doc('log_appt_staff_4slot').delete());

    // Doctor d1 completes own confirmed appointment & releases locks + syncs visitLookup
    await assertSucceeds(
      doctor1Db.runTransaction(async (tx) => {
        await tx.get(doctor1Db.collection('appointments').doc('appt_anon_1'));
        await tx.get(doctor1Db.collection('visitLookups').doc(hash1));
        const now = firebase.firestore.FieldValue.serverTimestamp();
        tx.update(doctor1Db.collection('appointments').doc('appt_anon_1'), {
          status: 'completed',
          staffNotes: 'All good.',
          updatedAt: now,
        });
        tx.update(doctor1Db.collection('visitLookups').doc(hash1), {
          status: 'completed',
          updatedAt: now,
        });
        tx.delete(doctor1Db.collection('slotLocks').doc(`d1_${testDate}_1000`));
        tx.delete(doctor1Db.collection('slotLocks').doc(`d1_${testDate}_1030`));
        tx.delete(doctor1Db.collection('busySlots').doc(`d1_${testDate}_1000`));
        tx.delete(doctor1Db.collection('busySlots').doc(`d1_${testDate}_1030`));
      })
    );
    // Terminal appointment reopening by guest denied
    await assertFails(
      anon1Db.collection('appointments').doc('appt_anon_1').update({
        status: 'pending',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    // Doctor d1 cannot read d2 appointment
    await assertFails(doctor1Db.collection('appointments').doc('appt_15m_ok').get());

    // 8. Reschedule & Cancellation releasing locks
    const hashResched = await sha256Hex('FCV-RESCH1-AAAAAA-BBBBBB-CCCCCC');
    await assertSucceeds(
      performBookingTx(anon1Db, {
        apptId: 'appt_resched_1',
        patientUid: 'anon_guest_1',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'checkup',
        serviceName: 'Check-up & Consultation',
        durationMins: 30,
        estimatedValue: 50,
        date: testDate,
        time: '14:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: hashResched,
      })
    );
    await assertSucceeds(
      anon1Db.runTransaction(async (tx) => {
        const now = firebase.firestore.FieldValue.serverTimestamp();
        tx.delete(anon1Db.collection('slotLocks').doc(`d1_${testDate}_1400`));
        tx.delete(anon1Db.collection('busySlots').doc(`d1_${testDate}_1400`));
        tx.set(anon1Db.collection('slotLocks').doc(`d1_${testDate}_1500`), {
          doctorId: 'd1',
          date: testDate,
          time: '15:00',
          appointmentId: 'appt_resched_1',
          bookedByUid: 'anon_guest_1',
          createdAt: now,
        });
        tx.set(anon1Db.collection('busySlots').doc(`d1_${testDate}_1500`), {
          doctorId: 'd1',
          date: testDate,
          time: '15:00',
          createdAt: now,
        });
        tx.update(anon1Db.collection('appointments').doc('appt_resched_1'), {
          date: testDate,
          time: '15:00',
          slotLockId: `d1_${testDate}_1500`,
          slotLockIds: [`d1_${testDate}_1500`],
          status: 'pending',
          updatedAt: now,
        });
        tx.update(anon1Db.collection('visitLookups').doc(hashResched), {
          date: testDate,
          time: '15:00',
          status: 'pending',
          updatedAt: now,
        });
      })
    );
    await assertSucceeds(
      anon1Db.runTransaction(async (tx) => {
        const now = firebase.firestore.FieldValue.serverTimestamp();
        tx.update(anon1Db.collection('appointments').doc('appt_resched_1'), {
          status: 'cancelled',
          updatedAt: now,
        });
        tx.update(anon1Db.collection('visitLookups').doc(hashResched), {
          status: 'cancelled',
          updatedAt: now,
        });
        tx.delete(anon1Db.collection('slotLocks').doc(`d1_${testDate}_1500`));
        tx.delete(anon1Db.collection('busySlots').doc(`d1_${testDate}_1500`));
      })
    );
    // Released 15:00 slot can now be rebooked by anon2
    await assertSucceeds(
      performBookingTx(anon2Db, {
        apptId: 'appt_rebooked_1500',
        patientUid: 'anon_guest_2',
        doctorId: 'd1',
        doctorName: 'Dr. Maya Okafor',
        serviceId: 'checkup',
        serviceName: 'Check-up & Consultation',
        durationMins: 30,
        estimatedValue: 50,
        date: testDate,
        time: '15:00',
        stepMins: 30,
        status: 'pending',
        source: 'form',
        tokenHash: await sha256Hex('FCV-REBOOK-AAAAAA-BBBBBB-CCCCCC'),
      })
    );

    // 9. Privilege escalation & unverified admin spoof denials
    await assertFails(
      unverifiedAdminSpoofDb.collection('clinicSettings').doc('main').update({
        clinicName: 'Spoofed',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    await assertFails(
      patient1Db.collection('users').doc('patient_1').update({
        role: 'receptionist',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
    const newPatientDb = testEnv
      .authenticatedContext('new_patient_1', {
        email: 'newp@example.com',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();
    await assertFails(
      newPatientDb.collection('users').doc('new_patient_1').set({
        uid: 'new_patient_1',
        email: 'newp@example.com',
        displayName: 'Mallory',
        role: 'admin',
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );

    // Non-owner cannot delete another guest's slotLock
    const lockSnap = await adminDb.collection('slotLocks').doc(`d1_${testDate}_1500`).get();
    assert.equal(lockSnap.exists, true);
    await assertFails(anon1Db.collection('slotLocks').doc(`d1_${testDate}_1500`).delete());

    console.log('ALL_FIRESTORE_EMULATOR_SECURITY_RULES_TESTS_PASSED');
  } finally {
    await testEnv.cleanup();
  }
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runEmulatorTests().catch((err) => {
    console.error('FIRESTORE_EMULATOR_TEST_FAILED:', err);
    process.exit(1);
  });
}
