import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";

type StudyHour = ApiResponse<typeof api, "getDailyStudyHour">;
type StudyHourList = ApiResponse<typeof api, "listDailyStudyHours">;
type StudyPhase = StudyHour["phases"][number];
type StudyHourClass = StudyHour["class_name"];
export type StudyHourTarget =
  | { kind: "watch"; className: string; topic: string; videoId?: string }
  | { kind: "study"; className: string; deckId: number | null }
  | { kind: "lab"; className: string; deckId: number | null; prompt: string }
  | { kind: "teach"; className: string; deckId: number | null; topic: string };

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTimer(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function assessmentDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SUBJECT_META: Record<StudyHourClass, { short: string; eyebrow: string; color: string }> = {
  "MA 162": { short: "Math", eyebrow: "Calculus II", color: "#2457d6" },
  "PHYS 172": { short: "Physics", eyebrow: "Modern mechanics", color: "#e7523d" },
  "CNIT 182": { short: "CNIT", eyebrow: "Systems & lab", color: "#16866a" },
};

const PHASE_COPY: Record<StudyPhase["id"], { action: string; description: string }> = {
  learn: { action: "Open Watch", description: "Watch the class-scoped lesson queue. Use an explainer wherever the setup still feels shaky." },
  drill: { action: "Open decision cards", description: "Work this class’s recall deck weakest-first: method, setup, and traps — not whole solutions." },
  practice: { action: "Open board + tutor", description: "Work 2–3 real problems on the whiteboard with this class and topic already in context." },
  teach: { action: "Teach Munki", description: "Explain this class’s hardest idea simply, then answer Munki’s follow-up question." },
  lock: { action: "Review the hour", description: "Name what you can now recognize, the trap you will avoid, and tomorrow’s first move." },
};

function phaseCopy(phase: StudyPhase, state: StudyHour) {
  if (phase.id === "learn" && state.class_name === "CNIT 182") {
    return { action: "Open concept cards", description: "Build the CNIT mental model with unseen and due concept cards before timed recall." };
  }
  return PHASE_COPY[phase.id];
}

function phaseTarget(phase: StudyPhase, state: StudyHour): StudyHourTarget | null {
  const selected = state.topic;
  const common = { className: selected.class_name, deckId: selected.deck_id };
  // CNIT does not have an owned lesson-video library yet. Keep Learn inside its
  // attached deck instead of sending the user into an unrelated MA/PHYS feed.
  if (phase.id === "learn") return selected.class_name === "CNIT 182"
    ? { kind: "study", ...common }
    : { kind: "watch", className: selected.class_name, topic: selected.label };
  if (phase.id === "drill") return { kind: "study", ...common };
  if (phase.id === "practice") return { kind: "lab", ...common, prompt: `${selected.class_name} · ${selected.assessment}: ${selected.label}` };
  if (phase.id === "teach") return { kind: "teach", ...common, topic: selected.label };
  return null;
}

function hourSummary(hour: StudyHour) {
  if (hour.status === "complete") return `Complete · +${hour.xp_earned} XP`;
  if (hour.status === "active") return `${hour.phases[hour.current_phase]?.label ?? "Resume"} · ${hour.completed_count}/5 finished`;
  return `${hour.topic.assessment} · ${assessmentDate(hour.topic.assessment_date)}`;
}

export function DailyStudyHourCard({ onOpen }: { onOpen: () => void }) {
  const state = useQuery({ queryKey: ["daily-study-hours", localDateKey()], queryFn: () => api.listDailyStudyHours({ date_key: localDateKey() }) });
  if (!state.data) return <button className="study-hour-card loading" onClick={onOpen}><span className="hour-mark">3×</span><span><strong>Choose a Study Hour</strong><small>Loading math, physics, and CNIT…</small></span><b aria-hidden="true">→</b></button>;
  const completed = state.data.hours.filter((hour) => hour.status === "complete").length;
  const active = state.data.hours.find((hour) => hour.status === "active");
  return <button className={`study-hour-card ${completed === 3 ? "complete" : active ? "active" : ""}`} onClick={onOpen}>
    <span className="hour-mark">{completed === 3 ? "✓" : "3×"}</span>
    <span><strong>{completed === 3 ? "All Study Hours complete" : "Choose a 60-minute hour"}</strong><small>{active ? `${active.class_name} · ${hourSummary(active)}` : `${completed}/3 complete · MA 162 · PHYS 172 · CNIT 182`}</small></span>
    <b aria-hidden="true">→</b>
  </button>;
}

export function ActiveStudyHourDock({ onOpen }: { onOpen: () => void }) {
  const state = useQuery({ queryKey: ["daily-study-hours", localDateKey()], queryFn: () => api.listDailyStudyHours({ date_key: localDateKey() }), refetchInterval: 15_000 });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const hour = state.data?.hours.find((item) => item.status === "active");
  if (!hour) return null;
  const phase = hour.phases[hour.current_phase];
  if (!phase) return null;
  const started = hour.phase_started_at ? new Date(hour.phase_started_at).getTime() : now;
  const remaining = Math.max(0, phase.minutes * 60 - Math.floor((now - started) / 1000));
  return <button className="study-hour-dock" onClick={onOpen} aria-label={`Return to ${hour.class_name} Study Hour, ${phase.label}, ${formatTimer(remaining)} remaining`}><span><i />{hour.class_name} · {phase.label}</span><strong>{formatTimer(remaining)}</strong><small>Return to hour</small></button>;
}

export function DailyStudyHour({ onExit, onOpenTarget }: { onExit: () => void; onOpenTarget: (target: StudyHourTarget) => void }) {
  const queryClient = useQueryClient();
  const key = localDateKey();
  const state = useQuery({ queryKey: ["daily-study-hours", key], queryFn: () => api.listDailyStudyHours({ date_key: key }) });
  const [selectedClass, setSelectedClass] = useState<StudyHourClass | null>(() => {
    try {
      const stored = window.localStorage.getItem("munki-current-study-hour");
      return stored === "MA 162" || stored === "PHYS 172" || stored === "CNIT 182" ? stored : null;
    } catch { return null; }
  });
  const chooseClass = (className: StudyHourClass | null) => {
    setSelectedClass(className);
    try { className ? window.localStorage.setItem("munki-current-study-hour", className) : window.localStorage.removeItem("munki-current-study-hour"); } catch { /* Session state still works. */ }
  };
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const data = state.data?.hours.find((hour) => hour.class_name === selectedClass);
  const phase = data?.phases[data.current_phase];
  const started = data?.phase_started_at ? new Date(data.phase_started_at).getTime() : now;
  const remaining = phase ? Math.max(0, phase.minutes * 60 - Math.floor((now - started) / 1000)) : 0;
  const progress = phase ? Math.max(0, Math.min(1, 1 - remaining / (phase.minutes * 60))) : 0;
  const overallMinutes = useMemo(() => data?.phases.reduce((sum, item, index) => sum + (item.status === "done" || item.status === "skipped" ? item.minutes : index === data.current_phase ? Math.round(progress * item.minutes) : 0), 0) ?? 0, [data, progress]);
  const start = useMutation({
    mutationFn: (className: StudyHourClass) => api.startDailyStudyHour({ date_key: key, class_name: className }),
    onSuccess: async (result) => { chooseClass(result.class_name); await queryClient.invalidateQueries({ queryKey: ["daily-study-hours", key] }); },
  });
  const advance = useMutation({
    mutationFn: ({ className, phaseId, status }: { className: StudyHourClass; phaseId: StudyPhase["id"]; status: "done" | "skipped" }) => api.advanceDailyStudyHour({ date_key: key, class_name: className, phase: phaseId, status }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["daily-study-hours", key] }), queryClient.invalidateQueries({ queryKey: ["game"] }), queryClient.invalidateQueries({ queryKey: ["mascot"] })]); },
  });

  if (state.isPending || !state.data) return <div className="study-hour-page center-state"><span className="loader" /><p>Building today’s hours…</p></div>;
  if (state.error) return <div className="study-hour-page center-state"><p>Today’s study hours couldn’t load.</p><button className="secondary-btn" onClick={() => state.refetch()}>Try again</button></div>;

  if (!selectedClass || !data) return <HourChooser hours={state.data.hours} onExit={onExit} onSelect={chooseClass} />;
  const meta = SUBJECT_META[data.class_name];

  return <section className="study-hour-page" style={{ "--subject-color": meta.color } as CSSProperties}>
    <header className="study-hour-head"><button className="hour-close" onClick={() => chooseClass(null)} aria-label="Back to all Study Hours">‹</button><div><p className="hero-label">{data.class_name} · 60-minute hour</p><h1>{data.status === "complete" ? "That hour counted." : data.status === "active" ? "Stay in the sequence." : `${meta.short}, start to finish.`}</h1></div><span className="hour-total">{data.status === "complete" ? `${data.xp_earned} XP` : `${overallMinutes}/60 min`}</span></header>

    {data.status === "not_started" && <>
      <div className="hour-intro-grid">
        <div className="hour-ring intro"><strong>60</strong><span>minutes</span></div>
        <div><h2>Learn → drill → practice → teach.</h2><p>A complete hour for {data.class_name}. Every handoff stays scoped to this class, from its Watch queue through Teach Munki.</p></div>
      </div>
      <TopicAgenda topic={data.topic} />
      <ol className="hour-timeline">{data.phases.map((item, index) => <li key={item.id}><span>{index + 1}</span><div><strong>{item.label}</strong><small>{phaseCopy(item, data).description}</small></div><b>{item.minutes}m</b></li>)}</ol>
      <button className="primary-btn hour-start" disabled={start.isPending} onClick={() => start.mutate(data.class_name)}>{start.isPending ? "Starting…" : `Start ${data.class_name} hour`}</button>
    </>}

    {data.status === "active" && phase && <div className="hour-active-layout">
      <div className="hour-main">
        <div className="hour-phase-kicker">{data.class_name} · Phase {data.current_phase + 1} of 5 · {phase.minutes} minutes</div>
        <div className={`hour-ring ${remaining === 0 ? "overtime" : ""}`} style={{ "--hour-progress": `${progress * 360}deg` } as CSSProperties}><strong>{formatTimer(remaining)}</strong><span>{remaining === 0 ? "time’s up" : phase.label}</span></div>
        <h2>{phase.label}</h2>
        <p>{phaseCopy(phase, data).description}</p>
        <p className="hour-active-topic"><strong>{data.topic.class_name} · {data.topic.assessment}</strong><span>{data.topic.label}</span></p>
        {phase.id === "lock" ? <LockInSummary phases={data.phases} className={data.class_name} /> : <button className="hour-surface-button" onClick={() => { const target = phaseTarget(phase, data); if (target) onOpenTarget(target); }}><span>{data.class_name} · {phaseCopy(phase, data).action}</span><span aria-hidden="true">↗</span></button>}
        <div className="hour-phase-actions"><button className="primary-btn" disabled={advance.isPending} onClick={() => advance.mutate({ className: data.class_name, phaseId: phase.id, status: "done" })}>{phase.id === "lock" ? "Finish hour" : "Finish phase"}</button><button className="text-btn skip" disabled={advance.isPending} onClick={() => advance.mutate({ className: data.class_name, phaseId: phase.id, status: "skipped" })}>Skip this phase</button></div>
        {advance.error && <p className="form-error">{advance.error instanceof Error ? advance.error.message : "That phase did not save."}</p>}
      </div>
      <aside><TopicAgenda topic={data.topic} compact /><PhaseRail phases={data.phases} activeIndex={data.current_phase} /></aside>
    </div>}

    {data.status === "complete" && <div className="hour-complete">
      <div className="complete-mark">✓</div><p className="hero-label">{data.class_name} locked in</p><h2>+{data.xp_earned} XP</h2><p>{data.completed_count} phases finished{data.skipped_count ? ` · ${data.skipped_count} skipped` : " · full sequence"}. Your combo is now {data.combo}.</p>
      <PhaseRail phases={data.phases} activeIndex={-1} />
      <button className="primary-btn" onClick={() => chooseClass(null)}>Choose another hour</button>
    </div>}
  </section>;
}

