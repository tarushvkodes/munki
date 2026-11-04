import {$, api, esc, h, sleep, announce} from './lib.js';
import {anim, pop, countUp, flyChip, rectCenter, isReduced, EASE} from './motion.js';
import {burst, confetti, ring, PALETTE} from './fx.js';

// Combo tiers come from the server (/api/gamification combo_tiers); the copy and colors are presentation only.
let tiers = [[5, 2], [10, 3], [20, 5]];
const TIER_STYLE = {
  1: {name: 'Warming up', palette: PALETTE.good, color: '#9aa4c2'},
  2: {name: 'On a roll', palette: PALETTE.cyan, color: '#4fd1ff'},
  3: {name: 'Locked in', palette: PALETTE.violet, color: '#a98bff'},
  5: {name: 'Unstoppable', palette: PALETTE.fire, color: '#ffb020'},
};

export function tierFor(combo){
  let mult = 1, floor = 0, next = tiers[0][0];
  for(const [at, m] of tiers){
    if(combo >= at){ mult = m; floor = at; next = null; }
    else { next = at; break; }
  }
  const fill = next === null ? 1 : (combo - floor) / (next - floor);
  return {mult, fill, next};
}

let snapshot = null;
let soundOn = false;
let audioCtx = null;
const queue = [];
let draining = false;

export const getSnapshot = () => snapshot;
export function setSound(on){ soundOn = on; }

function tone(freq, at, dur = 0.08, type = 'sine', vol = 0.045){
  const t = audioCtx.currentTime + at;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur);
}
const SOUNDS = {
  knew: () => { tone(587, 0); tone(880, 0.07); },
  again: () => tone(233, 0, 0.11, 'triangle', 0.035),
  critical: () => { tone(1319, 0, 0.06); tone(1760, 0.05, 0.09); },
  tier: () => [659, 880, 1175].forEach((f, i) => tone(f, i * 0.06, 0.1)),
  quest: () => [784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.14)),
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.12)),
};
export function sfx(name){
  if(!soundOn) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    SOUNDS[name]?.();
  }catch{ /* sound is garnish: never let it break grading */ }
}

// ---------- HUD ----------
function renderCombo(combo, animateTier){
  const meter = $('#hud-combo');
  const {mult, fill} = tierFor(combo);
  const prevMult = Number(meter.dataset.tier);
  meter.dataset.tier = mult;
  document.body.dataset.tier = mult;
  $('#combo-mult').textContent = '×' + mult;
  $('#combo-count').textContent = combo;
  $('#combo-fill').style.transform = `scaleX(${fill})`;
  if(animateTier && mult > prevMult) return mult;
  return 0;
}

function renderXP(g, {animate}){
  const xpEl = $('#hud-xp');
  if(animate) countUp(xpEl, g.total_xp); else xpEl.textContent = g.total_xp;
  $('#hud-level-num').textContent = g.level;
  const p = g.level_progress.span ? g.level_progress.into / g.level_progress.span : 0;
  $('#xpfill').style.transform = `scaleX(${p})`;
}
const syncXP = () => snapshot && renderXP(snapshot, {animate: true});

function renderStreak(n){
  $('#hud-streak-num').textContent = n;
  $('#hud-streak').classList.toggle('cold', !n);
  $('#hud-streak').title = n ? `${n}-day streak` : 'Study today to start a streak';
}

const QUEST_ICON = {graded: '🃏', best_combo: '🔥', blitz: '⚡', knew: '✓', focus_minutes: '⏱️', quizzes: '📝'};

