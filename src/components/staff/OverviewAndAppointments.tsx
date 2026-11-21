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
  STATUS_LABELS,
  todayIso,
} from '../../lib/validation';
import type {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  ClinicSettings,
  Doctor,
  Inquiry,
  ScheduleOverride,
  ServiceItem,
  SlotLock,
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#12262e]">
            {role === 'doctor' ? 'Doctor Schedule Overview' : 'Clinic Overview'}
          </h1>
          <p className="text-sm text-[#5d737a]">
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4d8a96] text-white text-xs font-bold hover:bg-[#3d7280] cursor-pointer"
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#cfdee1] bg-white text-xs font-bold text-[#12262e] hover:bg-[#f2f7f8] cursor-pointer disabled:opacity-50"
            >
              <Database className="w-3.5 h-3.5 text-[#4d8a96]" />
              <span>{seeding ? 'Loading sample data…' : 'Load Demo Sample Data'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Real KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#5d737a]">
            <span>TODAY&apos;S APPOINTMENTS</span>
            <Calendar className="w-4 h-4 text-[#4d8a96]" />
          </div>
          <b className="block mt-2 text-3xl font-extrabold text-[#12262e] fc-tabular">
            {todaysList.length}
          </b>
          <span className="text-xs text-[#5d737a]">Active bookings scheduled today</span>
        </div>

        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-amber-700">
            <span>PENDING CONFIRMATION</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <b className="block mt-2 text-3xl font-extrabold text-[#12262e] fc-tabular">
            {pendingList.length}
          </b>
          <span className="text-xs text-[#5d737a]">Awaiting front-desk review</span>
        </div>

        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#2e8a5c]">
            <span>CONFIRMED UPCOMING</span>
            <CheckCircle2 className="w-4 h-4 text-[#2e8a5c]" />
          </div>
          <b className="block mt-2 text-3xl font-extrabold text-[#12262e] fc-tabular">
            {confirmedList.length}
          </b>
          <span className="text-xs text-[#5d737a]">Verified &amp; locked on schedule</span>
        </div>

        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#5d737a]">
            <span>ACTIVE DOCTORS</span>
            <Stethoscope className="w-4 h-4 text-[#4d8a96]" />
          </div>
          <b className="block mt-2 text-3xl font-extrabold text-[#12262e] fc-tabular">
            {activeDoctorsCount}
          </b>
          <span className="text-xs text-[#5d737a]">Practitioners available for booking</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Queue */}
        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold text-[#12262e]">
              Pending Booking Requests ({pendingList.length})
            </h2>
            <button
              type="button"
              onClick={() => onGoToTab('appointments')}
              className="text-xs font-bold text-[#4d8a96] hover:underline cursor-pointer"
            >
              Manage all →
            </button>
          </div>
          {pendingList.length === 0 ? (
            <p className="text-sm text-[#5d737a] py-6 text-center">
              No pending appointments right now.
            </p>
          ) : (
            <div className="space-y-3">
              {pendingList.slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  className="p-3.5 rounded-xl border border-[#e3ebec] bg-[#fbfdfd] flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <b className="text-sm text-[#12262e]">{a.patientName}</b>
                      {a.isSample && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                          SAMPLE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#5d737a]">
                      {a.referenceCode} · {a.serviceName} · {a.doctorName}
                    </p>
                    <p className="text-xs font-semibold text-[#3d7280] mt-0.5">
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
                      className="px-3.5 py-1.5 rounded-full bg-[#2e8a5c] text-white text-xs font-bold hover:opacity-90 cursor-pointer"
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
          <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
            <h2 className="text-base font-extrabold text-[#12262e] mb-4">
              Your Assigned Today Schedule ({todaysList.length})
            </h2>
            {todaysList.length === 0 ? (
              <p className="text-sm text-[#5d737a] py-6 text-center">
                No visits assigned to you for today.
              </p>
            ) : (
              <div className="space-y-2.5">
                {todaysList.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-xl border border-[#e3ebec] flex items-center justify-between text-sm"
                  >
                    <div>
                      <b className="text-[#12262e]">
                        {formatTimeLabel(a.time)} — {a.patientName}
                      </b>
                      <p className="text-xs text-[#5d737a]">
                        {a.serviceName} · {a.referenceCode}
                      </p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#e7eff1] text-[#3d7280] text-xs font-bold">
                      {STATUS_LABELS[a.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-[#12262e] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Urgent Front-Desk Inquiries ({urgentInquiries.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => onGoToTab('inquiries')}
                className="text-xs font-bold text-[#4d8a96] hover:underline cursor-pointer"
              >
                Open inbox →
              </button>
            </div>
            {urgentInquiries.length === 0 ? (
              <p className="text-sm text-[#5d737a] py-6 text-center">
                No open urgent inquiries. All urgent alerts are handled.
              </p>
            ) : (
              <div className="space-y-3">
                {urgentInquiries.slice(0, 5).map((q) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[#12262e]">{q.name}</b>
                      <span className="text-xs font-bold text-rose-700 uppercase">
                        {q.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#42565c] mt-1">{q.contact}</p>
                    <p className="text-xs text-[#12262e] mt-1 line-clamp-2">
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
  slotLocks: SlotLock[];
  settings: ClinicSettings;
  catalogSeeded: boolean;
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

  // Walk-in / Staff Booking modal
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

  // Reschedule modal + Calendar Quick Inspector
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
        const hay = `${a.referenceCode} ${a.patientName} ${a.patientPhone} ${a.serviceName} ${a.doctorName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [appointments, role, doctorId, statusFilter, canManageAll, doctorFilter, search]);

  const newDocObj = activeDoctors.find((d) => d.id === newDoc) || activeDoctors[0];
  const newServiceObj = activeServices.find((s) => s.id === newSvc) || activeServices[0];
  const createSlots = useMemo(() => {
    if (!newDocObj || !newDate) return [];
    return generateAvailableSlotsForDoctor({
      dateStr: newDate,
      doctor: newDocObj,
      schedules,
      slotLocks,
      settings,
      serviceDurationMins: newServiceObj?.durationMins,
    });
  }, [newDocObj, newServiceObj, newDate, schedules, slotLocks, settings]);

  const reschedDocObj = activeDoctors.find((d) => d.id === rDocId) || activeDoctors[0];
  const reschedSlots = useMemo(() => {
    if (!reschedAppt || !reschedDocObj || !rDate) return [];
    return generateAvailableSlotsForDoctor({
      dateStr: rDate,
      doctor: reschedDocObj,
      schedules,
      slotLocks,
      settings,
      serviceDurationMins: reschedAppt.durationMins,
      ignoreAppointmentId: reschedAppt.id,
    });
  }, [reschedAppt, reschedDocObj, rDate, schedules, slotLocks, settings]);

  function exportCsv() {
    const header = ['Reference', 'Patient', 'Phone', 'Service', 'Doctor', 'Date', 'Time', 'Status', 'Source', 'Sample'];
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
    if (!newTime && createSlots[0]) {
      // use first slot if none explicitly picked
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
        serviceId: newSvc,
        doctorId: newDoc,
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
    const chosen = rTime || reschedSlots[0];
    if (!chosen) {
      onToast('Choose an available slot.');
      return;
    }
    setBusyId(reschedAppt.id);
    try {
      await onReschedule(reschedAppt, rDate, chosen, reschedDocObj);
      onToast(`Rescheduled ${reschedAppt.referenceCode} to ${formatDateLabel(rDate)} ${formatTimeLabel(chosen)}.`);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#12262e]">Appointments</h1>
          <p className="text-sm text-[#5d737a]">
            Confirm pending bookings, manage day/week calendar, and track visit outcomes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-[#f2f7f8] p-1 border border-[#e3ebec]">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-[#12262e] shadow-xs' : 'text-[#5d737a]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                viewMode === 'calendar' ? 'bg-white text-[#12262e] shadow-xs' : 'text-[#5d737a]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>7-Day Calendar</span>
            </button>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#cfdee1] bg-white text-xs font-bold text-[#12262e] hover:bg-[#f2f7f8] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {canManageAll && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4d8a96] text-white text-xs font-bold hover:bg-[#3d7280] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Booking</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e3ebec] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#5d737a] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient, phone, ref code…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm font-medium"
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
            className="px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm font-medium"
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
        <div className="bg-white border border-[#e3ebec] rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#5d737a]">
              No appointments match the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#f8fbfb] border-b border-[#e3ebec] text-xs uppercase text-[#5d737a]">
                  <tr>
                    <th className="py-3 px-4 font-bold">Ref / Patient</th>
                    <th className="py-3 px-4 font-bold">Treatment</th>
                    <th className="py-3 px-4 font-bold">Doctor</th>
                    <th className="py-3 px-4 font-bold">Date &amp; Time</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef3f4]">
                  {filtered.map((a) => {
                    const badgeClass =
                      a.status === 'confirmed'
                        ? 'bg-[#eef7f1] text-[#2e8a5c]'
                        : a.status === 'pending'
                          ? 'bg-amber-50 text-amber-700'
                          : a.status === 'completed'
                            ? 'bg-[#e7eff1] text-[#3d7280]'
                            : 'bg-rose-50 text-rose-700';

                    const isBusy = busyId === a.id;

                    return (
                      <tr key={a.id} className="hover:bg-[#fcfefe]">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-extrabold text-[#4d8a96]">
                              {a.referenceCode}
                            </span>
                            {a.isSample && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                                SAMPLE
                              </span>
                            )}
                          </div>
                          <b className="block text-[#12262e]">{a.patientName}</b>
                          <span className="text-xs text-[#5d737a]">{a.patientPhone}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-[#12262e]">{a.serviceName}</span>
                          <span className="block text-xs text-[#5d737a]">{a.durationMins} mins</span>
                        </td>
                        <td className="py-3 px-4 text-[#42565c] font-medium">{a.doctorName}</td>
                        <td className="py-3 px-4">
                          <b className="block text-[#12262e]">{formatDateLabel(a.date)}</b>
                          <span className="text-xs text-[#5d737a]">{formatTimeLabel(a.time)}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badgeClass}`}>
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
                                className="px-2.5 py-1 rounded-lg bg-[#2e8a5c] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
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
                                      onToast(err instanceof Error ? err.message : 'Update failed.');
                                    } finally {
                                      setBusyId(null);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#4d8a96] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
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
                                      onToast(err instanceof Error ? err.message : 'Update failed.');
                                    } finally {
                                      setBusyId(null);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-amber-300 text-amber-800 text-xs font-bold cursor-pointer disabled:opacity-50"
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
                                    className="px-2.5 py-1 rounded-lg border border-[#cfdee1] text-[#3d7280] text-xs font-bold cursor-pointer inline-flex items-center gap-1"
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
                                        onToast(err instanceof Error ? err.message : 'Cancel failed.');
                                      } finally {
                                        setBusyId(null);
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer inline-flex items-center gap-1"
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
        <div className="bg-white border border-[#e3ebec] rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarDate(addDaysIso(calendarDate, -7))}
                className="px-3 py-1.5 rounded-lg border border-[#cfdee1] text-xs font-bold cursor-pointer"
              >
                ← Prev 7d
              </button>
              <button
                type="button"
                onClick={() => setCalendarDate(todayIso())}
                className="px-3 py-1.5 rounded-lg bg-[#e7eff1] text-[#3d7280] text-xs font-bold cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setCalendarDate(addDaysIso(calendarDate, 7))}
                className="px-3 py-1.5 rounded-lg border border-[#cfdee1] text-xs font-bold cursor-pointer"
              >
                Next 7d →
              </button>
            </div>
            <input
              type="date"
              value={calendarDate}
              onChange={(e) => e.target.value && setCalendarDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#cfdee1] text-xs font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {calendarDays.map((dayStr) => {
              const dayItems = filtered.filter((a) => a.date === dayStr);
              return (
                <div
                  key={dayStr}
                  className="border border-[#e3ebec] rounded-xl p-3 bg-[#fbfdfd] min-h-[220px]"
                >
                  <b className="block text-xs font-extrabold text-[#12262e] pb-2 border-b border-[#eef3f4]">
                    {formatDateLabel(dayStr)}
                  </b>
                  <div className="mt-2 space-y-2">
                    {dayItems.length === 0 ? (
                      <p className="text-[11px] text-[#5d737a] italic">No bookings</p>
                    ) : (
                      dayItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedCalItem(item)}
                          className="w-full text-left p-2 rounded-lg bg-white border border-[#e3ebec] hover:border-[#4d8a96] text-[11px] shadow-2xs transition cursor-pointer"
                        >
                          <b className="block text-[#4d8a96] fc-tabular">{formatTimeLabel(item.time)}</b>
                          <span className="block font-bold text-[#12262e] truncate">
                            {item.patientName}
                          </span>
                          <span className="block text-[#5d737a] truncate">{item.serviceName}</span>
                          <span className="block text-[10px] font-bold uppercase mt-1 text-[#3d7280]">
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
          className="fixed inset-0 z-50 bg-[#12262e]/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl text-sm">
            <div className="flex items-center justify-between">
              <b className="text-base text-[#12262e]">
                {selectedCalItem.referenceCode} · {selectedCalItem.patientName}
              </b>
              <button
                type="button"
                onClick={() => setSelectedCalItem(null)}
                className="text-xs font-bold text-[#5d737a] cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="text-xs text-[#42565c] space-y-1">
              <p>
                <b>Treatment:</b> {selectedCalItem.serviceName} ({selectedCalItem.durationMins}m)
              </p>
              <p>
                <b>Doctor:</b> {selectedCalItem.doctorName}
              </p>
              <p className="fc-tabular">
                <b>When:</b> {formatDateLabel(selectedCalItem.date)} at {formatTimeLabel(selectedCalItem.time)}
              </p>
              <p>
                <b>Phone:</b> {selectedCalItem.patientPhone}
              </p>
              <p>
                <b>Status:</b> {STATUS_LABELS[selectedCalItem.status]}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[#eef3f4]">
              {canManageAll && selectedCalItem.status === 'pending' && (
                <button
                  type="button"
                  onClick={async () => {
                    await onUpdateStatus(selectedCalItem, 'confirmed');
                    onToast(`Confirmed ${selectedCalItem.referenceCode}.`);
                    setSelectedCalItem(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#2e8a5c] text-white text-xs font-bold cursor-pointer"
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
                  className="px-3 py-1.5 rounded-lg bg-[#4d8a96] text-white text-xs font-bold cursor-pointer"
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
                      className="px-3 py-1.5 rounded-lg border border-[#cfdee1] text-[#3d7280] text-xs font-bold cursor-pointer"
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
                      className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer"
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
          className="fixed inset-0 z-50 bg-[#12262e]/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#12262e]">New Walk-in / Phone Booking</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-xs font-bold text-[#5d737a] cursor-pointer"
              >
                Close
              </button>
            </div>
            {!catalogSeeded && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg">
                Initialize clinic catalog on Overview before creating appointments.
              </p>
            )}
            <input
              required
              placeholder="Patient full name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
            />
            <input
              required
              placeholder="Phone / WhatsApp (+1 555 ...)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newSvc}
                onChange={(e) => setNewSvc(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm"
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
                className="px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm"
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
                className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
              />
              <select
                value={newTime || createSlots[0] || ''}
                onChange={(e) => setNewTime(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm"
              >
                {createSlots.length === 0 ? (
                  <option value="">No open slots</option>
                ) : (
                  createSlots.map((t) => (
                    <option key={t} value={t}>
                      {formatTimeLabel(t)}
                    </option>
                  ))
                )}
              </select>
            </div>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as 'pending' | 'confirmed')}
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm"
            >
              <option value="confirmed">Create as Confirmed</option>
              <option value="pending">Create as Pending</option>
            </select>
            <textarea
              rows={2}
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
            />
            <button
              type="submit"
              disabled={busyId === 'create' || createSlots.length === 0}
              className="w-full py-2.5 rounded-full bg-[#4d8a96] text-white text-sm font-bold disabled:opacity-50 cursor-pointer"
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
          className="fixed inset-0 z-50 bg-[#12262e]/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleRescheduleSubmit}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#12262e]">
                Reschedule {reschedAppt.referenceCode}
              </h2>
              <button
                type="button"
                onClick={() => setReschedAppt(null)}
                className="text-xs font-bold text-[#5d737a] cursor-pointer"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-[#5d737a]">
              Patient: <b>{reschedAppt.patientName}</b> · {reschedAppt.serviceName}
            </p>
            <select
              value={rDocId}
              onChange={(e) => setRDocId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm"
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
                className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
              />
              <select
                value={rTime || reschedSlots[0] || ''}
                onChange={(e) => setRTime(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm"
              >
                {reschedSlots.length === 0 ? (
                  <option value="">No free slots</option>
                ) : (
                  reschedSlots.map((t) => (
                    <option key={t} value={t}>
                      {formatTimeLabel(t)}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button
              type="submit"
              disabled={busyId === reschedAppt.id || reschedSlots.length === 0}
              className="w-full py-2.5 rounded-full bg-[#4d8a96] text-white text-sm font-bold disabled:opacity-50 cursor-pointer"
            >
              {busyId === reschedAppt.id ? 'Updating slot…' : 'Save Rescheduled Time'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
