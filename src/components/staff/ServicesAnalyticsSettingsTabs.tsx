import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Edit3, Plus, Shield, Trash2, X } from 'lucide-react';
import {
  formatUserFriendlyError,
  getSlotsNeededForDuration,
  MAX_SLOT_LOCKS,
  sanitizeId,
  STATUS_LABELS,
} from '../../lib/validation';
import type {
  Appointment,
  AuditLog,
  ClinicSettings,
  Doctor,
  Inquiry,
  ServiceItem,
  UserProfile,
  UserRole,
  WeekdayKey,
} from '../../types/clinic';

/* ==================== SERVICES TAB ==================== */
interface ServicesTabProps {
  role: UserRole;
  services: ServiceItem[];
  doctors: Doctor[];
  slotDurationMins?: number;
  onSaveService: (svc: ServiceItem, isNew: boolean) => Promise<void>;
  onToast: (msg: string) => void;
}

export function ServicesTab({
  role,
  services,
  doctors,
  slotDurationMins = 30,
  onSaveService,
  onToast,
}: ServicesTabProps) {
  const isAdmin = role === 'admin';
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  function openNew() {
    setIsNew(true);
    setEditing({
      id: sanitizeId(`svc_${Date.now().toString(36)}`),
      name: '',
      description: '',
      includes: 'Includes: consultation · plan',
      durationMins: 30,
      priceLabel: '$80',
      basePrice: 80,
      iconKey: 'checkup',
      defaultDoctorId: doctors[0]?.id || 'd1',
      active: true,
      sortOrder: services.length + 1,
      isSample: false,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const slotsNeeded = getSlotsNeededForDuration(editing.durationMins, slotDurationMins);
    if (slotsNeeded > MAX_SLOT_LOCKS) {
      onToast(
        `Duration ${editing.durationMins}m requires ${slotsNeeded} slots on a ${slotDurationMins}m grid (max ${MAX_SLOT_LOCKS} atomic slots = ${slotDurationMins * MAX_SLOT_LOCKS}m).`
      );
      return;
    }
    setSaving(true);
    try {
      await onSaveService(editing, isNew);
      onToast(`${isNew ? 'Created' : 'Updated'} service ${editing.name}.`);
      setEditing(null);
    } catch (err) {
      onToast(formatUserFriendlyError(err, 'Unable to save service.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-[#D8DFD9]">
        <div>
          <h1 className="font-editorial text-3xl sm:text-4xl text-[#102E34]">
            Services &amp; Pricing
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#5B7074]">
            Services edited here update the public website fee schedule and booking options immediately.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Service</span>
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((svc, idx) => (
          <div
            key={svc.id}
            className="bg-white border border-[#D8DFD9] rounded-lg p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B7074] fc-tabular">
                    0{idx + 1}
                  </span>
                  <b className="block font-editorial text-xl text-[#102E34] mt-0.5">
                    {svc.name}
                  </b>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                    svc.active
                      ? 'bg-[#E6F2EC] text-[#1E6B4B]'
                      : 'bg-[#EFECE4] text-[#5B7074]'
                  }`}
                >
                  {svc.active ? 'Active' : 'Hidden'}
                </span>
              </div>
              <p className="text-xs text-[#3B5257] mt-2 leading-relaxed">
                {svc.description}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-[#E6EAE4] flex items-center justify-between text-xs">
              <span className="font-bold text-[#102E34] fc-tabular">
                {svc.priceLabel}{' '}
                <span className="text-[#5B7074] font-normal">· {svc.durationMins} min</span>
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setIsNew(false);
                    setEditing(svc);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#D8DFD9] font-semibold text-[#102E34] hover:border-[#102E34] cursor-pointer transition-colors"
                >
                  <Edit3 className="w-3 h-3 text-[#426F77]" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isNew ? 'Add Dental Service' : `Edit ${editing.name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
          className="fixed inset-0 z-50 bg-[#102E34]/65 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-[#D8DFD9] rounded-lg max-w-md w-full p-5 sm:p-6 space-y-3.5 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E6EAE4]">
              <h2 className="font-editorial text-2xl text-[#102E34]">
                {isNew ? 'Add Dental Service' : `Edit ${editing.name}`}
              </h2>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-md text-[#5B7074] hover:text-[#102E34] hover:bg-[#F7F5F0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              required
              placeholder="Service title"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
            />
            <textarea
              required
              rows={2}
              placeholder="Description"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
            />
            <input
              required
              placeholder="Includes summary"
              value={editing.includes}
              onChange={(e) => setEditing({ ...editing, includes: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                min={15}
                max={slotDurationMins * MAX_SLOT_LOCKS}
                step={15}
                value={editing.durationMins}
                onChange={(e) =>
                  setEditing({ ...editing, durationMins: Number(e.target.value) || 30 })
                }
                className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] fc-tabular focus:outline-none focus:border-[#102E34]"
              />
              <input
                required
                placeholder="Label ($90)"
                value={editing.priceLabel}
                onChange={(e) => setEditing({ ...editing, priceLabel: e.target.value })}
                className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] fc-tabular focus:outline-none focus:border-[#102E34]"
              />
              <input
                type="number"
                min={0}
                value={editing.basePrice}
                onChange={(e) =>
                  setEditing({ ...editing, basePrice: Number(e.target.value) || 0 })
                }
                className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] fc-tabular focus:outline-none focus:border-[#102E34]"
              />
            </div>
            <select
              value={editing.defaultDoctorId}
              onChange={(e) => setEditing({ ...editing, defaultDoctorId: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Default: {d.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#102E34] cursor-pointer">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                className="accent-[#102E34]"
              />
              <span>Visible on public clinic website</span>
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] cursor-pointer disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving service…' : 'Save Service'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ==================== ANALYTICS TAB ==================== */
interface AnalyticsTabProps {
  appointments: Appointment[];
  inquiries: Inquiry[];
  doctors: Doctor[];
  services: ServiceItem[];
}

const CHART_COLORS = ['#102E34', '#426F77', '#C7775F', '#1E6B4B', '#5B7074'];

export function AnalyticsTab({
  appointments,
  inquiries,
  doctors,
  services,
}: AnalyticsTabProps) {
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
    appointments.forEach((a) => {
      counts[a.status] = (counts[a.status] || 0) + 1;
    });
    return Object.entries(counts).map(([k, v]) => ({
      name: STATUS_LABELS[k as keyof typeof STATUS_LABELS] || k,
      count: v,
    }));
  }, [appointments]);

  const serviceData = useMemo(() => {
    return services.map((s) => ({
      name: s.name.split(' ')[0],
      bookings: appointments.filter((a) => a.serviceId === s.id).length,
    }));
  }, [services, appointments]);

  const doctorData = useMemo(() => {
    return doctors.map((d) => ({
      name: d.name.replace('Dr. ', ''),
      appointments: appointments.filter((a) => a.doctorId === d.id).length,
    }));
  }, [doctors, appointments]);

  const channelData = useMemo(() => {
    const map = new Map<string, number>();
    inquiries.forEach((q) => {
      map.set(q.channel, (map.get(q.channel) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [inquiries]);

  const estimatedActiveRevenue = appointments
    .filter((a) => a.status === 'confirmed' || a.status === 'completed')
    .reduce((sum, a) => sum + (a.estimatedValue || 0), 0);

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-[#D8DFD9]">
        <h1 className="font-editorial text-3xl sm:text-4xl text-[#102E34]">
          Analytics &amp; Aggregates
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[#5B7074]">
          Real-time breakdowns computed strictly from Firestore appointments &amp; inquiries.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#D8DFD9] border-t-2 border-t-[#102E34] rounded-lg p-5">
          <span className="text-[11px] uppercase tracking-wider font-bold text-[#5B7074]">
            Total Bookings Recorded
          </span>
          <b className="block mt-2 font-editorial text-4xl text-[#102E34] fc-tabular">
            {appointments.length}
          </b>
        </div>
        <div className="bg-white border border-[#D8DFD9] border-t-2 border-t-[#426F77] rounded-lg p-5">
          <span className="text-[11px] uppercase tracking-wider font-bold text-[#5B7074]">
            Confirmed + Completed Value
          </span>
          <b className="block mt-2 font-editorial text-4xl text-[#1E6B4B] fc-tabular">
            ${estimatedActiveRevenue.toLocaleString()}
          </b>
        </div>
        <div className="bg-white border border-[#D8DFD9] border-t-2 border-t-[#C7775F] rounded-lg p-5">
          <span className="text-[11px] uppercase tracking-wider font-bold text-[#5B7074]">
            Total Inquiries Logged
          </span>
          <b className="block mt-2 font-editorial text-4xl text-[#102E34] fc-tabular">
            {inquiries.length}
          </b>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
          <h2 className="font-editorial text-xl text-[#102E34] mb-4">
            Appointments by Status
          </h2>
          {appointments.length === 0 ? (
            <p className="text-sm text-[#5B7074] py-16 text-center">
              No appointment records yet.
            </p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6EAE4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5B7074' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5B7074' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#102E34" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
          <h2 className="font-editorial text-xl text-[#102E34] mb-4">
            Bookings by Treatment
          </h2>
          {appointments.length === 0 ? (
            <p className="text-sm text-[#5B7074] py-16 text-center">
              No treatment bookings recorded yet.
            </p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6EAE4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5B7074' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5B7074' }} />
                  <Tooltip />
                  <Bar dataKey="bookings" fill="#426F77" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
          <h2 className="font-editorial text-xl text-[#102E34] mb-4">
            Doctor Workload Distribution
          </h2>
          {appointments.length === 0 ? (
            <p className="text-sm text-[#5B7074] py-16 text-center">
              No doctor appointments recorded yet.
            </p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={doctorData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E6EAE4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5B7074' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5B7074' }} />
                  <Tooltip />
                  <Bar dataKey="appointments" fill="#1E6B4B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
          <h2 className="font-editorial text-xl text-[#102E34] mb-4">
            Inquiries by Channel
          </h2>
          {channelData.length === 0 ? (
            <p className="text-sm text-[#5B7074] py-16 text-center">
              No inquiry channel data yet.
            </p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {channelData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== SETTINGS & AUDIT LOGS TAB ==================== */
interface SettingsAndAuditTabProps {
  role: UserRole;
  settings: ClinicSettings;
  doctors: Doctor[];
  services?: ServiceItem[];
  usersList: UserProfile[];
  auditLogs: AuditLog[];
  onSaveSettings: (s: ClinicSettings) => Promise<void>;
  onUpdateUserRole: (u: UserProfile, role: UserRole, doctorId?: string) => Promise<void>;
  onToast: (msg: string) => void;
}

const WEEK_LIST: Array<{ key: WeekdayKey; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

export function SettingsAndAuditTab({
  role,
  settings,
  doctors,
  services = [],
  usersList,
  auditLogs,
  onSaveSettings,
  onUpdateUserRole,
  onToast,
}: SettingsAndAuditTabProps) {
  const isAdmin = role === 'admin';
  const [draft, setDraft] = useState<ClinicSettings>(settings);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayLabel, setHolidayLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  async function submitSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    const incompatible = services.find(
      (s) =>
        s.active &&
        getSlotsNeededForDuration(s.durationMins, draft.slotDurationMins) > MAX_SLOT_LOCKS
    );
    if (incompatible) {
      onToast(
        `Slot duration ${draft.slotDurationMins}m cannot accommodate "${incompatible.name}" (${incompatible.durationMins}m) within the ${MAX_SLOT_LOCKS}-slot lock limit.`
      );
      return;
    }
    setSaving(true);
    try {
      await onSaveSettings(draft);
      onToast('Clinic hours, holidays & slot duration saved.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to save clinic settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-[#D8DFD9]">
        <h1 className="font-editorial text-3xl sm:text-4xl text-[#102E34]">
          Settings, Roles &amp; Audit Logs
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[#5B7074]">
          Configure clinic hours, holidays, slot duration, RBAC permissions, and review immutable activity logs.
        </p>
      </div>

      {isAdmin && (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <form
            onSubmit={submitSettings}
            className="bg-white border border-[#D8DFD9] rounded-lg p-5 space-y-4"
          >
            <h2 className="font-editorial text-xl text-[#102E34] pb-3 border-b border-[#E6EAE4]">
              Clinic Hours, Holidays &amp; Slot Duration
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="font-bold uppercase tracking-wider text-[11px] text-[#5B7074] block mb-1">
                  Slot Duration
                </span>
                <select
                  value={draft.slotDurationMins}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      slotDurationMins: Number(e.target.value) as 15 | 30 | 45 | 60,
                    })
                  }
                  className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] fc-tabular focus:outline-none focus:border-[#102E34]"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </label>

              <label className="block text-xs">
                <span className="font-bold uppercase tracking-wider text-[11px] text-[#5B7074] block mb-1">
                  Min Lead Time (mins)
                </span>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={draft.minLeadTimeMins}
                  onChange={(e) =>
                    setDraft({ ...draft, minLeadTimeMins: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] text-[#102E34] fc-tabular focus:outline-none focus:border-[#102E34]"
                />
              </label>
            </div>

            <div className="space-y-2.5 border-t border-[#E6EAE4] pt-3">
              {WEEK_LIST.map(({ key, label }) => {
                const d = draft.workingHours[key];
                return (
                  <div
                    key={key}
                    className="grid grid-cols-2 sm:grid-cols-[100px_auto_1fr_1fr] gap-2 items-center text-xs pb-2 sm:pb-0 border-b sm:border-b-0 border-[#E6EAE4]"
                  >
                    <span className="font-semibold text-[#102E34]">{label}</span>
                    <div className="flex justify-end sm:justify-start">
                      <input
                        type="checkbox"
                        checked={d.enabled}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            workingHours: {
                              ...draft.workingHours,
                              [key]: { ...d, enabled: e.target.checked },
                            },
                          })
                        }
                        className="accent-[#102E34]"
                      />
                    </div>
                    <input
                      type="time"
                      disabled={!d.enabled}
                      value={d.start}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          workingHours: {
                            ...draft.workingHours,
                            [key]: { ...d, start: e.target.value },
                          },
                        })
                      }
                      className="w-full min-w-0 px-2 py-1.5 rounded-md border border-[#D8DFD9] text-[#102E34] fc-tabular disabled:opacity-45"
                    />
                    <input
                      type="time"
                      disabled={!d.enabled}
                      value={d.end}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          workingHours: {
                            ...draft.workingHours,
                            [key]: { ...d, end: e.target.value },
                          },
                        })
                      }
                      className="w-full min-w-0 px-2 py-1.5 rounded-md border border-[#D8DFD9] text-[#102E34] fc-tabular disabled:opacity-45"
                    />
                  </div>
                );
              })}
            </div>

            <div className="space-y-2.5 border-t border-[#E6EAE4] pt-3">
              <b className="block text-[11px] uppercase tracking-wider font-bold text-[#5B7074]">
                Clinic Holidays
              </b>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="px-2.5 py-2 rounded-md border border-[#D8DFD9] text-xs text-[#102E34] fc-tabular"
                />
                <input
                  type="text"
                  placeholder="Holiday label"
                  value={holidayLabel}
                  onChange={(e) => setHolidayLabel(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-2 rounded-md border border-[#D8DFD9] text-xs text-[#102E34]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!holidayDate || !holidayLabel.trim()) return;
                    setDraft({
                      ...draft,
                      holidays: [
                        ...draft.holidays,
                        { date: holidayDate, label: holidayLabel.trim() },
                      ],
                    });
                    setHolidayDate('');
                    setHolidayLabel('');
                  }}
                  className="px-3.5 py-2 rounded-md border border-[#D8DFD9] bg-[#F7F5F0] text-[#102E34] text-xs font-semibold hover:border-[#102E34] cursor-pointer shrink-0 transition-colors"
                >
                  Add
                </button>
              </div>
              {draft.holidays.length > 0 && (
                <div className="space-y-1.5">
                  {draft.holidays.map((h, i) => (
                    <div
                      key={`${h.date}-${i}`}
                      className="flex items-center justify-between text-xs bg-[#F7F5F0] border border-[#E6EAE4] px-3 py-2 rounded-md"
                    >
                      <span className="fc-tabular text-[#102E34]">
                        <b>{h.date}</b> — {h.label}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            holidays: draft.holidays.filter((_, idx) => idx !== i),
                          })
                        }
                        className="text-[#A12A2A] hover:bg-[#FBECEC] p-1 rounded-sm cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] cursor-pointer disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving settings…' : 'Save Clinic Settings'}
            </button>
          </form>

          {/* Staff Roles & Permissions */}
          <div className="bg-white border border-[#D8DFD9] rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E6EAE4]">
              <Shield className="w-4 h-4 text-[#426F77]" />
              <h2 className="font-editorial text-xl text-[#102E34]">
                Staff Permissions &amp; User Roles ({usersList.length})
              </h2>
            </div>
            <p className="text-xs text-[#5B7074] leading-relaxed">
              New users default to <b className="text-[#102E34]">patient</b>. Only an Admin can elevate accounts to{' '}
              <b className="text-[#102E34]">receptionist</b>, <b className="text-[#102E34]">doctor</b>, or{' '}
              <b className="text-[#102E34]">admin</b> (enforced by Firestore rules).
            </p>
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {usersList.map((u) => (
                <div
                  key={u.uid}
                  className="p-3 rounded-md border border-[#E6EAE4] bg-[#F7F5F0]/50 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <b className="block text-[#102E34] truncate">{u.displayName}</b>
                    <span className="text-[#5B7074] truncate block">{u.email}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={u.role}
                      onChange={async (e) => {
                        const nextRole = e.target.value as UserRole;
                        try {
                          await onUpdateUserRole(u, nextRole, u.doctorId || doctors[0]?.id);
                          onToast(`Updated ${u.email} role to ${nextRole}.`);
                        } catch (err) {
                          onToast(
                            err instanceof Error ? err.message : 'Role update failed.'
                          );
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-[#D8DFD9] bg-white font-semibold text-[#102E34] focus:outline-none focus:border-[#102E34]"
                    >
                      <option value="patient">patient</option>
                      <option value="receptionist">receptionist</option>
                      <option value="doctor">doctor</option>
                      <option value="admin">admin</option>
                    </select>
                    {u.role === 'doctor' && (
                      <select
                        value={u.doctorId || doctors[0]?.id || 'd1'}
                        onChange={async (e) => {
                          try {
                            await onUpdateUserRole(u, 'doctor', e.target.value);
                            onToast(`Linked ${u.displayName} to ${e.target.value}.`);
                          } catch (err) {
                            onToast(
                              err instanceof Error ? err.message : 'Doctor link failed.'
                            );
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] focus:outline-none focus:border-[#102E34]"
                      >
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Immutable Audit Logs */}
      <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E6EAE4]">
          <h2 className="font-editorial text-xl text-[#102E34]">Audit Logs</h2>
          <span className="text-xs font-semibold text-[#5B7074] fc-tabular">
            {auditLogs.length} entries
          </span>
        </div>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-[#5B7074] py-4">No administrative audit entries yet.</p>
        ) : (
          <div className="divide-y divide-[#E6EAE4] max-h-[360px] overflow-y-auto text-xs">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <span className="px-2 py-0.5 rounded-sm bg-[#DCE8E3]/70 text-[#102E34] font-bold uppercase tracking-wider text-[10px] mr-2 fc-tabular">
                    {log.action}
                  </span>
                  <span className="text-[#102E34] font-medium">{log.summary}</span>
                </div>
                <span className="text-[#5B7074] fc-tabular shrink-0">
                  {log.actorEmail} ({log.actorRole})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
