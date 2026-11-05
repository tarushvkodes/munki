import {$, $$, api, post, esc, h} from '../lib.js';
import {anim, pop, EASE, isReduced} from '../motion.js';
import {burst, PALETTE} from '../fx.js';
import * as rewards from '../rewards.js';
import {go} from '../router.js';

export const SAMPLE_NOTES = `# Lecture 14: Database Normalization

## Why normalize
Normalization is the process of organizing tables to reduce redundancy and update anomalies.
An update anomaly is a bug where changing one fact means editing many rows.

## Normal forms
- 1NF: every column holds atomic values and there are no repeating groups
- 2NF: in 1NF and every non-key column depends on the whole primary key
- 3NF: in 2NF and no non-key column depends on another non-key column
- BCNF: every determinant is a candidate key

## Keys
Candidate key: a minimal set of columns that uniquely identifies a row
Composite key - a primary key made of two or more columns
A surrogate key is a system-generated identifier with no business meaning.

## Dependencies
Functional dependency: A → B means each value of A determines exactly one value of B
Transitive dependency: A → B and B → C, so C depends on A through a non-key column

Q: Which normal form removes partial dependencies?
A: 2NF

## Denormalization
Denormalization means deliberately adding redundancy to make reads faster.
`;

const KIND_LABEL = {definition: 'definition', term: 'term', formula: 'formula', qa: 'Q&A', list: 'list', statement: 'fact'};
const DEBOUNCE_MS = 280;

let preview = null, pending = 0, debounce = 0, file = null, targetDeckId = null, decks = [];

const TEMPLATE = `
<div class="view-head">
  <div><h2>📥 Munki Drop</h2><p>Paste notes or drop a PDF, .txt, or .md. Your deck builds itself as you go.</p></div>
  <span class="source-tag" id="drop-engine" data-hook="drop-source">…</span>
</div>
<div class="drop-grid">
  <section class="drop-input panel">
    <div class="dropzone" id="dropzone" data-hook="drop-zone">
      <textarea id="drop-text" data-hook="drop-text" spellcheck="false" placeholder="Paste lecture notes, a study guide, or a syllabus…&#10;&#10;Lines like “Term: definition”, “X is Y”, “Q: … / A: …”, headings and bullet lists all become cards."></textarea>
      <div class="drop-file-chip" id="drop-file-chip" hidden></div>
    </div>
    <div class="drop-actions">
      <label class="btn" data-hook="drop-file-btn">📄 Choose a file<input type="file" id="drop-file" data-hook="drop-file" accept=".pdf,.txt,.md,.markdown" hidden></label>
      <button class="btn ghost" id="drop-sample" data-hook="drop-sample">✨ Try sample notes</button>
      <button class="btn ghost" id="drop-clear" data-hook="drop-clear" hidden>Clear</button>
    </div>
    <p class="muted drop-tip">Tip: drag a file anywhere on the page.</p>
  </section>
  <section class="drop-out">
    <div class="drop-status" id="drop-status" data-hook="drop-status"></div>
    <div class="drop-preview" id="drop-preview" data-hook="drop-preview">
      <div class="drop-empty" id="drop-empty">
        <div class="drop-empty-icon">🃏</div>
        <p><b>Your cards show up here.</b><br><span class="muted">Paste something on the left, or tap “Try sample notes”.</span></p>
      </div>
    </div>
  </section>
</div>
<div class="drop-bar" id="drop-bar" hidden>
  <label class="field">Deck <select id="drop-deck" data-hook="drop-deck"></select></label>
  <label class="field grow" id="drop-title-wrap">Name <input id="drop-title" data-hook="drop-title" maxlength="80"></label>
  <button class="btn primary drop-go" id="drop-study" data-hook="drop-study" disabled>Study these now</button>
</div>`;

function setEngine(){
  api('/api/health').then(hh => {
    const el = $('#drop-engine');
    el.textContent = hh.meta_configured ? '⚡ Meta AI (muse-spark)' : '🧩 Built-in extractor (offline)';
    el.classList.toggle('meta', hh.meta_configured);
  }).catch(() => {});
}

async function loadDecks(){
  ({decks} = await api('/api/decks'));
  const sel = $('#drop-deck');
  sel.innerHTML = '<option value="">✨ New deck</option>' + decks.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  sel.value = targetDeckId ? String(targetDeckId) : '';
  syncTitleField();
}

