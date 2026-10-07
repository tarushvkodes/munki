import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fileToBase64, SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";
import { MathText } from "./math";
import { playSound, setSoundPreferences } from "./sound";
import { StudyLab, type LabHandoff } from "./StudyLab";
import { TeachMunki, TeachingSettings } from "./TeachMunki";
import { ActiveStudyHourDock, DailyStudyHour, DailyStudyHourCard, type StudyHourTarget } from "./DailyStudyHour";
import { lessonVideos, type LessonVideo } from "./video-registry";
import { useManagedPlayback, usePlaybackScope } from "./playback";
import { Lessons } from "./Lessons";
import "katex/dist/katex.min.css";

type HomeDeck = ApiResponse<typeof api, "getHome">["decks"][number];
type DeckCard = ApiResponse<typeof api, "getDeck">["cards"][number];
type StudyCard = ApiResponse<typeof api, "getStudySession">["cards"][number];
type FeedCard = ApiResponse<typeof api, "getFeed">["cards"][number];
type CramCard = ApiResponse<typeof api, "getCramQueue">["cards"][number];
type Rating = "again" | "hard" | "good" | "easy";
type View = { name: "feed" } | { name: "watch"; videoId?: string; className?: string; topic?: string } | { name: "lessons" } | { name: "decks" } | { name: "lab" } | { name: "teach"; deckId?: number | null; topic?: string } | { name: "hour" } | { name: "deck"; deckId: number } | { name: "study"; deckId: number | null } | { name: "cram" } | { name: "blitz" } | { name: "recap" } | { name: "settings" };

type GradeResult = ApiResponse<typeof api, "gradeCard">;
type MascotState = ApiResponse<typeof api, "getMascotState">;
type EditableDeck = Pick<HomeDeck, "id" | "title" | "description" | "color" | "exam_date">;

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yesterdayDateKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

function dateKeyOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function recentDateKeys(count = 30) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - index);
    return dateKey(date);
  });
}

function stableFeedSeed(key: string) {
  let hash = 2166136261;
  for (const character of key) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

const initialFeedDate = dateKey();
const feedNavigationState: { dateKey: string; seed: number; deckId: number | null; scrollTop: number } = {
  dateKey: initialFeedDate,
  seed: stableFeedSeed(initialFeedDate),
  deckId: null,
  scrollTop: 0,
};

const COLORS = ["#2457D6", "#E7523D", "#16866A", "#CC8B18", "#7A4BC2", "#2F7892"];

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function Icon({ name }: { name: "home" | "watch" | "lesson" | "stack" | "lab" | "teach" | "plus" | "back" | "edit" | "cards" | "image" | "bolt" | "trophy" | "settings" | "refresh" | "flame" }) {
  const common = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "home") return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>;
  if (name === "watch") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/></svg>;
  if (name === "lesson") return <svg {...common}><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22Z"/></svg>;
  if (name === "stack" || name === "cards") return <svg {...common}><rect x="5" y="4" width="14" height="14" rx="2"/><path d="M8 8h8M8 12h5"/><path d="M3 8v11a2 2 0 0 0 2 2h10"/></svg>;
  if (name === "lab") return <svg {...common}><path d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8A3 3 0 0 0 19 17l-5-9V3"/><path d="M7.5 15h9"/></svg>;
  if (name === "teach") return <svg {...common}><path d="M4 5.5 12 3l8 2.5-8 2.6Z"/><path d="M7 7.2v4.4c0 1.5 2.2 2.7 5 2.7s5-1.2 5-2.7V7.2M20 6v6"/><path d="M5 20c1.5-2.8 4-4.2 7-4.2s5.5 1.4 7 4.2"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "back") return <svg {...common}><path d="m15 18-6-6 6-6"/></svg>;
  if (name === "image") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></svg>;
  if (name === "bolt") return <svg {...common}><path d="m13 2-9 12h7l-1 8 9-12h-7z"/></svg>;
  if (name === "trophy") return <svg {...common}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
  if (name === "refresh") return <svg {...common}><path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9m2 6.5A7 7 0 0 0 18 18l2-3"/></svg>;
  if (name === "flame") return <svg {...common}><path d="M12 22c4.4 0 7-3.2 7-7.2 0-3.2-1.7-6.5-5.2-9.6.1 2.3-.8 4-2.4 5.1.1-3.6-1.7-6.1-3.7-8.3.1 4.1-2.7 6.4-2.7 10.8C5 17.9 7.9 22 12 22Z"/><path d="M9.6 17c.1 1.8 1.1 3 2.5 3 1.7 0 2.8-1.4 2.8-3.2 0-1.3-.6-2.6-1.8-3.8-.2 1-.8 1.8-1.6 2.3-.1-1.1-.6-2.1-1.3-3-.1 2-1 3.1-.6 4.7Z"/></svg>;
  return <svg {...common}><path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16Z"/><path d="m14.5 6.5 3 3"/></svg>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-state">
      <div className="empty-stack" aria-hidden="true"><span /><span /><span /></div>
      <h2>Start with one thing<br />you want to remember.</h2>
      <p>Make a deck, add a few cards, then let Munki decide when they come back.</p>
      <button className="primary-btn" onClick={onCreate}><Icon name="plus" /> Create your first deck</button>
    </section>
  );
}

function DeckForm({ deck, onClose, onSaved }: { deck?: EditableDeck; onClose: () => void; onSaved: (id: number) => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(deck?.title ?? "");
  const [description, setDescription] = useState(deck?.description ?? "");
  const [examDate, setExamDate] = useState(deck?.exam_date ?? "");
  const [color, setColor] = useState(deck?.color ?? COLORS[0] ?? "#2457D6");
  const create = useMutation({ mutationFn: api.createDeck, onSuccess: async (result) => { await queryClient.invalidateQueries(); onSaved(result.id); } });
  const update = useMutation({ mutationFn: api.updateDeck, onSuccess: async () => { await queryClient.invalidateQueries(); onSaved(deck?.id ?? 0); } });
  const saving = create.isPending || update.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    if (deck) update.mutate({ id: deck.id, title, description, color, exam_date: examDate || null });
    else create.mutate({ title, description, color, exam_date: examDate || null });
  };
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="deck-form-title">
      <button className="sheet-backdrop" aria-label="Close deck form" onClick={onClose} />
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-handle" />
        <div className="sheet-title-row"><h2 id="deck-form-title">{deck ? "Edit deck" : "New deck"}</h2><button type="button" className="text-btn" onClick={onClose}>Cancel</button></div>
        <label htmlFor="deck-title">Deck name</label>
        <input id="deck-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CNIT 182 — Exam II" maxLength={80} />
        <label htmlFor="deck-description">What’s in it? <span>Optional</span></label>
        <textarea id="deck-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Key terms, processes, and diagrams" maxLength={240} rows={3} />
        <label htmlFor="deck-exam-date">Exam date <span>Optional — makes this deck surface sooner</span></label>
        <input id="deck-exam-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        <fieldset><legend>Color</legend><div className="color-row">{COLORS.map((choice) => <button type="button" key={choice} aria-label={`Choose ${choice} deck color`} aria-pressed={color === choice} className="color-choice" style={{ background: choice }} onClick={() => setColor(choice)} />)}</div></fieldset>
        <button className="primary-btn full" disabled={saving || !title.trim()}>{saving ? "Saving…" : deck ? "Save changes" : "Create deck"}</button>
        {(create.error || update.error) && <p className="form-error">Couldn’t save this deck. Try again.</p>}
      </form>
    </div>
  );
}

type ImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const IMAGE_TYPES: ImageMime[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

async function encodeImage(file: File) {
  const encoded = await fileToBase64(file);
  const mime = encoded.mimeType || file.type;
  if (!IMAGE_TYPES.includes(mime as ImageMime)) throw new Error("Choose a JPEG, PNG, GIF, or WebP image.");
  return { name: file.name, mime_type: mime as ImageMime, size_bytes: file.size, data_base64: encoded.dataBase64 };
}

function ImageAttachmentField({ side, existingUrl, file, removed, onFile, onRemove, onError }: {
  side: "front" | "back";
  existingUrl: string | null;
  file: File | null;
  removed: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}) {
  const objectUrl = useObjectUrl(file);
  const preview = objectUrl ?? (removed ? null : existingUrl);
  const title = side === "front" ? "Front image" : "Back image";
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    if (next.size > 12_000_000) { onError("Images must be 12 MB or smaller."); return; }
    if (!IMAGE_TYPES.includes(next.type as ImageMime)) { onError("Choose a JPEG, PNG, GIF, or WebP image."); return; }
    onFile(next);
  };
  return (
    <div className="image-attachment">
      <div className="image-attachment-label"><span>{title}</span><small>Optional</small></div>
      {preview ? <div className="image-preview"><img src={preview} alt={`${title} preview`} /><div><strong>{file?.name ?? "Attached image"}</strong><span>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "Saved on this card"}</span><button type="button" className="text-btn" onClick={onRemove}>Remove</button></div></div> : <label className="image-picker"><Icon name="image" /><span><strong>Attach image</strong><small>JPEG, PNG, GIF, or WebP · up to 12 MB</small></span><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={choose} aria-label={`Attach ${side} image`} /></label>}
    </div>
  );
}

function CardForm({ deckId, card, onClose }: { deckId: number; card?: DeckCard; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const [tags, setTags] = useState(card?.tags ?? "");
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [removeFrontImage, setRemoveFrontImage] = useState(false);
  const [removeBackImage, setRemoveBackImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = async () => { await queryClient.invalidateQueries(); onClose(); };
  const create = useMutation({ mutationFn: api.createCards, onSuccess: refresh });
  const update = useMutation({ mutationFn: api.updateCard, onSuccess: refresh });
  const remove = useMutation({ mutationFn: api.deleteCard, onSuccess: refresh });
  const saving = preparing || create.isPending || update.isPending || remove.isPending;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!front.trim() || !back.trim()) return;
    setImageError("");
    setPreparing(true);
    try {
      const frontUpload = frontImage ? await encodeImage(frontImage) : undefined;
      const backUpload = backImage ? await encodeImage(backImage) : undefined;
      if (card) update.mutate({ id: card.id, front, back, tags, front_image: frontUpload, back_image: backUpload, remove_front_image: removeFrontImage, remove_back_image: removeBackImage });
      else create.mutate({ deck_id: deckId, cards: [{ front, back, tags, front_image: frontUpload, back_image: backUpload }] });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "That image could not be attached.");
    } finally {
      setPreparing(false);
    }
  };
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="card-form-title">
      <button className="sheet-backdrop" aria-label="Close card form" onClick={onClose} />
      <form className="sheet tall" onSubmit={submit}>
        <div className="sheet-handle" />
        <div className="sheet-title-row"><h2 id="card-form-title">{card ? "Edit card" : "New card"}</h2><button type="button" className="text-btn" onClick={onClose}>Cancel</button></div>
        <label htmlFor="card-front">Front</label>
        <textarea id="card-front" autoFocus value={front} onChange={(e) => setFront(e.target.value)} placeholder="Question, term, or prompt" rows={4} />
        <ImageAttachmentField side="front" existingUrl={card?.front_image_url ?? null} file={frontImage} removed={removeFrontImage} onFile={(file) => { setImageError(""); setFrontImage(file); setRemoveFrontImage(false); }} onRemove={() => { setFrontImage(null); setRemoveFrontImage(true); }} onError={setImageError} />
        <label htmlFor="card-back">Back</label>
        <textarea id="card-back" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Answer in your own words" rows={5} />
        <ImageAttachmentField side="back" existingUrl={card?.back_image_url ?? null} file={backImage} removed={removeBackImage} onFile={(file) => { setImageError(""); setBackImage(file); setRemoveBackImage(false); }} onRemove={() => { setBackImage(null); setRemoveBackImage(true); }} onError={setImageError} />
        {imageError && <p className="form-error">{imageError}</p>}
        <label htmlFor="card-tags">Tags <span>Optional, comma-separated</span></label>
        <input id="card-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="chapter 4, definitions" />
        <button className="primary-btn full" disabled={saving || !front.trim() || !back.trim()}>{saving ? "Saving…" : card ? "Save card" : "Add card"}</button>
        {(create.error || update.error) && <p className="form-error">Couldn’t save this card. Try again.</p>}
        {card && (!confirmDelete ? <button type="button" className="danger-link" onClick={() => setConfirmDelete(true)}>Delete card</button> : <div className="confirm-row"><span>Delete it permanently?</span><button type="button" className="danger-btn" onClick={() => remove.mutate({ id: card.id })}>Yes, delete</button><button type="button" className="text-btn" onClick={() => setConfirmDelete(false)}>Keep it</button></div>)}
      </form>
    </div>
  );
}

