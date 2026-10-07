import { fileToBase64 } from "@hatch/space-sdk/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { api, type ApiResponse } from "./api";
import { MathText } from "./math";

type HomeDeck = ApiResponse<typeof api, "getHome">["decks"][number];
type Lab = ApiResponse<typeof api, "getStudyLab">;
type Board = Lab["boards"][number];
type Annotation = Board["annotations"][number];
type Practice = ApiResponse<typeof api, "generatePractice">;
type CoachResult = ApiResponse<typeof api, "coachStudyBoard">;
type CoachRequest = Parameters<typeof api.coachStudyBoard>[0];
type CoachDisplay = { nudge: string; question: string };
type LabTab = "board" | "practice" | "focus" | "files";
export type LabHandoff = { deckId: number; tab: "board" | "practice" | "focus"; prompt?: string; nonce: string };
type Point = { x: number; y: number };
type Stroke = { color: string; width: number; mode: "pen" | "eraser"; points: Point[] };
type BoardSaveState = { revision: number; acknowledgedRevision: number; chain: Promise<void> };
const boardSaveStates = new Map<number, BoardSaveState>();
function saveStateFor(boardId: number, initialRevision: number) {
  const existing = boardSaveStates.get(boardId);
  if (existing) return existing;
  const created: BoardSaveState = { revision: initialRevision, acknowledgedRevision: initialRevision, chain: Promise.resolve() };
  boardSaveStates.set(boardId, created);
  return created;
}