export function renderQuests(g){
  const host = $('#quests');
  if(!host || !g) return;
  if(host.dataset.day !== g.date_key){
    host.dataset.day = g.date_key;
    host.innerHTML = g.quests.map(q => `<div class="quest" data-quest="${esc(q.key)}" data-hook="quest">
        <span class="q-icon">${QUEST_ICON[q.metric] || '🎯'}</span><span class="q-label">${esc(q.label)}</span><span class="q-xp">+${q.xp}</span>
        <span class="q-bar"><i></i></span><span class="q-count"></span><span class="q-shine"></span></div>`).join('') +
      `<div class="quest perfect" data-quest="perfect" hidden><span class="q-icon">🌟</span><span class="q-label">Perfect day!</span><span class="q-xp">+50</span></div>`;
  }
  for(const q of g.quests){
    const el = host.querySelector(`[data-quest="${q.key}"]`);
    if(!el) continue;
    el.classList.toggle('done', q.done);
    el.querySelector('.q-icon').textContent = q.done ? '✓' : (QUEST_ICON[q.metric] || '🎯');
    el.querySelector('.q-bar i').style.transform = `scaleX(${q.target ? q.progress / q.target : 0})`;
    el.querySelector('.q-count').textContent = q.done ? 'Done' : `${q.progress} / ${q.target}`;
  }
  host.querySelector('[data-quest="perfect"]').hidden = !g.perfect_day;
}

function render(g, {animate = false, deferXP = false} = {}){
  if(!deferXP) renderXP(g, {animate});
  renderCombo(g.combo, false);
  renderStreak(g.streak);
  renderQuests(g);
}

function diff(prev, next){
  const events = [];
  for(const q of next.quests){
    const before = prev.quests.find(x => x.key === q.key);
    if(q.done && before && !before.done) events.push({type: 'quest', quest: q});
  }
  if(next.perfect_day && !prev.perfect_day) events.push({type: 'perfect'});
  if(next.streak > prev.streak) events.push({type: 'streak', streak: next.streak});
  if(next.level > prev.level) events.push({type: 'level', level: next.level});
  return events;
}

export async function refresh({animate = true, deferXP = false} = {}){
  const next = await api('/api/gamification');
  next.date_key = next.quests.map(q => q.key).join('|');
  if(next.combo_tiers) tiers = next.combo_tiers;
  const prev = snapshot;
  snapshot = next;
  render(next, {animate: animate && !!prev, deferXP});
  if(prev && animate) diff(prev, next).forEach(ev => enqueue(() => MOMENTS[ev.type](ev)));
  return next;
}

// ---------- moments ----------
function enqueue(fn){
  queue.push(fn);
  if(!draining) drain();
}
async function drain(){
  draining = true;
  while(queue.length){
    const fn = queue.shift();
    try{ await fn(); }catch(e){ console.error(e); }
    await sleep(140);
  }
  draining = false;
}