function storedSoundVolume() {
  try {
    const saved = Number(window.localStorage.getItem("munki-sound-volume"));
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.34;
  } catch { return 0.34; }
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Zoomed card image" onClick={onClose}><img src={src} alt={alt} onClick={(event) => event.stopPropagation()} /><button aria-label="Close zoomed image" onClick={onClose}>Close</button></div>;
}

function CardFace({ side, text, image, tags, onZoom, onWatch }: { side: "front" | "back"; text: string; image: string | null; tags: string; onZoom: () => void; onWatch?: () => void }) {
  return <div className={`card-face ${side} ${image ? "has-image" : ""}`}>
    <span className="face-label">{side === "front" ? "Prompt" : "Answer"}</span>
    <span className="feed-card-content">
      {image && <button className="image-zoom-hit" aria-label={`Zoom ${side === "front" ? "prompt" : "answer"} image`} onClick={(event) => { event.stopPropagation(); onZoom(); }}><img className="study-image" src={image} alt={`${side === "front" ? "Prompt" : "Answer"} diagram`} /><small>Tap to zoom</small></button>}
      <span className={`prompt-text ${image ? "with-image" : ""}`}><MathText text={text} /></span>
      {side === "back" && onWatch && <button className="card-video-link" onClick={(event) => { event.stopPropagation(); onWatch(); }}><Icon name="watch" /> Watch worked example</button>}
    </span>
    {tags && <span className="study-tags">{tags}</span>}
    {side === "front" && <span className="reveal-hint">Tap to flip</span>}
  </div>;
}

function GameCard({ card, revealed, busy, exiting, onReveal, onGrade, onLess, onTakeToBoard, onDrill, onWatch }: { card: FeedCard; revealed: boolean; busy: boolean; exiting?: "left" | "right"; onReveal: () => void; onGrade: (knew: boolean) => void; onLess?: () => void; onTakeToBoard?: () => void; onDrill?: () => void; onWatch?: (videoId: string) => void }) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const [zoomedSide, setZoomedSide] = useState<"front" | "back" | null>(null);
  const [menu, setMenu] = useState(false);
  const zoomedImage = zoomedSide === "front" ? card.front_image_url : zoomedSide === "back" ? card.back_image_url : null;
  const clearLongPress = () => { if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current); longPressTimer.current = null; };
  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    longPressed.current = false;
    clearLongPress();
    if (onLess) longPressTimer.current = window.setTimeout(() => { longPressed.current = true; setMenu(true); }, 520);
  };
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    clearLongPress();
    const start = pointerStart.current; pointerStart.current = null;
    if (!start || !revealed || busy || zoomedSide || longPressed.current) return;
    const dx = event.clientX - start.x;
    const dy = Math.abs(event.clientY - start.y);
    if (Math.abs(dx) > 70 && Math.abs(dx) > dy) onGrade(dx > 0);
  };
  const revealFromKeyboard = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!revealed && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onReveal(); }
  };
  return (
    <article className={`feed-post ${card.critical ? "critical" : ""} ${exiting ? `exit-${exiting}` : ""}`}>
      {zoomedImage && <ImageLightbox src={zoomedImage} alt={`${zoomedSide === "back" ? "Answer" : "Prompt"} diagram`} onClose={() => setZoomedSide(null)} />}
      <div className="post-meta"><span className="deck-chip"><i style={{ background: card.deck_color }} />{card.deck_title}</span><span className="post-tools">{card.critical && <span className="critical-label"><Icon name="bolt" /> CRITICAL · 2× XP</span>}{onLess && <button className="more-card" aria-label="Card options" aria-expanded={menu} onClick={() => setMenu((value) => !value)}>···</button>}</span></div>
      {menu && <div className="card-menu" role="menu" aria-label="Card actions">{onTakeToBoard && <button role="menuitem" onClick={() => { setMenu(false); onTakeToBoard(); }}>Take to board</button>}{onDrill && <button role="menuitem" onClick={() => { setMenu(false); onDrill(); }}>Drill me</button>}{onLess && <button role="menuitem" onClick={() => { setMenu(false); onLess(); }}>Not helpful — show me less</button>}</div>}
      <div role="button" tabIndex={0} className={`feed-card ${revealed ? "is-flipped" : ""}`} style={{ "--deck-color": card.deck_color } as CSSProperties} onClick={() => { if (longPressed.current) { longPressed.current = false; return; } if (!revealed) onReveal(); }} onKeyDown={revealFromKeyboard} onPointerDown={pointerDown} onPointerMove={clearLongPress} onPointerUp={pointerUp} onPointerCancel={clearLongPress} aria-label={revealed ? "Answer shown. Swipe right for Knew it or left for Again" : "Reveal answer"}>
        <div className="card-rotor">
          <CardFace side="front" text={card.front} image={card.front_image_url} tags={card.tags} onZoom={() => setZoomedSide("front")} />
          <CardFace side="back" text={card.back} image={card.back_image_url} tags={card.tags} onZoom={() => setZoomedSide("back")} onWatch={card.worked_video_id && onWatch ? () => onWatch(card.worked_video_id ?? "") : undefined} />
        </div>
      </div>
      <div className={`feed-actions ${revealed ? "ready" : ""}`} aria-hidden={!revealed}>
        <button disabled={!revealed || busy} className="again-action" onClick={() => onGrade(false)}><span>Again</span><small>still cooking · {card.intervals.again}</small></button>
        <button disabled={!revealed || busy} className="knew-action" onClick={() => onGrade(true)}><span>Knew it</span><small>nice · {card.intervals.knew}</small></button>
      </div>
    </article>
  );
}

function ActiveFocusIndicator({ session, onOpen }: { session: NonNullable<ApiResponse<typeof api, "getActiveFocusSession">["session"]>; onOpen: () => void }) {
  const endAt = new Date(session.started_at).getTime() + session.duration_minutes * 60_000;
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
  useEffect(() => { const tick = () => setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000))); tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }, [endAt]);
  const clock = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  return <button className={`feed-focus-indicator ${remaining === 0 ? "done" : ""}`} onClick={onOpen} aria-label={`Open active focus session for ${session.deck_title}, ${clock} remaining`}><i style={{ background: session.deck_color }} /><span><b>{remaining === 0 ? "Focus finished" : "Focus running"}</b><small>{session.deck_title}{session.intention ? ` · ${session.intention}` : ""}</small></span><strong>{clock}</strong></button>;
}

function ComboMeter({ combo, multiplier }: { combo: number; multiplier: number }) {
  const next = combo < 5 ? 5 : combo < 10 ? 10 : combo < 20 ? 20 : 25;
  const base = combo < 5 ? 0 : combo < 10 ? 5 : combo < 20 ? 10 : 20;
  const progress = Math.min(100, ((combo - base) / (next - base)) * 100);
  return <div className={`combo-meter ${combo > 0 ? "live" : ""}`}><div><strong>{combo}</strong><span>combo</span></div><div className="combo-track"><span style={{ width: `${progress}%` }} /></div><b>×{multiplier}</b></div>;
}

