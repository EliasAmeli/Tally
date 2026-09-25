import { useEffect, useState } from "react";
import * as api from "../api";
import type { Job, Shift, Proposal } from "../types";

const jobColor = (jobs: Job[], jobId: string | null) =>
  jobs.find((j) => j.jobId === jobId)?.color ?? "var(--job-a)";

function DayBlock({
  title,
  shifts,
  jobs,
  onSaved,
}: {
  title: string;
  shifts: Shift[];
  jobs: Job[];
  onSaved: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const beginEdit = (s: Shift) => {
    setEditingId(s.shiftId);
    setStart(s.start);
    setEnd(s.end);
  };

  const save = async (s: Shift) => {
    setSaving(true);
    try {
      await api.updateShift(s.shiftId, s.date, { start, end });
      setEditingId(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const totalHours = shifts.length; // placeholder — real total computed from time strings server-side

  return (
    <div className="day-block">
      <div className="day-head">
        <h3>{title}</h3>
        <span className="total nums">{totalHours} shift{totalHours === 1 ? "" : "s"}</span>
      </div>

      {shifts.length === 0 && <div className="empty-day">Nothing scheduled — paste a message above to add one.</div>}

      {shifts.map((s) => {
        const job = jobs.find((j) => j.jobId === s.jobId);
        return (
          <div key={s.shiftId} className="shift-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="bar" style={{ background: jobColor(jobs, s.jobId) }} />
              <div className="info">
                <div className="job">{job?.name ?? "Unknown job"}</div>
                <div className="time">{s.start} – {s.end}</div>
              </div>
              <button className="edit-btn" onClick={() => beginEdit(s)}>Edit</button>
            </div>
            {editingId === s.shiftId && (
              <div className="edit-row">
                <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="Start" />
                <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="End" />
                <button className="btn btn-primary" disabled={saving} onClick={() => save(s)}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ShiftsView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [today, setToday] = useState<Shift[]>([]);
  const [tomorrow, setTomorrow] = useState<Shift[]>([]);
  const [message, setMessage] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [j, t, tm] = await Promise.all([
      api.listJobs(),
      api.listShifts("today"),
      api.listShifts("tomorrow"),
    ]);
    setJobs(j.jobs);
    setToday(t.shifts);
    setTomorrow(tm.shifts);
  };

  useEffect(() => {
    refresh().catch((e) => setFeedback({ text: String(e), error: true }));
  }, []);

  const handleParse = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.parseMessage(message);
      if (res.proposals.length === 0) {
        setFeedback({ text: res.message ?? "Couldn't find a shift in that message.", error: true });
      } else {
        setProposals(res.proposals);
      }
    } catch (e) {
      setFeedback({ text: String(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const confirmProposal = async (p: Proposal) => {
    if (!p.jobId) {
      setFeedback({ text: "Couldn't match that to one of your jobs — add it manually instead.", error: true });
      return;
    }
    await api.createShift({ jobId: p.jobId, date: p.date, start: p.start, end: p.end, tips: 0 });
    setProposals((cur) => cur.filter((x) => x !== p));
    setMessage("");
    await refresh();
  };

  return (
    <div className="view">
      <div className="paste-panel">
        <h2>Paste a shift message</h2>
        <p>Drop in whatever your manager sent — Tally proposes a shift for you to confirm.</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder='e.g. "You&#39;re on Thu 4-9pm, also picked up Sat 10-3"'
        />
        <div className="paste-actions">
          <button className="btn btn-primary" disabled={busy} onClick={handleParse}>
            {busy ? "Parsing…" : "Parse message"}
          </button>
        </div>
        {feedback && <div className={`feedback ${feedback.error ? "error" : ""}`}>{feedback.text}</div>}
        {proposals.map((p, i) => (
          <div className="proposal-card" key={i}>
            <span>{p.jobName ?? "?"} · {p.date} · {p.start}–{p.end}</span>
            <button className="btn btn-primary" onClick={() => confirmProposal(p)}>Add</button>
          </div>
        ))}
      </div>

      <DayBlock title="Today" shifts={today} jobs={jobs} onSaved={refresh} />
      <DayBlock title="Tomorrow" shifts={tomorrow} jobs={jobs} onSaved={refresh} />
    </div>
  );
}
