import {$, api, post, params} from '../lib.js';
import {anim, EASE} from '../motion.js';
import {CardStack} from '../stack.js';
import * as rewards from '../rewards.js';
import {go} from '../router.js';

const COACH_KEY = 'munki.coach';
const SOURCES = {
  mix: () => ({url: '/api/feed?limit=30', label: 'Your mix: due cards first, then new.'}),
  deck: ({deckId, name}) => ({url: `/api/feed?deck_id=${deckId}&limit=30`, label: `Studying ${name || 'one deck'}.`, deckId, deckName: name}),
  targeted: () => ({url: '/api/feed?targeted=1&limit=20', label: 'Targeted review: your still-cooking topics.', finite: true}),
};

let stack, root, source = SOURCES.mix(), seen = new Set(), toppingUp = false;
let reviewChain = Promise.resolve();
const session = {cards: 0, knew: 0, best: 0};
let forceCritical = false;

const TEMPLATE = `
<div class="feed-layout">
  <aside class="rail rail-left">
    <h3>Today's quests</h3>
    <div class="quests" id="quests" data-hook="quests"></div>
  </aside>
  <div class="feed-center">
    <div class="stage" id="stage" data-hook="feed-stage"><div class="stack" id="stack"></div></div>
    <div class="grade-row">
      <button class="grade again" id="btn-again" data-hook="grade-again"><kbd>2</kbd><span data-plain="↩ Not yet">↩ Again</span></button>
      <button class="grade knew" id="btn-knew" data-hook="grade-knew"><span data-plain="✓ I knew it">✓ Knew it</span><kbd>1</kbd></button>
    </div>
    <div class="feed-actions">
      <button class="chipbtn" id="btn-shuffle" data-hook="shuffle">🔀 <span data-plain="New mix">Fresh mix</span></button>
      <button class="chipbtn" id="btn-targeted" data-hook="targeted">🎯 <span data-plain="Practice weak topics">Weak spots</span></button>
      <button class="chipbtn" data-go="drop">📥 <span>Drop notes</span></button>
      <button class="chipbtn" data-go="blitz">⚡ <span>60s Blitz</span></button>
    </div>
    <p class="feed-status" id="feed-status" data-hook="feed-status"></p>
  </div>
  <aside class="rail rail-right">
    <h3>This session</h3>
    <div class="session">
      <div class="stat"><span>Cards</span><b id="ss-cards">0</b></div>
      <div class="stat"><span>Knew it</span><b id="ss-knew">0</b></div>
      <div class="stat"><span>Best combo</span><b id="ss-best">0</b></div>
    </div>
    <div class="drop-cta"><strong>📥 Got lecture notes?</strong><p>Paste them or drop a PDF. Munki makes the deck in seconds.</p><button class="btn primary small" data-go="drop">Open Drop</button></div>
  </aside>
</div>`;

function status(text){ $('#feed-status').textContent = text; }

// ---------- first run coach ----------
const coachStep = () => localStorage.getItem(COACH_KEY) || 'tap';
function renderCoach(){
  $('#stage .coach')?.remove();
  const step = coachStep();
  if(step === 'done' || !stack.top) return;
  const el = document.createElement('div');
  el.className = 'coach' + (step === 'swipe' ? ' swipe' : '');
  el.innerHTML = `<div class="coach-hand" aria-hidden="true">👆</div><div class="coach-tip">${step === 'swipe' ? 'Swipe right if you knew it, left if not' : '👋 You\'re already studying. Tap the card to flip it.'}</div>`;
  $('#stage').appendChild(el);
}
function advanceCoach(event){
  const step = coachStep();
  if(step === 'tap' && event === 'flip') localStorage.setItem(COACH_KEY, 'swipe');
  else if(event === 'grade') localStorage.setItem(COACH_KEY, 'done');
  else return;
  renderCoach();
}

// ---------- end-of-feed ----------
function renderEnd(){
  if(source.deckId && !session.cards && !seen.size){
    return `<div class="card-text">This deck is empty.</div><p class="muted">Drop some notes into it and the cards land here.</p>
      <div class="end-actions"><button class="btn primary" data-end="drop">📥 Drop notes</button><button class="btn" data-end="mix">🔀 Back to my mix</button></div>`;
  }
  return `<div class="card-text">🎉 You cleared this mix.</div><p class="muted">Everything you graded is scheduled. Want more?</p>
    <div class="end-actions"><button class="btn primary" data-end="mix">🔀 Fresh mix</button><button class="btn" data-end="drop">📥 Drop notes</button><button class="btn" data-end="blitz">⚡ Blitz</button></div>`;
}
const END_ACTIONS = {
  mix: () => load(SOURCES.mix(), {reset: true}),
  drop: () => go('drop', source.deckId ? {deckId: source.deckId} : undefined),
  blitz: () => go('blitz'),
};

