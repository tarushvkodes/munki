// Munki frontend — feed-first, keyboard-driven, zero decisions before card 1.
// Vanilla JS, no build step. Sound is OFF unless the user enables it.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const api = async (path, opts={}) => {
  const r = await fetch(path, {headers:{'Content-Type':'application/json'}, ...opts});
  return r.json();
};
let feed=[], idx=0, flipped=false, soundOn=false, grading=false;

// ---------- tiny sound engine (WebAudio, no assets, off by default) ----------
let audioCtx = null;
function tone(freq, at, dur=0.08, type='sine', vol=0.045){
  const t = audioCtx.currentTime + at;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur);
}
function sfx(name){
  if(!soundOn) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    if(name === 'knew'){ tone(587, 0); tone(880, 0.07); }
    else if(name === 'again'){ tone(233, 0, 0.11, 'triangle', 0.035); }
    else if(name === 'critical'){ tone(1319, 0, 0.06); tone(1760, 0.05, 0.09); }
    else if(name === 'levelup'){ [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.12)); }
  }catch(e){ /* sound is garnish — never let it break grading */ }
}

// ---------- HUD / gamification ----------
let prevMult = 1;
async function refreshHUD(){
  const g = await api('/api/gamification');
  $('#hud-level').textContent = 'Lv ' + g.level;
  $('#hud-xp').textContent = g.total_xp + ' XP';
  const mult = g.combo>=20?5:g.combo>=10?3:g.combo>=5?2:1;
  $('#hud-combo').textContent = 'Combo ×' + mult + ' (' + g.combo + ')';
  if(mult > prevMult){
    const pill = $('#hud-combo');
    pill.classList.remove('pulse'); void pill.offsetWidth; pill.classList.add('pulse');
  }
  prevMult = mult;
  $('#hud-streak').textContent = '🔥 ' + g.streak + ' day streak';
  $('#xpfill').style.width = Math.round(100*g.level_progress.into/g.level_progress.span) + '%';
  $('#blitz-best').textContent = g.blitz_best;
  $('#quests').innerHTML = g.quests.map(q =>
    `<div class="quest ${q.done?'done':''}">${q.done?'✅':'🎯'} ${esc(q.label)} — ${q.progress}/${q.target} (+${q.xp} XP)` +
    `<span class="qbar"><i style="width:${Math.round(100*q.progress/q.target)}%"></i></span></div>`).join('')
    + (g.perfect_day ? '<div class="quest done">🌟 Perfect day!</div>' : '');
}
function floater(text, crit=false){
  const host = $('#xp-floater');
  const f = document.createElement('span');
  f.className = 'floater' + (crit ? ' crit' : '');
  f.textContent = text;
  f.style.left = (44 + Math.random()*12) + '%';
  host.appendChild(f);
  while(host.children.length > 3) host.firstChild.remove();
  setTimeout(() => f.remove(), 1000);  // backstop: animationend may not fire under reduced-motion
}
function celebrate(){
  const c = $('#confetti');
  c.innerHTML = Array.from({length:24},()=>`<span style="left:${Math.random()*100}%">🎉</span>`).join('');
  const lu = $('#levelup'); lu.hidden = false; setTimeout(()=>{lu.hidden=true; c.innerHTML='';}, 1800);
}

