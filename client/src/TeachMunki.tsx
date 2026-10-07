import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";

type HomeDeck = ApiResponse<typeof api, "getHome">["decks"][number];
type TeachState = ApiResponse<typeof api, "getTeachState">;
type TeachReply = ApiResponse<typeof api, "teachMunki">;
type SpeechRecognitionEventLike = { results: ArrayLike<{ 0?: { transcript?: string } }> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
type Point = { x: number; y: number };
type Stroke = Point[];

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Munki couldn't save that class. Try again.";
}

function formatClassTime(value: string | null) {
  if (!value) return "Choose a time";
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hours, minutes));
}

function downloadCalendar(time: string) {
  const [hours = 17, minutes = 0] = time.split(":").map(Number);
  const start = new Date();
  start.setHours(hours, minutes, 0, 0);
  if (start.getTime() < Date.now()) start.setDate(start.getDate() + 1);
  const end = new Date(start.getTime() + 25 * 60_000);
  const stamp = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}00`;
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Munki//Teach Munki//EN", "BEGIN:VEVENT", `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, "RRULE:FREQ=DAILY", "SUMMARY:Teach Munki", "DESCRIPTION:Daily Feynman class — explain one topic to Munki.", "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:Munki class starts in 10 minutes", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "teach-munki-daily-class.ics";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useTeachState() {
  return useQuery({ queryKey: ["teach-munki", localDateKey()], queryFn: () => api.getTeachState({ today_key: localDateKey() }) });
}

function useSaveSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateTeachingSchedule,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["teach-munki"] }); },
  });
}

export function TeachingSettings() {
  const state = useTeachState();
  const save = useSaveSchedule();
  const [time, setTime] = useState("17:00");
  const [reminders, setReminders] = useState(true);
  useEffect(() => {
    if (!state.data) return;
    setTime(state.data.settings.class_time ?? "17:00");
    setReminders(state.data.settings.reminder_enabled);
  }, [state.data]);
  const commit = async (nextTime = time, nextReminders = reminders) => {
    if (nextReminders && "Notification" in window && Notification.permission === "default") await Notification.requestPermission().catch(() => "denied");
    save.mutate({ class_time: nextTime, reminder_enabled: nextReminders });
  };
  if (state.isPending) return <p className="settings-status">Loading class schedule…</p>;
  return <div className="teaching-settings-block">
    <div className="settings-section-title"><strong>Optional Teach Munki schedule</strong><small>Only if a routine helps</small></div>
    <label className="teach-time-setting"><span><strong>Class time</strong><small>{formatClassTime(time)} every day</small></span><input aria-label="Teach Munki class time" type="time" value={time} onChange={(event) => { setTime(event.target.value); void commit(event.target.value, reminders); }} /></label>
    <label><span><strong>Class reminder</strong><small>In-app and device reminder while Munki is open.</small></span><input type="checkbox" checked={reminders} onChange={(event) => { setReminders(event.target.checked); void commit(time, event.target.checked); }} /></label>
    <button className="calendar-download" disabled={!time} onClick={() => downloadCalendar(time)}>Add repeating class to calendar</button>
    {save.isPending && <p className="settings-status">Saving class time…</p>}
    {save.error && <p className="form-error">{messageOf(save.error)}</p>}
  </div>;
}

function MiniMunki({ mood = "ready" }: { mood?: "ready" | "thinking" | "curious" }) {
  return <span className={`teach-munki-art ${mood}`} aria-hidden="true"><svg viewBox="0 0 120 108">
    <path className="tm-tail" d="M89 68c24-2 25 23 9 25-10 1-13-7-8-12" />
    <ellipse className="tm-shadow" cx="59" cy="99" rx="31" ry="6" />
    <path className="tm-body" d="M29 58c0-26 13-43 31-43s32 17 32 43v21c0 14-13 22-32 22S29 93 29 79Z" />
    <circle className="tm-ear" cx="29" cy="53" r="12" /><circle className="tm-ear" cx="91" cy="53" r="12" />
    <ellipse className="tm-face" cx="60" cy="58" rx="23" ry="20" />
    <g className="tm-eyes"><circle cx="51" cy="51" r="3" /><circle cx="70" cy="51" r="3" /></g>
    <path className="tm-smile" d="M53 66q7 7 14 0" />
    <g className="tm-book"><path d="M31 78q14-7 29 3v19q-14-8-29-3Z"/><path d="M89 78q-14-7-29 3v19q14-8 29-3Z"/></g>
    <path className="tm-question" d="M98 19q0-9 8-9 8 0 8 7 0 5-6 7v5M108 36h.1" />
  </svg></span>;
}

