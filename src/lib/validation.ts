import type {
  AppointmentStatus,
  BusySlot,
  ClinicSettings,
  Doctor,
  ScheduleOverride,
  WeekdayKey,
} from '../types/clinic';

export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_REGEX = /^\d{2}:\d{2}$/;
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;
export const MAX_SLOT_LOCKS = 4;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function addDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toIsoDate(dt);
}

export function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateLabel(dateStr: string): string {
  if (!DATE_REGEX.test(dateStr)) return dateStr;
  return parseIsoDate(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeLabel(timeStr: string): string {
  if (!TIME_REGEX.test(timeStr)) return timeStr;
  const [h, m] = timeStr.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hr12 = ((h + 11) % 12) + 1;
  return `${hr12}:${pad2(m)} ${suffix}`;
}

export function getWeekdayKey(dateStr: string): WeekdayKey {
  const keys: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return keys[parseIsoDate(dateStr).getDay()];
}

export function expectedLockId(doctorId: string, date: string, time: string): string {
  return `${doctorId}_${date}_${time.replace(':', '')}`;
}

export function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

export function isPastDateTime(dateStr: string, timeStr: string, minLeadTimeMins = 30): boolean {
  if (!DATE_REGEX.test(dateStr) || !TIME_REGEX.test(timeStr)) return true;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const slotMs = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  return slotMs < Date.now() + minLeadTimeMins * 60_000;
}

export function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minsToTime(mins: number): string {
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

export function getSlotsNeededForDuration(durationMins: number, stepMins: number): number {
  const step = Math.max(15, stepMins || 30);
  return Math.max(1, Math.ceil((durationMins || step) / step));
}

export function getCoveredTimes(startTime: string, durationMins: number, stepMins: number): string[] {
  const step = Math.max(15, stepMins || 30);
  const slotsNeeded = getSlotsNeededForDuration(durationMins, step);
  if (slotsNeeded > MAX_SLOT_LOCKS) {
    throw new Error(
      `Visit duration (${durationMins}m) requires ${slotsNeeded} slots on a ${step}m grid, exceeding the ${MAX_SLOT_LOCKS}-slot atomic lock limit.`
    );
  }
  const start = timeToMins(startTime);
  const times: string[] = [];
  for (let i = 0; i < slotsNeeded; i++) {
    times.push(minsToTime(start + i * step));
  }
  return times;
}

export function getCoveredLockIds(
  doctorId: string,
  date: string,
  startTime: string,
  durationMins: number,
  stepMins: number
): string[] {
  return getCoveredTimes(startTime, durationMins, stepMins).map((t) =>
    expectedLockId(doctorId, date, t)
  );
}

export function generateAvailableSlotsForDoctor(params: {
  dateStr: string;
  doctor: Doctor;
  schedules: ScheduleOverride[];
  slotLocks: Array<BusySlot & { appointmentId?: string }>;
  settings: ClinicSettings;
  serviceDurationMins?: number;
  ignoreAppointmentId?: string;
  ignoreLockIds?: string[];
}): string[] {
  const {
    dateStr,
    doctor,
    schedules,
    slotLocks,
    settings,
    serviceDurationMins,
    ignoreAppointmentId,
    ignoreLockIds,
  } = params;
  if (!DATE_REGEX.test(dateStr) || !doctor.active) return [];

  if (settings.holidays.some((h) => h.date === dateStr)) return [];
  if (doctor.blockedDates?.includes(dateStr)) return [];

  const docOverrides = schedules.filter((s) => s.doctorId === doctor.id && s.date === dateStr);
  if (docOverrides.some((s) => s.isBlockedDay)) return [];

  const dayKey = getWeekdayKey(dateStr);
  const clinicDay = settings.workingHours[dayKey];
  const docDay = doctor.workingHours?.[dayKey] ?? clinicDay;
  if (!clinicDay?.enabled || !docDay?.enabled) return [];

  const startMins = Math.max(timeToMins(clinicDay.start), timeToMins(docDay.start));
  const endMins = Math.min(timeToMins(clinicDay.end), timeToMins(docDay.end));
  const step = settings.slotDurationMins || 30;
  const duration = Math.max(step, serviceDurationMins || step);
  if (getSlotsNeededForDuration(duration, step) > MAX_SLOT_LOCKS) {
    return [];
  }

  const lunchStart = docDay.lunchStart
    ? timeToMins(docDay.lunchStart)
    : clinicDay.lunchStart
      ? timeToMins(clinicDay.lunchStart)
      : null;
  const lunchEnd = docDay.lunchEnd
    ? timeToMins(docDay.lunchEnd)
    : clinicDay.lunchEnd
      ? timeToMins(clinicDay.lunchEnd)
      : null;

  const ignoreSet = new Set(ignoreLockIds || []);
  const blockedSet = new Set<string>();
  docOverrides.forEach((ov) => ov.blockedSlots.forEach((t) => blockedSet.add(t)));
  slotLocks.forEach((lock) => {
    const lockId = expectedLockId(lock.doctorId, lock.date, lock.time);
    const matchesIgnoredAppt = Boolean(ignoreAppointmentId && lock.appointmentId === ignoreAppointmentId);
    if (
      lock.doctorId === doctor.id &&
      lock.date === dateStr &&
      !matchesIgnoredAppt &&
      !ignoreSet.has(lockId)
    ) {
      blockedSet.add(lock.time);
    }
  });

  // Build set of open base grid intervals
  const openGridTimes = new Set<string>();
  const allGridTimes: string[] = [];
  for (let m = startMins; m + step <= endMins; m += step) {
    if (lunchStart !== null && lunchEnd !== null && m < lunchEnd && m + step > lunchStart) {
      continue;
    }
    const t = minsToTime(m);
    allGridTimes.push(t);
    if (!blockedSet.has(t)) {
      openGridTimes.add(t);
    }
  }

  // Only permit start times where EVERY grid slot across the full service duration is open and not past
  return allGridTimes.filter((startTime) => {
    if (isPastDateTime(dateStr, startTime, settings.minLeadTimeMins)) return false;
    const needed = getCoveredTimes(startTime, duration, step);
    return needed.every((slotTime) => openGridTimes.has(slotTime));
  });
}

export function validateBookingInput(input: {
  patientName: string;
  patientPhone: string;
  date: string;
  time: string;
  notes: string;
  maxDaysAhead: number;
  minLeadTimeMins: number;
}): string | null {
  const name = input.patientName.trim();
  if (name.length < 2 || name.length > 80 || /\d/.test(name)) {
    return 'Please enter a valid full name (2–80 characters, no digits).';
  }
  const digits = input.patientPhone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15 || input.patientPhone.trim().length > 24) {
    return 'Please enter a valid phone or WhatsApp number (7–15 digits).';
  }
  if (!DATE_REGEX.test(input.date)) {
    return 'Please choose a valid appointment date.';
  }
  const today = todayIso();
  const maxDate = addDaysIso(today, input.maxDaysAhead || 60);
  if (input.date < today) {
    return 'Bookings in the past are not allowed.';
  }
  if (input.date > maxDate) {
    return `Bookings can be scheduled up to ${input.maxDaysAhead || 60} days ahead.`;
  }
  if (!TIME_REGEX.test(input.time)) {
    return 'Please choose an available time slot.';
  }
  if (isPastDateTime(input.date, input.time, input.minLeadTimeMins)) {
    return 'That time slot has already passed or is too close to the current time.';
  }
  if (input.notes.trim().length > 400) {
    return 'Notes must be 400 characters or fewer.';
  }
  return null;
}

export const ALLOWED_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export function generateGuestVisitSecret(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `FCV-${hex.slice(0, 6)}-${hex.slice(6, 12)}-${hex.slice(12, 18)}-${hex.slice(18, 24)}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input.trim());
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface LocalGuestVisitSecret {
  appointmentId: string;
  referenceCode: string;
  secret: string;
  serviceName: string;
  doctorName: string;
  date: string;
  time: string;
  createdAtIso: string;
}

const GUEST_SECRETS_KEY = 'fc_guest_visit_secrets_v1';

export function getLocalGuestVisitSecrets(): LocalGuestVisitSecret[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GUEST_SECRETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LocalGuestVisitSecret =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.appointmentId === 'string' &&
        typeof item.secret === 'string' &&
        typeof item.referenceCode === 'string'
    );
  } catch {
    return [];
  }
}

export function saveLocalGuestVisitSecret(entry: LocalGuestVisitSecret): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalGuestVisitSecrets().filter(
      (x) => x.appointmentId !== entry.appointmentId
    );
    const next = [entry, ...existing].slice(0, 20);
    window.localStorage.setItem(GUEST_SECRETS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

export function getLocalGuestSecretForAppointment(appointmentId: string): string | null {
  const found = getLocalGuestVisitSecrets().find((x) => x.appointmentId === appointmentId);
  return found?.secret || null;
}

export function formatUserFriendlyError(
  err: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';

  // Map common Firebase Auth error codes cleanly
  if (code || raw.includes('auth/')) {
    const c = code || (raw.match(/auth\/[a-z0-9-]+/i)?.[0] ?? '');
    switch (c) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect email or password. Please check your credentials or use Forgot Password.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Please sign in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a few minutes before trying again.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Google sign-in popup was closed before completing.';
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
      case 'auth/credential-already-in-use':
        return 'This login credential is already associated with another existing account.';
      case 'auth/operation-not-allowed':
      case 'auth/admin-restricted-operation':
        return 'This sign-in method is not enabled in Firebase Console yet (Authentication → Sign-in method → enable Anonymous & Email/Password).';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized in Firebase Console → Authentication → Settings → Authorized domains.';
      case 'auth/network-request-failed':
        return 'Network error communicating with authentication service. Please check your connection.';
      case 'auth/requires-recent-login':
        return 'For security, please sign out and sign in again before completing this action.';
    }
  }

  if (!raw) return fallback;

  // Handle JSON-serialized FirestoreErrorInfo emitted by handleFirestoreError
  if (raw.startsWith('{') && raw.includes('"operationType"')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      const inner = String(parsed.error || '');
      if (inner.toLowerCase().includes('permission') || inner.toLowerCase().includes('insufficient')) {
        return 'Permission denied for that action. Please verify your signed-in account permissions.';
      }
      if (inner.toLowerCase().includes('offline') || inner.toLowerCase().includes('unavailable')) {
        return 'Network temporarily unavailable. Please check your connection and try again.';
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  if (raw.toLowerCase().includes('permission-denied') || raw.toLowerCase().includes('missing or insufficient permissions')) {
    return 'Permission denied for that action. Please verify your signed-in account permissions.';
  }

  return raw;
}