// ---------- Feed ----------
async function loadFeed(url='/api/feed?limit=30'){
  $('#feed-status').textContent = 'Shuffling your mix…';
  $('#feed-card').classList.add('loading');
  const data = await api(url); feed = data.cards; idx = 0;
  $('#feed-card').classList.remove('loading');
  showCard();
  $('#feed-status').textContent = feed.length ? feed.length + ' cards in this mix — due cards first, then new.' : 'No cards here yet.';
}
function showCard(){
  flipped = false;
  const card = $('#feed-card');
  card.classList.remove('flipped', 'leaving-l', 'leaving-r');
  card.setAttribute('aria-pressed', 'false');
  const c = feed[idx];
  if(!c){
    $('#fc-meta').innerHTML = ''; $('#fc-critical').hidden = true;
    $('#fc-front').textContent = 'All caught up 🎉 — shuffle for another round.';
    $('#fc-back').textContent = '';
    return;
  }
  card.classList.toggle('critical', !!c.critical);
  $('#fc-critical').hidden = !c.critical;
  $('#fc-meta').innerHTML =
    `<span class="chip deck">${esc(c.deck_name || '')}</span> <span class="chip">${esc(c.topic)}</span> ` +
    `<span class="chip ghost">${c.repetitions ? 'review' : 'new'}</span>`;
  $('#fc-front').textContent = c.front;
  $('#fc-back').textContent = c.back;
  card.classList.remove('entering'); void card.offsetWidth; card.classList.add('entering');
}
function flip(){
  if(!feed[idx]) return;
  flipped = !flipped;
  $('#feed-card').classList.toggle('flipped', flipped);
  $('#feed-card').setAttribute('aria-pressed', String(flipped));
}
async function grade(g){
  const c = feed[idx];
  if(!c || grading) return;             // double-tap guard: one review per card, ever
  grading = true;
  if(!flipped) flip();
  const card = $('#feed-card');
  card.classList.add(g === 'knew' ? 'leaving-r' : 'leaving-l');
  try{
    const res = await api('/api/review', {method:'POST', body: JSON.stringify({card_id:c.id, grade:g, critical:!!c.critical})});
    floater('+' + res.xp_gained + ' XP' + (res.multiplier>1 ? ' (combo ×'+res.multiplier+')' : ''), !!c.critical);
    sfx(res.leveled_up ? 'levelup' : c.critical ? 'critical' : g);
    if(res.leveled_up) celebrate();
    refreshHUD();
    idx++;
    setTimeout(() => { showCard(); grading = false; }, 170);
  }catch(e){
    card.classList.remove('leaving-l', 'leaving-r');
    grading = false;
  }
}
$('#feed-card').addEventListener('click', flip);
$('#btn-knew').addEventListener('click', ()=>grade('knew'));
$('#btn-again').addEventListener('click', ()=>grade('again'));
$('#btn-shuffle').addEventListener('click', ()=>loadFeed('/api/feed?limit=30'));
$('#btn-targeted').addEventListener('click', ()=>loadFeed('/api/feed?targeted=1&limit=20'));

// ---------- Blitz ----------
let blitz = null;
async function blitzStart(){
  if(blitz && !blitz.ended) blitz.end(true);   // never leak a previous round's timer
  const data = await api('/api/feed?limit=60');
  let cards = data.cards, i = 0, score = 0, seen = 0, left = 60;
  const state = {ended:false};
  $('#blitz-card').hidden = false; $('#blitz-start').hidden = true; $('#blitz-again-btn').hidden = true;
  const show = () => {
    if(i >= cards.length){ end(); return; }
    $('#blitz-front').textContent = cards[i].front; $('#blitz-back').textContent = cards[i].back; $('#blitz-back').hidden = true;
    $('#blitz-score').textContent = 'Score: ' + score + ' XP · ' + seen + ' cards';
  };
  const gradeB = async g => {
    if(state.ended || i >= cards.length) return;
    const c = cards[i];
    const res = await api('/api/review', {method:'POST', body: JSON.stringify({card_id:c.id, grade:g, critical:!!c.critical, mode:'blitz'})});
    score += res.xp_gained; seen++; i++;
    sfx(g === 'knew' ? 'knew' : 'again');
    show();
  };
  const end = async (silent=false) => {
    if(state.ended) return;
    state.ended = true;
    clearInterval(timer);
    $('#blitz-card').hidden = true; $('#blitz-again-btn').hidden = false; $('#blitz-start').hidden = false;
    $('#blitz-timer').classList.remove('urgent');
    if(silent) return;
    const res = await api('/api/blitz', {method:'POST', body: JSON.stringify({score, cards: seen})});
    $('#blitz-score').textContent = '⏱ Time! Score: ' + score + ' XP' + (res.is_personal_best ? ' — NEW PERSONAL BEST 🏆' : ' · Best: ' + res.personal_best);
    if(res.is_personal_best) sfx('levelup');
    refreshHUD();
  };
  const tick = () => {
    $('#blitz-timer').textContent = left;
    $('#blitz-bar-fill').style.width = (left/60*100) + '%';
    $('#blitz-timer').classList.toggle('urgent', left <= 10);
  };
  tick();
  const timer = setInterval(()=>{ left--; tick(); if(left<=0) end(); }, 1000);
  blitz = {gradeB, end, get ended(){ return state.ended; }};
  $('#blitz-front').onclick = () => { $('#blitz-back').hidden = false; };
  show();
}
$('#blitz-start').addEventListener('click', blitzStart);
$('#blitz-again-btn').addEventListener('click', blitzStart);
$('#blitz-knew').addEventListener('click', ()=>blitz && blitz.gradeB('knew'));
$('#blitz-again').addEventListener('click', ()=>blitz && blitz.gradeB('again'));

