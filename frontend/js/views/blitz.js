import {$, api, post, sleep} from '../lib.js';
import {anim, pop, countUp, EASE} from '../motion.js';
import {confetti, burst, PALETTE} from '../fx.js';
import {CardStack} from '../stack.js';
import * as rewards from '../rewards.js';

const ROUND_SECONDS = 60;
let stack, round = null, best = 0;

const TEMPLATE = `
<div class="view-head">
  <div><h2 data-plain="⚡ Blitz: one minute, as many cards as you can">⚡ Blitz</h2><p>60 seconds. As many cards as you can. Score = XP earned.</p></div>
  <div class="blitz-best">Personal best <b id="blitz-best">0</b> XP</div>
</div>
<div class="blitz-wrap">
  <div class="blitz-hud">
    <div class="blitz-timer" id="blitz-timer" data-hook="blitz-timer">60</div>
    <div class="blitz-bar"><i id="blitz-bar-fill"></i></div>
    <div class="blitz-score">Score <b id="blitz-score" data-hook="blitz-score">0</b> <span class="muted">· <span id="blitz-count">0</span> cards</span></div>
  </div>
  <div class="stage blitz-stage" id="blitz-stage">
    <div class="stack" id="blitz-stack"></div>
    <div class="blitz-panel" id="blitz-panel">
      <div class="blitz-panel-inner" id="blitz-panel-inner"></div>
    </div>
  </div>
  <div class="grade-row" id="blitz-grades" hidden>
    <button class="grade again" id="blitz-again"><kbd>2</kbd>↩ Again</button>
    <button class="grade knew" id="blitz-knew">✓ Knew it<kbd>1</kbd></button>
  </div>
</div>`;

function panel(html){
  $('#blitz-panel').hidden = false;
  $('#blitz-panel-inner').innerHTML = html;
  anim($('#blitz-panel-inner'), [{opacity: 0, transform: 'scale(.94) translateY(10px)'}, {opacity: 1, transform: 'none'}], {duration: 360, easing: EASE.spring});
}

function startPanel(){
  panel(`<div class="blitz-emoji">⚡</div><h3>Ready for a sprint?</h3><p class="muted">Tap or swipe through as many cards as you can in 60 seconds.</p>
    <button class="btn primary big-cta" id="blitz-start" data-hook="blitz-start">Start Blitz</button>`);
  $('#blitz-start').addEventListener('click', start);
}

async function countdown(r){
  for(const n of ['3', '2', '1', 'GO!']){
    if(r.ended) return;
    $('#blitz-panel-inner').innerHTML = `<div class="blitz-count">${n}</div>`;
    anim($('#blitz-panel-inner').firstElementChild, [
      {opacity: 0, transform: 'scale(1.8)'}, {opacity: 1, transform: 'scale(.95)', offset: .4}, {opacity: 1, transform: 'scale(1)', offset: .7}, {opacity: 0, transform: 'scale(.9)'},
    ], {duration: 520, easing: EASE.out, fill: 'forwards'});
    await sleep(n === 'GO!' ? 380 : 520);
  }
}

function tick(){
  const left = round.left;
  $('#blitz-timer').textContent = left;
  $('#blitz-timer').classList.toggle('urgent', left <= 10);
  $('#blitz-bar-fill').style.transform = `scaleX(${left / ROUND_SECONDS})`;
  if(left <= 10 && left > 0) pop($('#blitz-timer'), 1.12, 300);
}

// A round is live only between GO and time-up. Leaving during the countdown cancels it unsaved;
// leaving mid-round saves it. Every await re-checks the round it belongs to.
async function start(){
  if(round && !round.ended) return;
  const r = round = {score: 0, seen: 0, left: ROUND_SECONDS, ended: false, live: false, timer: 0, pending: []};
  const startBtn = $('#blitz-start');
  if(startBtn) startBtn.disabled = true;
  const data = await api('/api/feed?limit=60');
  if(r.ended) return;
  $('#blitz-score').textContent = '0';
  $('#blitz-count').textContent = '0';
  $('#blitz-bar-fill').style.transition = 'none';
  tick();
  void $('#blitz-bar-fill').offsetWidth;
  $('#blitz-bar-fill').style.transition = '';
  await countdown(r);
  if(r.ended) return;
  r.live = true;
  $('#blitz-panel').hidden = true;
  $('#blitz-grades').hidden = false;
  stack.setCards(data.cards);
  r.timer = setInterval(() => {
    r.left--;
    tick();
    if(r.left <= 0) end(r);
  }, 1000);
}

