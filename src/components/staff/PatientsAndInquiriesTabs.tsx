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
      <div>
        <h1 className="text-2xl font-extrabold text-[#12262e]">Patient Directory</h1>
        <p className="text-sm text-[#5d737a]">
          Authorized contact records and visit history (no clinical chart records stored).
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[#5d737a] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patients by name, phone, or email…"
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#cfdee1] bg-white text-sm"
        />
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
        <div className="bg-white border border-[#e3ebec] rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#5d737a]">
              No patients recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-[#eef3f4]">
              {filtered.map((pt) => (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(pt.id);
                    setNotesDraft(pt.notes || '');
                  }}
                  className={`w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-[#f8fbfb] cursor-pointer ${
                    selected?.id === pt.id ? 'bg-[#f2f7f8]' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <b className="text-sm text-[#12262e]">{pt.fullName}</b>
                      {pt.isSample && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                          SAMPLE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#5d737a]">
                      {pt.phone}
                      {pt.email ? ` · ${pt.email}` : ''}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#e7eff1] text-[#3d7280] text-xs font-bold shrink-0">
                    {pt.totalAppointments} visits
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          {!selected ? (
            <p className="text-sm text-[#5d737a] py-8 text-center">
              Select a patient to view minimal contact details and appointment history.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-extrabold text-[#12262e]">{selected.fullName}</h2>
                <p className="text-xs text-[#5d737a]">
                  {selected.phone} {selected.email ? `· ${selected.email}` : ''}
                </p>
              </div>

              {(role === 'admin' || role === 'receptionist') && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-[#42565c]">
                    Front-desk scheduling preferences
                  </label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="e.g. Prefers morning slots, Spanish speaker"
                    className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-xs"
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
                        onToast(err instanceof Error ? err.message : 'Unable to save note.');
                      } finally {
                        setSavingNote(false);
                      }
                    }}
                    className="px-4 py-1.5 rounded-full bg-[#4d8a96] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {savingNote ? 'Saving…' : 'Save Note'}
                  </button>
                </div>
              )}

              <div>
                <b className="block text-xs font-extrabold text-[#12262e] mb-2">
                  Appointment History ({history.length})
                </b>
                {history.length === 0 ? (
                  <p className="text-xs text-[#5d737a]">No matching visits found.</p>
                ) : (
                  <div className="space-y-2 max-h-[260px] overflow-y-auto">
                    {history.map((a) => (
                      <div
                        key={a.id}
                        className="p-2.5 rounded-xl border border-[#e3ebec] bg-[#fbfdfd] text-xs"
                      >
                        <div className="flex justify-between font-bold text-[#12262e]">
                          <span>
                            {a.referenceCode} · {a.serviceName}
                          </span>
                          <span className="text-[#4d8a96]">{STATUS_LABELS[a.status]}</span>
                        </div>
                        <p className="text-[#5d737a] mt-0.5">
                          {formatDateLabel(a.date)} {formatTimeLabel(a.time)} · {a.doctorName}
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
    const header = ['ID', 'Name', 'Contact', 'Channel', 'Topic', 'Status', 'Priority', 'AssignedTo', 'Sample'];
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#12262e]">Inquiries &amp; CRM</h1>
          <p className="text-sm text-[#5d737a]">
            Triage website messages &amp; AI chat escalations, assign staff, and log follow-ups.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#cfdee1] bg-white text-xs font-bold text-[#12262e] cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
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
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
              statusFilter === chip.id
                ? 'bg-[#4d8a96] text-white'
                : 'bg-white border border-[#e3ebec] text-[#42565c]'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-6 items-start">
        <div className="bg-white border border-[#e3ebec] rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#5d737a]">No inquiries in this view.</div>
          ) : (
            <div className="divide-y divide-[#eef3f4]">
              {filtered.map((q) => (
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
                  className={`w-full text-left p-4 hover:bg-[#f8fbfb] cursor-pointer ${
                    selected?.id === q.id ? 'bg-[#f2f7f8]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-[#12262e] flex items-center gap-2">
                      {q.unread && <span className="w-2 h-2 rounded-full bg-[#4d8a96]" />}
                      <span>{q.name}</span>
                      {q.isSample && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                          SAMPLE
                        </span>
                      )}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                        q.priority === 'urgent'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-[#e7eff1] text-[#3d7280]'
                      }`}
                    >
                      {q.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-[#5d737a] mt-1">
                    {q.channel} · {q.contact}
                  </p>
                  <p className="text-xs text-[#42565c] mt-1 line-clamp-1">
                    {q.messages[0]?.text}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e3ebec] rounded-2xl p-5">
          {!selected ? (
            <p className="text-sm text-[#5d737a] py-8 text-center">
              Select an inquiry to view thread, update CRM status, or assign staff.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eef3f4] pb-3">
                <div>
                  <h2 className="text-lg font-extrabold text-[#12262e]">{selected.name}</h2>
                  <p className="text-xs text-[#5d737a]">
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
                      onToast(err instanceof Error ? err.message : 'Status update failed.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl border border-[#cfdee1] bg-white text-xs font-bold"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <label className="block">
                  <span className="font-bold text-[#42565c] flex items-center gap-1 mb-1">
                    <UserCheck className="w-3.5 h-3.5" /> Assigned Staff
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
                        onToast(err instanceof Error ? err.message : 'Assignment failed.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] bg-white"
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
                  <span className="font-bold text-[#42565c] mb-1 block">Priority</span>
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
                        onToast(err instanceof Error ? err.message : 'Priority update failed.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] bg-white"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto p-3 rounded-xl bg-[#f8fbfb] border border-[#e3ebec]">
                {selected.messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl text-xs ${
                      m.from === 'user'
                        ? 'bg-white border border-[#e3ebec]'
                        : 'bg-[#e7eff1] text-[#12262e]'
                    }`}
                  >
                    <b className="uppercase text-[10px] text-[#4d8a96]">{m.from}</b>
                    <p className="mt-0.5">{m.text}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#42565c]">
                  <MessageSquare className="inline w-3.5 h-3.5 mr-1" />
                  Log staff reply / note to thread
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="Called patient and confirmed PPO coverage…"
                    className="flex-1 px-3 py-2 rounded-xl border border-[#cfdee1] text-xs"
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
                        onToast(err instanceof Error ? err.message : 'Failed to log reply.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="px-4 py-2 rounded-full bg-[#4d8a96] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    Log Reply
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[#eef3f4]">
                <label className="block text-xs font-bold text-[#42565c]">Internal CRM Notes</label>
                <textarea
                  rows={2}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#cfdee1] text-xs"
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
                      onToast(err instanceof Error ? err.message : 'Failed to save notes.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-[#cfdee1] text-xs font-bold text-[#12262e] cursor-pointer disabled:opacity-50"
                >
                  <MailCheck className="w-3.5 h-3.5 text-[#4d8a96]" />
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
