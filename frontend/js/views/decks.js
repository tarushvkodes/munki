import {$, api, esc} from '../lib.js';
import {anim, EASE} from '../motion.js';
import {go} from '../router.js';

let decksCache = [];

function deckCard(d, i){
  const empty = d.total === 0;
  const fromDrop = d.slug.startsWith('drop-');
  return `<article class="deck-card" data-hook="deck" data-deck-id="${d.id}" style="--i:${i}">
    <div class="ring" style="--p:${d.mastery_pct}"><i>${d.mastery_pct}%</i></div>
    <div class="deck-body">
      <div class="deck-title"><strong>${esc(d.name)}</strong>${fromDrop ? '<span class="chip fresh">Drop</span>' : ''}</div>
      <div class="muted deck-stats">${empty ? 'No cards yet' : `${d.total} cards · ${d.due} due · ${d.mature} mature`}</div>
      ${d.topics.length ? `<div class="deck-topics">${d.topics.slice(0, 4).map(t => `<span class="chip">${esc(t)}</span>`).join('')}${d.topics.length > 4 ? `<span class="chip ghost">+${d.topics.length - 4}</span>` : ''}</div>` : ''}
    </div>
    ${empty
      ? `<button class="btn" data-drop-into="${d.id}">📥 Drop notes in</button>`
      : `<button class="btn primary" data-study="${d.id}">Study</button>`}
  </article>`;
}

async function load(){
  const {decks} = await api('/api/decks');
  decksCache = decks;
  const list = $('#deck-list');
  list.innerHTML = decks.map(deckCard).join('');
  [...list.children].forEach((el, i) => anim(el, [{opacity: 0, transform: 'translateY(10px)'}, {opacity: 1, transform: 'none'}],
    {duration: 300, delay: Math.min(i * 40, 320), easing: EASE.out, fill: 'backwards'}));
}

export function mount(el){
  el.innerHTML = `<div class="view-head"><div><h2>Decks &amp; mastery</h2><p>Rings fill as cards mature (21+ day intervals).</p></div>
    <button class="btn primary" data-go="drop">📥 New deck from notes</button></div>
    <div class="deck-list" id="deck-list" data-hook="deck-list"></div>`;
  $('#deck-list').addEventListener('click', e => {
    const study = e.target.closest('[data-study]');
    const into = e.target.closest('[data-drop-into]');
    if(study){
      const d = decksCache.find(x => x.id === +study.dataset.study);
      go('feed', {deckId: d.id, name: d.name});
    } else if(into){
      go('drop', {deckId: +into.dataset.dropInto});
    }
  });
}

export function onShow(){ load(); }