// ---------- busy-button helper (lab actions) ----------
async function busy(btn, label, fn){
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try{ return await fn(); }
  finally{ btn.disabled = false; btn.textContent = old; }
}

// ---------- Lab: tutor / whiteboard ----------
const board = $('#board'), bctx = board.getContext('2d'); let drawing = false;
const pos = e => { const r = board.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e;
  return [(t.clientX-r.left) * board.width/r.width, (t.clientY-r.top) * board.height/r.height]; };
board.addEventListener('pointerdown', e => { drawing = true; bctx.beginPath(); const [x,y]=pos(e); bctx.moveTo(x,y); });
board.addEventListener('pointermove', e => { if(!drawing) return; const [x,y]=pos(e); bctx.lineWidth=2.5; bctx.lineTo(x,y); bctx.stroke(); });
board.addEventListener('pointerup', ()=> drawing = false);
$('#board-clear').addEventListener('click', ()=> bctx.clearRect(0,0,board.width,board.height));
$('#tutor-go').addEventListener('click', async () => {
  const problem = $('#tutor-problem').value.trim();
  if(!problem){ $('#tutor-out').innerHTML = '<p>Type the problem first (the board sketch is sent too when the Meta API is on).</p>'; return; }
  const blank = bctx.getImageData(0,0,board.width,board.height).data.every(v => v===0);
  const img = blank ? null : board.toDataURL('image/png').split(',')[1];
  await busy($('#tutor-go'), 'Thinking it through…', async () => {
    const res = await api('/api/tutor', {method:'POST', body: JSON.stringify({problem, image_base64: img})});
    $('#tutor-out').innerHTML = '<p class="source-tag">Source: ' + esc(res.source) + ' · ' + esc(res.kind) + ' — steps appear one idea at a time; the final answer comes last, on purpose.</p>'
      + res.steps.map(s => `<div class="step">${esc(s)}</div>`).join('');
  });
});

