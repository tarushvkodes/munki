export type SoundKind = "flip" | "correct" | "wrong" | "combo" | "critical" | "level" | "perfect" | "tick" | "finish" | "quest" | "mascotTap" | "mascotCelebrate";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.34;
let lastSoundAt = 0;

function audioContext() {
  if (!context) {
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    context = new AudioContextCtor();
    master = context.createGain();
    master.gain.value = volume * 0.18;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

export function setSoundPreferences(nextEnabled: boolean, nextVolume: number) {
  enabled = nextEnabled;
  volume = Math.max(0, Math.min(1, nextVolume));
  if (master && context) master.gain.setTargetAtTime(volume * 0.18, context.currentTime, 0.02);
}

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, gainValue = 0.32, type: OscillatorType = "sine", endFrequency?: number) {
  if (!master) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + Math.min(0.025, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain); gain.connect(master);
  oscillator.start(start); oscillator.stop(start + duration + 0.02);
}

function whoosh(ctx: AudioContext) {
  if (!master) return;
  const duration = 0.12;
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) samples[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1100, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + duration);
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(0.13, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  source.buffer = buffer;
  source.connect(filter); filter.connect(gain); gain.connect(master);
  source.start();
}

export function playSound(kind: SoundKind, force = false) {
  if (!enabled) return;
  const nowMs = performance.now();
  if (!force && nowMs - lastSoundAt < 80) return;
  lastSoundAt = nowMs;
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.008;
  if (kind === "flip") { whoosh(ctx); return; }
  if (kind === "correct") { tone(ctx, 659.25, now, 0.12, 0.26, "sine", 987.77); return; }
  if (kind === "wrong") { tone(ctx, 155.56, now, 0.14, 0.2, "sine", 123.47); return; }
  if (kind === "tick") { tone(ctx, 880, now, 0.045, 0.15, "square"); return; }
  if (kind === "mascotTap") { tone(ctx, 510, now, 0.075, 0.13, "sine", 680); return; }
  const notes = kind === "combo" ? [659.25, 783.99, 987.77]
    : kind === "critical" ? [1046.5, 1318.51, 1567.98]
    : kind === "level" ? [523.25, 659.25, 783.99, 1046.5]
    : kind === "perfect" ? [523.25, 659.25, 783.99, 1046.5, 1318.51]
    : kind === "finish" ? [783.99, 987.77, 1174.66]
    : kind === "mascotCelebrate" ? [698.46, 880, 1174.66]
    : [987.77, 1318.51, 987.77];
  notes.forEach((note, index) => tone(ctx, note, now + index * 0.075, 0.16, kind === "quest" || kind === "mascotCelebrate" ? 0.18 : 0.2, "sine"));
}