function syncTitleField(){ $('#drop-title-wrap').hidden = !!$('#drop-deck').value; }

function status(html){ $('#drop-status').innerHTML = html; }

function renderStatus(p){
  const s = p.stats;
  const parts = [`<b>${s.new}</b> new card${s.new === 1 ? '' : 's'}`];
  if(s.duplicates) parts.push(`${s.duplicates} already in your decks`);
  if(p.topics.length) parts.push(`${p.topics.length} topic${p.topics.length === 1 ? '' : 's'}`);
  if(s.pages) parts.push(`${s.pages} page${s.pages === 1 ? '' : 's'}`);
  status(`<span class="source-tag ${p.source === 'meta-api' ? 'meta' : ''}" data-hook="drop-source-label">${esc(p.source_label || p.source)}</span>
    <span>${parts.join(' · ')}</span>
    ${p.topics.length ? `<div class="drop-topics">${p.topics.slice(0, 8).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
    ${p.note ? `<p class="drop-note">${esc(p.note)}</p>` : ''}`);
}

function cardEl(c){
  return h(`<article class="drop-card ${c.duplicate ? 'dup' : ''}" data-hook="drop-card" data-key="${esc(c.front.toLowerCase())}">
    <div class="dc-meta"><span class="chip">${esc(c.topic)}</span><span class="chip ghost">${esc(KIND_LABEL[c.kind] || c.kind || 'card')}</span>${c.duplicate ? '<span class="chip dupchip">already have it</span>' : ''}</div>
    <div class="dc-front">${esc(c.front)}</div>
    <div class="dc-back">${esc(c.back)}</div>
  </article>`);
}

function renderCards(p){
  const host = $('#drop-preview');
  $('#drop-empty').hidden = p.cards.length > 0;
  const existing = new Map($$('.drop-card', host).map(el => [el.dataset.key, el]));
  const keep = new Set();
  let born = 0;
  let prevEl = null;
  for(const c of p.cards){
    const key = c.front.toLowerCase();
    keep.add(key);
    let el = existing.get(key);
    const isNew = !el;
    if(isNew) el = cardEl(c);
    if(prevEl) prevEl.after(el); else host.prepend(el);
    prevEl = el;
    if(isNew){
      const delay = Math.min(born++ * 38, 520);
      anim(el, [{opacity: 0, transform: 'translateY(18px) scale(.94)'}, {opacity: 1, transform: 'none'}], {duration: 380, delay, easing: EASE.spring, fill: 'backwards'});
    }
  }
  for(const [key, el] of existing){
    if(!keep.has(key)) el.remove();
  }
  if(!p.cards.length && p.note) $('#drop-empty').querySelector('p').innerHTML = `<b>No cards yet.</b><br><span class="muted">${esc(p.note)}</span>`;
}

function renderBar(p){
  const n = p ? p.stats.new : 0;
  $('#drop-bar').hidden = !p || !p.cards.length;
  const btn = $('#drop-study');
  btn.disabled = n === 0;
  btn.innerHTML = n ? `🚀 Study these ${n} now` : 'Nothing new to add';
  if(p && !$('#drop-title').dataset.touched) $('#drop-title').value = p.title || 'Pasted notes';
  $('#drop-clear').hidden = !p;
}

async function runPreview(form, label){
  const token = ++pending;
  status(`<span class="drop-spinner" aria-hidden="true"></span><span>${esc(label)}</span>`);
  try{
    const p = await api('/api/drop/preview', {method: 'POST', body: form});
    if(token !== pending) return;
    preview = p;
    renderStatus(p);
    renderCards(p);
    renderBar(p);
  }catch(err){
    if(token !== pending) return;
    preview = null;
    renderBar(null);
    status(`<span class="drop-error">${esc(err.message)}</span>`);
  }
}

function previewText(){
  const text = $('#drop-text').value;
  file = null;
  $('#drop-file-chip').hidden = true;
  if(!text.trim()){
    pending++;
    preview = null;
    $$('#drop-preview .drop-card').forEach(el => el.remove());
    $('#drop-empty').hidden = false;
    status('');
    renderBar(null);
    return;
  }
  const form = new FormData();
  form.append('text', text);
  runPreview(form, 'Reading your notes…');
}

export function previewFile(f){
  file = f;
  $('#drop-text').value = '';
  const chip = $('#drop-file-chip');
  chip.hidden = false;
  chip.innerHTML = `<span>📄</span><b>${esc(f.name)}</b><span class="muted">${(f.size / 1024).toFixed(f.size > 10240 ? 0 : 1)} KB</span>`;
  pop(chip, 1.05, 320);
  $$('#drop-preview .drop-card').forEach(el => el.remove());
  $('#drop-title').dataset.touched = '';
  const form = new FormData();
  form.append('file', f);
  runPreview(form, `Reading ${f.name}…`);
}

async function commit(){
  if(!preview) return;
  const btn = $('#drop-study');
  const cards = preview.cards.filter(c => !c.duplicate).map(({front, back, topic}) => ({front, back, topic}));
  if(!cards.length) return;
  btn.disabled = true;
  const deckId = $('#drop-deck').value;
  const deck = decks.find(d => String(d.id) === deckId);
  try{
    const res = await post('/api/drop/commit', {cards, title: $('#drop-title').value.trim() || preview.title, deck_slug: deck ? deck.slug : null, source: preview.source});
    await flyAway();
    rewards.toast({icon: '📥', title: `${res.added} cards added`, sub: res.deck.name + (res.skipped_duplicates ? ` · ${res.skipped_duplicates} duplicates skipped` : ''), kind: 'quest'});
    reset();
    go('feed', {cards: res.cards, deckId: res.deck.id, name: res.deck.name});
  }catch(err){
    btn.disabled = false;
    status(`<span class="drop-error">${esc(err.message)}</span>`);
  }
}

function flyAway(){
  const tab = $('.tab[data-view="feed"]').getBoundingClientRect();
  const els = $$('#drop-preview .drop-card:not(.dup)').slice(0, 14);
  const b = $('#drop-study').getBoundingClientRect();
  burst(b.left + b.width / 2, b.top + b.height / 2, {count: 30, colors: PALETTE.party, speed: [200, 520]});
  if(isReduced() || !els.length) return Promise.resolve();
  const anims = els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const dx = tab.left + tab.width / 2 - (r.left + r.width / 2), dy = tab.top + tab.height / 2 - (r.top + r.height / 2);
    return el.animate([
      {transform: 'none', opacity: 1},
      {transform: `translate(${dx * 0.15}px, ${dy * 0.15 - 20}px) scale(.9)`, opacity: 1, offset: .3},
      {transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0},
    ], {duration: 560, delay: i * 30, easing: EASE.inOut, fill: 'forwards'}).finished;
  });
  return Promise.race([Promise.all(anims), new Promise(r => setTimeout(r, 1100))]);
}

function reset(){
  pending++;
  preview = null; file = null;
  $('#drop-text').value = '';
  $('#drop-file-chip').hidden = true;
  $('#drop-title').dataset.touched = '';
  $$('#drop-preview .drop-card').forEach(el => el.remove());
  $('#drop-empty').hidden = false;
  status('');
  renderBar(null);
}

export function mount(el){
  el.innerHTML = TEMPLATE;
  setEngine();
  $('#drop-text').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(previewText, DEBOUNCE_MS); });
  $('#drop-text').addEventListener('paste', () => { clearTimeout(debounce); debounce = setTimeout(previewText, 30); });
  $('#drop-file').addEventListener('change', e => { const f = e.target.files[0]; if(f) previewFile(f); e.target.value = ''; });
  $('#drop-sample').addEventListener('click', () => { $('#drop-text').value = SAMPLE_NOTES; previewText(); });
  $('#drop-clear').addEventListener('click', reset);
  $('#drop-study').addEventListener('click', commit);
  $('#drop-deck').addEventListener('change', syncTitleField);
  $('#drop-title').addEventListener('input', e => { e.target.dataset.touched = '1'; });
  const zone = $('#dropzone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', () => zone.classList.remove('over'));
}

export function onShow(arg){
  targetDeckId = arg?.deckId ?? null;
  loadDecks();
  if(arg?.file) previewFile(arg.file);
  else if(arg?.text){ $('#drop-text').value = arg.text; previewText(); }
  else if(!preview && !matchMedia('(hover: none)').matches) $('#drop-text').focus({preventScroll: true});
}

export function onKey(e){
  if(e.key === 'Enter' && preview && !$('#drop-study').disabled){ e.preventDefault(); commit(); }
}
