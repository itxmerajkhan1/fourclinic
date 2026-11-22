import React, { useEffect, useState } from 'react';
import { Calendar, CalendarOff, Edit3, Plus, Trash2, X } from 'lucide-react';
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
  onAddOverride: (
    override: Omit<ScheduleOverride, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
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
      color: '#426F77',
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

  const visibleOverrides = schedules.filter(
    (s) => role !== 'doctor' || s.doctorId === linkedDoctorId
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-[#D8DFD9]">
        <div>
          <h1 className="font-editorial text-3xl sm:text-4xl text-[#102E34]">
            Doctors &amp; Schedules
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#5B7074]">
            Manage practitioner profiles, working hours, leave days, and assigned appointments.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openNewDoctor}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] cursor-pointer transition-colors"
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
              className="bg-white border border-[#D8DFD9] rounded-lg p-5 space-y-3"
            >
              <div className="flex gap-4 items-start">
                <div
                  style={{ borderTopColor: docItem.color || '#426F77' }}
                  className="w-16 h-20 rounded-md overflow-hidden border border-[#D8DFD9] border-t-2 bg-[#EFECE4] shrink-0"
                >
                  <img
                    src={docItem.photoUrl}
                    alt={docItem.name}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <b className="font-editorial text-xl text-[#102E34] truncate">
                      {docItem.name}
                    </b>
                    <span
                      className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        docItem.active
                          ? 'bg-[#E6F2EC] text-[#1E6B4B]'
                          : 'bg-[#EFECE4] text-[#5B7074]'
                      }`}
                    >
                      {docItem.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#426F77] mt-0.5">
                    {docItem.role} · {docItem.specialty}
                  </p>
                  <p className="text-xs text-[#5B7074] mt-1">
                    {docItem.experience} · {docItem.languages}
                  </p>
                  <p className="text-[11px] text-[#5B7074] mt-1.5">
                    Clinic Days:{' '}
                    <b className="text-[#102E34] font-semibold">
                      {activeDays || 'None enabled'}
                    </b>
                  </p>
                  <div className="mt-3.5 pt-3 border-t border-[#E6EAE4] flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDocId(isExpanded ? null : docItem.id)
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#426F77] hover:text-[#102E34] cursor-pointer fc-tabular"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {docAppts.length} active visits {isExpanded ? '▴' : '▾'}
                      </span>
                    </button>
                    {canEditThisDoc && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewDoc(false);
                          setEditingDoc(docItem);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#102E34] hover:border-[#102E34] cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3 h-3 text-[#426F77]" />
                        <span>{isAdmin ? 'Edit Profile & Hours' : 'Edit Hours'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="pt-3 border-t border-[#E6EAE4] space-y-2">
                  <b className="block text-[11px] uppercase tracking-wider font-bold text-[#5B7074] fc-tabular">
                    Assigned Active Appointments ({docAppts.length})
                  </b>
                  {docAppts.length === 0 ? (
                    <p className="text-xs text-[#5B7074] py-2">
                      No pending or confirmed visits assigned.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                      {docAppts.map((a) => (
                        <div
                          key={a.id}
                          className="p-2.5 rounded-md bg-[#F7F5F0] border border-[#E6EAE4] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <b className="text-[#102E34] fc-tabular block truncate">
                              {a.referenceCode} · {a.patientName}
                            </b>
                            <span className="block text-[#5B7074] fc-tabular mt-0.5">
                              {a.serviceName} ({a.durationMins}m) —{' '}
                              {formatDateLabel(a.date)} at {formatTimeLabel(a.time)}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-sm font-bold text-[10px] uppercase tracking-wider shrink-0 ${
                              a.status === 'confirmed'
                                ? 'bg-[#E6F2EC] text-[#1E6B4B]'
                                : 'bg-[#FCF4E6] text-[#9A5B13]'
                            }`}
                          >
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
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <form
          onSubmit={submitLeaveOverride}
          className="bg-white border border-[#D8DFD9] rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-[#E6EAE4]">
            <CalendarOff className="w-4 h-4 text-[#C7775F]" />
            <h2 className="font-editorial text-xl text-[#102E34]">
              Add Leave / Blocked Time
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#5B7074] mb-1">
                Dentist
              </span>
              <select
                value={leaveDocId}
                disabled={role === 'doctor'}
                onChange={(e) => setLeaveDocId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
              >
                {visibleDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#5B7074] mb-1">
                Date
              </span>
              <input
                type="date"
                min={todayIso()}
                value={leaveDate}
                onChange={(e) => setLeaveDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm text-[#102E34] fc-tabular focus:outline-none focus:border-[#102E34]"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-[#3B5257] cursor-pointer">
            <input
              type="checkbox"
              checked={leaveFullDay}
              onChange={(e) => setLeaveFullDay(e.target.checked)}
              className="accent-[#102E34]"
            />
            <span>Block entire clinical day</span>
          </label>

          {!leaveFullDay && (
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#5B7074] mb-1">
                Specific Slots (24h HH:MM, comma separated)
              </span>
              <input
                type="text"
                value={leaveSlotsText}
                onChange={(e) => setLeaveSlotsText(e.target.value)}
                placeholder="e.g. 10:00, 10:30"
                className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] fc-tabular focus:outline-none focus:border-[#102E34]"
              />
            </label>
          )}

          <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[#5B7074] mb-1">
              Reason
            </span>
            <input
              type="text"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              maxLength={160}
              placeholder="e.g. Continuing education conference, personal leave"
              className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
            />
          </label>

          <button
            type="submit"
            disabled={leaveSaving}
            className="px-5 py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] cursor-pointer disabled:opacity-50 transition-colors"
          >
            {leaveSaving ? 'Saving…' : 'Save Blocked Time'}
          </button>
        </form>

        <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E6EAE4]">
            <h2 className="font-editorial text-xl text-[#102E34]">
              Active Leave &amp; Overrides
            </h2>
            <span className="text-xs font-semibold text-[#5B7074] fc-tabular">
              {visibleOverrides.length} active
            </span>
          </div>

          {visibleOverrides.length === 0 ? (
            <p className="text-sm text-[#5B7074] py-6">
              No blocked days or slot overrides recorded.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[290px] overflow-y-auto pr-1">
              {visibleOverrides.map((ov) => {
                const dName =
                  doctors.find((d) => d.id === ov.doctorId)?.name || ov.doctorId;
                return (
                  <div
                    key={ov.id}
                    className="p-3 rounded-md bg-[#F7F5F0] border border-[#E6EAE4] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <b className="text-[#102E34] fc-tabular block truncate">
                        {dName} · {formatDateLabel(ov.date)}
                      </b>
                      <p className="text-[#5B7074] mt-0.5 fc-tabular">
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
                          onToast(
                            err instanceof Error ? err.message : 'Failed to remove override.'
                          );
                        }
                      }}
                      className="p-1.5 rounded-md text-[#A12A2A] hover:bg-[#FBECEC] cursor-pointer shrink-0 transition-colors"
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
          className="fixed inset-0 z-50 bg-[#102E34]/65 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={submitDoctor}
            className="bg-white border border-[#D8DFD9] rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E6EAE4]">
              <h2 className="font-editorial text-2xl text-[#102E34]">
                {isNewDoc ? 'Add Doctor' : `Edit ${editingDoc.name}`}
              </h2>
              <button
                type="button"
                aria-label="Close doctor modal"
                onClick={() => setEditingDoc(null)}
                className="p-1.5 rounded-md text-[#5B7074] hover:text-[#102E34] hover:bg-[#F7F5F0] cursor-pointer"
              >
                <X className="w-4 h-4" />
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
                    className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  />
                  <input
                    required
                    placeholder="Role (e.g. Orthodontist)"
                    value={editingDoc.role}
                    onChange={(e) => setEditingDoc({ ...editingDoc, role: e.target.value })}
                    className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Specialty (e.g. Braces · Aligners)"
                    value={editingDoc.specialty}
                    onChange={(e) =>
                      setEditingDoc({ ...editingDoc, specialty: e.target.value })
                    }
                    className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  />
                  <input
                    required
                    placeholder="Languages (e.g. English · Urdu)"
                    value={editingDoc.languages}
                    onChange={(e) =>
                      setEditingDoc({ ...editingDoc, languages: e.target.value })
                    }
                    className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    required
                    placeholder="Experience"
                    value={editingDoc.experience}
                    onChange={(e) =>
                      setEditingDoc({ ...editingDoc, experience: e.target.value })
                    }
                    className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  />
                  <input
                    required
                    placeholder="Initials"
                    maxLength={4}
                    value={editingDoc.initials}
                    onChange={(e) =>
                      setEditingDoc({ ...editingDoc, initials: e.target.value })
                    }
                    className="px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  />
                  <input
                    type="color"
                    aria-label="Doctor accent color"
                    value={editingDoc.color}
                    onChange={(e) => setEditingDoc({ ...editingDoc, color: e.target.value })}
                    className="w-full h-10 rounded-md border border-[#D8DFD9] bg-white px-1 cursor-pointer"
                  />
                </div>
                <textarea
                  required
                  rows={2}
                  placeholder="Bio"
                  value={editingDoc.bio}
                  onChange={(e) => setEditingDoc({ ...editingDoc, bio: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-[#102E34] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingDoc.active}
                    onChange={(e) =>
                      setEditingDoc({ ...editingDoc, active: e.target.checked })
                    }
                    className="accent-[#102E34]"
                  />
                  <span>Active for public booking</span>
                </label>
              </>
            )}

            <div className="space-y-2.5 border-t border-[#E6EAE4] pt-3">
              <b className="block text-xs uppercase tracking-wider font-bold text-[#5B7074]">
                Weekly Working Hours
              </b>
              {WEEKDAYS.map(({ key, label }) => {
                const day = editingDoc.workingHours[key];
                return (
                  <div
                    key={key}
                    className="grid grid-cols-2 sm:grid-cols-[110px_auto_1fr_1fr] gap-2 items-center text-xs pb-2 sm:pb-0 border-b sm:border-b-0 border-[#E6EAE4]"
                  >
                    <span className="font-semibold text-[#102E34]">{label}</span>
                    <div className="flex justify-end sm:justify-start">
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
                        className="accent-[#102E34]"
                      />
                    </div>
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
                      className="w-full min-w-0 px-2.5 py-1.5 rounded-md border border-[#D8DFD9] text-[#102E34] fc-tabular disabled:opacity-45"
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
                      className="w-full min-w-0 px-2.5 py-1.5 rounded-md border border-[#D8DFD9] text-[#102E34] fc-tabular disabled:opacity-45"
                    />
                  </div>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-sm font-semibold hover:bg-[#194149] disabled:opacity-50 cursor-pointer transition-colors"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