// ---------- loading ----------
async function load(next = source, {reset = false} = {}){
  source = next;
  if(reset) seen = new Set();
  status('Shuffling your mix…');
  const {cards} = await api(source.url);
  const fresh = cards.filter(c => !seen.has(c.id));
  fresh.forEach(c => seen.add(c.id));
  if(forceCritical && fresh[0]){ fresh[0].critical = true; forceCritical = false; }
  stack.setCards(fresh);
  status(fresh.length ? `${source.label} ${fresh.length} cards ready.` : '');
  renderCoach();
}

async function topUp(){
  if(toppingUp || source.finite || stack.remaining > 6) return;
  toppingUp = true;
  try{
    const {cards} = await api(source.url);
    const fresh = cards.filter(c => !seen.has(c.id));
    fresh.forEach(c => seen.add(c.id));
    if(fresh.length) stack.append(fresh);
    else source = {...source, finite: true};
  } finally { toppingUp = false; }
}

// ---------- grading ----------
function onGrade(card, grade, rect){
  session.cards++;
  if(grade === 'knew') session.knew++;
  $('#ss-cards').textContent = session.cards;
  $('#ss-knew').textContent = session.knew;
  advanceCoach('grade');
  const origin = {x: grade === 'knew' ? rect.right - rect.width * 0.18 : rect.left + rect.width * 0.18, y: rect.top + rect.height * 0.42};
  const stage = $('#stage');
  reviewChain = reviewChain
    .then(() => post('/api/review', {card_id: card.id, grade, critical: !!card.critical, mode: 'feed'}))
    .then(res => {
      session.best = Math.max(session.best, res.combo);
      $('#ss-best').textContent = session.best;
      rewards.onReview(res, {grade, critical: !!card.critical, origin, stage});
    })
    .catch(err => { console.error(err); status('Could not save that grade. Check the server and try again.'); });
  topUp();
}

function pressFeedback(btn){
  anim(btn, [{transform: 'scale(1)'}, {transform: 'scale(.95)', offset: .3}, {transform: 'scale(1)'}], {duration: 220, easing: EASE.out});
}

export function grade(g){
  if(!stack.top) return;
  pressFeedback(g === 'knew' ? $('#btn-knew') : $('#btn-again'));
  stack.grade(g);
}

export function mount(el){
  root = el;
  root.innerHTML = TEMPLATE;
  stack = new CardStack($('#stack'), {
    onGrade,
    onFlip: (_card, on) => { if(on) advanceCoach('flip'); },
    renderEnd,
  });
  $('#stack').addEventListener('click', e => {
    const b = e.target.closest('[data-end]');
    if(b) END_ACTIONS[b.dataset.end]();
  });
  $('#btn-knew').addEventListener('click', () => grade('knew'));
  $('#btn-again').addEventListener('click', () => grade('again'));
  $('#btn-shuffle').addEventListener('click', () => load(SOURCES.mix(), {reset: true}));
  $('#btn-targeted').addEventListener('click', () => load(SOURCES.targeted(), {reset: true}));
  forceCritical = params.get('critical') === '1';
  rewards.renderQuests(rewards.getSnapshot());
  load(SOURCES.mix());
}

export function onShow(arg){
  if(arg?.cards){
    arg.cards.forEach(c => seen.add(c.id));
    source = arg.deckId ? SOURCES.deck(arg) : source;
    stack.prepend(arg.cards);
    status(`${arg.cards.length} fresh cards from Drop are up first.`);
    renderCoach();
  } else if(arg?.deckId){
    load(SOURCES.deck(arg), {reset: true});
  } else if(arg?.targeted){
    load(SOURCES.targeted(), {reset: true});
  }
  if(stack.topEl && !matchMedia('(hover: none)').matches) stack.topEl.focus({preventScroll: true});
}

const KEYS = {
  ' ': () => stack.flip(),
  '1': () => grade('knew'),
  'ArrowRight': () => grade('knew'),
  '2': () => grade('again'),
  'ArrowLeft': () => grade('again'),
};
export function onKey(e){
  const fn = KEYS[e.key];
  if(!fn) return;
  e.preventDefault();
  if(e.repeat) return;
  fn();
}

export function setForceCritical(){ forceCritical = true; }
export const reload = () => load(source, {reset: true});
