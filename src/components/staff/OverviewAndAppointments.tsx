import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  Download,
  List,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import {
  addDaysIso,
  formatDateLabel,
  formatTimeLabel,
  formatUserFriendlyError,
  generateAvailableSlotsForDoctor,
  getSlotsNeededForDuration,
  MAX_SLOT_LOCKS,
  STATUS_LABELS,
  todayIso,
} from '../../lib/validation';
import type {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  BusySlot,
  ClinicSettings,
  Doctor,
  Inquiry,
  ScheduleOverride,
  ServiceItem,
  UserRole,
} from '../../types/clinic';

interface OverviewTabProps {
  role: UserRole;
  doctorId?: string;
  appointments: Appointment[];
  doctors: Doctor[];
  inquiries: Inquiry[];
  catalogSeeded: boolean;
  onConfirmAppt: (appt: Appointment) => Promise<void>;
  onGoToTab: (tab: string) => void;
  onInitializeCatalog: () => Promise<void>;
  onSeedSampleData: () => Promise<void>;
  onToast: (msg: string) => void;
}

export function OverviewTab({
  role,
  doctorId,
  appointments,
  doctors,
  inquiries,
  catalogSeeded,
  onConfirmAppt,
  onGoToTab,
  onInitializeCatalog,
  onSeedSampleData,
  onToast,
}: OverviewTabProps) {
  const [seeding, setSeeding] = useState(false);
  const today = todayIso();

  const scopedAppointments = useMemo(() => {
    if (role === 'doctor' && doctorId) {
      return appointments.filter((a) => a.doctorId === doctorId);
    }
    return appointments;
  }, [appointments, role, doctorId]);

  const todaysList = scopedAppointments.filter(
    (a) => a.date === today && a.status !== 'cancelled'
  );
  const pendingList = scopedAppointments.filter((a) => a.status === 'pending');
  const confirmedList = scopedAppointments.filter((a) => a.status === 'confirmed');
  const activeDoctorsCount = doctors.filter((d) => d.active).length;
  const urgentInquiries = inquiries.filter(
    (q) => q.priority === 'urgent' && q.status !== 'closed'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-[#D8DFD9]">
        <div>
          <h1 className="font-editorial text-3xl sm:text-4xl text-[#102E34]">
            {role === 'doctor' ? 'Doctor Schedule Overview' : 'Clinic Operations Overview'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#5B7074] fc-tabular">
            Live metrics computed directly from Cloud Firestore ({formatDateLabel(today)}).
          </p>
        </div>

        {role === 'admin' && (
          <div className="flex flex-wrap gap-2">
            {!catalogSeeded && (
              <button
                type="button"
                onClick={async () => {
                  await onInitializeCatalog();
                  onToast('Clinic doctors & services initialized in Firestore.');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Initialize Catalog</span>
              </button>
            )}
            <button
              type="button"
              disabled={seeding}
              onClick={async () => {
                setSeeding(true);
                try {
                  await onSeedSampleData();
                  onToast('Fictional sample records loaded (clearly marked Sample).');
                } catch (err) {
                  onToast(err instanceof Error ? err.message : 'Seed failed');
                } finally {
                  setSeeding(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#102E34] hover:border-[#426F77] cursor-pointer disabled:opacity-50"
            >
              <Database className="w-3.5 h-3.5 text-[#426F77]" />
              <span>{seeding ? 'Loading sample data…' : 'Load Demo Sample Data'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Hairline KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#D8DFD9] border-t-2 border-t-[#102E34] rounded-lg p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5B7074]">
            <span>Today&apos;s Appointments</span>
            <Calendar className="w-4 h-4 text-[#426F77]" />
          </div>
          <b className="block mt-2.5 font-editorial text-4xl leading-none text-[#102E34] fc-tabular">
            {todaysList.length}
          </b>
          <span className="mt-1.5 block text-xs text-[#5B7074]">Active bookings today</span>
        </div>

        <div className="bg-white border border-[#D8DFD9] border-t-2 border-t-[#C7775F] rounded-lg p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9A5B13]">
            <span>Pending Confirmation</span>
            <Clock className="w-4 h-4 text-[#C7775F]" />
          </div>
          <b className="block mt-2.5 font-editorial text-4xl leading-none text-[#102E34] fc-tabular">
            {pendingList.length}
          </b>
          <span className="mt-1.5 block text-xs text-[#5B7074]">Awaiting front-desk review</span>
        </div>

        <div className="bg-white border border-[#D8DFD9] border-t-2 border-t-[#1E6B4B] rounded-lg p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1E6B4B]">
            <span>Confirmed Upcoming</span>
            <CheckCircle2 className="w-4 h-4 text-[#1E6B4B]" />
          </div>
          <b className="block mt-2.5 font-editorial text-4xl leading-none text-[#102E34] fc-tabular">
            {confirmedList.length}
          </b>
          <span className="mt-1.5 block text-xs text-[#5B7074]">Verified &amp; locked slots</span>
        </div>

        <div className="bg-white border border-[#D8DFD9] border-t-2 border-t-[#426F77] rounded-lg p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5B7074]">
            <span>Active Doctors</span>
            <Stethoscope className="w-4 h-4 text-[#426F77]" />
          </div>
          <b className="block mt-2.5 font-editorial text-4xl leading-none text-[#102E34] fc-tabular">
            {activeDoctorsCount}
          </b>
          <span className="mt-1.5 block text-xs text-[#5B7074]">Available for booking</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Queue */}
        <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
          <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[#E6EAE4]">
            <h2 className="text-sm font-bold text-[#102E34] fc-tabular">
              Pending Booking Requests ({pendingList.length})
            </h2>
            <button
              type="button"
              onClick={() => onGoToTab('appointments')}
              className="text-xs font-semibold text-[#426F77] hover:text-[#102E34] underline underline-offset-4 cursor-pointer"
            >
              Manage all →
            </button>
          </div>
          {pendingList.length === 0 ? (
            <p className="text-sm text-[#5B7074] py-8 text-center">
              No pending appointments right now.
            </p>
          ) : (
            <div className="divide-y divide-[#E6EAE4]">
              {pendingList.slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <b className="text-sm text-[#102E34]">{a.patientName}</b>
                      {a.isSample && (
                        <span className="px-1.5 py-0.5 rounded-sm bg-[#EFECE4] text-[10px] font-semibold text-[#5B7074]">
                          SAMPLE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#5B7074] fc-tabular">
                      {a.referenceCode} · {a.serviceName} · {a.doctorName}
                    </p>
                    <p className="text-xs font-semibold text-[#426F77] mt-0.5 fc-tabular">
                      {formatDateLabel(a.date)} at {formatTimeLabel(a.time)}
                    </p>
                  </div>
                  {(role === 'admin' || role === 'receptionist') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await onConfirmAppt(a);
                          onToast(`Confirmed ${a.referenceCode} for ${a.patientName}`);
                        } catch (err) {
                          onToast(err instanceof Error ? err.message : 'Unable to confirm.');
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-md bg-[#1E6B4B] text-white text-xs font-semibold hover:opacity-95 cursor-pointer"
                    >
                      Confirm
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Urgent Inquiries or Doctor Schedule */}
        {role === 'doctor' ? (
          <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
            <h2 className="text-sm font-bold text-[#102E34] pb-3.5 mb-4 border-b border-[#E6EAE4] fc-tabular">
              Your Assigned Today Schedule ({todaysList.length})
            </h2>
            {todaysList.length === 0 ? (
              <p className="text-sm text-[#5B7074] py-8 text-center">
                No visits assigned to you for today.
              </p>
            ) : (
              <div className="divide-y divide-[#E6EAE4]">
                {todaysList.map((a) => (
                  <div key={a.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between text-sm">
                    <div>
                      <b className="text-[#102E34] fc-tabular">
                        {formatTimeLabel(a.time)} — {a.patientName}
                      </b>
                      <p className="text-xs text-[#5B7074]">
                        {a.serviceName} · {a.referenceCode}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-sm bg-[#DCE8E3] text-[#102E34] text-[11px] font-semibold">
                      {STATUS_LABELS[a.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[#E6EAE4]">
              <h2 className="text-sm font-bold text-[#102E34] flex items-center gap-2 fc-tabular">
                <AlertTriangle className="w-4 h-4 text-[#A12A2A]" />
                <span>Urgent Front-Desk Inquiries ({urgentInquiries.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => onGoToTab('inquiries')}
                className="text-xs font-semibold text-[#426F77] hover:text-[#102E34] underline underline-offset-4 cursor-pointer"
              >
                Open inbox →
              </button>
            </div>
            {urgentInquiries.length === 0 ? (
              <p className="text-sm text-[#5B7074] py-8 text-center">
                No open urgent inquiries. All urgent alerts are handled.
              </p>
            ) : (
              <div className="space-y-3">
                {urgentInquiries.slice(0, 5).map((q) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-md border border-[#E8BABA] bg-[#FBECEC]/60 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[#102E34]">{q.name}</b>
                      <span className="text-[11px] font-bold text-[#A12A2A] uppercase">
                        {q.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#3B5257] mt-1">{q.contact}</p>
                    <p className="text-xs text-[#102E34] mt-1 line-clamp-2">
                      {q.messages[0]?.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface AppointmentsTabProps {
  role: UserRole;
  doctorId?: string;
  appointments: Appointment[];
  doctors: Doctor[];
  services: ServiceItem[];
  schedules: ScheduleOverride[];
  slotLocks: BusySlot[];
  settings: ClinicSettings;
  catalogSeeded: boolean;
  availabilityVerified?: boolean;
  availabilityError?: string | null;
  onRetryAvailability?: () => void;
  onBookAppointment: (input: {
    patientName: string;
    patientPhone: string;
    serviceId: string;
    doctorId: string;
    date: string;
    time: string;
    notes: string;
    source: AppointmentSource;
    initialStatus?: 'pending' | 'confirmed';
  }) => Promise<Appointment>;
  onUpdateStatus: (
    appt: Appointment,
    status: AppointmentStatus,
    staffNotes?: string
  ) => Promise<void>;
  onReschedule: (
    appt: Appointment,
    newDate: string,
    newTime: string,
    newDoctor: Doctor
  ) => Promise<void>;
  onToast: (msg: string) => void;
}

export function AppointmentsTab({
  role,
  doctorId,
  appointments,
  doctors,
  services,
  schedules,
  slotLocks,
  settings,
  catalogSeeded,
  availabilityVerified = true,
  availabilityError = null,
  onRetryAvailability,
  onBookAppointment,
  onUpdateStatus,
  onReschedule,
  onToast,
}: AppointmentsTabProps) {
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [doctorFilter, setDoctorFilter] = useState<string>('all');
  const [calendarDate, setCalendarDate] = useState(todayIso());

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSvc, setNewSvc] = useState(services[0]?.id || 'checkup');
  const [newDoc, setNewDoc] = useState(doctors[0]?.id || 'd1');
  const [newDate, setNewDate] = useState(todayIso());
  const [newTime, setNewTime] = useState('');
  const [newStatus, setNewStatus] = useState<'pending' | 'confirmed'>('confirmed');
  const [newNotes, setNewNotes] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [reschedAppt, setReschedAppt] = useState<Appointment | null>(null);
  const [rDocId, setRDocId] = useState('');
  const [rDate, setRDate] = useState('');
  const [rTime, setRTime] = useState('');
  const [selectedCalItem, setSelectedCalItem] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!showCreate && !reschedAppt && !selectedCalItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreate(false);
        setReschedAppt(null);
        setSelectedCalItem(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreate, reschedAppt, selectedCalItem]);

  const canManageAll = role === 'admin' || role === 'receptionist';
  const activeDoctors = doctors.filter((d) => d.active);
  const activeServices = services.filter((s) => s.active);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments.filter((a) => {
      if (role === 'doctor' && doctorId && a.doctorId !== doctorId) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (canManageAll && doctorFilter !== 'all' && a.doctorId !== doctorFilter) return false;
      if (q) {
        const hay =
          `${a.referenceCode} ${a.patientName} ${a.patientPhone} ${a.serviceName} ${a.doctorName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [appointments, role, doctorId, statusFilter, canManageAll, doctorFilter, search]);

  const newDocObj = activeDoctors.find((d) => d.id === newDoc) || activeDoctors[0];
  const newServiceObj = activeServices.find((s) => s.id === newSvc) || activeServices[0];
  const createSlotsNeeded = newServiceObj
    ? getSlotsNeededForDuration(newServiceObj.durationMins, settings.slotDurationMins)
    : 1;
  const createExceedsLimit = createSlotsNeeded > MAX_SLOT_LOCKS;
  const canCheckSlots = availabilityVerified && !availabilityError;
  const createSlots = useMemo(() => {
    if (!canCheckSlots || !newDocObj || !newDate) return [];
    return generateAvailableSlotsForDoctor({
      dateStr: newDate,
      doctor: newDocObj,
      schedules,
      slotLocks,
      settings,
      serviceDurationMins: newServiceObj?.durationMins,
    });
  }, [canCheckSlots, newDocObj, newServiceObj, newDate, schedules, slotLocks, settings]);

  const reschedExceedsLimit = reschedAppt
    ? getSlotsNeededForDuration(reschedAppt.durationMins, settings.slotDurationMins) >
      MAX_SLOT_LOCKS
    : false;

  const reschedDocObj = activeDoctors.find((d) => d.id === rDocId) || activeDoctors[0];
  const reschedSlots = useMemo(() => {
    if (!canCheckSlots || !reschedAppt || !reschedDocObj || !rDate) return [];
    return generateAvailableSlotsForDoctor({
      dateStr: rDate,
      doctor: reschedDocObj,
      schedules,
      slotLocks,
      settings,
      serviceDurationMins: reschedAppt.durationMins,
      ignoreAppointmentId: reschedAppt.id,
      ignoreLockIds: reschedAppt.slotLockIds,
    });
  }, [canCheckSlots, reschedAppt, reschedDocObj, rDate, schedules, slotLocks, settings]);

  useEffect(() => {
    if (createSlots.length === 0) {
      if (newTime !== '') setNewTime('');
    } else if (!createSlots.includes(newTime)) {
      setNewTime(createSlots[0]);
    }
  }, [createSlots, newTime]);

  useEffect(() => {
    if (reschedSlots.length === 0) {
      if (rTime !== '') setRTime('');
    } else if (!reschedSlots.includes(rTime)) {
      setRTime(reschedSlots[0]);
    }
  }, [reschedSlots, rTime]);

  function exportCsv() {
    const header = [
      'Reference',
      'Patient',
      'Phone',
      'Service',
      'Doctor',
      'Date',
      'Time',
      'Status',
      'Source',
      'Sample',
    ];
    const rows = filtered.map((a) => [
      a.referenceCode,
      a.patientName,
      a.patientPhone,
      a.serviceName,
      a.doctorName,
      a.date,
      a.time,
      a.status,
      a.source,
      a.isSample ? 'Yes' : 'No',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fourclinic-appointments-${todayIso()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!availabilityVerified || availabilityError) {
      onToast(
        availabilityError ||
          'Live slot availability could not be verified. Creating new bookings is blocked until Firestore availability loads.'
      );
      return;
    }
    const chosenTime = newTime || createSlots[0];
    if (!chosenTime) {
      onToast('No open slots for that doctor and date.');
      return;
    }
    setBusyId('create');
    try {
      const created = await onBookAppointment({
        patientName: newName,
        patientPhone: newPhone,
        serviceId: newServiceObj?.id || newSvc,
        doctorId: newDocObj?.id || newDoc,
        date: newDate,
        time: chosenTime,
        notes: newNotes,
        source: 'walkin',
        initialStatus: newStatus,
      });
      onToast(`Created ${created.referenceCode} (${created.status}).`);
      setShowCreate(false);
      setNewName('');
      setNewPhone('');
      setNewNotes('');
    } catch (err) {
      onToast(formatUserFriendlyError(err, 'Failed to create appointment.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRescheduleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reschedAppt || !reschedDocObj) return;
    if (!availabilityVerified || availabilityError) {
      onToast(
        availabilityError ||
          'Live slot availability could not be verified. Rescheduling is blocked until Firestore availability loads.'
      );
      return;
    }
    const chosen = rTime || reschedSlots[0];
    if (!chosen) {
      onToast('Choose an available slot.');
      return;
    }
    setBusyId(reschedAppt.id);
    try {
      await onReschedule(reschedAppt, rDate, chosen, reschedDocObj);
      onToast(
        `Rescheduled ${reschedAppt.referenceCode} to ${formatDateLabel(rDate)} ${formatTimeLabel(chosen)}.`
      );
      setReschedAppt(null);
    } catch (err) {
      onToast(formatUserFriendlyError(err, 'Reschedule failed.'));
    } finally {
      setBusyId(null);
    }
  }

  const calendarDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysIso(calendarDate, i));
  }, [calendarDate]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-[#D8DFD9]">
        <div>
          <h1 className="font-editorial text-3xl sm:text-4xl text-[#102E34]">Appointments</h1>
          <p className="mt-1 text-xs sm:text-sm text-[#5B7074]">
            Confirm pending bookings, review weekly practitioner schedule, and track visit outcomes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md bg-[#EFECE4] p-1 border border-[#D8DFD9]">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-[#102E34] border border-[#D8DFD9]'
                  : 'text-[#5B7074]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-white text-[#102E34] border border-[#D8DFD9]'
                  : 'text-[#5B7074]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>7-Day Calendar</span>
            </button>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#102E34] hover:border-[#426F77] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {canManageAll && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Booking</span>
            </button>
          )}
        </div>
      </div>

      {availabilityError && (
        <div
          role="alert"
          className="rounded-lg border border-[#E8BABA] bg-[#FBECEC] px-4 py-3 text-xs sm:text-sm text-[#A12A2A] flex flex-wrap items-center justify-between gap-3"
        >
          <span>{availabilityError}</span>
          {onRetryAvailability && (
            <button
              type="button"
              onClick={onRetryAvailability}
              className="px-3 py-1.5 rounded-md border border-[#A12A2A]/30 bg-white text-xs font-semibold text-[#A12A2A] hover:bg-[#FBECEC] cursor-pointer shrink-0"
            >
              Retry Availability
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-[#D8DFD9] rounded-lg p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#5B7074] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient, phone, ref code…"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-[#D8DFD9] bg-[#F7F5F0]/50 text-sm text-[#102E34] focus:bg-white focus:border-[#102E34]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm font-medium text-[#102E34]"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-show</option>
        </select>
        {canManageAll && (
          <select
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm font-medium text-[#102E34]"
          >
            <option value="all">All doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {viewMode === 'table' ? (
        <div className="bg-white border border-[#D8DFD9] rounded-lg overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#5B7074]">
              No appointments match the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#EFECE4] border-b border-[#D8DFD9] text-[11px] uppercase tracking-[0.1em] text-[#5B7074]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Ref / Patient</th>
                    <th className="py-3 px-4 font-semibold">Treatment</th>
                    <th className="py-3 px-4 font-semibold">Doctor</th>
                    <th className="py-3 px-4 font-semibold">Date &amp; Time</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6EAE4]">
                  {filtered.map((a) => {
                    const badgeClass =
                      a.status === 'confirmed'
                        ? 'bg-[#E6F2EC] text-[#1E6B4B] border-[#B8DEC9]'
                        : a.status === 'pending'
                          ? 'bg-[#FCF4E6] text-[#9A5B13] border-[#E8CFA1]'
                          : a.status === 'completed'
                            ? 'bg-[#DCE8E3] text-[#102E34] border-[#B9CEC5]'
                            : 'bg-[#FBECEC] text-[#A12A2A] border-[#E8BABA]';

                    const isBusy = busyId === a.id;

                    return (
                      <tr key={a.id} className="hover:bg-[#F7F5F0]/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-semibold text-[#426F77] fc-tabular">
                              {a.referenceCode}
                            </span>
                            {a.isSample && (
                              <span className="px-1.5 py-0.5 rounded-sm bg-[#EFECE4] text-[10px] font-semibold text-[#5B7074]">
                                SAMPLE
                              </span>
                            )}
                          </div>
                          <b className="block text-[#102E34]">{a.patientName}</b>
                          <span className="text-xs text-[#5B7074] fc-tabular">{a.patientPhone}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-[#102E34]">{a.serviceName}</span>
                          <span className="block text-xs text-[#5B7074] fc-tabular">
                            {a.durationMins} mins
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#3B5257] font-medium">{a.doctorName}</td>
                        <td className="py-3 px-4 fc-tabular">
                          <b className="block text-[#102E34]">{formatDateLabel(a.date)}</b>
                          <span className="text-xs text-[#5B7074]">{formatTimeLabel(a.time)}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-sm border text-[11px] font-bold uppercase tracking-wide ${badgeClass}`}
                          >
                            {STATUS_LABELS[a.status]}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            {canManageAll && a.status === 'pending' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={async () => {
                                  setBusyId(a.id);
                                  try {
                                    await onUpdateStatus(a, 'confirmed');
                                    onToast(`Confirmed ${a.referenceCode}.`);
                                  } catch (err) {
                                    onToast(err instanceof Error ? err.message : 'Update failed.');
                                  } finally {
                                    setBusyId(null);
                                  }
                                }}
                                className="px-2.5 py-1 rounded-sm bg-[#1E6B4B] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                              >
                                Confirm
                              </button>
                            )}
                            {a.status === 'confirmed' && (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={async () => {
                                    setBusyId(a.id);
                                    try {
                                      await onUpdateStatus(a, 'completed');
                                      onToast(`Marked ${a.referenceCode} completed.`);
                                    } catch (err) {
                                      onToast(
                                        err instanceof Error ? err.message : 'Update failed.'
                                      );
                                    } finally {
                                      setBusyId(null);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-sm bg-[#102E34] text-[#F7F5F0] text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Complete
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={async () => {
                                    setBusyId(a.id);
                                    try {
                                      await onUpdateStatus(a, 'no_show');
                                      onToast(`Marked ${a.referenceCode} no-show.`);
                                    } catch (err) {
                                      onToast(
                                        err instanceof Error ? err.message : 'Update failed.'
                                      );
                                    } finally {
                                      setBusyId(null);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-sm border border-[#E8CFA1] bg-[#FCF4E6] text-[#9A5B13] text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  No-show
                                </button>
                              </>
                            )}
                            {canManageAll &&
                              (a.status === 'pending' || a.status === 'confirmed') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReschedAppt(a);
                                      setRDocId(a.doctorId);
                                      setRDate(a.date);
                                      setRTime('');
                                    }}
                                    className="px-2.5 py-1 rounded-sm border border-[#D8DFD9] bg-white text-[#102E34] text-xs font-semibold cursor-pointer inline-flex items-center gap-1 hover:border-[#426F77]"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>Reschedule</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={async () => {
                                      setBusyId(a.id);
                                      try {
                                        await onUpdateStatus(a, 'cancelled');
                                        onToast(`Cancelled ${a.referenceCode} & released slot.`);
                                      } catch (err) {
                                        onToast(
                                          err instanceof Error ? err.message : 'Cancel failed.'
                                        );
                                      } finally {
                                        setBusyId(null);
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-sm border border-[#E8BABA] text-[#A12A2A] text-xs font-semibold cursor-pointer inline-flex items-center gap-1 hover:bg-[#FBECEC]"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    <span>Cancel</span>
                                  </button>
                                </>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* 7-Day Calendar Grid */
        <div className="bg-white border border-[#D8DFD9] rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarDate(addDaysIso(calendarDate, -7))}
                className="px-3 py-1.5 rounded-md border border-[#D8DFD9] text-xs font-semibold text-[#102E34] cursor-pointer hover:border-[#426F77]"
              >
                ← Prev 7d
              </button>
              <button
                type="button"
                onClick={() => setCalendarDate(todayIso())}
                className="px-3 py-1.5 rounded-md bg-[#DCE8E3] text-[#102E34] text-xs font-semibold cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setCalendarDate(addDaysIso(calendarDate, 7))}
                className="px-3 py-1.5 rounded-md border border-[#D8DFD9] text-xs font-semibold text-[#102E34] cursor-pointer hover:border-[#426F77]"
              >
                Next 7d →
              </button>
            </div>
            <input
              type="date"
              value={calendarDate}
              onChange={(e) => e.target.value && setCalendarDate(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-[#D8DFD9] text-xs font-medium text-[#102E34]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {calendarDays.map((dayStr) => {
              const dayItems = filtered.filter((a) => a.date === dayStr);
              return (
                <div
                  key={dayStr}
                  className="border border-[#D8DFD9] rounded-md p-3 bg-[#F7F5F0]/60 min-h-[220px]"
                >
                  <b className="block text-xs font-bold text-[#102E34] pb-2 border-b border-[#D8DFD9] fc-tabular">
                    {formatDateLabel(dayStr)}
                  </b>
                  <div className="mt-2 space-y-2">
                    {dayItems.length === 0 ? (
                      <p className="text-[11px] text-[#5B7074] italic">No bookings</p>
                    ) : (
                      dayItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedCalItem(item)}
                          className="w-full text-left p-2 rounded-md bg-white border border-[#D8DFD9] hover:border-[#102E34] text-[11px] transition cursor-pointer"
                        >
                          <b className="block text-[#426F77] fc-tabular">
                            {formatTimeLabel(item.time)}
                          </b>
                          <span className="block font-bold text-[#102E34] truncate">
                            {item.patientName}
                          </span>
                          <span className="block text-[#5B7074] truncate">{item.serviceName}</span>
                          <span className="block text-[10px] font-bold uppercase mt-1 text-[#3B5257]">
                            {STATUS_LABELS[item.status]}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Calendar Item Quick Action Modal */}
      {selectedCalItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Appointment quick actions"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCalItem(null);
          }}
          className="fixed inset-0 z-50 bg-[#102E34]/65 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#D8DFD9] rounded-lg max-w-sm w-full p-5 space-y-3 shadow-2xl text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6EAE4]">
              <b className="text-base text-[#102E34] fc-tabular">
                {selectedCalItem.referenceCode} · {selectedCalItem.patientName}
              </b>
              <button
                type="button"
                onClick={() => setSelectedCalItem(null)}
                className="text-xs font-semibold text-[#5B7074] hover:text-[#102E34] cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="text-xs text-[#3B5257] space-y-1.5">
              <p>
                <b>Treatment:</b> {selectedCalItem.serviceName} ({selectedCalItem.durationMins}m)
              </p>
              <p>
                <b>Doctor:</b> {selectedCalItem.doctorName}
              </p>
              <p className="fc-tabular">
                <b>When:</b> {formatDateLabel(selectedCalItem.date)} at{' '}
                {formatTimeLabel(selectedCalItem.time)}
              </p>
              <p className="fc-tabular">
                <b>Phone:</b> {selectedCalItem.patientPhone}
              </p>
              <p>
                <b>Status:</b> {STATUS_LABELS[selectedCalItem.status]}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-3 border-t border-[#E6EAE4]">
              {canManageAll && selectedCalItem.status === 'pending' && (
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateStatus(selectedCalItem, 'confirmed');
                    onToast(`Confirmed ${selectedCalItem.referenceCode}.`);
                    setSelectedCalItem(null);
                  }}
                  className="px-3 py-1.5 rounded-sm bg-[#1E6B4B] text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm
                </button>
              )}
              {selectedCalItem.status === 'confirmed' && (
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateStatus(selectedCalItem, 'completed');
                    onToast(`Marked ${selectedCalItem.referenceCode} completed.`);
                    setSelectedCalItem(null);
                  }}
                  className="px-3 py-1.5 rounded-sm bg-[#102E34] text-[#F7F5F0] text-xs font-semibold cursor-pointer"
                >
                  Complete
                </button>
              )}
              {canManageAll &&
                (selectedCalItem.status === 'pending' || selectedCalItem.status === 'confirmed') && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setReschedAppt(selectedCalItem);
                        setRDocId(selectedCalItem.doctorId);
                        setRDate(selectedCalItem.date);
                        setRTime('');
                        setSelectedCalItem(null);
                      }}
                      className="px-3 py-1.5 rounded-sm border border-[#D8DFD9] text-[#102E34] text-xs font-semibold cursor-pointer"
                    >
                      Reschedule
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onUpdateStatus(selectedCalItem, 'cancelled');
                        onToast(`Cancelled ${selectedCalItem.referenceCode}.`);
                        setSelectedCalItem(null);
                      }}
                      className="px-3 py-1.5 rounded-sm border border-[#E8BABA] text-[#A12A2A] text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                )}
            </div>
          </div>
        </div>
      )}

      {/* New Staff Booking Modal */}
      {showCreate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New walk-in or phone booking"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
          className="fixed inset-0 z-50 bg-[#102E34]/65 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white border border-[#D8DFD9] rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E6EAE4]">
              <h2 className="font-editorial text-2xl text-[#102E34]">
                New Walk-in / Phone Booking
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-xs font-semibold text-[#5B7074] hover:text-[#102E34] cursor-pointer"
              >
                Close
              </button>
            </div>
            {!catalogSeeded && (
              <p className="text-xs text-[#8F5310] bg-[#FCF4E6] border border-[#E8CFA1] p-2.5 rounded-md">
                Initialize clinic catalog on Overview before creating appointments.
              </p>
            )}
            {(!availabilityVerified || availabilityError) && (
              <p
                role="alert"
                className="text-xs font-semibold text-[#A12A2A] bg-[#FBECEC] border border-[#E8BABA] p-2.5 rounded-md"
              >
                {availabilityError || 'Verifying live slot availability from Firestore…'}
              </p>
            )}
            <input
              required
              placeholder="Patient full name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-md border border-[#D8DFD9] text-sm"
            />
            <input
              required
              placeholder="Phone / WhatsApp (+1 555 ...)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-full px-3.5 py-2 rounded-md border border-[#D8DFD9] text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newSvc}
                onChange={(e) => setNewSvc(e.target.value)}
                className="px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm"
              >
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={newDoc}
                onChange={(e) => setNewDoc(e.target.value)}
                className="px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm"
              >
                {activeDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                min={todayIso()}
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm"
              />
              <select
                value={newTime || createSlots[0] || ''}
                onChange={(e) => setNewTime(e.target.value)}
                disabled={!canCheckSlots}
                className="px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm fc-tabular disabled:opacity-60"
              >
                {createSlots.length === 0 ? (
                  <option value="">
                    {availabilityError
                      ? 'Availability unavailable'
                      : !availabilityVerified
                        ? 'Verifying live availability…'
                        : createExceedsLimit
                          ? `Exceeds ${MAX_SLOT_LOCKS}-slot limit`
                          : 'No open slots'}
                  </option>
                ) : (
                  createSlots.map((t) => (
                    <option key={t} value={t}>
                      {formatTimeLabel(t)}
                    </option>
                  ))
                )}
              </select>
            </div>
            {createExceedsLimit && newServiceObj && (
              <p className="text-xs text-[#8F5310] bg-[#FCF4E6] border border-[#E8CFA1] rounded-md p-2.5">
                {newServiceObj.name} ({newServiceObj.durationMins}m) requires {createSlotsNeeded}{' '}
                slots on a {settings.slotDurationMins}m grid (max {MAX_SLOT_LOCKS}). Increase clinic
                slot duration in Settings to book this visit.
              </p>
            )}
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as 'pending' | 'confirmed')}
              className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm"
            >
              <option value="confirmed">Create as Confirmed</option>
              <option value="pending">Create as Pending</option>
            </select>
            <textarea
              rows={2}
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-md border border-[#D8DFD9] text-sm"
            />
            <button
              type="submit"
              disabled={busyId === 'create' || !canCheckSlots || createSlots.length === 0}
              className="w-full py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold disabled:opacity-50 cursor-pointer"
            >
              {busyId === 'create' ? 'Booking…' : 'Create & Lock Slot'}
            </button>
          </form>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedAppt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Reschedule ${reschedAppt.referenceCode}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setReschedAppt(null);
          }}
          className="fixed inset-0 z-50 bg-[#102E34]/65 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleRescheduleSubmit}
            className="bg-white border border-[#D8DFD9] rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E6EAE4]">
              <h2 className="font-editorial text-2xl text-[#102E34]">
                Reschedule {reschedAppt.referenceCode}
              </h2>
              <button
                type="button"
                onClick={() => setReschedAppt(null)}
                className="text-xs font-semibold text-[#5B7074] hover:text-[#102E34] cursor-pointer"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-[#5B7074]">
              Patient: <b className="text-[#102E34]">{reschedAppt.patientName}</b> ·{' '}
              {reschedAppt.serviceName}
            </p>
            {(!availabilityVerified || availabilityError) && (
              <p
                role="alert"
                className="text-xs font-semibold text-[#A12A2A] bg-[#FBECEC] border border-[#E8BABA] p-2.5 rounded-md"
              >
                {availabilityError || 'Verifying live slot availability from Firestore…'}
              </p>
            )}
            <select
              value={rDocId}
              onChange={(e) => setRDocId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm"
            >
              {activeDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.role}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                min={todayIso()}
                value={rDate}
                onChange={(e) => setRDate(e.target.value)}
                className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm"
              />
              <select
                value={rTime || reschedSlots[0] || ''}
                onChange={(e) => setRTime(e.target.value)}
                disabled={!canCheckSlots}
                className="px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm fc-tabular disabled:opacity-60"
              >
                {reschedSlots.length === 0 ? (
                  <option value="">
                    {availabilityError
                      ? 'Availability unavailable'
                      : !availabilityVerified
                        ? 'Verifying live availability…'
                        : reschedExceedsLimit
                          ? `Exceeds ${MAX_SLOT_LOCKS}-slot limit`
                          : 'No free slots'}
                  </option>
                ) : (
                  reschedSlots.map((t) => (
                    <option key={t} value={t}>
                      {formatTimeLabel(t)}
                    </option>
                  ))
                )}
              </select>
            </div>
            {reschedExceedsLimit && (
              <p className="text-xs text-[#8F5310] bg-[#FCF4E6] border border-[#E8CFA1] rounded-md p-2.5">
                This {reschedAppt.durationMins}m visit requires more than {MAX_SLOT_LOCKS} locks on
                the current {settings.slotDurationMins}m grid. Increase slot duration in Settings
                before rescheduling.
              </p>
            )}
            <button
              type="submit"
              disabled={busyId === reschedAppt.id || !canCheckSlots || reschedSlots.length === 0}
              className="w-full py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold disabled:opacity-50 cursor-pointer"
            >
              {busyId === reschedAppt.id ? 'Updating slot…' : 'Save Rescheduled Time'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