function TeachingBoard({ onSnapshot }: { onSnapshot: (data: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef<Stroke[]>([]);
  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) {
      canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    }
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = "#fbfcfe"; ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#17212b"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    strokes.current.forEach((stroke) => { const first = stroke[0]; if (!first) return; ctx.beginPath(); ctx.moveTo(first.x * rect.width, first.y * rect.height); stroke.slice(1).forEach((point) => ctx.lineTo(point.x * rect.width, point.y * rect.height)); ctx.stroke(); });
    onSnapshot(strokes.current.length ? canvas.toDataURL("image/png").split(",")[1] ?? null : null);
  };
  useEffect(() => { redraw(); const resize = () => redraw(); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }; };
  return <div className="teaching-board">
    <div className="teaching-board-head"><span>Optional whiteboard</span><button onClick={() => { strokes.current = []; redraw(); }}>Clear</button></div>
    <canvas ref={canvasRef} aria-label="Draw an explanation for Munki" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; strokes.current.push([point(event)]); redraw(); }} onPointerMove={(event) => { if (!drawing.current) return; event.preventDefault(); const last = strokes.current[strokes.current.length - 1]; if (!last) return; last.push(point(event)); redraw(); }} onPointerUp={(event) => { if (!drawing.current) return; drawing.current = false; event.currentTarget.releasePointerCapture(event.pointerId); redraw(); }} onPointerCancel={() => { drawing.current = false; }} />
  </div>;
}

