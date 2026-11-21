import React, { useEffect, useState } from 'react';
import { Calendar, CalendarOff, Edit3, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_WORKING_HOURS } from '../../data/sampleSeed';
import {
  formatDateLabel,
  formatTimeLabel,
  formatUserFriendlyError,
  sanitizeId,
  STATUS_LABELS,
  todayIso,
} from '../../lib/validation';
import type {
  Appointment,
  Doctor,
  ScheduleOverride,
  UserRole,
  WeekdayKey,
} from '../../types/clinic';

const WEEKDAYS: Array<{ key: WeekdayKey; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

interface DoctorsAndSchedulesTabProps {
  role: UserRole;
  linkedDoctorId?: string;
  doctors: Doctor[];
  schedules: ScheduleOverride[];
  appointments: Appointment[];
  onSaveDoctor: (doctor: Doctor, isNew: boolean) => Promise<void>;
  onSaveDoctorSchedule: (
    doctorId: string,
    workingHours: Doctor['workingHours'],
    blockedDates: string[]
  ) => Promise<void>;
  onAddOverride: (override: Omit<ScheduleOverride, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteOverride: (scheduleId: string) => Promise<void>;
  onToast: (msg: string) => void;
}

export function DoctorsAndSchedulesTab({
  role,
  linkedDoctorId,
  doctors,
  schedules,
  appointments,
  onSaveDoctor,
  onSaveDoctorSchedule,
  onAddOverride,
  onDeleteOverride,
  onToast,
}: DoctorsAndSchedulesTabProps) {
  const isAdmin = role === 'admin';
  const [editingDoc, setEditingDoc] = useState<Doctor | null>(null);
  const [isNewDoc, setIsNewDoc] = useState(false);
  const [leaveDocId, setLeaveDocId] = useState(
    role === 'doctor' && linkedDoctorId ? linkedDoctorId : doctors[0]?.id || 'd1'
  );
  const [leaveDate, setLeaveDate] = useState(todayIso());
  const [leaveFullDay, setLeaveFullDay] = useState(true);
  const [leaveSlotsText, setLeaveSlotsText] = useState('10:00, 10:30');
  const [leaveReason, setLeaveReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingDoc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingDoc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingDoc]);

  const visibleDoctors =
    role === 'doctor' && linkedDoctorId
      ? doctors.filter((d) => d.id === linkedDoctorId)
      : doctors;

  function openNewDoctor() {
    setIsNewDoc(true);
    setEditingDoc({
      id: sanitizeId(`d_${Date.now().toString(36)}`),
      name: '',
      role: 'Specialist Dentist',
      specialty: '',
      bio: '',
      experience: '5 yrs experience',
      languages: 'English',
      color: '#4d8a96',
      photoUrl: '/images/doctor-1.jpg',
      initials: 'DR',
      active: true,
      workingHours: DEFAULT_WORKING_HOURS,
      blockedDates: [],
      isSample: false,
    });
  }

  async function submitDoctor(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDoc) return;
    setSaving(true);
    try {
      if (isAdmin) {
        await onSaveDoctor(editingDoc, isNewDoc);
        onToast(`${isNewDoc ? 'Added' : 'Updated'} ${editingDoc.name}.`);
      } else {
        await onSaveDoctorSchedule(
          editingDoc.id,
          editingDoc.workingHours,
          editingDoc.blockedDates
        );
        onToast(`Updated working hours for ${editingDoc.name}.`);
      }
      setEditingDoc(null);
    } catch (err) {
      onToast(formatUserFriendlyError(err, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitLeaveOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!leaveDate || !leaveDocId) return;
    const blockedSlots = leaveFullDay
      ? []
      : leaveSlotsText
          .split(',')
          .map((s) => s.trim())
          .filter((s) => /^\d{2}:\d{2}$/.test(s));
    setLeaveSaving(true);
    try {
      await onAddOverride({
        doctorId: leaveDocId,
        date: leaveDate,
        isBlockedDay: leaveFullDay,
        blockedSlots,
        reason: leaveReason.trim() || 'Leave / Blocked time',
      });
      setLeaveReason('');
      onToast('Leave / blocked time saved to schedule.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to block time.');
    } finally {
      setLeaveSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#12262e]">Doctors &amp; Schedules</h1>
          <p className="text-sm text-[#5d737a]">
            Manage practitioner profiles, working hours, leave days, and assigned appointments.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openNewDoctor}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#4d8a96] text-white text-xs font-bold hover:bg-[#3d7280] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Doctor</span>
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {visibleDoctors.map((docItem) => {
          const docAppts = appointments.filter(
            (a) =>
              a.doctorId === docItem.id &&
              (a.status === 'pending' || a.status === 'confirmed')
          );
          const isExpanded = expandedDocId === docItem.id;
          const activeDays = WEEKDAYS.filter((w) => docItem.workingHours?.[w.key]?.enabled)
            .map((w) => w.label.slice(0, 3))
            .join(', ');

          const canEditThisDoc =
            isAdmin || (role === 'doctor' && linkedDoctorId === docItem.id);

          return (
            <div
              key={docItem.id}
              className="bg-white border border-[#e3ebec] rounded-2xl p-5 space-y-3"
            >
              <div className="flex gap-4 items-start">
                <img
                  src={docItem.photoUrl}
                  alt={docItem.name}
                  style={{ borderColor: docItem.color }}
                  className="w-16 h-16 rounded-full object-cover border-2 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-base text-[#12262e] truncate">{docItem.name}</b>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        docItem.active
                          ? 'bg-[#eef7f1] text-[#2e8a5c]'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {docItem.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#4d8a96]">
                    {docItem.role} · {docItem.specialty}
                  </p>
                  <p className="text-xs text-[#5d737a] mt-1">
                    {docItem.experience} · {docItem.languages}
                  </p>
                  <p className="text-[11px] text-[#5d737a] mt-1">
                    Days: <b className="text-[#12262e]">{activeDays || 'None enabled'}</b>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDocId(isExpanded ? null : docItem.id)
                      }
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#4d8a96] hover:underline cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {docAppts.length} assigned active visits {isExpanded ? '▴' : '▾'}
                      </span>
                    </button>
                    {canEditThisDoc && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewDoc(false);
                          setEditingDoc(docItem);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#cfdee1] text-xs font-bold text-[#3d7280] hover:bg-[#f2f7f8] cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{isAdmin ? 'Edit Profile & Hours' : 'Edit Hours'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="pt-3 border-t border-[#eef3f4] space-y-2">
                  <b className="block text-xs font-extrabold text-[#12262e]">
                    Assigned Active Appointments ({docAppts.length})
                  </b>
                  {docAppts.length === 0 ? (
                    <p className="text-xs text-[#5d737a]">No pending or confirmed visits assigned.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                      {docAppts.map((a) => (
                        <div
                          key={a.id}
                          className="p-2.5 rounded-xl bg-[#f8fbfb] border border-[#e3ebec] flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <b className="text-[#12262e]">
                              {a.referenceCode} · {a.patientName}
                            </b>
                            <span className="block text-[#5d737a]">
                              {a.serviceName} ({a.durationMins}m) — {formatDateLabel(a.date)} at{' '}
                              {formatTimeLabel(a.time)}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-[#e7eff1] text-[#3d7280] font-bold text-[10px] uppercase shrink-0">
                            {STATUS_LABELS[a.status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Leave & Blocked Slots Section */}
      <div className="grid lg:grid-cols-2 gap-6">
        <form
          onSubmit={submitLeaveOverride}
          className="bg-white border border-[#e3ebec] rounded-2xl p-5 space-y-3"
        >
          <h2 className="text-base font-extrabold text-[#12262e] flex items-center gap-2">
            <CalendarOff className="w-4 h-4 text-[#4d8a96]" />
            <span>Add Leave / Blocked Time</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <select
              value={leaveDocId}
              disabled={role === 'doctor'}
              onChange={(e) => setLeaveDocId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm"
            >
              {visibleDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              min={todayIso()}
              value={leaveDate}
              onChange={(e) => setLeaveDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#42565c]">
            <input
              type="checkbox"
              checked={leaveFullDay}
              onChange={(e) => setLeaveFullDay(e.target.checked)}
            />
            <span>Block entire day</span>
          </label>
          {!leaveFullDay && (
            <input
              type="text"
              value={leaveSlotsText}
              onChange={(e) => setLeaveSlotsText(e.target.value)}
              placeholder="Blocked slots (HH:MM, comma separated e.g. 10:00, 10:30)"
              className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
            />
          )}
          <input
            type="text"
            value={leaveReason}
            onChange={(e) => setLeaveReason(e.target.value)}
            maxLength={160}
            placeholder="Reason (e.g. Conference, personal leave)"
            className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
          />
          <button
            type="submit"
            disabled={leaveSaving}
            className="px-5 py-2.5 rounded-full bg-[#4d8a96] text-white text-xs font-bold hover:bg-[#3d7280] cursor-pointer disabled:opacity-50"
          >
            {leaveSaving ? 'Saving…' : 'Save Blocked Time'}
          </button>
        </form>

        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          <h2 className="text-base font-extrabold text-[#12262e] mb-3">
            Active Leave &amp; Schedule Overrides ({schedules.length})
          </h2>
          {schedules.length === 0 ? (
            <p className="text-sm text-[#5d737a]">No blocked days or slot overrides recorded.</p>
          ) : (
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto">
              {schedules
                .filter((s) => role !== 'doctor' || s.doctorId === linkedDoctorId)
                .map((ov) => {
                  const dName = doctors.find((d) => d.id === ov.doctorId)?.name || ov.doctorId;
                  return (
                    <div
                      key={ov.id}
                      className="p-3 rounded-xl border border-[#e3ebec] flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <b className="text-[#12262e]">
                          {dName} · {formatDateLabel(ov.date)}
                        </b>
                        <p className="text-[#5d737a]">
                          {ov.isBlockedDay
                            ? 'Full day blocked'
                            : `Slots: ${ov.blockedSlots.map(formatTimeLabel).join(', ')}`}{' '}
                          — {ov.reason}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove override"
                        onClick={async () => {
                          try {
                            await onDeleteOverride(ov.id);
                            onToast('Schedule override removed.');
                          } catch (err) {
                            onToast(err instanceof Error ? err.message : 'Failed to remove override.');
                          }
                        }}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Doctor Editor Modal */}
      {editingDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isNewDoc ? 'Add Doctor' : `Edit ${editingDoc.name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingDoc(null);
          }}
          className="fixed inset-0 z-50 bg-[#12262e]/60 flex items-center justify-center p-4"
        >
          <form
            onSubmit={submitDoctor}
            className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#12262e]">
                {isNewDoc ? 'Add Doctor' : `Edit ${editingDoc.name}`}
              </h2>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="text-xs font-bold text-[#5d737a] cursor-pointer"
              >
                Close
              </button>
            </div>

            {isAdmin && (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Doctor full name"
                    value={editingDoc.name}
                    onChange={(e) => setEditingDoc({ ...editingDoc, name: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
                  />
                  <input
                    required
                    placeholder="Role (e.g. Orthodontist)"
                    value={editingDoc.role}
                    onChange={(e) => setEditingDoc({ ...editingDoc, role: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Specialty (e.g. Braces · Aligners)"
                    value={editingDoc.specialty}
                    onChange={(e) => setEditingDoc({ ...editingDoc, specialty: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
                  />
                  <input
                    required
                    placeholder="Languages (e.g. English · Urdu)"
                    value={editingDoc.languages}
                    onChange={(e) => setEditingDoc({ ...editingDoc, languages: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    required
                    placeholder="Experience"
                    value={editingDoc.experience}
                    onChange={(e) => setEditingDoc({ ...editingDoc, experience: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
                  />
                  <input
                    required
                    placeholder="Initials"
                    maxLength={4}
                    value={editingDoc.initials}
                    onChange={(e) => setEditingDoc({ ...editingDoc, initials: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
                  />
                  <input
                    type="color"
                    value={editingDoc.color}
                    onChange={(e) => setEditingDoc({ ...editingDoc, color: e.target.value })}
                    className="w-full h-10 rounded-xl border border-[#cfdee1]"
                  />
                </div>
                <textarea
                  required
                  rows={2}
                  placeholder="Bio"
                  value={editingDoc.bio}
                  onChange={(e) => setEditingDoc({ ...editingDoc, bio: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-sm"
                />
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={editingDoc.active}
                    onChange={(e) => setEditingDoc({ ...editingDoc, active: e.target.checked })}
                  />
                  <span>Active for public booking</span>
                </label>
              </>
            )}

            <div className="space-y-2 border-t border-[#eef3f4] pt-3">
              <b className="block text-xs font-extrabold text-[#12262e]">Weekly Working Hours</b>
              {WEEKDAYS.map(({ key, label }) => {
                const day = editingDoc.workingHours[key];
                return (
                  <div key={key} className="grid grid-cols-[110px_auto_1fr_1fr] gap-2 items-center text-xs">
                    <span className="font-semibold text-[#42565c]">{label}</span>
                    <input
                      type="checkbox"
                      checked={day.enabled}
                      onChange={(e) =>
                        setEditingDoc({
                          ...editingDoc,
                          workingHours: {
                            ...editingDoc.workingHours,
                            [key]: { ...day, enabled: e.target.checked },
                          },
                        })
                      }
                    />
                    <input
                      type="time"
                      disabled={!day.enabled}
                      value={day.start}
                      onChange={(e) =>
                        setEditingDoc({
                          ...editingDoc,
                          workingHours: {
                            ...editingDoc.workingHours,
                            [key]: { ...day, start: e.target.value },
                          },
                        })
                      }
                      className="px-2 py-1 rounded border border-[#cfdee1]"
                    />
                    <input
                      type="time"
                      disabled={!day.enabled}
                      value={day.end}
                      onChange={(e) =>
                        setEditingDoc({
                          ...editingDoc,
                          workingHours: {
                            ...editingDoc.workingHours,
                            [key]: { ...day, end: e.target.value },
                          },
                        })
                      }
                      className="px-2 py-1 rounded border border-[#cfdee1]"
                    />
                  </div>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-full bg-[#4d8a96] text-white text-sm font-bold disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
