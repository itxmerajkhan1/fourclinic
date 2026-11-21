import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'patient' | 'doctor' | 'receptionist' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  role: UserRole;
  doctorId?: string;
  active: boolean;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayHours {
  enabled: boolean;
  start: string;
  end: string;
  lunchStart?: string;
  lunchEnd?: string;
}

export type WorkingHoursMap = Record<WeekdayKey, DayHours>;

export interface Doctor {
  id: string;
  name: string;
  role: string;
  specialty: string;
  bio: string;
  experience: string;
  languages: string;
  color: string;
  photoUrl: string;
  initials: string;
  active: boolean;
  workingHours: WorkingHoursMap;
  blockedDates: string[];
  isSample: boolean;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  includes: string;
  durationMins: number;
  priceLabel: string;
  basePrice: number;
  iconKey: string;
  defaultDoctorId: string;
  active: boolean;
  sortOrder: number;
  isSample: boolean;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface ScheduleOverride {
  id: string;
  doctorId: string;
  date: string;
  isBlockedDay: boolean;
  blockedSlots: string[];
  reason: string;
  createdByUid: string;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface SlotLock {
  doctorId: string;
  date: string;
  time: string;
  appointmentId: string;
  bookedByUid: string;
  createdAt?: Timestamp | string;
}

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentSource =
  | 'form'
  | 'chatbot'
  | 'whatsapp'
  | 'phone'
  | 'walkin'
  | 'staff';

export interface Appointment {
  id: string;
  referenceCode: string;
  patientUid: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  serviceId: string;
  serviceName: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  durationMins: number;
  estimatedValue: number;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string;
  staffNotes: string;
  slotLockId: string;
  slotLockIds: string[];
  isSample: boolean;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface PatientRecord {
  id: string;
  uid?: string;
  fullName: string;
  phone: string;
  email?: string;
  preferredDoctorId?: string;
  lastVisitDate?: string;
  totalAppointments: number;
  notes: string;
  isSample: boolean;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export type InquiryStatus = 'new' | 'contacted' | 'follow_up' | 'closed';
export type InquiryChannel = 'website' | 'chatbot' | 'whatsapp' | 'phone';
export type InquiryPriority = 'normal' | 'urgent';

export interface InquiryMessage {
  from: 'user' | 'bot' | 'staff';
  text: string;
  ts: string;
}

export interface Inquiry {
  id: string;
  patientUid: string;
  channel: InquiryChannel;
  name: string;
  contact: string;
  topic: string;
  status: InquiryStatus;
  priority: InquiryPriority;
  assignedToUid?: string;
  assignedToName?: string;
  estimatedValue: number;
  internalNotes: string;
  unread: boolean;
  messages: InquiryMessage[];
  isSample: boolean;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface ClinicHoliday {
  date: string;
  label: string;
}

export interface ClinicSettings {
  id: string;
  clinicName: string;
  address: string;
  phone: string;
  email: string;
  slotDurationMins: 15 | 30 | 45 | 60;
  minLeadTimeMins: number;
  maxBookingDaysAhead: number;
  workingHours: WorkingHoursMap;
  holidays: ClinicHoliday[];
  allowChatbotBooking: boolean;
  requireConfirmation: boolean;
  updatedByUid?: string;
  updatedAt?: Timestamp | string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: 'admin' | 'receptionist' | 'doctor';
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  createdAt?: Timestamp | string;
}