function FeedView({ onHour, onDecks, onCram, onBlitz, onRecap, onSettings, onOpenFocus, onRepair, onWatch }: { onHour: () => void; onDecks: () => void; onCram: () => void; onBlitz: () => void; onRecap: () => void; onSettings: () => void; onOpenFocus: (deckId: number) => void; onRepair: (handoff: LabHandoff) => void; onWatch: (videoId: string) => void }) {
  type FeedItem = { instanceId: number; card: FeedCard; revealed: boolean; exiting?: "left" | "right" };
  const CHUNK_SIZE = 6;
  const queryClient = useQueryClient();
  if (feedNavigationState.dateKey !== dateKey()) {
    feedNavigationState.dateKey = dateKey();
    feedNavigationState.seed = stableFeedSeed(feedNavigationState.dateKey);
    feedNavigationState.deckId = null;
    feedNavigationState.scrollTop = 0;
  }
  const [seed, setSeed] = useState(feedNavigationState.seed);
  const [deckId, setDeckId] = useState<number | null>(feedNavigationState.deckId);
  const feed = useQuery({ queryKey: ["feed", seed, deckId], queryFn: () => api.getFeed({ now_ms: Date.now(), seed, deck_id: deckId, limit: 200 }) });
  const game = useQuery({ queryKey: ["game", dateKey()], queryFn: () => api.getGameState({ date_key: dateKey(), recent_date_keys: recentDateKeys() }) });
  const home = useQuery({ queryKey: ["feed-decks"], queryFn: () => api.getHome({ now_ms: Date.now(), today_start_ms: todayStart() }) });
  const activeFocus = useQuery({ queryKey: ["active-focus"], queryFn: () => api.getActiveFocusSession({}), refetchInterval: 15_000 });
  const [queue, setQueue] = useState<FeedItem[] | null>(null);
  const [lastGrade, setLastGrade] = useState<GradeResult | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [showQuests, setShowQuests] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pullStart = useRef<number | null>(null);
  const reservoir = useRef<FeedCard[]>([]);
  const nextInstanceId = useRef(1);
  const nextSeed = useRef(seed + 1);
  const loadingMore = useRef(false);
  const generation = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const feedScreen = useRef<HTMLElement | null>(null);
  const appendMoreRef = useRef<() => Promise<void>>(async () => undefined);
  const gradeUuids = useRef(new Map<number, string>());
  const dismissedCardIds = useRef(new Set<number>());

  useEffect(() => {
    try {
      const opens = Number(window.localStorage.getItem("munki-feed-opens") ?? "0");
      setShowHint(opens < 3);
      window.localStorage.setItem("munki-feed-opens", String(opens + 1));
    } catch { setShowHint(false); }
  }, []);

  const feedReady = queue !== null && !feed.isPending && !game.isPending;
  useEffect(() => {
    if (!feedReady) return;
    const scroller = feedScreen.current?.parentElement;
    if (!scroller) return;
    const restore = () => scroller.scrollTo({ top: feedNavigationState.scrollTop, behavior: "auto" });
    restore();
    const frame = window.requestAnimationFrame(restore);
    const remember = () => { feedNavigationState.scrollTop = scroller.scrollTop; };
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => { window.cancelAnimationFrame(frame); remember(); scroller.removeEventListener("scroll", remember); };
  }, [feedReady]);

  useEffect(() => {
    feedNavigationState.seed = seed;
    feedNavigationState.deckId = deckId;
  }, [seed, deckId]);

  useEffect(() => {
    if (!game.data) return;
    const volume = storedSoundVolume();
    setSoundPreferences(game.data.sound_enabled, volume);
    try {
      if (!window.localStorage.getItem("munki-sound-initialized-v2")) {
        window.localStorage.setItem("munki-sound-initialized-v2", "1");
        if (!game.data.sound_enabled) void api.updateGameSettings({ sound_enabled: true, daily_nudge_enabled: game.data.daily_nudge_enabled }).then(() => queryClient.invalidateQueries({ queryKey: ["game"] }));
        setSoundPreferences(true, volume);
      }
    } catch { /* Preferences can stay session-only when storage is unavailable. */ }
  }, [game.data, queryClient]);

  useEffect(() => {
    generation.current += 1;
    reservoir.current = [];
    nextSeed.current = seed + 1;
    loadingMore.current = false;
    dismissedCardIds.current.clear();
    setQueue(null);
  }, [seed, deckId]);

  useEffect(() => {
    if (!feed.data || queue !== null) return;
    const first = feed.data.cards.slice(0, CHUNK_SIZE).map((card) => ({ instanceId: nextInstanceId.current++, card, revealed: false }));
    reservoir.current = feed.data.cards.slice(CHUNK_SIZE);
    setQueue(first);
  }, [feed.data, queue]);

  appendMoreRef.current = async () => {
    if (loadingMore.current || queue === null) return;
    loadingMore.current = true;
    const requestGeneration = generation.current;
    let candidates = reservoir.current;
    reservoir.current = [];
    try {
      if (candidates.length < CHUNK_SIZE) {
        const fresh = await api.getFeed({ now_ms: Date.now(), seed: nextSeed.current++, deck_id: deckId, limit: 200 });
        candidates = [...candidates, ...fresh.cards];
      }
      if (requestGeneration !== generation.current) return;
      setQueue((current) => {
        if (!current) return current;
        const activeIds = new Set(current.map((item) => item.card.id));
        const next: FeedItem[] = [];
        const leftover: FeedCard[] = [];
        for (const candidate of candidates) {
          if (dismissedCardIds.current.has(candidate.id)) continue;
          if (next.length < CHUNK_SIZE && !activeIds.has(candidate.id)) {
            activeIds.add(candidate.id);
            next.push({ instanceId: nextInstanceId.current++, card: candidate, revealed: false });
          } else {
            leftover.push(candidate);
          }
        }
        reservoir.current = [...leftover, ...reservoir.current];
        return next.length ? [...current, ...next] : current;
      });
    } finally {
      if (requestGeneration === generation.current) loadingMore.current = false;
    }
  };

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !queue?.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void appendMoreRef.current();
    }, { rootMargin: "1200px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [queue?.length]);

  useEffect(() => {
    if (queue && queue.length < 3 && feed.data?.cards.length) void appendMoreRef.current();
  }, [queue, feed.data]);

  const grade = useMutation({
    mutationFn: ({ item, knew }: { item: FeedItem; knew: boolean }) => {
      let gradeUuid = gradeUuids.current.get(item.instanceId);
      if (!gradeUuid) { gradeUuid = crypto.randomUUID(); gradeUuids.current.set(item.instanceId, gradeUuid); }
      return api.gradeCard({ grade_uuid: gradeUuid, card_id: item.card.id, rating: knew ? "good" : "again", answered_at_ms: Date.now(), date_key: dateKey(), critical: item.card.critical, combo_safe: false });
    },
    onMutate: ({ item, knew }) => setQueue((current) => current?.map((candidate) => candidate.instanceId === item.instanceId ? { ...candidate, exiting: knew ? "right" : "left" } : candidate) ?? current),
    onError: (_error, vars) => setQueue((current) => current?.map((candidate) => candidate.instanceId === vars.item.instanceId ? { ...candidate, exiting: undefined } : candidate) ?? current),
    onSuccess: async (result, vars) => {
      gradeUuids.current.delete(vars.item.instanceId);
      dismissedCardIds.current.add(vars.item.card.id);
      setLastGrade(result);
      playSound(vars.knew ? "correct" : "wrong");
      if (result.combo > 0 && result.combo % 5 === 0) window.setTimeout(() => playSound("combo", true), 110);
      if (result.quest_bonus_xp > 0) window.setTimeout(() => playSound("quest", true), 210);
      if (result.level_up) { setCelebration(`Level ${result.level}!`); window.setTimeout(() => playSound("level", true), 110); }
      else if (result.perfect_day && !game.data?.perfect_today) { setCelebration("Perfect day!"); window.setTimeout(() => playSound("perfect", true), 110); }
      window.setTimeout(() => setQueue((current) => current ? current.filter((item) => item.instanceId !== vars.item.instanceId) : current), 270);
      await queryClient.invalidateQueries({ queryKey: ["game"] });
      window.setTimeout(() => setLastGrade(null), 900);
      if (result.level_up || (result.perfect_day && !game.data?.perfect_today)) window.setTimeout(() => setCelebration(null), 1800);
    },
  });
  const bury = useMutation({
    mutationFn: ({ item }: { item: FeedItem }) => api.buryCard({ id: item.card.id }),
    onSuccess: (_result, vars) => {
      dismissedCardIds.current.add(vars.item.card.id);
      setQueue((current) => current?.filter((item) => item.instanceId !== vars.item.instanceId) ?? current);
      setToast("Got it — fewer like this");
      window.setTimeout(() => setToast(null), 1800);
    },
  });
  const refresh = () => { feedNavigationState.scrollTop = 0; feedScreen.current?.parentElement?.scrollTo({ top: 0, behavior: "smooth" }); setSeed((current) => stableFeedSeed(`${dateKey()}:${current}:shuffle`)); };
  if (feed.isPending || queue === null || game.isPending) return <Loading />;
  if (feed.error || game.error) return <ErrorState />;
  if (!queue.length && feed.data.cards.length === 0) return <section className="feed-empty"><h1>Your feed is ready for cards.</h1><p>Create a deck or add cards, then they’ll flow here automatically.</p><button className="primary-btn" onClick={onDecks}>Open decks</button></section>;
  if (!queue.length) return <section className="feed-empty"><h1>Mix cleared.</h1><p>You finished every card in this pass. Shuffle for another mix or switch decks.</p><div className="feed-empty-actions"><button className="primary-btn" onClick={refresh}>Shuffle again</button><button className="secondary-btn" onClick={onDecks}>Open decks</button></div></section>;
  const hud = lastGrade ? { ...game.data, total_xp: lastGrade.total_xp, combo: lastGrade.combo, multiplier: lastGrade.multiplier, level: lastGrade.level } : game.data;
  return (
    <section ref={feedScreen} className="feed-screen" onTouchStart={(event) => { if ((feedScreen.current?.parentElement?.scrollTop ?? 0) <= 0) pullStart.current = event.touches[0]?.clientY ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientY; if (pullStart.current !== null && end !== undefined && end - pullStart.current > 80) refresh(); pullStart.current = null; }}>
      {celebration && <Confetti message={celebration} />}
      {lastGrade && <div className="xp-floater">+{lastGrade.xp_earned + lastGrade.quest_bonus_xp} XP{lastGrade.quest_bonus_xp ? " · Quest!" : ""}</div>}
      {toast && <div className="toast" role="status">{toast}</div>}
      <header className="feed-hud">
        <div className="level-block"><span>LVL {hud.level}</span><div><i style={{ width: `${(hud.level_xp / hud.next_level_xp) * 100}%` }} /></div><b>{hud.total_xp.toLocaleString()} XP</b></div>
        <div className="hud-actions"><span className="streak-pill" aria-label={`${hud.streak} day streak`}><Icon name="flame" />{hud.streak || 0}</span><button className="quest-button" aria-label="Daily quests" aria-expanded={showQuests} onClick={() => setShowQuests((value) => !value)}><Icon name="trophy" />{hud.quests.some((quest) => !quest.complete) && <i />}</button><button aria-label="Settings" onClick={onSettings}><Icon name="settings" /></button><Mascot view="feed" /></div>
      </header>
      {activeFocus.data?.session && <ActiveFocusIndicator session={activeFocus.data.session} onOpen={() => onOpenFocus(activeFocus.data.session?.deck_id ?? 0)} />}
      <DailyStudyHourCard onOpen={onHour} />
      <button className="cram-launch" onClick={onCram}><span><Icon name="bolt" /><span><strong>Cram Queue</strong><small>Weakest first · built for your exam</small></span></span><b aria-hidden="true">→</b></button>
      {hud.combo > 0 && <ComboMeter key={hud.combo} combo={hud.combo} multiplier={hud.multiplier} />}
      {showQuests && <div className="quest-popover"><div className="quest-strip">{hud.quests.map((quest) => <span key={quest.id} className={quest.complete ? "done" : ""}>{quest.complete ? "✓" : `${quest.progress}/${quest.target}`} {quest.title}</span>)}{hud.perfect_today && <strong>Perfect day</strong>}</div><button onClick={onRecap}>View weekly recap</button></div>}
      <div className="feed-controls"><label>Mix <select aria-label="Choose feed deck" value={deckId ?? "all"} onChange={(event) => { feedNavigationState.scrollTop = 0; setDeckId(event.target.value === "all" ? null : Number(event.target.value)); }}><option value="all">All classes</option>{home.data?.decks.map((deck) => <option value={deck.id} key={deck.id}>{deck.title}</option>)}</select></label><button className="blitz-pill" onClick={onBlitz}><Icon name="bolt" /> 60s Blitz</button><button className="refresh-btn" aria-label="Shuffle fresh mix" onClick={refresh}><Icon name="refresh" /></button></div>
      {showHint && <p className="swipe-hint">Swipe left for Again · right for Knew it · pull down to reshuffle</p>}
      <div className="feed-list">
        {queue.map((item) => <GameCard key={item.instanceId} card={item.card} revealed={item.revealed} busy={grade.isPending || bury.isPending} exiting={item.exiting} onReveal={() => { playSound("flip"); if (item.card.critical) window.setTimeout(() => playSound("critical", true), 100); setQueue((current) => current?.map((candidate) => candidate.instanceId === item.instanceId ? { ...candidate, revealed: true } : candidate) ?? current); }} onGrade={(knew) => grade.mutate({ item, knew })} onTakeToBoard={() => onRepair({ deckId: item.card.deck_id, tab: "board", prompt: item.card.front, nonce: crypto.randomUUID() })} onDrill={() => onRepair({ deckId: item.card.deck_id, tab: "practice", prompt: item.card.front, nonce: crypto.randomUUID() })} onWatch={onWatch} onLess={() => bury.mutate({ item })} />)}
      </div>
      {grade.error && <p className="form-error feed-error">That grade didn’t save. Try it again.</p>}
      <div ref={sentinel} className="feed-sentinel" aria-hidden="true"><span className="loader" /></div>
      <button className="feed-decks-link" onClick={onDecks}><Icon name="stack" /> Browse decks</button>
    </section>
  );
}

