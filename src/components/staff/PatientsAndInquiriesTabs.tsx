import { useEffect, useMemo, useState } from 'react';
import { Download, MailCheck, MessageSquare, Search, UserCheck } from 'lucide-react';
import { formatDateLabel, formatTimeLabel, STATUS_LABELS } from '../../lib/validation';
import type {
  Appointment,
  Inquiry,
  InquiryPriority,
  InquiryStatus,
  PatientRecord,
  UserProfile,
  UserRole,
} from '../../types/clinic';

interface PatientsTabProps {
  role: UserRole;
  patients: PatientRecord[];
  appointments: Appointment[];
  onUpdateNotes: (patient: PatientRecord, notes: string) => Promise<void>;
  onToast: (msg: string) => void;
}

export function PatientsTab({
  role,
  patients,
  appointments,
  onUpdateNotes,
  onToast,
}: PatientsTabProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const selected = useMemo(
    () => patients.find((p) => p.id === selectedId) || null,
    [patients, selectedId]
  );

  useEffect(() => {
    if (selected) {
      setNotesDraft(selected.notes || '');
    }
  }, [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      `${p.fullName} ${p.phone} ${p.email || ''}`.toLowerCase().includes(q)
    );
  }, [patients, search]);

  const history = useMemo(() => {
    if (!selected) return [];
    return appointments.filter(
      (a) =>
        (selected.uid && a.patientUid === selected.uid) ||
        a.patientPhone === selected.phone
    );
  }, [selected, appointments]);

  return (
    <div className="space-y-5">
      <div className="pb-5 border-b border-[#D8DFD9]">
        <h1 className="font-editorial text-3xl sm:text-4xl text-[#102E34]">
          Patient Directory
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[#5B7074]">
          Authorized contact records and visit history (no clinical chart records stored).
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[#5B7074] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patients by name, phone, or email…"
          className="w-full pl-9 pr-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-sm text-[#102E34] focus:outline-none focus:border-[#102E34]"
        />
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
        <div className="bg-white border border-[#D8DFD9] rounded-lg overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#5B7074]">
              No patients recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-[#E6EAE4]">
              {filtered.map((pt) => {
                const isSelected = selected?.id === pt.id;
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(pt.id);
                      setNotesDraft(pt.notes || '');
                    }}
                    className={`w-full text-left p-4 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#DCE8E3]/45 border-l-2 border-l-[#102E34]'
                        : 'hover:bg-[#F7F5F0]/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <b className="text-sm font-semibold text-[#102E34] truncate">
                          {pt.fullName}
                        </b>
                        {pt.isSample && (
                          <span className="px-1.5 py-0.5 rounded-sm bg-[#EFECE4] text-[10px] font-bold uppercase tracking-wider text-[#5B7074]">
                            SAMPLE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#5B7074] mt-0.5 fc-tabular truncate">
                        {pt.phone}
                        {pt.email ? ` · ${pt.email}` : ''}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-sm bg-[#DCE8E3]/70 text-[#102E34] text-xs font-semibold shrink-0 fc-tabular">
                      {pt.totalAppointments} visits
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
          {!selected ? (
            <p className="text-sm text-[#5B7074] py-10 text-center">
              Select a patient to view contact details and appointment history.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="pb-3 border-b border-[#E6EAE4]">
                <h2 className="font-editorial text-2xl text-[#102E34]">
                  {selected.fullName}
                </h2>
                <p className="text-xs text-[#5B7074] fc-tabular mt-0.5">
                  {selected.phone} {selected.email ? `· ${selected.email}` : ''}
                </p>
              </div>

              {(role === 'admin' || role === 'receptionist') && (
                <div className="space-y-2">
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-[#5B7074]">
                    Front-desk scheduling preferences
                  </label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="e.g. Prefers morning slots, Spanish speaker"
                    className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] text-xs text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  />
                  <button
                    type="button"
                    disabled={savingNote}
                    onClick={async () => {
                      setSavingNote(true);
                      try {
                        await onUpdateNotes(selected, notesDraft);
                        onToast('Patient scheduling note saved.');
                      } catch (err) {
                        onToast(
                          err instanceof Error ? err.message : 'Unable to save note.'
                        );
                      } finally {
                        setSavingNote(false);
                      }
                    }}
                    className="px-4 py-1.5 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    {savingNote ? 'Saving…' : 'Save Note'}
                  </button>
                </div>
              )}

              <div>
                <b className="block text-[11px] uppercase tracking-wider font-bold text-[#5B7074] mb-2 fc-tabular">
                  Appointment History ({history.length})
                </b>
                {history.length === 0 ? (
                  <p className="text-xs text-[#5B7074]">No matching visits found.</p>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {history.map((a) => (
                      <div
                        key={a.id}
                        className="p-3 rounded-md border border-[#E6EAE4] bg-[#F7F5F0] text-xs"
                      >
                        <div className="flex justify-between gap-2 font-semibold text-[#102E34]">
                          <span className="fc-tabular">
                            {a.referenceCode} · {a.serviceName}
                          </span>
                          <span className="text-[#426F77] uppercase text-[10px] tracking-wider shrink-0">
                            {STATUS_LABELS[a.status]}
                          </span>
                        </div>
                        <p className="text-[#5B7074] mt-1 fc-tabular">
                          {formatDateLabel(a.date)} {formatTimeLabel(a.time)} ·{' '}
                          {a.doctorName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface InquiriesTabProps {
  inquiries: Inquiry[];
  staffUsers: UserProfile[];
  onUpdateInquiry: (
    inquiry: Inquiry,
    patch: {
      status?: InquiryStatus;
      priority?: InquiryPriority;
      assignedToUid?: string;
      assignedToName?: string;
      internalNotes?: string;
      unread?: boolean;
      appendStaffReply?: string;
    }
  ) => Promise<void>;
  onToast: (msg: string) => void;
}

export function InquiriesTab({
  inquiries,
  staffUsers,
  onUpdateInquiry,
  onToast,
}: InquiriesTabProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(inquiries[0]?.id || null);
  const [notesDraft, setNotesDraft] = useState(inquiries[0]?.internalNotes || '');
  const [replyDraft, setReplyDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => {
    if (!selectedId) return inquiries[0] || null;
    return inquiries.find((q) => q.id === selectedId) || inquiries[0] || null;
  }, [inquiries, selectedId]);

  useEffect(() => {
    if (selected) {
      setNotesDraft(selected.internalNotes || '');
    }
  }, [selected?.id, selected?.internalNotes]);

  const staffOnly = staffUsers.filter((u) => u.role !== 'patient' && u.active);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return inquiries;
    if (statusFilter === 'urgent') return inquiries.filter((q) => q.priority === 'urgent');
    return inquiries.filter((q) => q.status === statusFilter);
  }, [inquiries, statusFilter]);

  function exportCsv() {
    const header = [
      'ID',
      'Name',
      'Contact',
      'Channel',
      'Topic',
      'Status',
      'Priority',
      'AssignedTo',
      'Sample',
    ];
    const rows = filtered.map((q) => [
      q.id,
      q.name,
      q.contact,
      q.channel,
      q.topic,
      q.status,
      q.priority,
      q.assignedToName || '',
      q.isSample ? 'Yes' : 'No',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fourclinic-inquiries.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-[#D8DFD9]">
        <div>
          <h1 className="font-editorial text-3xl sm:text-4xl text-[#102E34]">
            Inquiries &amp; CRM
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#5B7074]">
            Triage website messages &amp; AI chat escalations, assign staff, and log follow-ups.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#102E34] hover:border-[#102E34] cursor-pointer transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-[#426F77]" />
          <span>Export CSV</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: `All (${inquiries.length})` },
          { id: 'new', label: 'New' },
          { id: 'contacted', label: 'Contacted' },
          { id: 'follow_up', label: 'Follow-up' },
          { id: 'closed', label: 'Closed' },
          { id: 'urgent', label: 'Urgent only' },
        ].map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setStatusFilter(chip.id)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer fc-tabular transition-colors ${
              statusFilter === chip.id
                ? 'bg-[#102E34] text-[#F7F5F0]'
                : 'bg-white border border-[#D8DFD9] text-[#3B5257] hover:border-[#102E34]'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-6 items-start">
        <div className="bg-white border border-[#D8DFD9] rounded-lg overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#5B7074]">
              No inquiries in this view.
            </div>
          ) : (
            <div className="divide-y divide-[#E6EAE4]">
              {filtered.map((q) => {
                const isSelected = selected?.id === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(q.id);
                      setNotesDraft(q.internalNotes || '');
                      if (q.unread) {
                        void onUpdateInquiry(q, { unread: false });
                      }
                    }}
                    className={`w-full text-left p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#DCE8E3]/45 border-l-2 border-l-[#102E34]'
                        : 'hover:bg-[#F7F5F0]/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-[#102E34] flex items-center gap-2 min-w-0">
                        {q.unread && (
                          <span className="w-2 h-2 rounded-sm bg-[#C7775F] shrink-0" />
                        )}
                        {q.referenceCode && (
                          <span className="text-xs font-bold text-[#426F77] fc-tabular shrink-0">
                            {q.referenceCode}
                          </span>
                        )}
                        <span className="truncate">{q.name}</span>
                        {q.isSample && (
                          <span className="px-1.5 py-0.5 rounded-sm bg-[#EFECE4] text-[10px] font-bold uppercase tracking-wider text-[#5B7074] shrink-0">
                            SAMPLE
                          </span>
                        )}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                          q.priority === 'urgent'
                            ? 'bg-[#FBECEC] text-[#A12A2A]'
                            : 'bg-[#DCE8E3]/70 text-[#102E34]'
                        }`}
                      >
                        {q.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-[#5B7074] mt-1 fc-tabular truncate">
                      {q.channel} · {q.contact}
                    </p>
                    <p className="text-xs text-[#3B5257] mt-1 line-clamp-1">
                      {q.messages[0]?.text}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#D8DFD9] rounded-lg p-5">
          {!selected ? (
            <p className="text-sm text-[#5B7074] py-10 text-center">
              Select an inquiry to view thread, update CRM status, or assign staff.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E6EAE4] pb-3.5">
                <div>
                  <h2 className="font-editorial text-2xl text-[#102E34]">
                    {selected.referenceCode ? `${selected.referenceCode} · ` : ''}
                    {selected.name}
                  </h2>
                  <p className="text-xs text-[#5B7074] mt-0.5 fc-tabular">
                    {selected.contact} · Channel: {selected.channel} · Topic: {selected.topic}
                  </p>
                </div>
                <select
                  value={selected.status}
                  disabled={busy}
                  onChange={async (e) => {
                    const next = e.target.value as InquiryStatus;
                    setBusy(true);
                    try {
                      await onUpdateInquiry(selected, { status: next });
                      onToast(`Inquiry status updated to ${next}.`);
                    } catch (err) {
                      onToast(
                        err instanceof Error ? err.message : 'Status update failed.'
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#102E34] focus:outline-none focus:border-[#102E34]"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <label className="block">
                  <span className="font-bold uppercase tracking-wider text-[11px] text-[#5B7074] flex items-center gap-1 mb-1">
                    <UserCheck className="w-3.5 h-3.5 text-[#426F77]" /> Assigned Staff
                  </span>
                  <select
                    value={selected.assignedToUid || ''}
                    disabled={busy}
                    onChange={async (e) => {
                      const staff = staffOnly.find((s) => s.uid === e.target.value);
                      setBusy(true);
                      try {
                        await onUpdateInquiry(selected, {
                          assignedToUid: staff?.uid || '',
                          assignedToName: staff?.displayName || '',
                        });
                        onToast(staff ? `Assigned to ${staff.displayName}` : 'Unassigned');
                      } catch (err) {
                        onToast(
                          err instanceof Error ? err.message : 'Assignment failed.'
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  >
                    <option value="">Unassigned</option>
                    {staffOnly.map((s) => (
                      <option key={s.uid} value={s.uid}>
                        {s.displayName} ({s.role})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="font-bold uppercase tracking-wider text-[11px] text-[#5B7074] mb-1 block">
                    Priority
                  </span>
                  <select
                    value={selected.priority}
                    disabled={busy}
                    onChange={async (e) => {
                      const p = e.target.value as InquiryPriority;
                      setBusy(true);
                      try {
                        await onUpdateInquiry(selected, { priority: p });
                        onToast(`Priority updated to ${p}.`);
                      } catch (err) {
                        onToast(
                          err instanceof Error ? err.message : 'Priority update failed.'
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] bg-white text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </div>

              <div className="space-y-2 max-h-[210px] overflow-y-auto p-3 rounded-md bg-[#F7F5F0] border border-[#E6EAE4]">
                {selected.messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-md text-xs ${
                      m.from === 'user'
                        ? 'bg-white border border-[#D8DFD9]'
                        : 'bg-[#DCE8E3]/70 text-[#102E34] border border-[#D8DFD9]'
                    }`}
                  >
                    <b className="uppercase text-[10px] tracking-wider text-[#426F77]">
                      {m.from}
                    </b>
                    <p className="mt-1 text-[#102E34] leading-relaxed">{m.text}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] uppercase tracking-wider font-bold text-[#5B7074]">
                  <MessageSquare className="inline w-3.5 h-3.5 mr-1 text-[#426F77]" />
                  Log staff reply / note to thread
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="Called patient and confirmed PPO coverage…"
                    className="flex-1 min-w-0 px-3 py-2 rounded-md border border-[#D8DFD9] text-xs text-[#102E34] focus:outline-none focus:border-[#102E34]"
                  />
                  <button
                    type="button"
                    disabled={busy || !replyDraft.trim()}
                    onClick={async () => {
                      if (!replyDraft.trim()) return;
                      setBusy(true);
                      try {
                        await onUpdateInquiry(selected, {
                          appendStaffReply: replyDraft,
                          status: selected.status === 'new' ? 'contacted' : selected.status,
                        });
                        setReplyDraft('');
                        onToast('Logged staff update to inquiry.');
                      } catch (err) {
                        onToast(
                          err instanceof Error ? err.message : 'Failed to log reply.'
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="px-4 py-2 rounded-md bg-[#102E34] text-[#F7F5F0] text-xs font-semibold hover:bg-[#194149] cursor-pointer disabled:opacity-50 shrink-0 transition-colors"
                  >
                    Log Reply
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t border-[#E6EAE4]">
                <label className="block text-[11px] uppercase tracking-wider font-bold text-[#5B7074]">
                  Internal CRM Notes
                </label>
                <textarea
                  rows={2}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[#D8DFD9] text-xs text-[#102E34] focus:outline-none focus:border-[#102E34]"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onUpdateInquiry(selected, { internalNotes: notesDraft });
                      onToast('CRM notes saved.');
                    } catch (err) {
                      onToast(
                        err instanceof Error ? err.message : 'Failed to save notes.'
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md border border-[#D8DFD9] bg-white text-xs font-semibold text-[#102E34] hover:border-[#102E34] cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <MailCheck className="w-3.5 h-3.5 text-[#426F77]" />
                  <span>{busy ? 'Saving…' : 'Save Notes'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