function HourChooser({ hours, onExit, onSelect }: { hours: StudyHourList["hours"]; onExit: () => void; onSelect: (className: StudyHourClass) => void }) {
  const complete = hours.filter((hour) => hour.status === "complete").length;
  return <section className="study-hour-page hour-chooser-page">
    <header className="study-hour-head"><button className="hour-close" onClick={onExit} aria-label="Exit Study Hours">×</button><div><p className="hero-label">Daily Study Hours</p><h1>Pick your next hour.</h1></div><span className="hour-total">{complete}/3 done</span></header>
    <p className="hour-chooser-lede">Each class gets its own full 60-minute sequence: 15 learn, 15 drill, 15 practice, 10 teach, and 5 lock in.</p>
    <div className="subject-hour-grid">{hours.map((hour) => {
      const meta = SUBJECT_META[hour.class_name];
      return <button key={hour.class_name} className={`subject-hour-option ${hour.status}`} style={{ "--subject-color": meta.color } as CSSProperties} onClick={() => onSelect(hour.class_name)} aria-label={`Open ${hour.class_name} 60-minute Study Hour`}>
        <span className="subject-hour-number">60<small>min</small></span>
        <span className="subject-hour-copy"><small>{meta.eyebrow}</small><strong>{hour.class_name}</strong><span>{hour.topic.label}</span><b>{hourSummary(hour)}</b></span>
        <span className="subject-hour-arrow" aria-hidden="true">→</span>
      </button>;
    })}</div>
    <ol className="chooser-flow" aria-label="Every Study Hour follows five phases"><li><b>15</b><span>Learn</span></li><li><b>15</b><span>Drill</span></li><li><b>15</b><span>Practice</span></li><li><b>10</b><span>Teach</span></li><li><b>5</b><span>Lock in</span></li></ol>
  </section>;
}

