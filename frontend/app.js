// Munki frontend entry: feed-first, keyboard-driven, zero decisions before card 1.
// Vanilla ES modules, no build step. Sound is OFF unless the user enables it.
import {$, $$, api, params} from './js/lib.js';
import * as rewards from './js/rewards.js';
import {register, go, initTabs, currentView, viewApi, onMount} from './js/router.js';
import * as feed from './js/views/feed.js';
import * as drop from './js/views/drop.js';
import * as blitz from './js/views/blitz.js';
import * as lab from './js/views/lab.js';
import * as decks from './js/views/decks.js';
import * as plan from './js/views/plan.js';

Object.entries({feed, drop, blitz, lab, decks, plan}).forEach(([name, view]) => register(name, view));

// ---------- settings ----------
let plainOn = false;
function applyPlain(root = document){
  root.querySelectorAll('[data-plain]').forEach(el => {
    if(el.dataset.full === undefined) el.dataset.full = el.textContent;
    el.textContent = plainOn ? el.dataset.plain : el.dataset.full;
  });
}
onMount(applyPlain);

function applySettings(s){
  plainOn = !!s.plain_language;
  $('#tgl-plain').checked = plainOn;
  $('#tgl-font').checked = !!s.dyslexia_font;
  $('#tgl-sound').checked = !!s.sound;
  rewards.setSound(!!s.sound);
  document.body.classList.toggle('dyslexia', !!s.dyslexia_font);
  applyPlain();
}
function saveSettings(){
  const s = {plain_language: $('#tgl-plain').checked, dyslexia_font: $('#tgl-font').checked, sound: $('#tgl-sound').checked};
  applySettings(s);
  return api('/api/settings', {method: 'PUT', body: JSON.stringify(s)});
}
['tgl-plain', 'tgl-font', 'tgl-sound'].forEach(id => $('#' + id).addEventListener('change', saveSettings));
$('#gear').addEventListener('click', e => {
  e.stopPropagation();
  const pop = $('#settings');
  pop.hidden = !pop.hidden;
  $('#gear').setAttribute('aria-expanded', String(!pop.hidden));
});
document.addEventListener('click', e => {
  if(!$('#settings').hidden && !e.target.closest('#settings')){
    $('#settings').hidden = true;
    $('#gear').setAttribute('aria-expanded', 'false');
  }
});

// ---------- keyboard ----------
document.addEventListener('keydown', e => {
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  if(e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  viewApi(currentView())?.onKey?.(e);
});

// ---------- drag a file anywhere: Drop takes it ----------
let dragDepth = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', e => { if(hasFiles(e)){ dragDepth++; $('#dropveil').hidden = false; } });
addEventListener('dragleave', e => { if(hasFiles(e) && --dragDepth <= 0){ dragDepth = 0; $('#dropveil').hidden = true; } });
addEventListener('dragover', e => { if(hasFiles(e)) e.preventDefault(); });
addEventListener('drop', e => {
  if(!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('#dropveil').hidden = true;
  const file = e.dataTransfer.files[0];
  if(file) go('drop', {file});
});

// ---------- boot: feed first, zero decisions ----------
async function boot(){
  initTabs();
  go('feed');
  const [settings, g] = await Promise.all([api('/api/settings'), api('/api/gamification')]);
  rewards.initFromSnapshot(g);
  applySettings(settings);
  if(params.has('demo')) import('./js/demo.js').then(m => m.init());
}
boot();