// ---------- Lab: quiz ----------
async function loadDecks(){
  const {decks} = await api('/api/decks');
  $('#quiz-deck').innerHTML = decks.filter(d=>d.slug!=='inbox').map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');
  $('#deck-list').innerHTML = decks.map(d =>
    `<div class="deck-row"><div class="ring" style="--p:${d.mastery_pct}"><i>${d.mastery_pct}%</i></div>
     <div><strong>${esc(d.name)}</strong><br><span class="source-tag">${d.total} cards · ${d.mature} mature · ${d.due} due · topics: ${esc(d.topics.join(', '))}</span></div>
     <button onclick="studyDeck(${d.id})">Study this deck</button></div>`).join('');
}
window.studyDeck = id => { switchView('feed'); loadFeed('/api/feed?deck_id=' + id + '&limit=30'); };
$('#quiz-go').addEventListener('click', async () => {
  await busy($('#quiz-go'), 'Writing questions…', async () => {
    const res = await api('/api/quiz', {method:'POST', body: JSON.stringify({deck_id: +$('#quiz-deck').value, count: +$('#quiz-count').value, seed: Date.now()%100000})});
    const out = $('#quiz-out');
    out.innerHTML = '<p class="source-tag">Source: ' + esc(res.source) + '</p>';
    res.questions.forEach((q, qi) => {
      const div = document.createElement('div'); div.className = 'quiz-q';
      div.innerHTML = `<strong>Q${qi+1} (${esc(q.topic)}):</strong> ${esc(q.front)}`;
      q.options.forEach(opt => {
        const b = document.createElement('button'); b.className = 'quiz-opt'; b.textContent = opt;
        b.onclick = async () => {
          if(div.dataset.answered) return;   // one graded attempt per question — diagnostics stay honest
          div.dataset.answered = '1';
          div.querySelectorAll('.quiz-opt').forEach(x => x.disabled = true);
          const g = await api('/api/quiz/grade', {method:'POST', body: JSON.stringify({card_id: q.card_id, chosen: opt})});
          b.classList.toggle('correct', g.correct);
          if(!g.correct){
            div.querySelectorAll('.quiz-opt').forEach(x => { if(x.textContent === g.correct_answer) x.classList.add('correct'); });
          }
          const note = document.createElement('p');
          note.textContent = (g.correct ? '✅ Correct — ' : 'Still cooking 🌱 — the right answer: ') + g.correct_answer;
          div.appendChild(note); refreshDiagnostics();
        };
        div.appendChild(b);
      });
      out.appendChild(div);
    });
  });
});

// ---------- Lab: diagnostics ----------
async function refreshDiagnostics(){
  const d = await api('/api/diagnostics');
  $('#diag-out').innerHTML = d.weak_topics.length
    ? d.weak_topics.map(w => `<div class="step">🌱 <strong>${esc(w.topic)}</strong> — ${Math.round(w.accuracy*100)}% across ${w.attempts} tries. Still cooking, not failing.</div>`).join('')
    : 'Grade some cards and weak topics will rank here.';
}
$('#diag-targeted').addEventListener('click', ()=>{ switchView('feed'); loadFeed('/api/feed?targeted=1&limit=20'); });

// ---------- Lab: focus ----------
let focusTimer = null, focusSecs = 0;
const fmtClock = s => Math.floor(Math.max(s,0)/60) + ':' + String(Math.max(s,0)%60).padStart(2,'0');
$('#focus-start').addEventListener('click', () => {
  document.body.classList.add('lockin');
  focusSecs = (+$('#focus-mins').value || 25) * 60;
  $('#focus-display').textContent = fmtClock(focusSecs);
  clearInterval(focusTimer);
  focusTimer = setInterval(() => { focusSecs--;
    $('#focus-display').textContent = fmtClock(focusSecs);
    if(focusSecs <= 0){ clearInterval(focusTimer); $('#focus-done').click(); } }, 1000);
});
$('#focus-done').addEventListener('click', async () => {
  clearInterval(focusTimer); document.body.classList.remove('lockin');
  const mins = +$('#focus-mins').value || 25;
  const res = await api('/api/focus', {method:'POST', body: JSON.stringify({minutes: mins, task: $('#focus-task').value})});
  $('#focus-stats').textContent = 'Logged ' + mins + ' min. Total focus all-time: ' + res.stats.reduce((a,s)=>a+s.minutes,0) + ' min.';
  refreshHUD();
});

// ---------- Lab: notes ----------
$('#notes-go').addEventListener('click', async () => {
  await busy($('#notes-go'), 'Reading your notes…', async () => {
    const res = await api('/api/notes/cards', {method:'POST', body: JSON.stringify({text: $('#notes-text').value})});
    const out = $('#notes-out');
    out.innerHTML = '<p class="source-tag">Source: ' + esc(res.source) + ' · ' + res.cards.length + ' candidate cards — tap Add to put one in your Inbox deck.</p>';
    res.cards.forEach(c => {
      const div = document.createElement('div'); div.className = 'step';
      div.innerHTML = `<strong>${esc(c.front)}</strong><br>${esc(c.back)}`;
      const b = document.createElement('button'); b.textContent = 'Add to Inbox';
      b.onclick = async () => { await api('/api/cards', {method:'POST', body: JSON.stringify({...c, deck_slug:'inbox'})}); b.textContent = 'Added ✓'; b.disabled = true; loadDecks(); };
      div.appendChild(b); out.appendChild(div);
    });
  });
});

