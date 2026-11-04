import {$, $$, api, post, esc, h} from '../lib.js';
import {anim, pop, EASE} from '../motion.js';
import {burst, PALETTE} from '../fx.js';
import * as rewards from '../rewards.js';
import {go} from '../router.js';

const EXAMPLES = [
  'Σ (2n/(3n+1))^n: which test?',
  'Taylor series of e^x centered at 0, radius of convergence?',
  'Ball tossed up at 12 m/s: momentum after 0.5 s?',
  'Area inside r = 1 + cos θ',
  'LEFT JOIN vs INNER JOIN for students with no enrollments',
];

const TEMPLATE = `
<div class="view-head"><div><h2>Study Lab</h2><p>Tools for when the feed isn't enough: a Socratic tutor, quizzes, focus, and your weak spots.</p></div></div>
<div class="lab-grid">
  <section class="panel lab-box lab-tutor">
    <h3>✏️ Whiteboard tutor</h3>
    <canvas id="board" width="640" height="240" aria-label="Sketch pad"></canvas>
    <div class="row"><button class="btn small ghost" id="board-clear">Clear board</button><span class="muted small-note">Sketches go to the Meta tutor when it's on.</span></div>
    <textarea id="tutor-problem" rows="2" data-hook="tutor-input" placeholder="Type the problem, e.g. Σ (2n/(3n+1))^n: which test?"></textarea>
    <div class="examples" id="tutor-examples">${EXAMPLES.map(x => `<button class="chipbtn" data-example="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <button class="btn primary" id="tutor-go" data-hook="tutor-go">Walk me through it</button>
    <div id="tutor-out" data-hook="tutor-out"></div>
  </section>
  <section class="panel lab-box">
    <h3>📝 Quiz generator</h3>
    <div class="row"><label class="field">Deck <select id="quiz-deck" data-hook="quiz-deck"></select></label>
    <label class="field narrow">Questions <input id="quiz-count" type="number" value="5" min="1" max="20"></label></div>
    <button class="btn primary" id="quiz-go" data-hook="quiz-go">Generate quiz</button>
    <div id="quiz-out" data-hook="quiz-out"></div>
  </section>
  <section class="panel lab-box">
    <h3>📊 Still-cooking topics</h3>
    <div id="diag-out" data-hook="diagnostics"></div>
    <button class="btn" id="diag-targeted" data-hook="targeted-review">🎯 Targeted review</button>
  </section>
  <section class="panel lab-box">
    <h3>⏱️ Focus session</h3>
    <div class="focus-clock" id="focus-display" data-hook="focus-clock">25:00</div>
    <input id="focus-task" placeholder="One task. Only this is on screen in lock-in.">
    <div class="row"><label class="field narrow">Minutes <input id="focus-mins" type="number" value="25" min="1" max="120"></label>
    <button class="btn primary" id="focus-start" data-hook="focus-start">Start focus</button>
    <button class="btn" id="focus-done">Finish &amp; log</button></div>
    <p id="focus-stats" class="muted"></p>
  </section>
  <section class="panel lab-box lab-drop">
    <h3>📥 Notes into cards</h3>
    <p class="muted">Paste lecture notes or drop a PDF in Drop. You get a deck in seconds, with duplicates removed and topics tagged.</p>
    <button class="btn primary" data-go="drop">Open Drop</button>
  </section>
