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
import { Edit3, Plus, Shield, Trash2 } from 'lucide-react';
import { formatUserFriendlyError, sanitizeId, STATUS_LABELS } from '../../lib/validation';
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
  onSaveService: (svc: ServiceItem, isNew: boolean) => Promise<void>;
  onToast: (msg: string) => void;
}

export function ServicesTab({
  role,
  services,
  doctors,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#12262e]">Services &amp; Pricing</h1>
          <p className="text-sm text-[#5d737a]">
            Services edited here update the public website pricing table and booking options immediately.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4d8a96] text-white text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Service</span>
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((svc) => (
          <div key={svc.id} className="bg-white border border-[#e3ebec] rounded-2xl p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <b className="text-base text-[#12262e]">{svc.name}</b>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  svc.active ? 'bg-[#eef7f1] text-[#2e8a5c]' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {svc.active ? 'Active' : 'Hidden'}
              </span>
            </div>
            <p className="text-xs text-[#42565c] mt-2 flex-1">{svc.description}</p>
            <div className="mt-4 pt-3 border-t border-[#eef3f4] flex items-center justify-between text-xs">
              <span className="font-extrabold text-[#4d8a96]">
                {svc.priceLabel} · {svc.durationMins}m
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setIsNew(false);
                    setEditing(svc);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#cfdee1] font-bold text-[#3d7280] cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
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
          className="fixed inset-0 z-50 bg-[#12262e]/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#12262e]">
                {isNew ? 'Add Dental Service' : `Edit ${editing.name}`}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-xs font-bold text-[#5d737a] cursor-pointer"
              >
                Close
              </button>
            </div>
            <input
              required
              placeholder="Service title"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
            />
            <textarea
              required
              rows={2}
              placeholder="Description"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
            />
            <input
              required
              placeholder="Includes summary"
              value={editing.includes}
              onChange={(e) => setEditing({ ...editing, includes: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                min={15}
                max={240}
                step={15}
                value={editing.durationMins}
                onChange={(e) =>
                  setEditing({ ...editing, durationMins: Number(e.target.value) || 30 })
                }
                className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
              />
              <input
                required
                placeholder="Label ($90)"
                value={editing.priceLabel}
                onChange={(e) => setEditing({ ...editing, priceLabel: e.target.value })}
                className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
              />
              <input
                type="number"
                min={0}
                value={editing.basePrice}
                onChange={(e) =>
                  setEditing({ ...editing, basePrice: Number(e.target.value) || 0 })
                }
                className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
              />
            </div>
            <select
              value={editing.defaultDoctorId}
              onChange={(e) => setEditing({ ...editing, defaultDoctorId: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Default: {d.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              <span>Visible on public clinic website</span>
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-full bg-[#4d8a96] text-white text-sm font-bold cursor-pointer disabled:opacity-50"
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

const CHART_COLORS = ['#4d8a96', '#2e8a5c', '#6f6fd6', '#d98a5f', '#dc2626'];

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
      <div>
        <h1 className="text-2xl font-extrabold text-[#12262e]">Analytics &amp; Aggregates</h1>
        <p className="text-sm text-[#5d737a]">
          Real-time breakdowns computed strictly from Firestore appointments &amp; inquiries (zero fabricated stats).
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          <span className="text-xs font-bold text-[#5d737a]">TOTAL BOOKINGS RECORDED</span>
          <b className="block mt-1 text-3xl font-extrabold text-[#12262e] fc-tabular">
            {appointments.length}
          </b>
        </div>
        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          <span className="text-xs font-bold text-[#5d737a]">CONFIRMED + COMPLETED VALUE</span>
          <b className="block mt-1 text-3xl font-extrabold text-[#4d8a96] fc-tabular">
            ${estimatedActiveRevenue.toLocaleString()}
          </b>
        </div>
        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          <span className="text-xs font-bold text-[#5d737a]">TOTAL INQUIRIES LOGGED</span>
          <b className="block mt-1 text-3xl font-extrabold text-[#12262e] fc-tabular">
            {inquiries.length}
          </b>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          <h2 className="text-sm font-extrabold text-[#12262e] mb-4">
            Appointments by Status
          </h2>
          {appointments.length === 0 ? (
            <p className="text-sm text-[#5d737a] py-16 text-center">
              No appointment records yet.
            </p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef3f4" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4d8a96" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          <h2 className="text-sm font-extrabold text-[#12262e] mb-4">
            Bookings by Treatment
          </h2>
          {appointments.length === 0 ? (
            <p className="text-sm text-[#5d737a] py-16 text-center">
              No treatment bookings recorded yet.
            </p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef3f4" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="bookings" fill="#6f6fd6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          <h2 className="text-sm font-extrabold text-[#12262e] mb-4">
            Doctor Workload Distribution
          </h2>
          {appointments.length === 0 ? (
            <p className="text-sm text-[#5d737a] py-16 text-center">
              No doctor appointments recorded yet.
            </p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={doctorData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef3f4" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="appointments" fill="#5aa07a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          <h2 className="text-sm font-extrabold text-[#12262e] mb-4">
            Inquiries by Channel
          </h2>
          {channelData.length === 0 ? (
            <p className="text-sm text-[#5d737a] py-16 text-center">
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
      <div>
        <h1 className="text-2xl font-extrabold text-[#12262e]">Settings, Roles &amp; Audit Logs</h1>
        <p className="text-sm text-[#5d737a]">
          Configure clinic hours, holidays, slot duration, RBAC permissions, and review immutable activity logs.
        </p>
      </div>

      {isAdmin && (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <form
            onSubmit={submitSettings}
            className="bg-white border border-[#e3ebec] rounded-2xl p-5 space-y-4"
          >
            <h2 className="text-base font-extrabold text-[#12262e]">
              Clinic Hours, Holidays &amp; Slot Duration
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="font-bold text-[#42565c] block mb-1">Slot Duration</span>
                <select
                  value={draft.slotDurationMins}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      slotDurationMins: Number(e.target.value) as 15 | 30 | 45 | 60,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] bg-white"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </label>

              <label className="block text-xs">
                <span className="font-bold text-[#42565c] block mb-1">Min Lead Time (mins)</span>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={draft.minLeadTimeMins}
                  onChange={(e) =>
                    setDraft({ ...draft, minLeadTimeMins: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#cfdee1]"
                />
              </label>
            </div>

            <div className="space-y-2 border-t border-[#eef3f4] pt-3">
              {WEEK_LIST.map(({ key, label }) => {
                const d = draft.workingHours[key];
                return (
                  <div key={key} className="grid grid-cols-[100px_auto_1fr_1fr] gap-2 items-center text-xs">
                    <span className="font-semibold text-[#42565c]">{label}</span>
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
                    />
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
                      className="px-2 py-1 rounded border border-[#cfdee1]"
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
                      className="px-2 py-1 rounded border border-[#cfdee1]"
                    />
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 border-t border-[#eef3f4] pt-3">
              <b className="text-xs font-extrabold text-[#12262e]">Clinic Holidays</b>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-[#cfdee1] text-xs"
                />
                <input
                  type="text"
                  placeholder="Holiday label"
                  value={holidayLabel}
                  onChange={(e) => setHolidayLabel(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-xl border border-[#cfdee1] text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!holidayDate || !holidayLabel.trim()) return;
                    setDraft({
                      ...draft,
                      holidays: [...draft.holidays, { date: holidayDate, label: holidayLabel.trim() }],
                    });
                    setHolidayDate('');
                    setHolidayLabel('');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#e7eff1] text-[#3d7280] text-xs font-bold cursor-pointer"
                >
                  Add
                </button>
              </div>
              {draft.holidays.length > 0 && (
                <div className="space-y-1">
                  {draft.holidays.map((h, i) => (
                    <div key={`${h.date}-${i}`} className="flex items-center justify-between text-xs bg-[#f8fbfb] px-3 py-1.5 rounded-lg">
                      <span>
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
                        className="text-rose-600 cursor-pointer"
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
              className="w-full py-2.5 rounded-full bg-[#4d8a96] text-white text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving settings…' : 'Save Clinic Settings'}
            </button>
          </form>

          {/* Staff Roles & Permissions */}
          <div className="bg-white border border-[#e3ebec] rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-extrabold text-[#12262e] flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#4d8a96]" />
              <span>Staff Permissions &amp; User Roles ({usersList.length})</span>
            </h2>
            <p className="text-xs text-[#5d737a]">
              New users default to <b>patient</b>. Only an Admin can elevate accounts to{' '}
              <b>receptionist</b>, <b>doctor</b>, or <b>admin</b> (enforced by Firestore rules).
            </p>
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto">
              {usersList.map((u) => (
                <div
                  key={u.uid}
                  className="p-3 rounded-xl border border-[#e3ebec] flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <b className="block text-[#12262e] truncate">{u.displayName}</b>
                    <span className="text-[#5d737a] truncate block">{u.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={u.role}
                      onChange={async (e) => {
                        const nextRole = e.target.value as UserRole;
                        try {
                          await onUpdateUserRole(u, nextRole, u.doctorId || doctors[0]?.id);
                          onToast(`Updated ${u.email} role to ${nextRole}.`);
                        } catch (err) {
                          onToast(err instanceof Error ? err.message : 'Role update failed.');
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-[#cfdee1] bg-white font-bold"
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
                            onToast(err instanceof Error ? err.message : 'Doctor link failed.');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-[#cfdee1] bg-white"
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
      <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
        <h2 className="text-base font-extrabold text-[#12262e] mb-3">
          Audit Logs ({auditLogs.length})
        </h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-[#5d737a]">No administrative audit entries yet.</p>
        ) : (
          <div className="divide-y divide-[#eef3f4] max-h-[340px] overflow-y-auto text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="px-2 py-0.5 rounded bg-[#e7eff1] text-[#3d7280] font-bold mr-2">
                    {log.action}
                  </span>
                  <span className="text-[#12262e] font-medium">{log.summary}</span>
                </div>
                <span className="text-[#5d737a]">
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