function TopicAgenda({ topic, compact = false }: { topic: StudyHour["topic"]; compact?: boolean }) {
  return <div className={`hour-topics ${compact ? "compact" : ""}`}><div className="hour-section-title"><strong>This hour’s target</strong><span>class scoped</span></div><article><div><strong>{topic.class_name}</strong><span className={topic.urgency}>{topic.urgency === "now" ? "Priority" : "Building"}</span></div><p>{topic.label}</p><small>{topic.assessment} · {assessmentDate(topic.assessment_date)}</small></article></div>;
}

function PhaseRail({ phases, activeIndex }: { phases: StudyHour["phases"]; activeIndex: number }) {
  return <ol className="phase-rail" aria-label="Study Hour progress">{phases.map((phase, index) => <li key={phase.id} className={`${phase.status} ${index === activeIndex ? "current" : ""}`}><span>{phase.status === "done" ? "✓" : phase.status === "skipped" ? "—" : index + 1}</span><div><strong>{phase.label}</strong><small>{phase.status === "skipped" ? "Skipped" : phase.status === "done" ? "Finished" : `${phase.minutes} min`}</small></div></li>)}</ol>;
}

function LockInSummary({ phases, className }: { phases: StudyHour["phases"]; className: StudyHourClass }) {
  const finished = phases.filter((phase) => phase.status === "done").length;
  const skipped = phases.filter((phase) => phase.status === "skipped").length;
  return <div className="lock-summary"><strong>Close the {className} loop</strong><p>Say one idea you can now recognize, one trap you will avoid, and the first problem you’ll open tomorrow.</p><div><span>{finished} finished</span><span>{skipped} skipped</span><span>60-minute hour</span></div></div>;
}