</div>`;

function setupBoard(){
  const board = $('#board'), ctx = board.getContext('2d');
  let drawing = false;
  const pos = e => { const r = board.getBoundingClientRect(); return [(e.clientX - r.left) * board.width / r.width, (e.clientY - r.top) * board.height / r.height]; };
  board.addEventListener('pointerdown', e => { drawing = true; board.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  board.addEventListener('pointermove', e => { if(!drawing) return; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#1d2435'; ctx.lineTo(...pos(e)); ctx.stroke(); });
  board.addEventListener('pointerup', () => { drawing = false; });
  $('#board-clear').addEventListener('click', () => ctx.clearRect(0, 0, board.width, board.height));
  return () => {
    const blank = ctx.getImageData(0, 0, board.width, board.height).data.every(v => v === 0);
    return blank ? null : board.toDataURL('image/png').split(',')[1];
  };
}

async function busy(btn, label, fn){
  const old = btn.innerHTML;
  btn.disabled = true; btn.textContent = label;
  try{ return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}

function revealStep(el){
  el.hidden = false;
  anim(el, [{opacity: 0, transform: 'translateY(10px)'}, {opacity: 1, transform: 'none'}], {duration: 320, easing: EASE.out});
}

async function runTutor(sketch){
  const problem = $('#tutor-problem').value.trim();
  const out = $('#tutor-out');
  if(!problem){
    out.innerHTML = '<p class="muted">Type the problem first, or tap one of the examples above.</p>';
    $('#tutor-problem').focus();
    return;
  }
  await busy($('#tutor-go'), 'Thinking it through…', async () => {
    const res = await post('/api/tutor', {problem, image_base64: sketch()});
    out.innerHTML = `<p class="row"><span class="source-tag ${res.source === 'meta-api' ? 'meta' : ''}">Source: ${esc(res.source)}</span><span class="muted">${esc(res.kind)}: one idea at a time, answer last.</span></p>` +
      res.steps.map((s, i) => `<div class="step" data-hook="tutor-step" ${i ? 'hidden' : ''}><b>${i + 1}</b><span>${esc(s.replace(/^Step \d+\s*[—–-]\s*/, ''))}</span></div>`).join('') +
      `<div class="row" id="tutor-ctrl"><button class="btn good" id="tutor-next" data-hook="tutor-next">Next step →</button><button class="btn ghost small" id="tutor-all">Show all</button></div>`;
    revealStep(out.querySelector('.step'));
  });
}

function nextStep(all){
  const hidden = $$('#tutor-out .step[hidden]');
  (all ? hidden : hidden.slice(0, 1)).forEach((el, i) => setTimeout(() => revealStep(el), i * 60));
  if(all || hidden.length <= 1) $('#tutor-ctrl').innerHTML = '<span class="muted">That\'s the whole walkthrough. Worth a flashcard? Drop your notes.</span>';
}

async function loadDecks(){
  const {decks} = await api('/api/decks');
  const sel = $('#quiz-deck'), prev = sel.value;
  sel.innerHTML = decks.filter(d => d.total > 0).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  if(prev) sel.value = prev;
}

async function runQuiz(){
  await busy($('#quiz-go'), 'Writing questions…', async () => {
    const res = await post('/api/quiz', {deck_id: +$('#quiz-deck').value, count: +$('#quiz-count').value || 5, seed: Date.now() % 100000});
    const out = $('#quiz-out');
    const state = {answered: 0, correct: 0, total: res.questions.length};
    out.innerHTML = `<p class="row"><span class="source-tag ${res.source === 'meta-api' ? 'meta' : ''}">Source: ${esc(res.source)}</span><span class="muted" id="quiz-score" data-hook="quiz-score">0 / ${state.total} answered</span></p>`;
    res.questions.forEach((q, qi) => {
      const div = h(`<div class="quiz-q" data-hook="quiz-question"><div class="quiz-front"><span class="chip">${esc(q.topic)}</span> <strong>Q${qi + 1}.</strong> ${esc(q.front)}</div></div>`);
      q.options.forEach(opt => {
        const b = h(`<button class="quiz-opt" data-hook="quiz-option"></button>`);
        b.textContent = opt;
        b.addEventListener('click', () => answer(div, b, q, opt, state));
        div.appendChild(b);
      });
      out.appendChild(div);
      anim(div, [{opacity: 0, transform: 'translateY(8px)'}, {opacity: 1, transform: 'none'}], {duration: 300, delay: qi * 50, easing: EASE.out, fill: 'backwards'});
    });
  });
}

async function answer(div, btn, q, opt, state){
  if(div.dataset.answered) return;
  div.dataset.answered = '1';
  div.querySelectorAll('.quiz-opt').forEach(x => { x.disabled = true; });
  const g = await post('/api/quiz/grade', {card_id: q.card_id, chosen: opt});
  state.answered++;
  if(g.correct){
    state.correct++;
    btn.classList.add('correct');
    pop(btn, 1.04, 320);
    const r = btn.getBoundingClientRect();
    burst(r.left + r.width * 0.85, r.top + r.height / 2, {count: 14, colors: PALETTE.good, speed: [120, 320]});
  } else {
    btn.classList.add('missed');
    div.querySelectorAll('.quiz-opt').forEach(x => { if(x.textContent === g.correct_answer) x.classList.add('correct'); });
  }
  const note = h(`<p class="quiz-note">${g.correct ? '✅ Nice.' : '🌱 Still cooking. Here\'s the answer:'} ${esc(g.correct_answer)}</p>`);
  div.appendChild(note);
  anim(note, [{opacity: 0}, {opacity: 1}], {duration: 240});
  $('#quiz-score').textContent = state.answered === state.total
    ? `${state.correct} / ${state.total} correct${state.correct === state.total ? ' 🎯 perfect' : ''}`
    : `${state.answered} / ${state.total} answered`;
  if(state.answered === state.total){
    $('#quiz-out').appendChild(h(`<div class="row"><button class="btn" id="quiz-review">🎯 Review my weak spots</button><button class="btn ghost" id="quiz-more">Another quiz</button></div>`));
    $('#quiz-review').addEventListener('click', () => go('feed', {targeted: true}));
    $('#quiz-more').addEventListener('click', runQuiz);
  }
  refreshDiagnostics();
  rewards.refresh();
}

export async function refreshDiagnostics(){
  const d = await api('/api/diagnostics');
  const out = $('#diag-out');
  const weak = d.weak_topics.filter(w => w.accuracy < 0.85);
  if(!weak.length){
    out.innerHTML = `<p class="muted">${d.weak_topics.length ? 'Nothing is struggling right now. Nice.' : 'No data yet.'} Take a quick quiz to find the topics that need heat.</p>
      <button class="btn small" id="diag-quiz">📝 Take a 5-question quiz</button>`;
    $('#diag-quiz').addEventListener('click', () => { $('#quiz-count').value = 5; runQuiz(); $('#quiz-go').scrollIntoView({behavior: 'smooth', block: 'center'}); });
    return;
  }
  out.innerHTML = weak.map(w => `<div class="diag-row"><span>🌱 <strong>${esc(w.topic)}</strong></span>
    <span class="diag-bar"><i style="transform:scaleX(${Math.max(0.04, w.accuracy)})"></i></span><span class="muted">${Math.round(w.accuracy * 100)}% · ${w.attempts}</span></div>`).join('');
}

let focusTimer = 0, focusSecs = 0;
const fmtClock = s => Math.floor(Math.max(s, 0) / 60) + ':' + String(Math.max(s, 0) % 60).padStart(2, '0');
function focusStart(){
  document.body.classList.add('lockin');
  focusSecs = (+$('#focus-mins').value || 25) * 60;
  $('#focus-display').textContent = fmtClock(focusSecs);
  clearInterval(focusTimer);
  focusTimer = setInterval(() => {
    focusSecs--;
    $('#focus-display').textContent = fmtClock(focusSecs);
    if(focusSecs <= 0){ clearInterval(focusTimer); focusDone(); }
  }, 1000);
}
async function focusDone(){
  clearInterval(focusTimer);
  document.body.classList.remove('lockin');
  const mins = +$('#focus-mins').value || 25;
  const res = await post('/api/focus', {minutes: mins, task: $('#focus-task').value});
  $('#focus-stats').textContent = `Logged ${mins} min. All-time focus: ${res.stats.reduce((a, s) => a + s.minutes, 0)} min.`;
  rewards.refresh();
}

export function mount(el){
  el.innerHTML = TEMPLATE;
  const sketch = setupBoard();
  $('#tutor-go').addEventListener('click', () => runTutor(sketch));
  $('#tutor-examples').addEventListener('click', e => {
    const b = e.target.closest('[data-example]');
    if(!b) return;
    $('#tutor-problem').value = b.dataset.example;
    runTutor(sketch);
  });
  $('#tutor-out').addEventListener('click', e => {
    if(e.target.closest('#tutor-next')) nextStep(false);
    else if(e.target.closest('#tutor-all')) nextStep(true);
  });
  $('#quiz-go').addEventListener('click', runQuiz);
  $('#diag-targeted').addEventListener('click', () => go('feed', {targeted: true}));
  $('#focus-start').addEventListener('click', focusStart);
  $('#focus-done').addEventListener('click', focusDone);
}

export function onShow(){
  loadDecks();
  refreshDiagnostics();
}