function formatRelative(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

export function TeachMunki({ decks, initialDeckId, initialTopic }: { decks: HomeDeck[]; initialDeckId?: number | null; initialTopic?: string }) {
  const queryClient = useQueryClient();
  const state = useTeachState();
  const [deckId, setDeckId] = useState<number | null>(initialDeckId ?? decks[0]?.id ?? null);
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [explanation, setExplanation] = useState("");
  const [boardImage, setBoardImage] = useState<string | null>(null);
  const [reply, setReply] = useState<TeachReply | null>(null);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const speechConstructor = typeof window !== "undefined" ? ((window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition) : undefined;
  useEffect(() => { if (deckId === null && decks[0]) setDeckId(decks[0].id); }, [deckId, decks]);
  useEffect(() => { if (initialDeckId) setDeckId(initialDeckId); if (initialTopic) setTopic(initialTopic); }, [initialDeckId, initialTopic]);
  useEffect(() => () => recognition.current?.stop(), []);
  useEffect(() => {
    const data = state.data;
    if (!data?.settings.class_time || !data.settings.reminder_enabled || data.class_completed_today || !("Notification" in window) || Notification.permission !== "granted") return;
    const [hours = 0, minutes = 0] = data.settings.class_time.split(":").map(Number);
    const at = new Date(); at.setHours(hours, minutes, 0, 0);
    const delay = at.getTime() - Date.now();
    if (delay <= 0 || delay > 86_400_000) return;
    const timer = window.setTimeout(() => new Notification("Teach Munki class", { body: "Bring one idea. Explaining it clearly is today's lesson." }), delay);
    return () => window.clearTimeout(timer);
  }, [state.data]);
  const teach = useMutation({
    mutationFn: () => api.teachMunki({ deck_id: deckId ?? 0, topic, explanation, date_key: localDateKey(), ...(boardImage ? { image_data_base64: boardImage, image_mime_type: "image/png" as const } : {}) }),
    onSuccess: async (result) => {
      setReply(result); setExplanation(""); setBoardImage(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["teach-munki"] }), queryClient.invalidateQueries({ queryKey: ["game"] })]);
    },
  });
  const beginVoice = () => {
    if (!speechConstructor) return;
    const engine = new speechConstructor(); recognition.current = engine; engine.continuous = true; engine.interimResults = false; engine.lang = "en-US";
    engine.onresult = (event) => { let next = ""; for (let i = 0; i < event.results.length; i += 1) next += `${event.results[i]?.[0]?.transcript ?? ""} `; if (next.trim()) setExplanation((value) => `${value}${value ? " " : ""}${next.trim()}`); };
    engine.onend = () => setListening(false); engine.onerror = () => setListening(false); engine.start(); setListening(true);
  };
  if (state.isPending) return <div className="center-state"><span className="loader" /><p>Munki is getting ready for class…</p></div>;
  if (state.error) return <div className="center-state"><p>Munki couldn't open the classroom.</p><button className="secondary-btn" onClick={() => state.refetch()}>Try again</button></div>;
  const data: TeachState = state.data;
  const due = !data.class_completed_today;
  return <section className="teach-page">
    <header className="teach-header">
      <div className="teach-title"><MiniMunki mood={teach.isPending ? "thinking" : reply ? "curious" : "ready"} /><div><p className="hero-label">Feynman class</p><h1>Teach Munki</h1><p>{teach.isPending ? "I'm thinking through what you taught me…" : reply ? "I have one question for you." : "Explain one idea simply enough that I can learn it."}</p></div></div>
      <div className="teach-stats"><span><strong>{data.streak}</strong> day streak</span><span className={due ? "due" : "done"}>{due ? data.settings.class_time ? `Class at ${formatClassTime(data.settings.class_time)}` : "Teach anytime" : "Class complete"}</span></div>
    </header>

    <div className="teach-layout">
      <div className="teach-workspace">
        <div className="teach-fields">
          <label><span>Class</span><select aria-label="Class to teach" value={deckId ?? ""} onChange={(event) => setDeckId(Number(event.target.value))}><option value="" disabled>Choose a class</option>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.title}</option>)}</select></label>
          <label><span>Topic</span><input aria-label="Topic to teach Munki" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. trig substitution" /></label>
        </div>
        {data.topics.length > 0 && <div className="topic-picks" aria-label="Continue a topic">{data.topics.slice(0, 6).map((item) => <button key={item.id} onClick={() => { setDeckId(item.deck_id); setTopic(item.topic); }}>{item.topic}</button>)}</div>}
        <label className="teach-explanation"><span>Teach it in your own words</span><textarea aria-label="Your explanation to Munki" value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder={reply?.question ?? "What is it, why does it work, and when would I use it?"} /></label>
        <div className="teach-input-actions"><button className={`voice-btn ${listening ? "active" : ""}`} disabled={!speechConstructor} onClick={() => { if (listening) { recognition.current?.stop(); setListening(false); } else beginVoice(); }}>{listening ? "Stop listening" : speechConstructor ? "Explain by voice" : "Voice unavailable"}</button><span>{explanation.length} / 8,000</span></div>
        <TeachingBoard onSnapshot={setBoardImage} />
        <button className="teach-submit" disabled={teach.isPending || deckId === null || topic.trim().length < 2 || explanation.trim().length < 20} onClick={() => teach.mutate()}>{teach.isPending ? "Munki is learning…" : reply ? "Answer Munki · keep teaching" : "Teach this lesson"}</button>
        {teach.error && <p className="form-error">{messageOf(teach.error)}</p>}
      </div>

      <aside className="teach-side">
        {reply ? <article className="munki-reply" aria-live="polite"><div className="reply-head"><MiniMunki mood="curious" /><span><strong>Munki learned</strong><small>+{reply.xp_earned} XP · {reply.combo} combo</small></span></div><p>{reply.student_reply}</p><blockquote>{reply.question}</blockquote><dl><div><dt>I understand</dt><dd>{reply.understood}</dd></div>{reply.knowledge_gap && <div><dt>Still fuzzy</dt><dd>{reply.knowledge_gap}</dd></div>}</dl></article> : <article className="teach-primer"><h2>Your class loop</h2><ol><li>Choose one small idea.</li><li>Explain it without hiding behind jargon.</li><li>Answer Munki's one follow-up.</li></ol><p>Your clearest explanations build retained knowledge and keep the teaching combo moving.</p></article>}
        <section className="knowledge-map"><div className="knowledge-head"><h2>Munki's knowledge</h2><span>retained</span></div>{data.topics.length ? data.topics.map((item) => <article key={item.id}><div><strong>{item.topic}</strong><span>{Math.round(item.mastery / 10)}%</span></div><div className="knowledge-bar" aria-label={`${item.topic} retained mastery ${Math.round(item.mastery / 10)} percent`}><i style={{ width: `${item.mastery / 10}%` }} /></div><small>{item.deck_title} · {item.total_sessions} {item.total_sessions === 1 ? "class" : "classes"}{item.decay_points > 0 ? ` · ${Math.round(item.decay_points / 10)} points faded` : ""}</small></article>) : <p className="knowledge-empty">Teach the first topic to start Munki's knowledge map.</p>}</section>
        {data.recent_sessions.length > 0 && <section className="teach-history"><h2>Recent classes</h2>{data.recent_sessions.slice(0, 3).map((session) => <button key={session.id} onClick={() => setTopic(session.topic)}><span><strong>{session.topic}</strong><small>{formatRelative(session.created_at)}</small></span><em>+{session.xp_earned} XP</em></button>)}</section>}
      </aside>
    </div>
  </section>;
}