// ---------- Plan ----------
async function loadPlan(){
  const [{deadlines}, plan] = await Promise.all([api('/api/deadlines'), api('/api/plan')]);
  $('#deadline-list').innerHTML = '<table><tr><th>When</th><th>Deadline</th><th>Deck</th><th></th></tr>' +
    deadlines.map(d => `<tr><td>${esc(d.date)}</td><td>${esc(d.title)}</td><td>${esc(d.deck_slug||'')}</td>
      <td><button onclick="delDeadline(${d.id})">Delete</button></td></tr>`).join('') + '</table>';
  $('#plan-out').innerHTML = plan.days.map(d =>
    `<div class="step"><strong>${esc(d.date)}</strong> — ${esc(d.action)} (~${d.suggested_minutes} min)` +
    (d.deadlines_today.length ? ' · 📌 ' + d.deadlines_today.map(esc).join(', ') : '') + '</div>').join('');
}
window.delDeadline = async id => { await api('/api/deadlines/' + id, {method:'DELETE'}); loadPlan(); };
$('#deadline-form').addEventListener('submit', async e => {
  e.preventDefault();
  await api('/api/deadlines', {method:'POST', body: JSON.stringify({title: $('#dl-title').value, date: $('#dl-date').value, deck_slug: $('#dl-deck').value || null})});
  loadPlan();
});

// ---------- Nav / keyboard / settings ----------
function switchView(name){
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if(name === 'plan') loadPlan(); if(name === 'decks') loadDecks(); if(name === 'lab') refreshDiagnostics();
}
document.querySelectorAll('.navbtn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
document.addEventListener('keydown', e => {
  if(e.target.matches('input, textarea, select')) return;
  if(!$('#view-feed').classList.contains('active')){
    if($('#view-blitz').classList.contains('active') && blitz){
      if(e.code === 'Space'){ e.preventDefault(); $('#blitz-back').hidden = false; }
      if(e.key === '1') blitz.gradeB('knew'); if(e.key === '2') blitz.gradeB('again');
    }
    return;
  }
  if(e.code === 'Space'){ e.preventDefault(); flip(); }
  else if(e.key === '1') grade('knew');
  else if(e.key === '2') grade('again');
  else if(e.key === 'ArrowRight') grade('knew');
  else if(e.key === 'ArrowLeft') grade('again');
});
function applyPlain(on){
  document.querySelectorAll('[data-plain]').forEach(el => {
    if(el.dataset.full === undefined) el.dataset.full = el.textContent;
    el.textContent = on ? el.dataset.plain : el.dataset.full;
  });
}
async function applySettings(){
  const s = await api('/api/settings');
  $('#tgl-plain').checked = !!s.plain_language; $('#tgl-font').checked = !!s.dyslexia_font; $('#tgl-sound').checked = !!s.sound;
  soundOn = !!s.sound;
  document.body.classList.toggle('dyslexia', !!s.dyslexia_font);
  applyPlain(!!s.plain_language);
}
const saveSettings = () => {
  soundOn = $('#tgl-sound').checked;
  document.body.classList.toggle('dyslexia', $('#tgl-font').checked);
  applyPlain($('#tgl-plain').checked);
  return api('/api/settings', {method:'PUT', body: JSON.stringify({
    plain_language: $('#tgl-plain').checked, dyslexia_font: $('#tgl-font').checked, sound: $('#tgl-sound').checked})});
};
['tgl-plain','tgl-font','tgl-sound'].forEach(id => $('#'+id).addEventListener('change', saveSettings));

// ---------- boot: feed first, zero decisions ----------
applySettings(); refreshHUD(); loadFeed(); loadDecks(); refreshDiagnostics();