function onGrade(card, grade, rect){
  const r = round;
  if(!r || !r.live) return;
  const origin = {x: grade === 'knew' ? rect.right - rect.width * 0.18 : rect.left + rect.width * 0.18, y: rect.top + rect.height * 0.42};
  r.seen++;
  $('#blitz-count').textContent = r.seen;
  r.pending.push(post('/api/review', {card_id: card.id, grade, critical: !!card.critical, mode: 'blitz'}).then(res => {
    r.score += res.xp_gained;
    if(!r.live) return;
    countUp($('#blitz-score'), r.score, 300);
    pop($('#blitz-score'), 1.2, 300);
    rewards.onReview(res, {grade, critical: !!card.critical, origin, stage: $('#blitz-stage')});
  }).catch(err => console.error(err)));
}

async function end(r){
  if(r.ended) return;
  r.ended = true;
  clearInterval(r.timer);
  $('#blitz-timer').classList.remove('urgent');
  if(!r.live){
    startPanel();
    return;
  }
  r.live = false;
  $('#blitz-grades').hidden = true;
  stack.setCards([]);
  await Promise.all([Promise.allSettled(r.pending), sleep(250)]);
  const res = await post('/api/blitz', {score: r.score, cards: r.seen});
  best = res.personal_best;
  $('#blitz-best').textContent = best;
  panel(`<div class="blitz-emoji">${res.is_personal_best ? '🏆' : '⏱️'}</div>
    <h3>${res.is_personal_best ? 'New personal best!' : 'Time!'}</h3>
    <div class="blitz-final" id="blitz-final" data-hook="blitz-final">0</div>
    <p class="muted">${r.seen} cards in 60 seconds${res.is_personal_best ? '' : ` · best ${best} XP`}</p>
    <div class="end-actions"><button class="btn primary big-cta" id="blitz-again-btn">🔁 Run it back</button><button class="btn" data-go="feed">Back to feed</button></div>`);
  countUp($('#blitz-final'), r.score, 900);
  $('#blitz-again-btn').addEventListener('click', start);
  if(res.is_personal_best){
    rewards.sfx('levelup');
    setTimeout(() => confetti({origin: 'top', count: 150}), 300);
  } else if(r.score){
    const b = $('#blitz-final').getBoundingClientRect();
    burst(b.left + b.width / 2, b.top + b.height / 2, {count: 24, colors: PALETTE.gold});
  }
  rewards.refresh();
}

export function mount(el){
  el.innerHTML = TEMPLATE;
  stack = new CardStack($('#blitz-stack'), {onGrade, onEmpty: () => round?.live && end(round), renderEnd: null});
  $('#blitz-knew').addEventListener('click', () => stack.grade('knew'));
  $('#blitz-again').addEventListener('click', () => stack.grade('again'));
  startPanel();
}

export function onShow(){
  best = rewards.getSnapshot()?.blitz_best ?? best;
  $('#blitz-best').textContent = best;
  if(!round || round.ended) startPanel();
}

export function onHide(){
  if(round && !round.ended) end(round);
}

export function onKey(e){
  if(!round?.live){
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); if(!e.repeat) $('#blitz-start, #blitz-again-btn')?.click(); }
    return;
  }
  const map = {' ': () => stack.flip(), '1': () => stack.grade('knew'), 'ArrowRight': () => stack.grade('knew'), '2': () => stack.grade('again'), 'ArrowLeft': () => stack.grade('again')};
  if(map[e.key]){ e.preventDefault(); if(!e.repeat) map[e.key](); }
}

