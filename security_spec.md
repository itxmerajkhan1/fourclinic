# FourClinic Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Default-Deny Baseline:** All paths not explicitly matched under `/databases/{database}/documents` are denied.
2. **Tiered Identity Enforcement:**
   - **Staff & Admin RBAC** (`isAdmin`, `isReceptionist`, `isDoctor`, `isStaff`, `isBootstrapAdmin`) strictly require a non-anonymous account with `request.auth.token.email_verified == true`.
   - **Guest & Patient Operations** allow Firebase Auth sessions (`request.auth != null`, including anonymous guest sessions and unverified email/password patients during sign-up) ONLY for creating/reading their own `pending` appointments, atomic `slotLocks`, `visitLookups/{sha256Hash}`, `new` inquiries (`messages[0].from == 'user'`), own `patients/{uid}`, or a `'patient'`-only `users/{uid}` profile (for non-anonymous accounts).
3. **Zero Client Privilege Escalation:** New users registering `/users/{uid}` can only set `role == 'patient'` (unless matching the bootstrapped verified admin email `itxmerajkhan3109@gmail.com`). Only an authorized verified `admin` can change `role` or `doctorId`.
4. **PII & Identifier Isolation:** Public visitors and patients cannot list `/patients/*`, `/visitLookups/*`, `/slotLocks/*`, other users' `/users/*`, other patients' `/appointments/*`, `/inquiries/*`, or `/auditLogs/*`. Public calendar availability is served exclusively from `/busySlots/{lockId}` containing only `{ doctorId, date, time, createdAt }` (zero `bookedByUid`, zero `appointmentId`). Cross-device guest lookup uses `/visitLookups/{sha256Hash}` which contains zero phone/email/notes PII, has `allow list: if false`, and requires matching the parent appointment's `status`, `date`, and `time` on every write (`getAfter`).
5. **Atomic Double-Booking & Hijack Prevention (Exact 1..4 Contiguous Slot Bound):** `appointments.slotLockIds` is capped at `1..4` unique contiguous lock IDs matching `doctorId`, `date`, `time`, `service.durationMins`, and `clinicSettings/main.slotDurationMins` (`(size - 1) * stepMins < durationMins <= size * stepMins`). Every covered entry `[0..3]` is verified via `getAfter(/slotLocks/{id}).data.appointmentId == data.id` so attackers cannot point a new appointment at another patient's existing locks. Both `create` and schedule-changing `update` enforce active `doctor`/`service`, exact catalog `doctorName`, `serviceName`, `durationMins`, `estimatedValue`, clinic/doctor weekday working hours, lunch breaks, `blockedDates`, grid alignment, and booking horizon (`maxBookingDaysAhead`). Creating a `slotLock` verifies the parent appointment (`status in ['pending', 'confirmed']`, matching `doctorId`, `date`, and `lockId in appt.slotLockIds`). Creating a `busySlot` requires `existsAfter(/slotLocks/{lockId})`. *Remaining rule engine limits*: `clinicSettings.holidays` (list of maps) and randomly-ID'd `schedules` overrides remain client-enforced because Firestore Rules cannot iterate arbitrary map lists or query unknown override document IDs; services requiring `> 4` slots on fine grids throw/block explicitly without partial locking.
6. **Status Transition Integrity:**
   - Guests and patients can create appointments only in `'pending'` status (`source in ['form', 'chatbot']`) and can only cancel or reschedule non-terminal (`pending` | `confirmed`) appointments they own (rescheduling resets to `'pending'`, releases old `slotLocks` + `busySlots`, and syncs `visitLookups`).
   - Doctors can only inspect appointments assigned to their `doctorId` and transition `confirmed` -> `completed | no_show`.
   - Receptionists & Admins can confirm (`pending -> confirmed`), complete, cancel, mark `no_show`, or reschedule.
7. **Immutable Audit Trail:** `/auditLogs/*` can be created only by verified staff with `actorUid == request.auth.uid` and `createdAt == request.time`, and can never be updated or deleted.

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield `PERMISSION_DENIED`)
1. **Self-Assigned Admin Role:** Patient creates `/users/u1` with `{ role: "admin" }`.
2. **Role Escalation Update:** Patient updates `/users/u1` changing `role` from `"patient"` to `"receptionist"`.
3. **Unverified Admin Email Spoof:** User with `email: "itxmerajkhan3109@gmail.com"` and `email_verified: false` tries to list `/users` or update `/clinicSettings/main`.
4. **Cross-Patient Appointment Read:** Signed-in patient B reads `/appointments/a1` owned by patient A (`patientUid: "uA"`).
5. **Blanket Appointment Scrape:** Unauthenticated or patient user runs `getDocs(collection(db, "appointments"))` without `where("patientUid", "==", uid)`.
6. **Direct Status Shortcut on Create:** Patient creates `/appointments/a2` with `{ status: "confirmed" }`.
7. **Orphaned Appointment Without Slot Lock:** Patient creates `/appointments/a3` without atomically creating its matching `/slotLocks/{slotLockId}`.
8. **Duplicate Slot Collision:** Attacker creates `/slotLocks/d1_2026-12-01_1000` when that lock document already exists.
9. **Terminal Appointment Tampering:** Patient updates a `"completed"` appointment back to `"pending"`.
10. **Shadow / Ghost Field Injection:** Patient creates `/inquiries/q1` including an extra unallowed field `{ isAdminApproved: true }`.
11. **Doctor Cross-Schedule Access:** Doctor A (`doctorId: "d1"`) tries to read or update an appointment assigned to Doctor B (`doctorId: "d2"`).
12. **Audit Log Deletion / Tampering:** Staff user tries to delete or overwrite `/auditLogs/log1` or spoof `actorUid`.