export function toast({icon = '✨', title, sub = '', xp = '', kind = ''}){
  const host = $('#toasts');
  const el = h(`<div class="toast ${kind}"><span class="t-icon">${icon}</span><div><div>${esc(title)}</div>${sub ? `<div class="muted" style="font-size:13px;font-weight:600">${esc(sub)}</div>` : ''}</div>${xp ? `<span class="t-xp">${esc(xp)}</span>` : ''}</div>`);
  host.appendChild(el);
  while(host.children.length > 3) host.firstElementChild.remove();
  anim(el, [{opacity: 0, transform: 'translateY(-18px) scale(.94)'}, {opacity: 1, transform: 'none'}], {duration: 380, easing: EASE.spring});
  announce(title + (sub ? '. ' + sub : ''));
  setTimeout(() => {
    const a = anim(el, [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateY(-10px) scale(.97)'}], {duration: 220, easing: EASE.in, fill: 'forwards'});
    a.finished.then(() => el.remove(), () => el.remove());
  }, 2600);
  return el;
}

function xpToHud(from, html, className = ''){
  return new Promise(resolve => flyChip({from, toEl: $('#hud-xp-wrap'), html, className, onArrive: () => {
    syncXP();
    pop($('#hud-xp-wrap'), 1.14, 380);
    const c = rectCenter($('#hud-xp-wrap'));
    burst(c.x, c.y, {count: 8, colors: PALETTE.gold, speed: [80, 220], gravity: 300, life: [.3, .55], size: [2, 3.5]});
    resolve();
  }}));
}

const MOMENTS = {
  async quest({quest}){
    const el = document.querySelector(`[data-quest="${quest.key}"]`);
    const visible = el && el.offsetParent !== null;
    sfx('quest');
    if(visible){
      pop(el, 1.06, 460);
      pop(el.querySelector('.q-icon'), 1.5, 500);
      anim(el.querySelector('.q-shine'), [{opacity: 1, transform: 'translateX(-100%)'}, {opacity: 1, transform: 'translateX(100%)'}], {duration: 700, easing: EASE.inOut});
      const c = rectCenter(el);
      burst(c.x, c.y, {count: 26, colors: PALETTE.gold, speed: [160, 420]});
      ring(c.x, c.y, {color: '#3ddc97', radius: 110, width: 4});
    }
    toast({icon: '🏆', title: 'Quest complete', sub: quest.label, xp: `+${quest.xp} XP`, kind: 'quest'});
    const from = visible ? rectCenter(el) : rectCenter($('#toasts'));
    await xpToHud(from, `+${quest.xp} XP`);
  },
  async perfect(){
    sfx('levelup');
    confetti({origin: 'top', count: 160});
    toast({icon: '🌟', title: 'Perfect day!', sub: 'All three quests done', xp: '+50 XP', kind: 'perfect'});
    await sleep(900);
  },
  async streak({streak}){
    const el = $('#hud-streak');
    anim(el.querySelector('.flame'), [
      {transform: 'scale(1) rotate(0)'}, {transform: 'scale(1.7) rotate(-14deg)', offset: .3},
      {transform: 'scale(1.3) rotate(10deg)', offset: .55}, {transform: 'scale(1) rotate(0)'},
    ], {duration: 700, easing: EASE.out});
    pop(el, 1.12, 500);
    const c = rectCenter(el);
    burst(c.x, c.y, {count: 22, colors: PALETTE.fire, angle: Math.PI / 2, spread: 2.2, speed: [120, 360], gravity: 500});
    toast({icon: '🔥', title: streak === 1 ? 'Streak started' : `${streak}-day streak`, sub: 'Today counts. See you tomorrow.', kind: 'streak'});
    await sleep(700);
  },
  async level({level}){ await sleep(480); return showLevelUp(level); },
};

const LEVEL_LINES = [
  'Your brain just leveled. Keep the feed rolling.',
  'New level, same you, more knowledge.',
  'That is real progress, not a streak gimmick.',
  'Look at you go. One more card?',
];

export function showLevelUp(level){
  return new Promise(resolve => {
    const root = $('#levelup');
    $('#lu-num').textContent = level;
    $('#lu-sub').textContent = LEVEL_LINES[level % LEVEL_LINES.length];
    root.hidden = false;
    sfx('levelup');
    announce(`Level up! You reached level ${level}.`);
    anim(root.querySelector('.lu-backdrop'), [{opacity: 0}, {opacity: 1}], {duration: 260, easing: EASE.out});
    anim(root.querySelector('.lu-rays'), [{opacity: 0, transform: 'scale(.5) rotate(-20deg)'}, {opacity: 1, transform: 'scale(1) rotate(0)'}], {duration: 900, easing: EASE.out});
    anim(root.querySelector('.lu-kicker'), [{opacity: 0, transform: 'translateY(-16px)'}, {opacity: 1, transform: 'none'}], {duration: 380, delay: 80, easing: EASE.out, fill: 'backwards'});
    anim($('#lu-num'), [
      {opacity: 0, transform: 'scale(.35) rotate(-10deg)'},
      {opacity: 1, transform: 'scale(1.12) rotate(2deg)', offset: .55},
      {transform: 'scale(.97) rotate(0)', offset: .8},
      {opacity: 1, transform: 'scale(1)'},
    ], {duration: 760, delay: 120, easing: EASE.out, fill: 'backwards'});
    anim(root.querySelector('.lu-sub'), [{opacity: 0, transform: 'translateY(10px)'}, {opacity: 1, transform: 'none'}], {duration: 360, delay: 420, easing: EASE.out, fill: 'backwards'});
    anim(root.querySelector('.lu-go'), [{opacity: 0, transform: 'translateY(10px) scale(.96)'}, {opacity: 1, transform: 'none'}], {duration: 360, delay: 520, easing: EASE.out, fill: 'backwards'});
    setTimeout(() => confetti({origin: 'sides', count: 180}), 160);
    let closed = false;
    const close = () => {
      if(closed) return;
      closed = true;
      clearTimeout(timer);
      removeEventListener('keydown', onKey, true);
      const a = anim(root, [{opacity: 1}, {opacity: 0}], {duration: 220, easing: EASE.in});
      const fin = () => {
        root.hidden = true;
        pop($('#hud-level'), 1.3, 520);
        const c = rectCenter($('#hud-level'));
        ring(c.x, c.y, {color: '#d9ccff', radius: 60, width: 4});
        resolve();
      };
      a.finished.then(fin, fin);
    };
    const onKey = e => { e.preventDefault(); e.stopPropagation(); close(); };
    const timer = setTimeout(close, 3200);
    root.onclick = close;
    addEventListener('keydown', onKey, true);
  });
}

// ---------- per-grade feedback ----------
export function comboTierUp(mult, stage){
  const style = TIER_STYLE[mult] || TIER_STYLE[2];
  sfx('tier');
  pop($('#hud-combo'), 1.3, 520);
  const host = stage || document.body;
  const banner = h(`<div class="combo-banner" data-hook="combo-banner"><b>COMBO ×${mult}</b><span>${esc(style.name)}</span></div>`);
  banner.style.setProperty('--tier', style.color);
  host.appendChild(banner);
  const a = anim(banner, [
    {opacity: 0, transform: 'translate(-50%,-50%) scale(1.9)'},
    {opacity: 1, transform: 'translate(-50%,-50%) scale(.92)', offset: .28},
    {opacity: 1, transform: 'translate(-50%,-50%) scale(1.03)', offset: .45},
    {opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .78},
    {opacity: 0, transform: 'translate(-50%,-64%) scale(1)'},
  ], {duration: 1250, easing: 'linear', fill: 'forwards'});
  a.finished.then(() => banner.remove(), () => banner.remove());
  const c = rectCenter(banner);
  setTimeout(() => {
    ring(c.x, c.y, {color: style.color, radius: 260, width: 8, life: .7});
    burst(c.x, c.y, {count: mult >= 5 ? 70 : 46, colors: style.palette, speed: [300, 760], gravity: 700, life: [.6, 1.1], size: [3, 6.5]});
  }, 300);
}

// res is the /api/review response; ctx carries where the card left from.
export function onReview(res, {grade, critical, origin, stage}){
  const from = origin || rectCenter(stage);
  if(grade === 'knew'){
    burst(from.x, from.y, {count: critical ? 34 : 16, colors: critical ? PALETTE.crit : PALETTE.good,
      angle: -Math.PI / 4, spread: 2.4, speed: critical ? [260, 640] : [180, 440]});
    if(critical) ring(from.x, from.y, {color: '#ff6ad5', radius: 140, width: 5});
  }
  sfx(critical && grade === 'knew' ? 'critical' : grade);
  const html = `+${res.xp_gained} XP` + (res.multiplier > 1 ? ` <small>×${res.multiplier}</small>` : '');
  const chip = xpToHud(from, html, grade === 'again' ? 'calm' : critical && grade === 'knew' ? 'crit' : '');
  const tierUp = renderCombo(res.combo, true);
  if(tierUp) comboTierUp(tierUp, stage);
  announce(`Plus ${res.xp_gained} XP. Combo ${res.combo}.`);
  return Promise.all([chip, refresh({deferXP: true})]).then(syncXP);
}

export function initFromSnapshot(g){
  if(g.combo_tiers) tiers = g.combo_tiers;
  g.date_key = g.quests.map(q => q.key).join('|');
  snapshot = g;
  render(g);
}

export {isReduced};
