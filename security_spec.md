# FourClinic Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Default-Deny Baseline:** All paths not explicitly matched under `/databases/{database}/documents` are denied.
2. **Verified Identity for Mutations:** Every user write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Zero Client Privilege Escalation:** New users registering `/users/{uid}` can only set `role == 'patient'` (unless matching the bootstrapped verified admin email `itxmerajkhan3109@gmail.com`). Only an authorized `admin` can change `role` or `doctorId`.
4. **PII Isolation:** Public unauthenticated visitors and patients cannot read `/patients/*`, other users' `/users/*`, other patients' `/appointments/*`, `/inquiries/*`, or `/auditLogs/*`.
5. **Atomic Double-Booking Prevention:** Every active appointment creation or reschedule must atomically create `/slotLocks/{doctorId}_{date}_{time}` inside the same Firestore transaction (`existsAfter` / `!exists`).
6. **Status Transition Integrity:**
   - Patients can create appointments only in `'pending'` status and can only cancel or reschedule non-terminal (`pending` | `confirmed`) appointments they own.
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
