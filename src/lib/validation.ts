import type {
  AppointmentStatus,
  ClinicSettings,
  Doctor,
  ScheduleOverride,
  SlotLock,
  WeekdayKey,
} from '../types/clinic';

export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_REGEX = /^\d{2}:\d{2}$/;
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;

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

export function getCoveredTimes(startTime: string, durationMins: number, stepMins: number): string[] {
  const step = Math.max(15, stepMins || 30);
  const slotsNeeded = Math.min(16, Math.max(1, Math.ceil((durationMins || step) / step)));
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
  slotLocks: SlotLock[];
  settings: ClinicSettings;
  serviceDurationMins?: number;
  ignoreAppointmentId?: string;
}): string[] {
  const {
    dateStr,
    doctor,
    schedules,
    slotLocks,
    settings,
    serviceDurationMins,
    ignoreAppointmentId,
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

  const blockedSet = new Set<string>();
  docOverrides.forEach((ov) => ov.blockedSlots.forEach((t) => blockedSet.add(t)));
  slotLocks.forEach((lock) => {
    if (
      lock.doctorId === doctor.id &&
      lock.date === dateStr &&
      lock.appointmentId !== ignoreAppointmentId
    ) {
      blockedSet.add(lock.time);
    }
  });

  // Build set of open base grid intervals
  const openGridTimes = new Set<string>();
  const allGridTimes: string[] = [];
  for (let m = startMins; m + step <= endMins; m += step) {
    if (lunchStart !== null && lunchEnd !== null && m >= lunchStart && m < lunchEnd) {
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

export function formatUserFriendlyError(
  err: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
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