function Confetti({ message }: { message: string }) {
  return <div className="celebration" role="status"><div className="confetti" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div><strong>{message}</strong></div>;
}

function DeckRow({ deck, onOpen, onStudy }: { deck: HomeDeck; onOpen: () => void; onStudy: () => void }) {
  const progress = deck.total_cards ? Math.round((deck.mature_cards / deck.total_cards) * 100) : 0;
  return (
    <article className="deck-row">
      <button className="deck-main" onClick={onOpen} aria-label={`Open ${deck.title}`}>
        <span className="mastery-ring" style={{ "--mastery": `${progress * 3.6}deg`, "--deck": deck.color } as CSSProperties}><span><b>{progress}%</b><small>mastery</small></span></span>
        <span className="deck-copy"><strong>{deck.title}</strong><small>{deck.total_cards ? `${deck.total_cards} cards · ${deck.new_cards} unseen${deck.exam_date ? ` · Exam ${new Date(`${deck.exam_date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}` : "No cards yet"}</small></span>
        <span className={`due-badge ${deck.due_cards ? "active" : ""}`}>{deck.due_cards}</span>
      </button>
      {deck.due_cards > 0 && <button className="mini-study" onClick={onStudy} aria-label={`Study ${deck.title}`}>Study</button>}
    </article>
  );
}

function DecksView({ decks, onCreate, onOpen }: { decks: HomeDeck[]; onCreate: () => void; onOpen: (id: number) => void }) {
  return <section className="page-section"><div className="page-title"><div><p className="hero-label">Library</p><h1>Decks</h1></div><button className="circle-btn accent" aria-label="Create deck" onClick={onCreate}><Icon name="plus" /></button></div>{decks.length ? <div className="deck-list roomy">{decks.map((deck) => <DeckRow key={deck.id} deck={deck} onOpen={() => onOpen(deck.id)} onStudy={() => onOpen(deck.id)} />)}</div> : <EmptyState onCreate={onCreate} />}</section>;
}

function DeckDetail({ deckId, onBack, onStudy }: { deckId: number; onBack: () => void; onStudy: () => void }) {
  const queryClient = useQueryClient();
  const result = useQuery({ queryKey: ["deck", deckId], queryFn: () => api.getDeck({ id: deckId }) });
  const [editing, setEditing] = useState<DeckCard | "new" | null>(null);
  const [editingDeck, setEditingDeck] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteDeck = useMutation({ mutationFn: api.deleteDeck, onSuccess: async () => { await queryClient.invalidateQueries(); onBack(); } });
  const reset = useMutation({ mutationFn: api.resetCard, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deck", deckId] }) });
  if (result.isPending) return <Loading />;
  if (result.error || !result.data.deck) return <ErrorState />;
  const { deck, cards } = result.data;
  const due = cards.filter((card) => new Date(card.due_at).getTime() <= Date.now()).length;
  return (
    <section className="page-section deck-detail">
      <div className="detail-nav"><button className="icon-text" onClick={onBack}><Icon name="back" /> Decks</button><div className="detail-tools"><button className="circle-btn" aria-label="Edit deck" onClick={() => setEditingDeck(true)}><Icon name="edit" /></button><button className="circle-btn" aria-label="Add card" onClick={() => setEditing("new")}><Icon name="plus" /></button></div></div>
      <div className="deck-heading"><span className="big-swatch" style={{ background: deck.color }}><Icon name="cards" /></span><div><h1>{deck.title}</h1>{deck.description && <p>{deck.description}</p>}{deck.exam_date && <p className="exam-date">Exam {new Date(`${deck.exam_date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>}</div></div>
      <div className="deck-actions"><button className="primary-btn" disabled={!due} onClick={onStudy}>{due ? `Study ${due} due` : "Nothing due"}</button><button className="secondary-btn" onClick={() => setEditing("new")}><Icon name="plus" /> Add card</button></div>
      <div className="card-section-head"><h2>Cards <span>{cards.length}</span></h2></div>
      {cards.length === 0 ? <div className="inline-empty"><p>No cards yet. Add your first prompt and answer.</p><button className="text-btn" onClick={() => setEditing("new")}>Add a card</button></div> : <div className="card-list">{cards.map((card) => <article className="card-row" key={card.id}><button onClick={() => setEditing(card)} aria-label={`Edit card: ${card.front}`}><span className="card-front">{card.front}</span><span className="card-back">{card.back}</span><span className="card-meta"><i className={`state-dot ${card.state}`} />{card.state === "new" ? "New" : card.state === "learning" ? "Learning" : `${Math.max(1, Math.round(card.interval_minutes / 1440))}d interval`}{(card.front_image_url || card.back_image_url) && ` · ${card.front_image_url && card.back_image_url ? "2 images" : "1 image"}`}{card.tags && ` · ${card.tags}`}</span></button><button className="reset-link" onClick={() => reset.mutate({ id: card.id, now_ms: Date.now() })} aria-label={`Reset schedule for ${card.front}`}>Reset</button></article>)}</div>}
      <div className="danger-zone">{!confirmDelete ? <button className="danger-link" onClick={() => setConfirmDelete(true)}>Delete deck</button> : <div className="confirm-row"><span>Delete this deck and all its cards?</span><button className="danger-btn" onClick={() => deleteDeck.mutate({ id: deck.id })}>Delete deck</button><button className="text-btn" onClick={() => setConfirmDelete(false)}>Cancel</button></div>}</div>
      {editing && <CardForm deckId={deck.id} card={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {editingDeck && <DeckForm deck={deck} onClose={() => setEditingDeck(false)} onSaved={() => { setEditingDeck(false); void queryClient.invalidateQueries({ queryKey: ["deck", deckId] }); }} />}
    </section>
  );
}

function StudyView({ deckId, onDone, onRepair, onWatch }: { deckId: number | null; onDone: () => void; onRepair: (handoff: LabHandoff) => void; onWatch: (videoId: string) => void }) {
  const queryClient = useQueryClient();
  const [startedAt] = useState(Date.now());
  const session = useQuery({ queryKey: ["study", deckId, startedAt], queryFn: () => api.getStudySession({ deck_id: deckId, now_ms: startedAt, limit: 100 }) });
  const game = useQuery({ queryKey: ["game", dateKey()], queryFn: () => api.getGameState({ date_key: dateKey(), recent_date_keys: recentDateKeys() }) });
  const [queue, setQueue] = useState<StudyCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [ratings, setRatings] = useState<Record<Rating, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [lastGrade, setLastGrade] = useState<GradeResult | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const gradeUuids = useRef(new Map<number, string>());
  useEffect(() => { if (session.data && queue === null) setQueue(session.data.cards); }, [session.data, queue]);
  useEffect(() => { if (game.data) setSoundPreferences(game.data.sound_enabled, storedSoundVolume()); }, [game.data]);
  const grade = useMutation({
    mutationFn: ({ card, rating }: { card: StudyCard; rating: Rating }) => {
      let gradeUuid = gradeUuids.current.get(card.id);
      if (!gradeUuid) { gradeUuid = crypto.randomUUID(); gradeUuids.current.set(card.id, gradeUuid); }
      return api.gradeCard({ grade_uuid: gradeUuid, card_id: card.id, rating, answered_at_ms: Date.now(), date_key: dateKey(), critical: false, combo_safe: false });
    },
    onSuccess: async (result, vars) => {
      gradeUuids.current.delete(vars.card.id);
      setLastGrade(result);
      if (result.level_up) setCelebration(`Level ${result.level}!`);
      else if (result.perfect_day && !game.data?.perfect_today) setCelebration("Perfect day!");
      playSound(vars.rating === "good" || vars.rating === "easy" ? "correct" : "wrong");
      if (result.combo > 0 && result.combo % 5 === 0) window.setTimeout(() => playSound("combo", true), 110);
      if (result.level_up) window.setTimeout(() => playSound("level", true), 110);
      else if (result.perfect_day && !game.data?.perfect_today) window.setTimeout(() => playSound("perfect", true), 110);
      setQueue((current) => current ? current.slice(1) : current);
      setCompleted((value) => value + 1);
      setRatings((current) => ({ ...current, [vars.rating]: current[vars.rating] + 1 }));
      setRevealed(false);
      await queryClient.invalidateQueries({ queryKey: ["game"] });
      window.setTimeout(() => setLastGrade(null), 900);
      if (result.level_up || (result.perfect_day && !game.data?.perfect_today)) window.setTimeout(() => setCelebration(null), 1800);
    },
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const card = queue?.[0];
      if (!card || grade.isPending) return;
      if (!revealed && (event.key === " " || event.key === "Enter")) { event.preventDefault(); setRevealed(true); }
      if (revealed && ["1", "2", "3", "4"].includes(event.key)) {
        const rating = ({ "1": "again", "2": "hard", "3": "good", "4": "easy" } as const)[event.key as "1" | "2" | "3" | "4"];
        grade.mutate({ card, rating });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queue, revealed, grade]);
  if (session.isPending || queue === null) return <Loading />;
  const feedback = <>{celebration && <Confetti message={celebration} />}{lastGrade && <div className="xp-floater">+{lastGrade.xp_earned + lastGrade.quest_bonus_xp} XP{lastGrade.quest_bonus_xp ? " · Quest!" : ""}</div>}</>;
  const card = queue[0];
  if (!card) return (
    <>{feedback}<section className="study-complete"><div className="complete-mark">✓</div><p className="hero-label">Session complete</p><h1>{completed ? `${completed} ${completed === 1 ? "card" : "cards"} reviewed` : "Nothing due right now"}</h1>{completed > 0 && <div className="rating-summary"><span><b>{ratings.again}</b> Again</span><span><b>{ratings.hard}</b> Hard</span><span><b>{ratings.good}</b> Good</span><span><b>{ratings.easy}</b> Easy</span></div>}<button className="primary-btn" onClick={onDone}>One more round</button></section></>
  );
  const total = completed + queue.length;
  const activeImage = revealed ? card.back_image_url : card.front_image_url;
  return (
    <>{feedback}<section className="study-screen">
      {zoomed && activeImage && <ImageLightbox src={activeImage} alt={`${revealed ? "Answer" : "Prompt"} diagram`} onClose={() => setZoomed(false)} />}
      <div className="study-top"><button className="icon-text" onClick={onDone}><Icon name="back" /> Exit</button><span>{completed + 1} / {total}</span><span className="study-card-tools"><span className="deck-chip"><i style={{ background: card.deck_color }} />{card.deck_title}</span><button className="more-card" aria-label="Card options" aria-expanded={menu} onClick={() => setMenu((value) => !value)}>···</button>{menu && <span className="card-menu study-card-menu" role="menu" aria-label="Card actions"><button role="menuitem" onClick={() => { setMenu(false); onRepair({ deckId: card.deck_id, tab: "board", prompt: card.front, nonce: crypto.randomUUID() }); }}>Take to board</button><button role="menuitem" onClick={() => { setMenu(false); onRepair({ deckId: card.deck_id, tab: "practice", prompt: card.front, nonce: crypto.randomUUID() }); }}>Drill me</button></span>}</span></div>
      <div className="progress-track"><span style={{ width: `${((completed) / total) * 100}%` }} /></div>
      <div role="button" tabIndex={0} className={`study-card ${revealed ? "revealed is-flipped" : ""}`} style={{ "--deck-color": card.deck_color } as CSSProperties} onClick={() => { if (!revealed) { playSound("flip"); setRevealed(true); } }} onKeyDown={(event) => { if (!revealed && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); playSound("flip"); setRevealed(true); } }} aria-label={revealed ? "Card answer shown" : "Reveal answer"}>
        <div className="card-rotor">
          <CardFace side="front" text={card.front} image={card.front_image_url} tags={card.tags} onZoom={() => setZoomed(true)} />
          <CardFace side="back" text={card.back} image={card.back_image_url} tags={card.tags} onZoom={() => setZoomed(true)} onWatch={card.worked_video_id ? () => onWatch(card.worked_video_id ?? "") : undefined} />
        </div>
      </div>
      {revealed ? <div className="rating-panel"><p>How well did you recall it?</p><div className="rating-grid">{(["again", "hard", "good", "easy"] as Rating[]).map((rating, index) => <button key={rating} className={`rating ${rating}`} disabled={grade.isPending} onClick={() => grade.mutate({ card, rating })}><span>{rating[0]?.toUpperCase()}{rating.slice(1)}</span><small>{card.intervals[rating]}</small><kbd>{index + 1}</kbd></button>)}</div>{grade.error && <p className="form-error">That review didn’t save. Try again.</p>}</div> : <p className="study-coach">Say the answer before you reveal it.</p>}
    </section></>
  );
}

function CramQueueView({ decks, onExit }: { decks: HomeDeck[]; onExit: () => void }) {
  type CramSession = ApiResponse<typeof api, "getCramQueue">;
  const preferred = decks.find((deck) => /CNIT\s*182/i.test(deck.title) && /Exam\s*II/i.test(deck.title)) ?? decks[0];
  const [deckId, setDeckId] = useState<number | null>(preferred?.id ?? null);
  const [targetDate, setTargetDate] = useState(preferred?.exam_date ?? dateKeyOffset(7));
  const [session, setSession] = useState<CramSession | null>(null);
  const [queue, setQueue] = useState<CramCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [covered, setCovered] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [xpFlash, setXpFlash] = useState<number | null>(null);
  const gradeUuids = useRef(new Map<number, string>());
  useEffect(() => {
    if (deckId !== null || !preferred) return;
    setDeckId(preferred.id);
    setTargetDate(preferred.exam_date ?? dateKeyOffset(7));
  }, [deckId, preferred]);
  const start = useMutation({
    mutationFn: () => {
      if (deckId === null) throw new Error("Choose a deck first.");
      return api.getCramQueue({ deck_id: deckId, target_date: targetDate, now_ms: Date.now() });
    },
    onSuccess: (result) => {
      setSession(result);
      setQueue(result.cards);
      setCovered(0);
      setSessionXp(0);
      setRevealed(false);
    },
  });
  const grade = useMutation({
    mutationFn: ({ card, knew }: { card: CramCard; knew: boolean }) => {
      let gradeUuid = gradeUuids.current.get(card.id);
      if (!gradeUuid) { gradeUuid = crypto.randomUUID(); gradeUuids.current.set(card.id, gradeUuid); }
      return api.gradeCard({ grade_uuid: gradeUuid, card_id: card.id, rating: knew ? "good" : "again", answered_at_ms: Date.now(), date_key: dateKey(), critical: false, combo_safe: true });
    },
    onSuccess: (result, vars) => {
      gradeUuids.current.delete(vars.card.id);
      const earned = result.xp_earned + result.quest_bonus_xp;
      setSessionXp((value) => value + earned);
      setXpFlash(earned);
      playSound(vars.knew ? "correct" : "wrong");
      setQueue((current) => current.slice(1));
      setCovered((value) => value + 1);
      setRevealed(false);
      setZoomed(false);
      window.setTimeout(() => setXpFlash(null), 850);
    },
  });
  const chooseDeck = (nextId: number) => {
    const deck = decks.find((candidate) => candidate.id === nextId);
    setDeckId(nextId);
    setTargetDate(deck?.exam_date ?? dateKeyOffset(7));
  };
  if (!session) return <section className="cram-setup">
    <button className="icon-text" onClick={onExit}><Icon name="back" /> Feed</button>
    <div className="cram-intro"><span className="cram-bolt"><Icon name="bolt" /></span><p className="hero-label">Exam mode</p><h1>Cram Queue</h1><p>Weak cards rise first, stale cards come next, and topics stay mixed so your brain can’t run on autopilot.</p></div>
    {decks.length === 0 ? <div className="inline-empty"><p>Add a deck and a few cards before starting a cram.</p><button className="primary-btn" onClick={onExit}>Back to feed</button></div> : <div className="cram-form">
      <label htmlFor="cram-deck">Deck</label>
      <select id="cram-deck" value={deckId ?? ""} onChange={(event) => chooseDeck(Number(event.target.value))}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.title} · {deck.total_cards} cards</option>)}</select>
      <label htmlFor="cram-date">Target exam date</label>
      <input id="cram-date" type="date" min={dateKey()} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
      <div className="cram-promise"><span>Priority</span><strong>Weakest + least recent</strong><span>Flow</span><strong>Topics interleaved</strong><span>Pressure</span><strong>Combo-safe</strong></div>
      <button className="primary-btn full cram-start" disabled={start.isPending || deckId === null || !targetDate} onClick={() => start.mutate()}><Icon name="bolt" />{start.isPending ? "Building your queue…" : "Start Cram Queue"}</button>
      {start.error && <p className="form-error">Couldn’t build that queue. Try again.</p>}
    </div>}
  </section>;
  const card = queue[0];
  if (!card) return <section className="cram-complete"><div className="complete-mark">✓</div><p className="hero-label">Queue cleared</p><h1>{covered ? `${covered} cards covered` : "This deck has no cards yet"}</h1>{covered > 0 && <p>You earned <strong>{sessionXp} XP</strong> without putting your combo at risk.</p>}<button className="primary-btn full" onClick={() => { setSession(null); setQueue([]); }}>Build another queue</button><button className="text-btn" onClick={onExit}>Back to feed</button></section>;
  const total = covered + queue.length;
  const estimated = Math.max(1, Math.ceil(queue.length * 1.15));
  const activeImage = revealed ? card.back_image_url : card.front_image_url;
  const targetLabel = new Date(`${session.target_date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return <section className="cram-screen">
    {xpFlash !== null && <div className="xp-floater">+{xpFlash} XP · combo safe</div>}
    {zoomed && activeImage && <ImageLightbox src={activeImage} alt={`${revealed ? "Answer" : "Prompt"} diagram`} onClose={() => setZoomed(false)} />}
    <header className="cram-top"><button className="icon-text" onClick={onExit}><Icon name="back" /> Exit</button><span className={`urgency-chip ${session.urgency}`}>Exam {targetLabel}</span><strong>{sessionXp} XP</strong></header>
    <div className="cram-progress-copy"><strong>{covered} covered</strong><span>{queue.length} remaining · ~{estimated} min</span></div>
    <div className="progress-track"><span style={{ width: `${total ? (covered / total) * 100 : 0}%` }} /></div>
    <div className="cram-topic-row"><span>{card.topic}</span><small>{card.priority_reason}</small></div>
    <div role="button" tabIndex={0} className={`study-card cram-card ${revealed ? "revealed is-flipped" : ""}`} style={{ "--deck-color": card.deck_color } as CSSProperties} onClick={() => { if (!revealed) { playSound("flip"); setRevealed(true); } }} onKeyDown={(event) => { if (!revealed && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); playSound("flip"); setRevealed(true); } }} aria-label={revealed ? "Card answer shown" : "Reveal answer"}>
      <div className="card-rotor"><CardFace side="front" text={card.front} image={card.front_image_url} tags="" onZoom={() => setZoomed(true)} /><CardFace side="back" text={card.back} image={card.back_image_url} tags="" onZoom={() => setZoomed(true)} /></div>
    </div>
    {revealed ? <div className="cram-actions"><button disabled={grade.isPending} className="cram-again" onClick={() => grade.mutate({ card, knew: false })}><span>Again</span><small>+XP · combo stays safe</small></button><button disabled={grade.isPending} className="cram-knew" onClick={() => grade.mutate({ card, knew: true })}><span>Got it</span><small>+XP · next in {card.intervals.good}</small></button></div> : <p className="study-coach">Say it first. Tap when you’re ready.</p>}
    {grade.error && <p className="form-error">That review didn’t save. Tap again.</p>}
  </section>;
}

function BlitzView({ onExit }: { onExit: () => void }) {
  const [round, setRound] = useState(1);
  return <BlitzRound key={round} onExit={onExit} onRunBack={() => setRound((value) => value + 1)} />;
}

function BlitzRound({ onExit, onRunBack }: { onExit: () => void; onRunBack: () => void }) {
  const queryClient = useQueryClient();
  const seed = useMemo(() => Math.floor(Math.random() * 1_000_000), []);
  const feed = useQuery({ queryKey: ["blitz-feed", seed], queryFn: () => api.getFeed({ now_ms: Date.now(), seed, deck_id: null, limit: 200 }) });
  const [queue, setQueue] = useState<FeedCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [score, setScore] = useState(0);
  const [cards, setCards] = useState(0);
  const attemptUuid = useRef(crypto.randomUUID());
  const gradeUuids = useRef(new Map<number, string>());
  const deadlineRef = useRef<number | null>(null);
  const finish = useMutation({ mutationFn: () => api.finishBlitz({ attempt_uuid: attemptUuid.current, score, date_key: dateKey(), yesterday_key: yesterdayDateKey() }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["game"] }) });
  const finishedRef = useRef(false);
  useEffect(() => { if (feed.data && queue === null) setQueue(feed.data.cards); }, [feed.data, queue]);
  useEffect(() => {
    if (!queue || seconds === 0) return;
    if (deadlineRef.current === null) deadlineRef.current = Date.now() + 60_000;
    const tick = () => setSeconds(Math.max(0, Math.ceil(((deadlineRef.current ?? Date.now()) - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [queue, seconds === 0]);
  useEffect(() => { if (seconds > 0 && seconds <= 5) playSound("tick"); }, [seconds]);
  const grade = useMutation({
    mutationFn: ({ card, knew }: { card: FeedCard; knew: boolean }) => {
      let gradeUuid = gradeUuids.current.get(card.id);
      if (!gradeUuid) { gradeUuid = crypto.randomUUID(); gradeUuids.current.set(card.id, gradeUuid); }
      return api.gradeCard({ grade_uuid: gradeUuid, card_id: card.id, rating: knew ? "good" : "again", answered_at_ms: Date.now(), date_key: dateKey(), critical: card.critical, combo_safe: false });
    },
    onSuccess: (result, vars) => { gradeUuids.current.delete(vars.card.id); playSound(vars.knew ? "correct" : "wrong"); setScore((value) => value + result.xp_earned); setCards((value) => value + 1); setQueue((current) => current?.length === 1 ? feed.data?.cards ?? current : current ? current.slice(1) : current); setRevealed(false); },
  });
  useEffect(() => {
    // Let an answer already in flight settle so the recorded score matches the result screen.
    if (seconds !== 0 || grade.isPending || finishedRef.current) return;
    finishedRef.current = true;
    playSound("finish");
    finish.mutate();
  }, [seconds, grade.isPending, score, cards]);
  if (feed.isPending || queue === null) return <Loading />;
  if (seconds === 0) return <section className="blitz-results">{finish.data?.perfect_day && <Confetti message="Perfect day!" />}<div className="results-bolt"><Icon name="bolt" /></div><p className="hero-label">Blitz complete</p><h1>{score} XP</h1><p>{cards} cards in one focused minute.</p><div className="best-score"><span>{finish.data?.yesterday_score ? (finish.data.beat_yesterday ? `You beat yesterday’s ${finish.data.yesterday_score} XP` : `Yesterday: ${finish.data.yesterday_score} XP — run it back`) : "First score on the board for today"}</span><br />Personal best <strong>{finish.data?.personal_best ?? score}</strong>{finish.data?.new_best && <span> New best!</span>}</div>{finish.data?.bonus_xp ? <p className="bonus-copy">+{finish.data.bonus_xp} quest XP</p> : null}<button className="primary-btn full" onClick={onRunBack}>Run it back · one more round</button><button className="text-btn" onClick={onExit}>Back to feed</button></section>;
  const card = queue[0];
  if (!card) return <section className="feed-empty"><h1>Add cards to start a Blitz.</h1><button className="primary-btn" onClick={onExit}>Back to feed</button></section>;
  return <section className="blitz-screen"><header><button className="icon-text" onClick={onExit}><Icon name="back" /> Exit</button><div className={`blitz-clock ${seconds <= 10 ? "urgent" : ""}`}>{seconds}</div><strong>{score} XP</strong></header><div className="blitz-progress"><span style={{ width: `${(seconds / 60) * 100}%` }} /></div><GameCard card={card} revealed={revealed} busy={grade.isPending || seconds === 0} onReveal={() => { if (seconds === 0) return; playSound("flip"); setRevealed(true); }} onGrade={(knew) => { if (seconds > 0) grade.mutate({ card, knew }); }} /></section>;
}

function formatVideoTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function assessmentTimestamp(value: string) {
  const localValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59` : value;
  const timestamp = new Date(localValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function formatAssessmentDate(value: string) {
  const timestamp = assessmentTimestamp(value);
  if (!Number.isFinite(timestamp)) return "Date pending";
  const hasTime = value.includes("T");
  return new Intl.DateTimeFormat(undefined, hasTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }
    : { month: "short", day: "numeric" }).format(new Date(timestamp));
}

function rankLessonVideos(videos: LessonVideo[], watchedIds: Set<string>, now = Date.now()) {
  const dayMs = 86_400_000;
  const score = (video: LessonVideo) => {
    const remaining = assessmentTimestamp(video.assessmentDate) - now;
    const days = Math.max(0, remaining / dayMs);
    // The cubic curve makes the final week accelerate sharply without hiding later material.
    const urgency = remaining >= 0 ? 120_000 / (1 + Math.pow(days / 7, 3)) : -20_000;
    const watchedPenalty = watchedIds.has(video.id) ? 45_000 : 0;
    return urgency - watchedPenalty;
  };
  return videos.filter((video) => !video.sealed).sort((a, b) => {
    const priority = score(b) - score(a);
    if (Math.abs(priority) > 0.001) return priority;
    const assessmentOrder = assessmentTimestamp(a.assessmentDate) - assessmentTimestamp(b.assessmentDate);
    if (assessmentOrder !== 0) return assessmentOrder;
    if (a.lesson !== b.lesson) return a.lesson - b.lesson;
    if (a.format !== b.format) return a.format === "Short" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

function WatchVideoCard({ video, index, totalVideos, active, muted, complete, onMutedChange, onEarn }: {
  video: LessonVideo;
  index: number;
  totalVideos: number;
  active: boolean;
  muted: boolean;
  complete: boolean;
  onMutedChange: (muted: boolean) => void;
  onEarn: (video: LessonVideo) => Promise<void>;
}) {
  const playback = useManagedPlayback(video.id);
  const element = playback.element;
  const mounted = useRef(true);
  const rewardRequested = useRef(complete);
  const holdTimer = useRef<number | null>(null);
  const boostingRef = useRef(false);
  const suppressToggle = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(video.durationSeconds);
  const [watchedRatio, setWatchedRatio] = useState(complete ? 1 : 0);
  const clearHoldTimer = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const endSpeedBoost = (blockClick: boolean) => {
    clearHoldTimer();
    const wasBoosting = boostingRef.current;
    playback.setPlaybackRate(1);
    boostingRef.current = false;
    if (mounted.current) setBoosting(false);
    if (blockClick && wasBoosting) {
      suppressToggle.current = true;
      window.setTimeout(() => { suppressToggle.current = false; }, 0);
    }
  };
  useEffect(() => { if (complete) rewardRequested.current = true; }, [complete]);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    playback.stop();
    setPlaybackError("");
    setPlaying(false);
    node.load();
  }, [video.source]);
  useEffect(() => {
    if (!active) {
      endSpeedBoost(false);
      playback.pause();
      return;
    }
    void playback.play().catch(() => {
      if (mounted.current) setPlaying(false);
    });
    return () => playback.pause();
  }, [active, video.source]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearHoldTimer();
    };
  }, []);
  const togglePlayback = () => {
    if (suppressToggle.current) { suppressToggle.current = false; return; }
    const node = element.current;
    if (!node) return;
    if (node.paused) {
      setPlaybackError("");
      void playback.play().then((started) => {
        if (started) playSound("flip");
      }).catch(() => {
        if (mounted.current) setPlaybackError("Playback was blocked. Tap Play once more to start this lesson.");
      });
    } else playback.pause();
  };
  const beginSpeedBoost = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, input")) return;
    const node = element.current;
    if (!node || node.paused || node.ended) return;
    clearHoldTimer();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Capture is optional on older webviews. */ }
    holdTimer.current = window.setTimeout(() => {
      if (!element.current || element.current.paused || !mounted.current) return;
      playback.setPlaybackRate(2);
      boostingRef.current = true;
      setBoosting(true);
    }, 220);
  };
  const updateProgress = () => {
    const node = element.current;
    if (!node) return;
    const total = Number.isFinite(node.duration) && node.duration > 0 ? node.duration : video.durationSeconds;
    setDuration(total);
    setTime(node.currentTime);
    let playedSeconds = 0;
    for (let range = 0; range < node.played.length; range += 1) playedSeconds += node.played.end(range) - node.played.start(range);
    const ratio = Math.min(1, playedSeconds / total);
    setWatchedRatio(ratio);
    if (ratio >= 0.8 && !rewardRequested.current && !complete) {
      rewardRequested.current = true;
      void onEarn(video).catch(() => { rewardRequested.current = false; });
    }
  };
  return <article className={`watch-card ${active ? "active" : ""}`} data-watch-index={index} aria-label={`${video.title}, ${video.scopeLabel} ${video.format}, for ${video.targetAssessment}`}>
    <div className="watch-video-stage" onPointerDown={beginSpeedBoost} onPointerUp={() => endSpeedBoost(true)} onPointerCancel={() => endSpeedBoost(false)} onLostPointerCapture={() => endSpeedBoost(false)} onContextMenu={(event) => event.preventDefault()}>
      <video ref={element} src={video.source} preload={index < 2 ? "auto" : "metadata"} playsInline muted={muted} onClick={togglePlayback} onPlay={() => { const accepted = playback.acceptPlayEvent(); if (mounted.current) { setPlaybackError(""); setPlaying(accepted); } }} onPause={() => { endSpeedBoost(false); if (mounted.current) setPlaying(false); }} onTimeUpdate={updateProgress} onLoadedMetadata={updateProgress} onCanPlay={() => { if (mounted.current) setPlaybackError(""); }} onError={() => { playback.stop(); if (mounted.current) { setPlaying(false); setPlaybackError("This lesson could not load. Tap to retry."); } }} onEnded={() => { endSpeedBoost(false); playback.stop(); if (mounted.current) setPlaying(false); }} aria-label={`${video.title} lesson video. Press and hold while playing for two times speed.`} />
      {!playing && !playbackError && <button className="watch-stage-play" aria-label={`Play ${video.title} with sound`} onClick={(event) => { event.stopPropagation(); togglePlayback(); }}><span aria-hidden="true">▶</span><small>Play with sound</small></button>}
      {playbackError && <button className="watch-stage-error" onClick={togglePlayback}><strong>Video paused</strong><span>{playbackError}</span></button>}
    </div>
    <div className="watch-panel">
      <div className="watch-tags"><span>{video.className}</span><span>{video.scopeLabel}</span><span>{video.format}</span><span>{video.targetAssessment}</span><span>{formatAssessmentDate(video.assessmentDate)}</span></div>
      <div className="watch-copy">
        <h1>{video.title}</h1>
        <p className="watch-topic">{video.topic}</p>
        <p className="watch-progress">{complete ? `Mastered · +${video.xp} XP` : `${Math.round(watchedRatio * 100)}% watched · +${video.xp} XP at 80%`}</p>
      </div>
      <div className="watch-timeline">
        <input aria-label={`Playback position for ${video.title}`} type="range" min="0" max={duration || video.durationSeconds} step="0.1" value={Math.min(time, duration)} onChange={(event) => { const node = element.current; if (!node) return; node.currentTime = Number(event.target.value); setTime(node.currentTime); }} />
        <span>{formatVideoTime(time)} / {formatVideoTime(duration)}</span>
      </div>
      <div className="watch-controls">
        <button className="watch-control-primary" aria-label={playing ? `Pause ${video.title}` : `Play ${video.title}`} onClick={togglePlayback}><span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>{playing ? "Pause" : "Play"}</button>
        <button className="watch-control-secondary" aria-label={muted ? "Turn video sound on" : "Mute video"} onClick={() => onMutedChange(!muted)}>{muted ? "Sound off" : "Sound on"}</button>
        <span className={`watch-speed ${boosting ? "active" : ""}`} role="status" aria-label={boosting ? "Playing at two times speed" : "Hold video for two times speed"}>{boosting ? "2× active" : "Hold video · 2×"}</span>
        {complete && <span className="watch-earned" aria-label={`${video.xp} XP earned`}>+{video.xp} XP</span>}
      </div>
      <span className="watch-next-hint">{index < totalVideos - 1 ? "Scroll for next lesson" : "You’re at the end of this batch"}</span>
    </div>
  </article>;
}

function WatchView({ targetVideoId, targetClassName, targetTopic }: { targetVideoId?: string; targetClassName?: string; targetTopic?: string }) {
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: ["watch-state"], queryFn: () => api.getWatchState({}) });
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const [feedOrder, setFeedOrder] = useState<LessonVideo[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const root = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!state.data) return;
    const watched = new Set(state.data.watched_video_ids);
    setEarned(watched);
    const classVideos = targetClassName ? lessonVideos.filter((video) => video.className === targetClassName) : lessonVideos;
    const ranked = rankLessonVideos(classVideos, watched);
    const target = targetVideoId ? ranked.find((video) => video.id === targetVideoId) : undefined;
    setFeedOrder(target ? [target, ...ranked.filter((video) => video.id !== target.id)] : ranked);
    setActiveIndex(0);
  }, [state.data, targetVideoId, targetClassName]);
  useEffect(() => {
    const container = root.current;
    if (!container || !feedOrder) return;
    const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-watch-index]"));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const next = Number((visible.target as HTMLElement).dataset.watchIndex ?? "0");
      if (Number.isFinite(next)) setActiveIndex(next);
    }, { root: container.parentElement, threshold: [0.35, 0.6, 0.8] });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [feedOrder]);
  const reward = useMutation({
    mutationFn: (video: LessonVideo) => api.awardWatchXp({ video_id: video.id, date_key: dateKey() }),
    onSuccess: async (result, video) => {
      setEarned((current) => new Set(current).add(video.id));
      setToast(result.awarded ? `+${result.xp_earned} XP · combo safe` : "XP already earned for this lesson");
      playSound(result.level_up ? "level" : "quest", true);
      window.setTimeout(() => setToast(null), 1800);
      await queryClient.invalidateQueries({ queryKey: ["game"] });
      await queryClient.invalidateQueries({ queryKey: ["watch-state"] });
    },
  });
  if (state.isPending || feedOrder === null) return <Loading />;
  if (state.error) return <ErrorState />;
  const completedInFeed = feedOrder.reduce((count, video) => count + (earned.has(video.id) ? 1 : 0), 0);
  if (targetClassName && feedOrder.length === 0) return <section className="watch-class-empty" aria-label={`${targetClassName} Watch`}>
    <p className="hero-label">{targetClassName} · Watch</p>
    <h1>{targetTopic ?? `Your next ${targetClassName} topic`}</h1>
    <p>{targetClassName} lesson videos are being produced. They’ll appear here as soon as they’re ready.</p>
    <div className="watch-class-route"><strong>Keep the {targetClassName} hour moving</strong><span>Return to the Study Hour and continue to Drill, Practice, or Teach with this class’s own materials.</span></div>
  </section>;
  return <section className="watch-feed" ref={root} aria-label={targetClassName ? `${targetClassName} lesson video feed` : "Lesson video feed ordered by upcoming assessments"}>
    <div className="watch-status"><Mascot view="watch" /></div>
    <div className="watch-rail" aria-label={`${completedInFeed} of ${feedOrder.length} lesson videos completed`}><span style={{ width: `${feedOrder.length ? (completedInFeed / feedOrder.length) * 100 : 0}%` }} /></div>
    {toast && <div className="watch-toast" role="status">{toast}</div>}
    {reward.error && <div className="watch-error" role="status">XP didn’t save. Keep watching and Munki will retry.</div>}
    {feedOrder.map((video, index) => <WatchVideoCard key={video.id} video={video} index={index} totalVideos={feedOrder.length} active={activeIndex === index} muted={muted} complete={earned.has(video.id)} onMutedChange={setMuted} onEarn={(item) => reward.mutateAsync(item).then(() => undefined)} />)}
  </section>;
}

function WeeklyRecap({ onBack }: { onBack: () => void }) {
  const recap = useQuery({ queryKey: ["weekly-recap", dateKey()], queryFn: () => api.getWeeklyRecap({ now_ms: Date.now() }) });
  if (recap.isPending) return <Loading />;
  if (recap.error) return <ErrorState />;
  const data = recap.data;
  return <section className="recap-page"><button className="icon-text" onClick={onBack}><Icon name="back" /> Feed</button><div className="recap-hero"><p className="hero-label">Your last 7 days</p><h1>{data.xp.toLocaleString()} XP</h1><p>{data.trend_label}</p></div><div className="recap-grid"><article><strong>{data.cards}</strong><span>cards graded</span></article><article><strong>{data.best_combo}</strong><span>best combo</span></article><article><strong>{data.accuracy}%</strong><span>knew it</span></article><article><strong>{data.active_days}</strong><span>active days</span></article></div>{data.perfect_days > 0 && <div className="perfect-callout"><Icon name="trophy" /><div><strong>{data.perfect_days} perfect {data.perfect_days === 1 ? "day" : "days"}</strong><span>You cleared every daily quest.</span></div></div>}<button className="primary-btn full" onClick={onBack}>One more round</button></section>;
}

function SettingsView({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const game = useQuery({ queryKey: ["game", dateKey()], queryFn: () => api.getGameState({ date_key: dateKey(), recent_date_keys: recentDateKeys() }) });
  const [sound, setSound] = useState(true);
  const [volume, setVolume] = useState(storedSoundVolume);
  useEffect(() => { if (game.data) { setSound(game.data.sound_enabled); setSoundPreferences(game.data.sound_enabled, volume); } }, [game.data, volume]);
  const save = useMutation({ mutationFn: api.updateGameSettings, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["game"] }) });
  const packageAll = useMutation({
    mutationFn: api.createMunkiPackage,
    onSuccess: (result) => {
      const link = document.createElement("a");
      link.href = result.download_url;
      link.download = result.file_name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      playSound("quest", true);
    },
  });
  if (game.isPending) return <Loading />;
  const packageCounts = packageAll.data?.counts;
  return <section className="settings-page">
    <button className="icon-text" onClick={onBack}><Icon name="back" /> Feed</button>
    <h1>Settings</h1>
    <div className="settings-list"><label><span><strong>Sound effects</strong><small>Subtle cues for flips, recall, combos, and milestones.</small></span><input type="checkbox" checked={sound} onChange={(event) => { const value = event.target.checked; setSound(value); setSoundPreferences(value, volume); if (value) playSound("correct", true); save.mutate({ sound_enabled: value, daily_nudge_enabled: false }); }} /></label><label className="volume-row"><span><strong>Sound volume</strong><small>{Math.round(volume * 100)}%</small></span><input aria-label="Sound volume" type="range" min="0" max="1" step="0.05" value={volume} disabled={!sound} onChange={(event) => { const value = Number(event.target.value); setVolume(value); setSoundPreferences(sound, value); try { window.localStorage.setItem("munki-sound-volume", String(value)); } catch { /* Session-only fallback. */ } }} onPointerUp={() => playSound("correct", true)} /></label></div>
    <TeachingSettings />
    <section className="package-panel" aria-labelledby="package-title">
      <div className="package-mark" aria-hidden="true"><Icon name="stack" /></div>
      <div className="package-copy"><p className="hero-label">Portable archive</p><h2 id="package-title">Package everything</h2><p>Bundle every deck, card, review, lesson, study session, board, practice result, teaching record, setting, and catalog reference into one dated file.</p></div>
      <div className="package-strip"><span><b>17</b> Watch videos</span><span><b>10</b> study systems</span><span><b>1</b> complete archive</span></div>
      <button className="primary-btn full" disabled={packageAll.isPending} onClick={() => packageAll.mutate({})}>{packageAll.isPending ? "Packaging Munki…" : "Download everything"}</button>
      {packageCounts && <p className="package-status" role="status">Packaged {packageCounts.decks} decks, {packageCounts.cards} cards, {packageCounts.lessons} lessons, and {packageCounts.reviews} reviews.</p>}
      {packageAll.error && <p className="form-error" role="alert">Munki couldn’t build the package. Nothing changed—try again.</p>}
      <small className="package-note">The archive includes attachment references and file metadata. Binary card images, Study Lab files, and videos stay safely stored in Munki.</small>
    </section>
    {save.isPending && <p className="settings-status">Saving…</p>}{save.isSuccess && <p className="settings-status">Saved</p>}
  </section>;
}

type MascotAccessoryId = "leaf-cap" | "round-glasses" | "study-hoodie" | "night-sky";
type MascotSlot = "hat" | "glasses" | "outfit" | "background";
const MASCOT_ACCESSORIES: Array<{ id: MascotAccessoryId; slot: MascotSlot; name: string; description: string; price: number }> = [
  { id: "leaf-cap", slot: "hat", name: "Leaf cap", description: "Fresh thinking cap", price: 80 },
  { id: "round-glasses", slot: "glasses", name: "Round glasses", description: "Tiny scholar energy", price: 120 },
  { id: "study-hoodie", slot: "outfit", name: "Study hoodie", description: "Cozy focus uniform", price: 180 },
  { id: "night-sky", slot: "background", name: "Night sky", description: "A calm little galaxy", price: 240 },
];

function MascotArt({ mode, state }: { mode: "idle" | "studying" | "dance" | "watching" | "sleepy" | "celebrate"; state: MascotState }) {
  const equipped = state.equipped;
  return <span className={`mascot-art mode-${mode} ${equipped.background === "night-sky" ? "with-night-sky" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 96 96" role="img">
      <ellipse className="mascot-shadow" cx="48" cy="87" rx="23" ry="5" />
      <path className="mascot-tail" d="M73 63c17 2 16 19 5 20-7 1-9-5-5-9" />
      <g className="mascot-body-group">
        <path className={`mascot-body ${equipped.outfit === "study-hoodie" ? "hoodied" : ""}`} d="M26 51c0-19 9-32 22-32s23 13 23 32v19c0 12-9 19-23 19S26 82 26 70Z" />
        <circle className="mascot-ear" cx="26" cy="47" r="9" /><circle className="mascot-ear" cx="71" cy="47" r="9" />
        <ellipse className="mascot-muzzle" cx="48" cy="52" rx="17" ry="15" />
        <g className="mascot-eyes"><circle cx="41" cy="45" r="2.4" /><circle cx="56" cy="45" r="2.4" /></g>
        <path className="mascot-smile" d="M43 57q5 5 10 0" />
        {equipped.outfit === "study-hoodie" && <path className="mascot-hoodie" d="M30 67q18-10 36 0v15q-18 12-36 0Z" />}
        {equipped.hat === "leaf-cap" && <g className="mascot-hat"><path d="M34 25q13-14 29-2-13 7-28 7Z" /><path d="M49 23q6-9 13-10-1 8-9 12" /></g>}
        {equipped.glasses === "round-glasses" && <g className="mascot-glasses"><circle cx="40" cy="45" r="6" /><circle cx="57" cy="45" r="6" /><path d="M46 45h5" /></g>}
        <g className="mascot-book"><path d="M27 66q11-5 21 2v16q-10-6-21-2Z" /><path d="M69 66q-11-5-21 2v16q10-6 21-2Z" /></g>
        <g className="mascot-popcorn"><path d="M61 65h17l-3 18H64Z" /><circle cx="65" cy="63" r="4" /><circle cx="70" cy="61" r="4" /><circle cx="75" cy="64" r="4" /></g>
      </g>
      <g className="mascot-sleep"><text x="66" y="28">z</text><text x="75" y="18">z</text></g>
      <g className="mascot-confetti"><circle cx="19" cy="22" r="2" /><rect x="72" y="25" width="4" height="4" rx="1" /><circle cx="81" cy="48" r="2" /></g>
    </svg>
  </span>;
}

function Mascot({ view }: { view: View["name"] }) {
  const queryClient = useQueryClient();
  const mascot = useQuery({ queryKey: ["mascot"], queryFn: () => api.getMascotState({}) });
  const game = useQuery({ queryKey: ["game", dateKey()], queryFn: () => api.getGameState({ date_key: dateKey(), recent_date_keys: recentDateKeys() }) });
  const focus = useQuery({ queryKey: ["active-focus"], queryFn: () => api.getActiveFocusSession({}), refetchInterval: 30_000 });
  const [shopOpen, setShopOpen] = useState(false);
  const [sleepy, setSleepy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const celebrationTimer = useRef<number | null>(null);
  const previousMilestones = useRef<{ level: number; quests: number } | null>(null);
  const buy = useMutation({ mutationFn: (id: MascotAccessoryId) => api.purchaseMascotAccessory({ accessory_id: id }), onSuccess: (result) => queryClient.setQueryData(["mascot"], result) });
  const equip = useMutation({ mutationFn: ({ slot, id }: { slot: MascotSlot; id: MascotAccessoryId | null }) => api.equipMascotAccessory({ slot, accessory_id: id }), onSuccess: (result) => queryClient.setQueryData(["mascot"], result) });
  const touch = useMutation({ mutationFn: api.touchMascot, onSuccess: (result) => queryClient.setQueryData(["mascot"], result) });
  useEffect(() => {
    let timer: number | null = null;
    const reset = () => { setSleepy(false); if (timer !== null) window.clearTimeout(timer); timer = window.setTimeout(() => setSleepy(true), 4 * 60_000); };
    reset();
    window.addEventListener("pointerdown", reset, { passive: true });
    window.addEventListener("keydown", reset);
    return () => { if (timer !== null) window.clearTimeout(timer); window.removeEventListener("pointerdown", reset); window.removeEventListener("keydown", reset); };
  }, []);
  useEffect(() => {
    if (!game.data) return;
    const next = { level: game.data.level, quests: game.data.quests.filter((quest) => quest.complete).length };
    const prior = previousMilestones.current;
    previousMilestones.current = next;
    if (!prior || (next.level <= prior.level && next.quests <= prior.quests)) return;
    setCelebrating(true);
    playSound("mascotCelebrate", true);
    if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
    celebrationTimer.current = window.setTimeout(() => setCelebrating(false), 2400);
  }, [game.data]);
  useEffect(() => () => { if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current); }, []);
  if (!mascot.data) return null;
  const state = mascot.data;
  const mode = celebrating ? "celebrate" : view === "watch" ? "watching" : focus.data?.session ? "studying" : (game.data?.combo ?? 0) >= 3 ? "dance" : sleepy ? "sleepy" : "idle";
  const openShop = () => { playSound("mascotTap"); setShopOpen(true); touch.mutate({}); };
  return <>
    <button className="mascot-button" data-mascot-mode={mode} aria-label={`Open ${state.name}'s accessory shop. ${mode} mode.`} onClick={openShop}>
      <MascotArt mode={mode} state={state} />
    </button>
    {shopOpen && <div className="mascot-shop-wrap" role="dialog" aria-modal="true" aria-labelledby="mascot-shop-title">
      <button className="mascot-shop-backdrop" aria-label="Close accessory shop" onClick={() => setShopOpen(false)} />
      <section className="mascot-shop">
        <header><div><p className="hero-label">Cosmetics only</p><h2 id="mascot-shop-title">{state.name}’s closet</h2></div><button className="text-btn" onClick={() => setShopOpen(false)}>Done</button></header>
        <div className="mascot-shop-balance"><MascotArt mode="idle" state={state} /><span><strong>{state.available_xp} XP</strong><small>available to spend</small></span></div>
        <div className="mascot-shop-grid">{MASCOT_ACCESSORIES.map((item) => {
          const owned = state.owned_accessory_ids.includes(item.id);
          const equipped = state.equipped[item.slot] === item.id;
          const affordable = state.available_xp >= item.price;
          return <article key={item.id} className={equipped ? "equipped" : ""}><div className={`accessory-swatch ${item.id}`} aria-hidden="true" /><div><strong>{item.name}</strong><small>{item.description}</small></div><button disabled={equipped || (!owned && !affordable) || buy.isPending || equip.isPending} onClick={() => owned ? equip.mutate({ slot: item.slot, id: item.id }) : buy.mutate(item.id)}>{equipped ? "Wearing" : owned ? "Equip" : `${item.price} XP`}</button>{equipped && <button className="remove-accessory" onClick={() => equip.mutate({ slot: item.slot, id: null })}>Remove</button>}</article>;
        })}</div>
        {(buy.error || equip.error) && <p className="form-error">{buy.error instanceof Error ? buy.error.message : equip.error instanceof Error ? equip.error.message : "That accessory could not be saved."}</p>}
        <p className="mascot-shop-note">Accessories never change your streak, level, or study progress.</p>
      </section>
    </div>}
  </>;
}

function Loading() { return <div className="center-state"><span className="loader" /><p>Loading your cards…</p></div>; }
function ErrorState() { return <div className="center-state"><p>Munki couldn’t load this view.</p><button className="secondary-btn" onClick={() => window.location.reload()}>Try again</button></div>; }

export function App() {
  const [view, setView] = useState<View>({ name: "feed" });
  const [showDeckForm, setShowDeckForm] = useState(false);
  const [labHandoff, setLabHandoff] = useState<LabHandoff | null>(null);
  const [hourReturn, setHourReturn] = useState(false);
  const playbackScope = view.name === "watch" ? `watch:${view.videoId ?? "queue"}:${view.className ?? "all"}` : null;
  usePlaybackScope(playbackScope);
  const now = useMemo(() => Date.now(), [view.name]);
  const home = useQuery({ queryKey: ["home-nav", todayStart()], queryFn: () => api.getHome({ now_ms: now, today_start_ms: todayStart() }) });
  const decks = home.data?.decks ?? [];
  const hasBottomNav = view.name === "feed" || view.name === "watch" || view.name === "lessons" || view.name === "decks" || view.name === "lab" || view.name === "teach";
  const openDeck = (deckId: number) => setView({ name: "deck", deckId });
  const openLab = (handoff: LabHandoff) => { setLabHandoff(handoff); setView({ name: "lab" }); };
  const openStudyHourTarget = (target: StudyHourTarget) => {
    setHourReturn(true);
    if (target.kind === "watch") { setView({ name: "watch", ...(target.videoId ? { videoId: target.videoId } : {}), className: target.className, topic: target.topic }); return; }
    if (target.kind === "study") { target.deckId ? setView({ name: "study", deckId: target.deckId }) : setView({ name: "decks" }); return; }
    if (target.kind === "lab") {
      if (target.deckId) openLab({ deckId: target.deckId, tab: "board", prompt: target.prompt, nonce: crypto.randomUUID() });
      else setView({ name: "decks" });
      return;
    }
    target.deckId ? setView({ name: "teach", deckId: target.deckId, topic: target.topic }) : setView({ name: "decks" });
  };
  if (view.name === "hour") return <main className="app-shell"><SafeAreaTopScrim backgroundColor="var(--bg)" /><DailyStudyHour onExit={() => setView({ name: "feed" })} onOpenTarget={openStudyHourTarget} /></main>;
  if (view.name === "study") return <main className="app-shell"><SafeAreaTopScrim backgroundColor="var(--bg)" /><StudyView deckId={view.deckId} onDone={() => { if (hourReturn) setView({ name: "hour" }); else setView({ name: "feed" }); }} onRepair={openLab} onWatch={(videoId) => setView({ name: "watch", videoId })} />{hourReturn && <ActiveStudyHourDock onOpen={() => setView({ name: "hour" })} />}</main>;
  if (view.name === "cram") return <main className="app-shell"><SafeAreaTopScrim backgroundColor="var(--bg)" /><CramQueueView decks={decks} onExit={() => setView({ name: "feed" })} /></main>;
  if (view.name === "blitz") return <main className="app-shell"><SafeAreaTopScrim backgroundColor="var(--bg)" /><BlitzView onExit={() => setView({ name: "feed" })} /></main>;
  return (
    <main className={`app-shell ${hasBottomNav ? "with-bottom-nav" : ""} ${view.name === "watch" ? "watch-mode" : ""}`}>
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <div className={view.name === "feed" ? "feed-wrap" : view.name === "watch" ? "watch-wrap" : view.name === "lab" ? "lab-wrap" : view.name === "teach" ? "teach-wrap" : "content-wrap"}>
        {view.name === "watch" && <WatchView targetVideoId={view.videoId} targetClassName={view.className} targetTopic={view.topic} />}
        {view.name === "lessons" && <Lessons />}
        {view.name === "feed" && <FeedView onHour={() => { setHourReturn(false); setView({ name: "hour" }); }} onDecks={() => setView({ name: "decks" })} onCram={() => setView({ name: "cram" })} onBlitz={() => setView({ name: "blitz" })} onRecap={() => setView({ name: "recap" })} onSettings={() => setView({ name: "settings" })} onOpenFocus={(deckId) => openLab({ deckId, tab: "focus", nonce: crypto.randomUUID() })} onRepair={openLab} onWatch={(videoId) => setView({ name: "watch", videoId })} />}
        {view.name === "decks" && <DecksView decks={decks} onCreate={() => setShowDeckForm(true)} onOpen={openDeck} />}
        {view.name === "lab" && <StudyLab decks={decks} onCreateDeck={() => setShowDeckForm(true)} handoff={labHandoff} onWatch={(videoId) => setView({ name: "watch", videoId })} />}
        {view.name === "teach" && <TeachMunki decks={decks} initialDeckId={view.deckId} initialTopic={view.topic} />}
        {view.name === "deck" && <DeckDetail deckId={view.deckId} onBack={() => setView({ name: "decks" })} onStudy={() => setView({ name: "study", deckId: view.deckId })} />}
        {view.name === "recap" && <WeeklyRecap onBack={() => setView({ name: "feed" })} />}
        {view.name === "settings" && <SettingsView onBack={() => setView({ name: "feed" })} />}
      </div>
      {hourReturn && <ActiveStudyHourDock onOpen={() => setView({ name: "hour" })} />}
      {hasBottomNav && <nav className="bottom-nav" aria-label="Main navigation"><button className={view.name === "feed" ? "active" : ""} onClick={() => setView({ name: "feed" })}><Icon name="home" /><span>Feed</span></button><button className={view.name === "watch" ? "active" : ""} onClick={() => setView({ name: "watch" })}><Icon name="watch" /><span>Watch</span></button><button className={view.name === "lessons" ? "active" : ""} onClick={() => setView({ name: "lessons" })}><Icon name="lesson" /><span>Lessons</span></button><button className={view.name === "teach" ? "active" : ""} onClick={() => setView({ name: "teach" })}><Icon name="teach" /><span>Teach</span></button><button className={view.name === "decks" ? "active" : ""} onClick={() => setView({ name: "decks" })}><Icon name="stack" /><span>Decks</span></button><button className={view.name === "lab" ? "active" : ""} onClick={() => { setLabHandoff(null); setView({ name: "lab" }); }}><Icon name="lab" /><span>Lab</span></button></nav>}
      {showDeckForm && <DeckForm onClose={() => setShowDeckForm(false)} onSaved={(id) => { setShowDeckForm(false); openDeck(id); }} />}
    </main>
  );
}
