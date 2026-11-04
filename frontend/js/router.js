import {$, $$} from './lib.js';

const views = new Map();
const mounted = new Set();
let current = null;
let plainHook = () => {};

export function register(name, view){ views.set(name, view); }
export function onMount(fn){ plainHook = fn; }
export const currentView = () => current;
export const viewApi = name => views.get(name);

function moveInk(){
  const tab = $(`.tab[data-view="${current}"]`), ink = $('.tab-ink');
  if(!tab || !ink) return;
  const nav = tab.parentElement.getBoundingClientRect(), r = tab.getBoundingClientRect();
  ink.style.transform = `translateX(${r.left - nav.left}px) scaleX(${r.width / 100})`;
  ink.style.top = `${r.top - nav.top}px`;
  ink.style.height = `${r.height}px`;
}
addEventListener('resize', moveInk);

export function go(name, arg){
  const view = views.get(name);
  if(!view) return;
  const el = $('#view-' + name);
  if(!mounted.has(name)){
    view.mount(el);
    mounted.add(name);
    plainHook(el);
  }
  if(current !== name){
    if(current){
      views.get(current).onHide?.();
      $('#view-' + current).hidden = true;
      $('#view-' + current).classList.remove('active');
    }
    el.hidden = false;
    el.classList.add('active');
    el.classList.remove('entering'); void el.offsetWidth; el.classList.add('entering');
    current = name;
    $$('.tab').forEach(t => {
      const on = t.dataset.view === name;
      t.classList.toggle('active', on);
      if(on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    moveInk();
    if(name !== 'feed' && scrollY > 0) scrollTo({top: 0});
  }
  view.onShow?.(arg);
}

export function initTabs(){
  $$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.view)));
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if(b) go(b.dataset.go, b.dataset.goArg ? JSON.parse(b.dataset.goArg) : undefined);
  });
  requestAnimationFrame(moveInk);
}