function messageOf(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Try again."; }
function parseStrokes(value: string): Stroke[] { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed as Stroke[] : []; } catch { return []; } }
function formatBytes(value: number) { return value < 1_048_576 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1_048_576).toFixed(1)} MB`; }
function formatClock(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function localDateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function parseTutorReply(value: string): CoachDisplay | null {
  if (!value.trim()) return null;
  const nudge = value.match(/(?:^|\n)Nudge:\s*([^\n]+)/i)?.[1]
    ?? value.match(/(?:^|\n)Readback:\s*([^\n]+)/i)?.[1]
    ?? value.split("\n")[0]
    ?? value;
  const question = value.match(/(?:^|\n)Next(?: step)?:\s*([^\n]*\?)/i)?.[1]
    ?? value.match(/(?:^|\n)Next:\s*([^\n]*\?)/i)?.[1]
    ?? value.match(/([^\n?]+\?)\s*$/)?.[1]
    ?? "What should you try next?";
  return { nudge, question };
}

function LabIcon({ name }: { name: "board" | "quiz" | "focus" | "files" | "spark" | "undo" | "trash" }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "board") return <svg {...common}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="m7 15 3-4 3 2 4-5"/></svg>;
  if (name === "quiz") return <svg {...common}><path d="M8 4h11v16H5V7z"/><path d="M8 4v3H5M9 11h6M9 15h4"/></svg>;
  if (name === "focus") return <svg {...common}><circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5v8l4 2"/></svg>;
  if (name === "files") return <svg {...common}><path d="M4 4h6l2 3h8v13H4z"/></svg>;
  if (name === "spark") return <svg {...common}><path d="m12 2 1.5 5.2L19 9l-5.5 1.8L12 16l-1.5-5.2L5 9l5.5-1.8z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/></svg>;
  if (name === "undo") return <svg {...common}><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>;
  return <svg {...common}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>;
}

export function StudyLab({ decks, onCreateDeck, handoff, onWatch }: { decks: HomeDeck[]; onCreateDeck: () => void; handoff?: LabHandoff | null; onWatch: (videoId: string) => void }) {
  const storedDeck = (() => { try { const value = Number(window.localStorage.getItem("munki-lab-deck")); return Number.isInteger(value) && value > 0 ? value : null; } catch { return null; } })();
  const storedTab = (() => { try { const value = window.localStorage.getItem("munki-lab-tab"); return value === "board" || value === "practice" || value === "focus" || value === "files" ? value : "board"; } catch { return "board" as LabTab; } })();
  const [deckId, setDeckId] = useState<number | null>(handoff?.deckId ?? storedDeck ?? decks[0]?.id ?? null);
  const [tab, setTab] = useState<LabTab>(handoff?.tab ?? storedTab);
  const [launch, setLaunch] = useState<{ tab: "board" | "practice"; prompt: string; nonce: string } | null>(handoff?.prompt && handoff.tab !== "focus" ? { tab: handoff.tab, prompt: handoff.prompt, nonce: handoff.nonce } : null);
  const handledHandoff = useRef<string | null>(handoff?.nonce ?? null);
  useEffect(() => {
    if (handoff && handledHandoff.current !== handoff.nonce) {
      handledHandoff.current = handoff.nonce;
      setDeckId(handoff.deckId);
      setTab(handoff.tab);
      setLaunch(handoff.prompt && handoff.tab !== "focus" ? { tab: handoff.tab, prompt: handoff.prompt, nonce: handoff.nonce } : null);
    }
  }, [handoff]);
  useEffect(() => {
    if (deckId !== null && !decks.some((deck) => deck.id === deckId)) setDeckId(decks[0]?.id ?? null);
  }, [deckId, decks]);
  useEffect(() => { try { if (deckId !== null) window.localStorage.setItem("munki-lab-deck", String(deckId)); } catch { /* Keep the selection for this visit. */ } }, [deckId]);
  useEffect(() => { try { window.localStorage.setItem("munki-lab-tab", tab); } catch { /* Keep the selection for this visit. */ } }, [tab]);
  if (!decks.length || deckId === null) return <section className="lab-empty"><p className="hero-label">Study lab</p><h1>Give your work a home.</h1><p>Create a deck first. Munki uses it as the shared class space for flashcards, whiteboards, practice, materials, and focus sessions.</p><button className="primary-btn" onClick={onCreateDeck}>Create a deck</button></section>;
  const takeToBoard = (prompt: string) => { const next = { tab: "board" as const, prompt, nonce: crypto.randomUUID() }; setLaunch(next); setTab("board"); };
  return <section className="study-lab">
    <header className="lab-header">
      <div><p className="hero-label">Study lab</p><h1>{decks.find((deck) => deck.id === deckId)?.title ?? "Choose a class"}</h1></div>
      <label className="lab-deck-picker"><span>Class</span><select aria-label="Choose study class" value={deckId} onChange={(event) => { setDeckId(Number(event.target.value)); setLaunch(null); }}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.title}</option>)}</select></label>
    </header>
    <nav className="lab-tabs" aria-label="Study lab tools">{(["board", "practice", "focus", "files"] as LabTab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}><LabIcon name={item === "practice" ? "quiz" : item} /><span>{item === "board" ? "Board + tutor" : item === "files" ? "Materials" : item[0]?.toUpperCase() + item.slice(1)}</span></button>)}</nav>
    <div className="lab-body">
      {tab === "board" && <BoardTool deckId={deckId} launchPrompt={launch?.tab === "board" ? launch : null} />}
      {tab === "practice" && <PracticeTool deckId={deckId} launchPrompt={launch?.tab === "practice" ? launch : null} onTakeToBoard={takeToBoard} onWatch={onWatch} />}
      {tab === "focus" && <FocusTool deckId={deckId} />}
      {tab === "files" && <FilesTool deckId={deckId} />}
    </div>
  </section>;
}

function useLab(deckId: number) {
  return useQuery({ queryKey: ["study-lab", deckId], queryFn: () => api.getStudyLab({ deck_id: deckId }) });
}

function BoardTool({ deckId, launchPrompt }: { deckId: number; launchPrompt: { prompt: string; nonce: string } | null }) {
  const qc = useQueryClient();
  const handledLaunch = useRef<string | null>(null);
  const lab = useLab(deckId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  useEffect(() => { const first = lab.data?.boards[0]?.id ?? null; if (!lab.isFetching && !lab.data?.boards.some((board) => board.id === selectedId)) setSelectedId(first); }, [lab.data?.boards, lab.isFetching, selectedId]);
  const create = useMutation({ mutationFn: api.createStudyBoard, onSuccess: async (result) => { setTitle(""); await qc.invalidateQueries({ queryKey: ["study-lab", deckId] }); setSelectedId(result.id); } });
  useEffect(() => {
    if (!launchPrompt || handledLaunch.current === launchPrompt.nonce) return;
    handledLaunch.current = launchPrompt.nonce;
    const compact = launchPrompt.prompt.replace(/\s+/g, " ").trim();
    create.mutate({ deck_id: deckId, title: compact.length > 42 ? `${compact.slice(0, 39)}…` : compact || "Repair board", prompt_text: launchPrompt.prompt });
  }, [launchPrompt?.nonce, deckId]);
  const remove = useMutation({ mutationFn: api.deleteStudyBoard, onSuccess: async () => { setSelectedId(null); await qc.invalidateQueries({ queryKey: ["study-lab", deckId] }); } });
  if (lab.isPending) return <LabLoading label="Opening your workspace…" />;
  if (lab.error) return <LabError error={lab.error} />;
  const board = lab.data.boards.find((item) => item.id === selectedId) ?? lab.data.boards[0] ?? null;
  return <div className="board-tool">
    <div className="lab-section-head"><div><h2>Think on the page.</h2><p>The tutor reads the board you actually made, then marks the exact spot to revisit.</p></div><form onSubmit={(event) => { event.preventDefault(); if (title.trim()) create.mutate({ deck_id: deckId, title, prompt_text: "" }); }}><label className="sr-only" htmlFor="new-board-title">Board title</label><input id="new-board-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New board name" /><button className="secondary-btn" disabled={!title.trim() || create.isPending}>New board</button></form></div>
    {lab.data.boards.length > 0 && <div className="board-tabs" role="tablist" aria-label="Whiteboards">{lab.data.boards.map((item) => <button role="tab" aria-selected={item.id === board?.id} className={item.id === board?.id ? "active" : ""} key={item.id} onClick={() => setSelectedId(item.id)}>{item.title}</button>)}</div>}
    {board ? <SmartBoard key={board.id} board={board} deckTitle={lab.data.deck.title} onDelete={() => remove.mutate({ board_id: board.id })} onRefresh={() => qc.invalidateQueries({ queryKey: ["study-lab", deckId] })} /> : <div className="lab-start"><div className="empty-lines" /><h3>Start with the problem in front of you.</h3><p>Name a board, write your work, then ask for one precise nudge.</p></div>}
  </div>;
}

function SmartBoard({ board, deckTitle, onDelete, onRefresh }: { board: Board; deckTitle: string; onDelete: () => void; onRefresh: () => Promise<unknown> }) {
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const activePointer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const requestToken = useRef(0);
  const lastCoachRequest = useRef<CoachRequest | null>(null);
  const activeCoachRequest = useRef<CoachRequest | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() => parseStrokes(board.strokes_json));
  const strokesRef = useRef(strokes);
  const [annotations, setAnnotations] = useState<Annotation[]>(board.annotations);
  const annotationsRef = useRef(annotations);
  const [reply, setReply] = useState<CoachDisplay | null>(() => parseTutorReply(board.tutor_reply));
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"pen" | "eraser">("pen");
  const [fingerDraws, setFingerDraws] = useState(false);
  const [color, setColor] = useState("#17212b");
  const [width, setWidth] = useState(4);
  const [hintLevel, setHintLevel] = useState(1);
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachError, setCoachError] = useState("");
  const saveState = saveStateFor(board.id, board.ink_revision);
  const [saved, setSaved] = useState(saveState.acknowledgedRevision === saveState.revision);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const setAllStrokes = (next: Stroke[]) => { strokesRef.current = next; setStrokes(next); };
  const setAllAnnotations = (next: Annotation[]) => { annotationsRef.current = next; setAnnotations(next); };
  const redraw = () => {
    drawBoardBackground(backgroundCanvasRef.current);
    drawBoardInk(canvasRef.current, strokesRef.current, annotationsRef.current);
  };
  useEffect(() => { redraw(); }, [strokes, annotations]);
  useEffect(() => { const resize = () => redraw(); resize(); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  useEffect(() => {
    const localIsClean = saveTimer.current === null && !drawing.current && saveState.acknowledgedRevision === saveState.revision;
    if (!localIsClean || board.ink_revision < saveState.acknowledgedRevision) return;
    saveState.revision = board.ink_revision;
    saveState.acknowledgedRevision = board.ink_revision;
    setAllStrokes(parseStrokes(board.strokes_json));
    setAllAnnotations(board.annotations);
    setReply(parseTutorReply(board.tutor_reply));
    setSaved(true);
  }, [board.strokes_json, board.annotations, board.tutor_reply, board.ink_revision, saveState]);
  const queueSave = (next: Stroke[], revision: number) => {
    const snapshot = JSON.stringify(next);
    const operation = saveState.chain.catch(() => undefined).then(async () => {
      const result = await api.saveStudyBoard({ board_id: board.id, strokes_json: snapshot, ink_revision: revision });
      if (result.stale) {
        saveState.revision = result.ink_revision;
        saveState.acknowledgedRevision = result.ink_revision;
        setAllStrokes(parseStrokes(result.strokes_json));
        setSaved(true);
        setCoachError("This board changed in another window, so Munki loaded the latest ink.");
        await onRefresh();
        return;
      }
      saveState.acknowledgedRevision = Math.max(saveState.acknowledgedRevision, result.ink_revision);
      if (saveState.revision === revision) setSaved(true);
    });
    saveState.chain = operation.catch(() => undefined);
    return operation;
  };
  const revise = () => {
    const active = activeCoachRequest.current;
    if (active) {
      requestToken.current += 1;
      activeCoachRequest.current = null;
      setCoachBusy(false);
      setCoachError("Ink changed while Munki was reading. Capture the new board when you are ready.");
      void api.cancelStudyBoardCoach({ board_id: active.board_id, request_id: active.request_id, captured_revision: active.captured_revision }).catch(() => undefined);
    }
    saveState.revision += 1; setSaved(false); return saveState.revision;
  };
  const persist = (next: Stroke[], revision: number) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void queueSave(next, revision).catch(() => setSaved(false));
    }, 360);
  };
  const persistTutorMarks = async (next: Annotation[]) => {
    setAllAnnotations(next);
    try { await api.saveStudyBoardAnnotations({ board_id: board.id, annotations: next }); await onRefresh(); }
    catch (error) { setCoachError(messageOf(error)); }
  };
  const clearTutorMarks = () => persistTutorMarks([]);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>): Point => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }; };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const allowed = event.pointerType === "pen" || event.pointerType === "mouse" || (event.pointerType === "touch" && fingerDraws);
    if (!allowed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    drawing.current = true;
    revise();
    const next = [...strokesRef.current, { color, width, mode, points: [point(event)] }];
    setAllStrokes(next);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || activePointer.current !== event.pointerId) return;
    event.preventDefault();
    const next = [...strokesRef.current]; const last = next[next.length - 1]; if (!last) return;
    const updated = { ...last, points: [...last.points, point(event)] };
    next[next.length - 1] = updated; setAllStrokes(next);
    if (updated.mode === "eraser" && annotationsRef.current.length) {
      const remaining = annotationsRef.current.filter((mark) => !eraserRemovesAnnotatedInk(mark, updated, strokesRef.current));
      if (remaining.length !== annotationsRef.current.length) setAllAnnotations(remaining);
    }
  };
  const end = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || activePointer.current !== event.pointerId) return;
    drawing.current = false; activePointer.current = null;
    const completed = strokesRef.current[strokesRef.current.length - 1];
    if (completed?.mode === "eraser") void persistTutorMarks(annotationsRef.current);
    persist(strokesRef.current, saveState.revision);
  };
  const undo = () => {
    const removed = strokesRef.current[strokesRef.current.length - 1];
    const next = strokesRef.current.slice(0, -1); const revision = revise(); setAllStrokes(next);
    if (removed?.mode === "pen" && annotationsRef.current.length) {
      const remaining = annotationsRef.current.filter((mark) => !annotationTouchesStroke(mark, removed));
      if (remaining.length !== annotationsRef.current.length) void persistTutorMarks(remaining);
    }
    persist(next, revision);
  };
  const clear = () => { const revision = revise(); setAllStrokes([]); if (annotationsRef.current.length) void clearTutorMarks(); persist([], revision); };
  const applyCoachResult = async (result: CoachResult, payload: CoachRequest) => {
    if (payload.captured_revision !== saveState.revision) {
      setCoachError("The ink changed while Munki was reading it. Capture the updated board again.");
      return;
    }
    if (result.board_changed) {
      setCoachError("The ink changed while Munki was reading it. The saved capture is ready to retry.");
      return;
    }
    setReply({ nudge: result.reply, question: result.question });
    setAllAnnotations(result.annotations);
    saveState.acknowledgedRevision = Math.max(saveState.acknowledgedRevision, payload.captured_revision);
    setSaved(true);
    setHintLevel(Math.min(3, payload.hint_level + 1));
    setQuestion("");
    await onRefresh();
  };
  const runCoach = async (payload: CoachRequest) => {
    const token = ++requestToken.current;
    lastCoachRequest.current = payload;
    activeCoachRequest.current = payload;
    setCoachBusy(true); setCoachError("");
    let timeoutId = 0;
    try {
      const result = await Promise.race([
        api.coachStudyBoard(payload),
        new Promise<never>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error("Munki took longer than 45 seconds. Your captured board is ready to retry.")), 45_000); }),
      ]);
      if (token !== requestToken.current) return;
      await applyCoachResult(result, payload);
    } catch (error) {
      void api.cancelStudyBoardCoach({ board_id: payload.board_id, request_id: payload.request_id, captured_revision: payload.captured_revision }).catch(() => undefined);
      if (token === requestToken.current) setCoachError(messageOf(error));
    } finally {
      window.clearTimeout(timeoutId);
      if (token === requestToken.current) {
        activeCoachRequest.current = null;
        setCoachBusy(false);
      }
    }
  };
  const captureAndCoach = async (ask: string) => {
    if (!strokesRef.current.length || coachBusy) return;
    if (saveTimer.current !== null) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    try {
      const dataBase64 = captureBoard(backgroundCanvasRef.current, canvasRef.current, strokesRef.current, annotationsRef.current);
      if (!dataBase64) throw new Error("Munki could not capture the board.");
      const priorReply = reply ? `Nudge: ${reply.nudge}\nNext: ${reply.question}` : board.tutor_reply;
      const payload: CoachRequest = {
        board_id: board.id,
        request_id: crypto.randomUUID(),
        image_data_base64: dataBase64,
        image_mime_type: "image/jpeg",
        strokes_json: JSON.stringify(strokesRef.current),
        question: ask,
        prior_tutor_reply: priorReply,
        hint_level: hintLevel,
        captured_revision: saveState.revision,
      };
      await runCoach(payload);
    } catch (error) { setCoachError(messageOf(error)); }
  };
  const retryCoach = () => { const payload = lastCoachRequest.current; if (payload && !coachBusy) void runCoach({ ...payload, request_id: crypto.randomUUID() }); };
  const cancelCoach = () => {
    const payload = activeCoachRequest.current;
    requestToken.current += 1; activeCoachRequest.current = null; setCoachBusy(false); setCoachError("Stopped. Your captured board is ready to retry.");
    if (payload) void api.cancelStudyBoardCoach({ board_id: payload.board_id, request_id: payload.request_id, captured_revision: payload.captured_revision }).catch(() => undefined);
  };
  const askTutor = (ask: string) => { void captureAndCoach(ask.trim()); };
  return <div className="smart-board-grid">
    <section className="canvas-shell">
      {board.prompt_text && <div className="board-problem"><span>Problem loaded</span><MathText text={board.prompt_text} /></div>}
      <div className="canvas-toolbar">
        <div className="tool-toggle" aria-label="Drawing tool"><button className={mode === "pen" ? "active" : ""} onClick={() => setMode("pen")}>Pen</button><button className={mode === "eraser" ? "active" : ""} onClick={() => setMode("eraser")}>Eraser</button></div>
        <label>Ink <input aria-label="Pen color" type="color" value={color} onChange={(event) => { setColor(event.target.value); setMode("pen"); }} /></label>
        <label>Width <input aria-label="Pen width" type="range" min="2" max="16" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
        <label className="finger-toggle"><input type="checkbox" checked={fingerDraws} onChange={(event) => setFingerDraws(event.target.checked)} /> Finger draws</label>
        <div className="canvas-actions"><button aria-label="Undo last stroke" disabled={!strokes.length} onClick={undo}><LabIcon name="undo" /></button><button aria-label="Clear board" disabled={!strokes.length} onClick={clear}><LabIcon name="trash" /></button></div>
      </div>
      <div className="canvas-meta"><span>{saved ? "Saved" : "Saving…"}</span><span>{annotations.length ? `${annotations.length} tutor marks` : `${strokes.length} strokes`}</span></div>
      <div className="canvas-stack">
        <canvas ref={backgroundCanvasRef} className="lab-canvas lab-canvas-background" aria-hidden="true" />
        <canvas ref={canvasRef} className={`lab-canvas lab-canvas-ink ${fingerDraws ? "finger-draws" : ""}`} aria-label={`${board.title} whiteboard for ${deckTitle}`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      </div>
      <div className="canvas-delete">{deleteArmed ? <><span>Delete this board?</span><button className="danger-btn" onClick={onDelete}>Delete</button><button className="text-btn" onClick={() => setDeleteArmed(false)}>Keep</button></> : <button className="danger-link" onClick={() => setDeleteArmed(true)}>Delete board</button>}</div>
    </section>
    <aside className="board-coach">
      <div className="coach-heading"><span><LabIcon name="spark" /></span><div><strong>Board-aware tutor</strong><small>Hint {hintLevel} of 3 · remembers the prior board</small></div></div>
      <div className={`coach-response ${coachBusy ? "thinking" : ""}`} aria-live="polite">{coachBusy ? <><i /><p>Captured. Checking the first questionable line…</p><button type="button" className="coach-cancel" onClick={cancelCoach}>Cancel</button></> : reply ? <div className="coach-blocks"><section><strong>Nudge</strong><p>{reply.nudge}</p></section><section><strong>Your move</strong><p className="coach-question">{reply.question}</p></section></div> : <><p>Write first. Munki will read your work, offer one hint, then ask you to reason through the next move.</p></>}</div>
      {coachError && <div className="coach-error" role="alert"><p>{coachError}</p>{lastCoachRequest.current && <button type="button" onClick={retryCoach} disabled={coachBusy}>Retry saved capture</button>}</div>}
      <div className="coach-prompts" aria-label="Quick tutor prompts">
        {[["Check setup", "Check my setup. Point to the first issue."],["First mistake", "Find my first mistake and mark it."],["Next hint", "Give me the next hint at the current level."]].map(([label, prompt]) => <button key={label} type="button" disabled={!strokes.length || coachBusy} onClick={() => askTutor(prompt ?? "")}>{label}</button>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); askTutor(question); }}><label htmlFor="board-question">Ask about this board</label><textarea id="board-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What am I missing here?" rows={2} /><button className="primary-btn full" disabled={!strokes.length || coachBusy}><LabIcon name="spark" />{coachBusy ? "Looking…" : `Read & coach · hint ${hintLevel}`}</button></form>
      <div className="coach-footnote"><span>Tutor marks stay while you write. Erasing ink, undoing, or clearing the board removes them.</span>{annotations.length > 0 && <button type="button" onClick={() => void clearTutorMarks()}>Clear tutor marks</button>}</div>
    </aside>
  </div>;
}
function WorkedWalkthrough({ question, onClose }: { question: Practice["questions"][number]; onClose: () => void }) {
  const [playing, setPlaying] = useState(true);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scene = question.worked_video.scenes[sceneIndex];
  const sceneSeconds = scene?.seconds ?? 1;
  useEffect(() => {
    if (!playing || !scene) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => {
        if (value + 1 < sceneSeconds) return value + 1;
        if (sceneIndex < question.worked_video.scenes.length - 1) { setSceneIndex((index) => index + 1); return 0; }
        setPlaying(false); return sceneSeconds;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, sceneIndex, sceneSeconds, scene, question.worked_video.scenes.length]);
  const totalBefore = question.worked_video.scenes.slice(0, sceneIndex).reduce((sum, item) => sum + item.seconds, 0);
  const progress = Math.min(100, ((totalBefore + elapsed) / Math.max(1, question.worked_video.duration_seconds)) * 100);
  const restart = () => { setSceneIndex(0); setElapsed(0); setPlaying(true); };
  return <div className="walkthrough-wrap" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title">
    <button className="walkthrough-backdrop" aria-label="Close worked video" onClick={onClose} />
    <section className="walkthrough-player">
      <header><div><span>Worked video · {question.worked_video.duration_seconds}s</span><h3 id="walkthrough-title">{question.worked_video.title}</h3></div><button aria-label="Close worked video" onClick={onClose}>Close</button></header>
      <div className="walkthrough-stage" aria-live="polite">
        <span className="walkthrough-step">Step {sceneIndex + 1} of {question.worked_video.scenes.length}</span>
        <h4>{scene?.heading ?? "Solution"}</h4>
        <div className="walkthrough-math"><MathText text={scene?.visual ?? question.final_answer} /></div>
        <p>{scene?.narration ?? ""}</p>
      </div>
      <div className="walkthrough-progress"><i style={{ width: `${progress}%` }} /></div>
      <div className="walkthrough-controls">
        <button className="secondary-btn" disabled={sceneIndex === 0} onClick={() => { setSceneIndex((value) => Math.max(0, value - 1)); setElapsed(0); setPlaying(false); }}>Previous</button>
        <button className="primary-btn" onClick={() => sceneIndex === question.worked_video.scenes.length - 1 && !playing ? restart() : setPlaying((value) => !value)}>{sceneIndex === question.worked_video.scenes.length - 1 && !playing ? "Replay" : playing ? "Pause" : "Play"}</button>
        <button className="secondary-btn" disabled={sceneIndex === question.worked_video.scenes.length - 1} onClick={() => { setSceneIndex((value) => Math.min(question.worked_video.scenes.length - 1, value + 1)); setElapsed(0); setPlaying(false); }}>Next</button>
      </div>
    </section>
  </div>;
}

function PracticeTool({ deckId, launchPrompt, onTakeToBoard, onWatch }: { deckId: number; launchPrompt: { prompt: string; nonce: string } | null; onTakeToBoard: (prompt: string) => void; onWatch: (videoId: string) => void }) {
  const qc = useQueryClient();
  const lab = useLab(deckId);
  const options = useQuery({ queryKey: ["practice-options", deckId], queryFn: () => api.getPracticeGeneratorOptions({ deck_id: deckId }) });
  const [mode, setMode] = useState<"exam" | "topic">("topic");
  const [topic, setTopic] = useState(launchPrompt?.prompt ?? "");
  const [examSourceId, setExamSourceId] = useState("");
  const [practice, setPractice] = useState<Practice | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  const [reward, setReward] = useState<{ xp: number; bonus: number } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [videoQuestionId, setVideoQuestionId] = useState<string | null>(null);
  const attemptUuid = useRef(crypto.randomUUID());
  const handledLaunch = useRef<string | null>(null);
  const generate = useMutation({ mutationFn: api.generatePractice, onSuccess: (result) => { setPractice(result); setIndex(0); setAnswers({}); setFinished(false); setReward(null); setSaveError(""); setSolutionOpen(false); setVideoQuestionId(null); attemptUuid.current = crypto.randomUUID(); } });
  useEffect(() => {
    if (!launchPrompt || handledLaunch.current === launchPrompt.nonce) return;
    handledLaunch.current = launchPrompt.nonce;
    setMode("topic"); setTopic(launchPrompt.prompt);
    generate.mutate({ deck_id: deckId, mode: "topic", exam_source_id: null, topic: launchPrompt.prompt, count: 5 });
  }, [launchPrompt?.nonce, deckId]);
  useEffect(() => { setExamSourceId(options.data?.exam_sources[0]?.id ?? ""); }, [deckId, options.data?.exam_sources]);
  const question = practice?.questions[index];
  const videoQuestion = practice?.questions.find((item) => item.id === videoQuestionId) ?? null;
  const score = practice ? practice.questions.filter((item) => answers[item.id] === item.correct_index).length : 0;
  const answerCurrent = (choice: number) => { if (!question || answers[question.id] !== undefined) return; setAnswers((current) => ({ ...current, [question.id]: choice })); setSolutionOpen(false); };
  const finish = async () => {
    if (!practice || finished) return;
    setFinished(true);
    setSaveError("");
    try {
      const result = await api.savePracticeAttempt({ attempt_uuid: attemptUuid.current, deck_id: deckId, topic: practice.source_label, score, max_score: practice.questions.length, date_key: localDateKey() });
      setReward({ xp: result.xp_earned, bonus: result.quest_bonus_xp });
      await Promise.all([qc.invalidateQueries({ queryKey: ["study-lab", deckId] }), qc.invalidateQueries({ queryKey: ["game"] })]);
    } catch (error) {
      setFinished(false);
      setSaveError(messageOf(error));
    }
  };
  const runGenerate = () => generate.mutate({ deck_id: deckId, mode, exam_source_id: mode === "exam" ? examSourceId : null, topic: mode === "topic" ? topic : "", count: 5 });
  return <div className="practice-tool">
    {videoQuestion && <WorkedWalkthrough question={videoQuestion} onClose={() => setVideoQuestionId(null)} />}
    <div className="lab-section-head"><div><h2>Build the whole practice package.</h2><p>Fresh problems, complete solutions, a worked walkthrough for every problem, and the right follow-up resources arrive together.</p></div></div>
    {!practice ? <section className="practice-launch package-launch">
      <div className="practice-mode" aria-label="Practice source mode">
        <button className={mode === "exam" ? "active" : ""} aria-pressed={mode === "exam"} onClick={() => setMode("exam")}><strong>Released exam</strong><span>Match an older exam’s difficulty</span></button>
        <button className={mode === "topic" ? "active" : ""} aria-pressed={mode === "topic"} onClick={() => setMode("topic")}><strong>Unit or topic</strong><span>Target one lesson or concept</span></button>
      </div>
      {mode === "exam" ? <div className="practice-source-field"><label htmlFor="practice-exam">Older released exam</label>{options.isPending ? <div className="source-loading">Checking eligible sources…</div> : options.data?.exam_sources.length ? <select id="practice-exam" value={examSourceId} onChange={(event) => setExamSourceId(event.target.value)}>{options.data.exam_sources.map((source) => <option key={source.id} value={source.id}>{source.label} · {source.card_count} source cards</option>)}</select> : <div className="sealed-empty"><strong>No older exam source is ready yet.</strong><span>Add dated released-exam source cards first. The newest two releases are sealed and cannot appear here.</span></div>}<div className="sealed-note"><span aria-hidden="true">◆</span><p><strong>{options.data?.sealed_source_count ?? 0} newest release{options.data?.sealed_source_count === 1 ? "" : "s"} sealed</strong><small>Unavailable to practice, generation, videos, and the question bank. They only open in final mock evaluation.</small></p></div></div> : <div className="practice-source-field"><label htmlFor="practice-topic">Lesson, unit, or topic</label>{options.data?.topics.length ? <div className="topic-picks">{options.data.topics.slice(0, 6).map((item) => <button key={item} className={topic === item ? "active" : ""} onClick={() => setTopic(item)}>{item}</button>)}</div> : null}<input id="practice-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. partial fractions or Lesson 16" /></div>}
      <div className="package-preview"><span><i>1</i> Problems</span><span><i>2</i> Solutions</span><span><i>3</i> Worked videos</span><span><i>4</i> Resources</span></div>
      <button className="primary-btn full generate-package" onClick={runGenerate} disabled={generate.isPending || (mode === "exam" ? !examSourceId : !topic.trim())}>{generate.isPending ? "Building problems, solutions, videos…" : "Generate complete quiz"}</button>
      {generate.isPending && <div className="generation-status" role="status"><span className="loader" /><div><strong>Keeping the principle. Changing the surface.</strong><small>Building fresh numbers, full reasoning, and a walkthrough for each problem.</small></div></div>}
      {generate.error && <p className="form-error">{messageOf(generate.error)}</p>}
      {lab.data?.attempts.length ? <div className="attempt-strip"><span>Recent</span>{lab.data.attempts.slice(0, 3).map((attempt) => <b key={attempt.id}>{attempt.score}/{attempt.max_score}</b>)}</div> : null}
    </section> : finished ? <section className="practice-finish"><div className="complete-mark">✓</div><p className="hero-label">Practice saved</p><h3>{score}/{practice.questions.length}</h3>{reward && <div className="lab-reward">+{reward.xp + reward.bonus} XP{reward.bonus ? ` · ${reward.bonus} quest bonus` : ""}</div>}<p>{score === practice.questions.length ? "Clean sweep. Switch the topic while retrieval is warm." : "Your misses are the map. Replay their walkthroughs or take one to the board."}</p><button className="primary-btn" onClick={() => setPractice(null)}>Build another set</button></section> : question ? <section className="practice-player package-player">
      <div className="practice-top"><span>{practice.title}</span><b>{index + 1} / {practice.questions.length}</b></div><div className="practice-source-label">{practice.mode === "exam" ? "Older exam style" : "Topic"} · {practice.source_label}</div><div className="practice-progress"><i style={{ width: `${((index + 1) / practice.questions.length) * 100}%` }} /></div>
      <h3><MathText text={question.prompt} /></h3>
      <div className="practice-choices">{question.choices.map((choice, choiceIndex) => { const selected = answers[question.id] === choiceIndex; const answered = answers[question.id] !== undefined; const correct = choiceIndex === question.correct_index; return <button key={`${choiceIndex}-${choice}`} className={`${selected ? "selected" : ""} ${answered && correct ? "correct" : ""} ${answered && selected && !correct ? "wrong" : ""}`} disabled={answered} onClick={() => answerCurrent(choiceIndex)}><span>{String.fromCharCode(65 + choiceIndex)}</span><MathText text={choice} /></button>; })}</div>
      {answers[question.id] !== undefined && <div className="practice-package-results"><div className="practice-explain"><strong>{answers[question.id] === question.correct_index ? "Got it." : "Repair it now."}</strong><p><MathText text={question.explanation} /></p></div><div className="package-actions"><button onClick={() => setSolutionOpen((value) => !value)} aria-expanded={solutionOpen}>Full solution</button><button className="video-action" onClick={() => setVideoQuestionId(question.id)}><span aria-hidden="true">▶</span> Play worked video · {question.worked_video.duration_seconds}s</button>{answers[question.id] !== question.correct_index && <button onClick={() => onTakeToBoard(question.prompt)}><LabIcon name="board" /> Take to board</button>}</div>{solutionOpen && <div className="solution-steps">{question.solution_steps.map((step, stepIndex) => <section key={`${stepIndex}-${step.title}`}><span>{stepIndex + 1}</span><div><strong>{step.title}</strong><MathText text={step.detail} /></div></section>)}<footer><span>Answer</span><MathText text={question.final_answer} /></footer></div>}{(question.resource_cards.length > 0 || question.lesson_video_ids.length > 0) && <div className="practice-resources"><strong>Keep going</strong>{question.resource_cards.map((card) => <details key={card.id}><summary>Drill card · <MathText text={card.front} /></summary><MathText text={card.back} /></details>)}{question.lesson_video_ids.map((videoId) => <button key={videoId} onClick={() => onWatch(videoId)}>Open related explainer</button>)}</div>}</div>}
      {saveError && <p className="form-error" role="alert">Couldn’t save this attempt: {saveError}</p>}
      <div className="practice-nav"><button className="secondary-btn" disabled={index === 0} onClick={() => { setIndex((value) => value - 1); setSolutionOpen(false); }}>Back</button>{index < practice.questions.length - 1 ? <button className="primary-btn" disabled={answers[question.id] === undefined} onClick={() => { setIndex((value) => value + 1); setSolutionOpen(false); }}>Next</button> : <button className="primary-btn" disabled={answers[question.id] === undefined} onClick={() => void finish()}>Finish · {score}/{practice.questions.length}</button>}</div>
    </section> : null}
  </div>;
}

function FocusTool({ deckId }: { deckId: number }) {
  const qc = useQueryClient();
  const lab = useLab(deckId);
  const activeFocus = useQuery({ queryKey: ["active-focus"], queryFn: () => api.getActiveFocusSession({}), refetchInterval: 15_000 });
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [intention, setIntention] = useState("");
  const [reflection, setReflection] = useState("");
  const [reward, setReward] = useState<{ xp: number; bonus: number } | null>(null);
  const active = activeFocus.data?.session ?? null;
  const startedAt = active ? new Date(active.started_at).getTime() : null;
  const activeMinutes = active?.duration_minutes ?? minutes;
  useEffect(() => { if (!active || startedAt === null) { setRemaining(minutes * 60); return; } const tick = () => setRemaining(Math.max(0, active.duration_minutes * 60 - Math.floor((Date.now() - startedAt) / 1000))); tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }, [active?.id, active?.duration_minutes, minutes, startedAt]);
  const start = useMutation({ mutationFn: api.startStudySession, onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["study-lab", deckId] }), qc.invalidateQueries({ queryKey: ["active-focus"] })]); } });
  const end = useMutation({ mutationFn: api.endStudySession, onSuccess: async (result) => { setReflection(""); setReward({ xp: result.xp_earned, bonus: result.quest_bonus_xp }); await Promise.all([qc.invalidateQueries({ queryKey: ["study-lab", deckId] }), qc.invalidateQueries({ queryKey: ["game"] }), qc.invalidateQueries({ queryKey: ["active-focus"] })]); } });
  return <div className="focus-tool"><div className="lab-section-head"><div><h2>One target. One visible finish.</h2><p>A bounded sprint turns “study” into a task your brain can start.</p></div></div>{reward && !active && <div className="lab-reward" role="status">+{reward.xp + reward.bonus} XP earned{reward.bonus ? ` · ${reward.bonus} quest bonus` : ""}</div>}{active ? <section className="focus-active">{active.deck_id !== deckId && <p className="focus-cross-deck" role="status">Your active sprint is in <strong>{active.deck_title}</strong>. Finish it here before starting another.</p>}<div className={`focus-dial ${remaining === 0 ? "done" : ""}`} style={{ "--progress": `${360 * (1 - remaining / (activeMinutes * 60))}deg` } as CSSProperties}><div><span>{remaining === 0 ? "Done" : "Focus"}</span><strong>{formatClock(remaining)}</strong><small>{active.intention || "Stay with the next step."}</small></div></div><label htmlFor="focus-reflection">Close the loop in one line</label><textarea id="focus-reflection" value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What clicked, or where should you resume?" /><button className="primary-btn" disabled={end.isPending} onClick={() => end.mutate({ session_id: active.id, reflection, date_key: localDateKey() })}>{end.isPending ? "Saving…" : remaining === 0 ? "Save & finish" : "End session"}</button>{end.error && <p className="form-error" role="alert">{messageOf(end.error)}</p>}</section> : <section className="focus-setup"><div className="duration-row" aria-label="Focus duration">{[15,25,45].map((value) => <button key={value} className={minutes === value ? "active" : ""} onClick={() => { setMinutes(value); setRemaining(value * 60); }}><strong>{value}</strong><span>min</span></button>)}</div><label htmlFor="focus-intention">When the timer ends, what will be different?</label><textarea id="focus-intention" value={intention} onChange={(event) => setIntention(event.target.value)} placeholder="e.g. I can set up three shell-method integrals without notes." /><button className="primary-btn full" disabled={start.isPending || activeFocus.isPending} onClick={() => start.mutate({ deck_id: deckId, intention, duration_minutes: minutes })}>{start.isPending ? "Starting…" : "Start focused session"}</button>{start.error && <p className="form-error" role="alert">{messageOf(start.error)}</p>}{lab.data?.sessions.filter((session) => session.ended_at).length ? <div className="session-history"><span>Recent finishes</span>{lab.data.sessions.filter((session) => session.ended_at).slice(0, 4).map((session) => <article key={session.id}><b>{Math.max(1, Math.round((new Date(session.ended_at ?? session.started_at).getTime() - new Date(session.started_at).getTime()) / 60000))} min</b><p>{session.reflection || session.intention || "Session completed"}</p></article>)}</div> : null}</section>}</div>;
}

function FilesTool({ deckId }: { deckId: number }) {
  const qc = useQueryClient();
  const lab = useLab(deckId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const upload = async (event: ChangeEvent<HTMLInputElement>) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (!files.length) return; setUploading(true); setError(""); try { for (const file of files) { if (file.size > 25_000_000) throw new Error(`${file.name} is larger than 25 MB.`); const encoded = await fileToBase64(file); await api.uploadStudyFile({ deck_id: deckId, name: file.name, mime_type: encoded.mimeType || file.type || "application/octet-stream", size_bytes: file.size, data_base64: encoded.dataBase64 }); } await qc.invalidateQueries({ queryKey: ["study-lab", deckId] }); } catch (cause) { setError(messageOf(cause)); } finally { setUploading(false); } };
  const open = async (id: number) => { const result = await api.getStudyFileUrl({ file_id: id }); const anchor = document.createElement("a"); anchor.href = result.url; anchor.target = "_blank"; anchor.rel = "noreferrer"; anchor.click(); };
  const remove = async (id: number) => { await api.deleteStudyFile({ file_id: id }); await qc.invalidateQueries({ queryKey: ["study-lab", deckId] }); };
  return <div className="files-tool"><div className="lab-section-head"><div><h2>Keep the source beside the work.</h2><p>Slides, notes, PDFs, and images stay attached to this class.</p></div><label className={`file-upload ${uploading ? "disabled" : ""}`}>{uploading ? "Adding…" : "Add materials"}<input aria-label="Upload study materials" type="file" multiple disabled={uploading} onChange={(event) => void upload(event)} /></label></div>{error && <p className="form-error">{error}</p>}{lab.isPending ? <LabLoading label="Loading materials…" /> : lab.data?.files.length ? <div className="materials-list">{lab.data.files.map((file) => <article key={file.id}><div className="file-glyph">{file.name.split(".").pop()?.slice(0,4).toUpperCase() || "FILE"}</div><div><strong>{file.name}</strong><span>{formatBytes(file.size_bytes)}</span></div><button onClick={() => void open(file.id)}>Open</button><button className="danger-link" onClick={() => void remove(file.id)}>Delete</button></article>)}</div> : <div className="lab-start compact"><LabIcon name="files" /><h3>No materials here yet.</h3><p>Add the files you actually work from so each class stays self-contained.</p></div>}</div>;
}

function LabLoading({ label }: { label: string }) { return <div className="lab-loading"><span className="loader" /><p>{label}</p></div>; }
function LabError({ error }: { error: unknown }) { return <div className="lab-start"><h3>Couldn’t open the study lab.</h3><p>{messageOf(error)}</p></div>; }

function annotationTouchesStroke(mark: Annotation, stroke: Stroke) {
  if (!stroke.points.length) return false;
  const nearSegment = (point: Point, a: Point, b: Point, tolerance: number) => {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) <= tolerance;
  };
  const pointsToCheck: Point[] = mark.kind === "circle"
    ? [{ x: mark.x, y: mark.y }]
    : mark.kind === "arrow"
      ? [{ x: mark.x, y: mark.y }, { x: mark.x2 ?? mark.x, y: mark.y2 ?? mark.y }]
      : [{ x: mark.x, y: mark.y }];
  const tolerance = mark.kind === "circle" ? Math.max(.035, Math.abs((mark.x2 ?? mark.x + .08) - mark.x), Math.abs((mark.y2 ?? mark.y + .06) - mark.y)) : mark.kind === "label" ? .065 : .04;
  for (const target of pointsToCheck) {
    if (stroke.points.some((point) => Math.hypot(point.x - target.x, point.y - target.y) <= tolerance)) return true;
    for (let index = 1; index < stroke.points.length; index += 1) {
      const before = stroke.points[index - 1]; const after = stroke.points[index];
      if (before && after && nearSegment(target, before, after, tolerance)) return true;
    }
  }
  return false;
}

function strokesIntersect(first: Stroke, second: Stroke) {
  const tolerance = Math.max(.012, (first.width + second.width) / 900);
  const distanceToSegment = (point: Point, a: Point, b: Point) => {
    const dx = b.x - a.x; const dy = b.y - a.y; const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
  };
  for (const point of first.points) {
    for (let index = 1; index < second.points.length; index += 1) {
      const before = second.points[index - 1]; const after = second.points[index];
      if (before && after && distanceToSegment(point, before, after) <= tolerance) return true;
    }
  }
  for (const point of second.points) {
    for (let index = 1; index < first.points.length; index += 1) {
      const before = first.points[index - 1]; const after = first.points[index];
      if (before && after && distanceToSegment(point, before, after) <= tolerance) return true;
    }
  }
  return false;
}

function eraserRemovesAnnotatedInk(mark: Annotation, eraser: Stroke, strokes: Stroke[]) {
  return strokes.some((stroke) => stroke.mode === "pen" && annotationTouchesStroke(mark, stroke) && strokesIntersect(stroke, eraser));
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio)); const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, rect, ratio };
}

function drawBoardBackground(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const prepared = prepareCanvas(canvas); if (!prepared) return;
  const { ctx, rect } = prepared;
  ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.strokeStyle = "#e8edf3"; ctx.lineWidth = 1; const grid = 24;
  for (let x = grid; x < rect.width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); }
  for (let y = grid; y < rect.height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); }
}

function drawBoardInk(canvas: HTMLCanvasElement | null, strokes: Stroke[], annotations: Annotation[]) {
  if (!canvas) return;
  const prepared = prepareCanvas(canvas); if (!prepared) return;
  const { ctx, rect } = prepared;
  for (const stroke of strokes) { const first = stroke.points[0]; if (!first) continue; ctx.globalCompositeOperation = stroke.mode === "eraser" ? "destination-out" : "source-over"; ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(first.x * rect.width, first.y * rect.height); for (const point of stroke.points.slice(1)) ctx.lineTo(point.x * rect.width, point.y * rect.height); if (stroke.points.length === 1) ctx.lineTo(first.x * rect.width + .1, first.y * rect.height + .1); ctx.stroke(); }
  ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = "#e7523d"; ctx.fillStyle = "#e7523d"; ctx.lineWidth = 3; ctx.font = "700 13px Avenir Next, system-ui";
  for (const mark of annotations) { const x = mark.x * rect.width; const y = mark.y * rect.height; const x2 = (mark.x2 ?? Math.min(.95, mark.x + .12)) * rect.width; const y2 = (mark.y2 ?? Math.min(.95, mark.y + .08)) * rect.height; if (mark.kind === "circle") { ctx.beginPath(); ctx.ellipse(x, y, Math.max(24, Math.abs(x2 - x)), Math.max(18, Math.abs(y2 - y)), 0, 0, Math.PI * 2); ctx.stroke(); } else if (mark.kind === "arrow") { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); const angle = Math.atan2(y2 - y, x2 - x); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 11 * Math.cos(angle - .45), y2 - 11 * Math.sin(angle - .45)); ctx.lineTo(x2 - 11 * Math.cos(angle + .45), y2 - 11 * Math.sin(angle + .45)); ctx.closePath(); ctx.fill(); } else { const text = mark.text ?? "Check here"; const measured = ctx.measureText(text).width; ctx.fillStyle = "rgba(255,250,244,.94)"; ctx.fillRect(x - 5, y - 17, measured + 10, 23); ctx.fillStyle = "#e7523d"; ctx.fillText(text, x, y); } }
}

function captureBoard(background: HTMLCanvasElement | null, ink: HTMLCanvasElement | null, strokes: Stroke[], annotations: Annotation[]) {
  if (!background || !ink) return "";
  drawBoardBackground(background);
  drawBoardInk(ink, strokes, []);
  const longest = Math.max(background.width, background.height);
  const scale = Math.min(1, 1100 / Math.max(1, longest));
  const capture = document.createElement("canvas");
  capture.width = Math.max(1, Math.round(background.width * scale));
  capture.height = Math.max(1, Math.round(background.height * scale));
  const ctx = capture.getContext("2d"); if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, capture.width, capture.height);
  ctx.drawImage(background, 0, 0, capture.width, capture.height);
  ctx.drawImage(ink, 0, 0, capture.width, capture.height);
  const data = capture.toDataURL("image/jpeg", .78).split(",")[1] ?? "";
  drawBoardInk(ink, strokes, annotations);
  return data;
}
