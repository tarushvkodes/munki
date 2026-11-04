import {$, api, post, esc} from '../lib.js';
import {anim, EASE} from '../motion.js';
import {go} from '../router.js';

let deckBySlug = {};
const today = () => new Date().toLocaleDateString('en-CA');
const fmtDay = iso => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'});

async function load(){
  const [{deadlines}, plan, {decks}] = await Promise.all([api('/api/deadlines'), api('/api/plan'), api('/api/decks')]);
  deckBySlug = Object.fromEntries(decks.map(d => [d.slug, d]));
  $('#dl-deck').innerHTML = '<option value="">No deck</option>' + decks.filter(d => d.slug !== 'inbox').map(d => `<option value="${esc(d.slug)}">${esc(d.name)}</option>`).join('');
  $('#deadline-list').innerHTML = deadlines.length
    ? deadlines.map(d => `<div class="dl-row ${d.date < today() ? 'past' : ''}" data-hook="deadline"><span class="dl-date">${esc(fmtDay(d.date))}</span>
        <span class="dl-title">${esc(d.title)}<small>${esc(deckBySlug[d.deck_slug]?.name || d.deck_slug || 'No deck')}</small></span>
        <button class="btn small ghost" data-del="${d.id}" aria-label="Delete ${esc(d.title)}">✕</button></div>`).join('')
    : '<p class="muted">No deadlines yet. Add your next exam above and Munki plans backward from it.</p>';
  const out = $('#plan-out');
  if(!plan.days.length){
    out.innerHTML = `<div class="plan-empty"><p>${esc(plan.note || 'Nothing to plan yet.')}</p><button class="btn primary" id="plan-add-first">Add a deadline</button></div>`;
    $('#plan-add-first').addEventListener('click', () => $('#dl-title').focus());
    return;
  }
  out.innerHTML = plan.days.map(d => {
    const deck = d.focus && deckBySlug[d.focus.deck_slug];
    const isToday = d.date === today();
    return `<div class="plan-day ${isToday ? 'today' : ''}" data-hook="plan-day">
      <div class="pd-date"><b>${esc(fmtDay(d.date))}</b>${isToday ? '<span class="chip fresh">Today</span>' : ''}</div>
      <div class="pd-body">${esc(d.action)} <span class="muted">· ~${d.suggested_minutes} min</span>
        ${d.deadlines_today.length ? `<div class="pd-due">📌 ${d.deadlines_today.map(esc).join(', ')}</div>` : ''}</div>
      ${deck ? `<button class="btn ${isToday ? 'primary' : ''} small" data-study="${deck.id}" data-name="${esc(deck.name)}">${isToday ? 'Start now' : 'Study'}</button>` : ''}
    </div>`;
  }).join('');
  const todayEl = out.querySelector('.today');
  if(todayEl) anim(todayEl, [{transform: 'scale(.98)', opacity: .6}, {transform: 'none', opacity: 1}], {duration: 380, easing: EASE.spring});
}

export function mount(el){
  el.innerHTML = `<div class="view-head"><div><h2>Study plan</h2><p>One focus a day, weighted by what's due, what's weak, and which exam is closest.</p></div></div>
  <div class="plan-grid">
    <section class="panel">
      <h3>Deadlines</h3>
      <form id="deadline-form" class="dl-form">
        <input id="dl-title" placeholder="e.g. MA 162 Exam 3" required>
        <input id="dl-date" type="date" required>
        <select id="dl-deck"></select>
        <button class="btn primary" type="submit">Add</button>
      </form>
      <div id="deadline-list" data-hook="deadlines"></div>
    </section>
    <section class="panel"><h3>Day by day</h3><div id="plan-out" data-hook="planner"></div></section>
  </div>`;
  $('#deadline-form').addEventListener('submit', async e => {
    e.preventDefault();
    await post('/api/deadlines', {title: $('#dl-title').value, date: $('#dl-date').value, deck_slug: $('#dl-deck').value || null});
    e.target.reset();
    load();
  });
  el.addEventListener('click', async e => {
    const del = e.target.closest('[data-del]');
    const study = e.target.closest('[data-study]');
    if(del){ await api('/api/deadlines/' + del.dataset.del, {method: 'DELETE'}); load(); }
    if(study) go('feed', {deckId: +study.dataset.study, name: study.dataset.name});
  });
}

export function onShow(){ load(); }
