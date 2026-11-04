import {esc, clamp} from './lib.js';
import {anim, spring, isReduced, EASE} from './motion.js';

const DEPTH = 3;
const TAP_SLOP = 8;
const FLING_DISTANCE = 0.28;
const FLING_VELOCITY = 0.45;

function lengthClass(card){
  const n = Math.max(card.front?.length || 0, card.back?.length || 0);
  return n > 260 ? 'xlong' : n > 150 ? 'long' : '';
}

function cardHTML(c){
  const meta = `<span class="chip deck">${esc(c.deck_name || '')}</span><span class="chip">${esc(c.topic || 'General')}</span>` +
    (c.source === 'drop' && !c.repetitions ? '<span class="chip fresh">fresh from Drop</span>' : `<span class="chip ghost">${c.repetitions ? 'review' : 'new'}</span>`);
  return `<div class="holo" aria-hidden="true"></div>
    <div class="crit-ribbon" aria-hidden="true">✨ CRITICAL · DOUBLE XP</div>
    <div class="card-inner">
      <div class="face front"><div class="card-meta">${meta}</div><div class="card-text" data-hook="card-front">${esc(c.front)}</div>
        <div class="card-hint"><span data-plain="Tap to see the answer">Tap or <kbd>Space</kbd> to flip · swipe → knew it · ← again</span></div></div>
      <div class="face back"><div class="card-meta">${meta}</div><div class="card-text" data-hook="card-back">${esc(c.back)}</div>
        <div class="card-hint"><span>How did that go? → knew it · ← again</span></div></div>
    </div>
    <div class="stamp knew" aria-hidden="true">KNEW IT</div>
    <div class="stamp again" aria-hidden="true">AGAIN</div>`;
}

// Owns the visible cards: a queue of card data and up to DEPTH elements stacked by data position.
// The top card takes drag, tap-to-flip, and programmatic grades; every grade flings it out and promotes the next.
export class CardStack {
  constructor(root, {onGrade, onFlip, onEmpty, renderEnd}){
    this.root = root;
    this.onGrade = onGrade; this.onFlip = onFlip; this.onEmpty = onEmpty; this.renderEnd = renderEnd;
    this.queue = [];
    this.els = [];
    this.drag = null;
    this.springBack = null;
  }

  get top(){ return this.queue[0] || null; }
  get topEl(){ return this.els[0] || null; }
  get remaining(){ return this.queue.length; }
  get flipped(){ return !!this.topEl?.classList.contains('is-flipped'); }

  setCards(cards){
    this.queue = cards.slice();
    this.els.forEach(el => el.remove());
    this.els = [];
    this.endEl?.remove(); this.endEl = null;
    this.fill(true);
  }

  append(cards){
    this.queue.push(...cards);
    if(this.endEl && this.queue.length){ this.endEl.remove(); this.endEl = null; }
    this.fill(false);
  }

  prepend(cards){
    const ids = new Set(cards.map(c => c.id));
    this.setCards([...cards, ...this.queue.filter(c => !ids.has(c.id))]);
  }

  fill(initial){
    while(this.els.length < Math.min(DEPTH, this.queue.length)){
      const data = this.queue[this.els.length];
      const el = document.createElement('article');
      el.className = `card pos-${initial ? this.els.length : DEPTH} ${lengthClass(data)}`;
      el.dataset.cardId = data.id;
      el.dataset.critical = String(!!data.critical);
      el.innerHTML = cardHTML(data);
      this.root.appendChild(el);
      this.els.push(el);
    }
    if(!initial) void this.root.offsetWidth;
    this.layout();
    if(!this.queue.length){ this.showEnd(); this.onEmpty?.(); }
  }

  layout(){
    this.els.forEach((el, i) => {
      el.classList.remove('pos-0', 'pos-1', 'pos-2', 'pos-3');
      el.classList.add('pos-' + i);
      if(this.painted?.el !== el) el.style.transform = '';
      const top = i === 0;
      el.toggleAttribute('data-hook', top);
      if(top) el.dataset.hook = 'feed-card';
      el.tabIndex = top ? 0 : -1;
      el.setAttribute('role', top ? 'button' : 'presentation');
      el.setAttribute('aria-hidden', String(!top));
      if(top){
        el.setAttribute('aria-label', 'Flashcard. Space flips. 1 or right arrow: knew it. 2 or left arrow: again.');
        el.setAttribute('aria-pressed', String(el.classList.contains('is-flipped')));
        this.bind(el);
      }
    });
  }

  showEnd(){
    if(this.endEl || !this.renderEnd) return;
    const el = document.createElement('article');
    el.className = 'card end pos-0';
    el.dataset.hook = 'feed-end';
    el.innerHTML = `<div class="card-inner"><div class="face front">${this.renderEnd()}</div></div>`;
    this.root.appendChild(el);
    this.endEl = el;
    anim(el, [{opacity: 0, transform: 'translateY(16px) scale(.96)'}, {opacity: 1, transform: 'none'}], {duration: 360, easing: EASE.out});
  }

  flip(){
    const el = this.topEl;
    if(!el) return;
    const on = el.classList.toggle('is-flipped');
    el.setAttribute('aria-pressed', String(on));
    this.onFlip?.(this.top, on);
  }

  grade(grade, velocity = 0){
    const el = this.topEl, card = this.top;
    if(!el || !card) return false;
    this.springBack?.stop();
    this.queue.shift();
    this.els.shift();
    el.removeAttribute('data-hook');
    el.classList.remove('dragging');
    el.classList.add('leaving');
    el.style.pointerEvents = 'none';
    const rect = el.getBoundingClientRect();
    this.fling(el, grade, velocity);
    this.fill(false);
    this.onGrade?.(card, grade, rect);
    return true;
  }

  fling(el, grade, velocity){
    const dir = grade === 'knew' ? 1 : -1;
    const now = this.painted?.el === el ? this.painted : {dx: 0, dy: 0};
    this.drag = null;
    this.painted = null;
    const fromT = `translate3d(${now.dx}px, ${now.dy * 0.25}px, 0) rotate(${now.dx * 0.05}deg)`;
    const endX = dir * (innerWidth * 0.55 + el.offsetWidth * 0.6);
    const speed = Math.max(Math.abs(velocity), 2.4);
    const duration = clamp(Math.abs(endX - now.dx) / speed * 1.6, 200, 340);
    const lift = grade === 'knew' ? -40 : 30;
    const a = anim(el, [
      {transform: fromT, opacity: 1},
      {transform: `translate3d(${endX}px, ${now.dy * 0.25 + lift}px, 0) rotate(${dir * 24}deg)`, opacity: 0},
    ], {duration, easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'forwards'});
    const done = () => el.remove();
    if(a) a.finished.then(done, done); else done();
  }

  bind(el){
    if(el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('pointerdown', e => this.down(e, el));
    el.addEventListener('pointermove', e => this.move(e, el));
    el.addEventListener('pointerup', e => this.up(e, el));
    el.addEventListener('pointercancel', () => this.cancel(el));
  }

  down(e, el){
    if(el !== this.topEl || this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if(e.target.closest('button, a, input')) return;
    this.springBack?.stop();
    this.drag = {el, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, active: false, samples: [{x: e.clientX, t: e.timeStamp}]};
  }

  move(e, el){
    const d = this.drag;
    if(!d || d.el !== el || e.pointerId !== d.id) return;
    d.dx = e.clientX - d.x0; d.dy = e.clientY - d.y0;
    if(!d.active){
      if(Math.abs(d.dx) < TAP_SLOP || Math.abs(d.dx) < Math.abs(d.dy) * 1.2) return;
      d.active = true;
      el.setPointerCapture(d.id);
      el.classList.add('dragging');
    }
    d.samples.push({x: e.clientX, t: e.timeStamp});
    while(d.samples.length > 2 && e.timeStamp - d.samples[0].t > 90) d.samples.shift();
    this.paint(el, d.dx, d.dy);
  }

  paint(el, dx, dy){
    this.painted = {el, dx, dy};
    el.style.transform = `translate3d(${dx}px, ${dy * 0.25}px, 0) rotate(${dx * 0.05}deg)`;
    const p = clamp(Math.abs(dx) / 120, 0, 1);
    el.querySelector('.stamp.knew').style.opacity = dx > 0 ? p : 0;
    el.querySelector('.stamp.again').style.opacity = dx < 0 ? p : 0;
    const next = this.els[1];
    if(next){
      const k = clamp(Math.abs(dx) / 180, 0, 1);
      next.style.transform = `translateY(${16 - 16 * k}px) scale(${0.94 + 0.06 * k})`;
    }
  }

  up(e, el){
    const d = this.drag;
    if(!d || d.el !== el || e.pointerId !== d.id) return;
    if(!d.active){
      this.drag = null;
      if(Math.hypot(d.dx, d.dy) < TAP_SLOP) this.flip();
      return;
    }
    const first = d.samples[0], lastS = d.samples[d.samples.length - 1];
    const v = (lastS.x - first.x) / Math.max(1, lastS.t - first.t);
    const far = Math.abs(d.dx) > el.offsetWidth * FLING_DISTANCE;
    const flick = Math.abs(v) > FLING_VELOCITY && Math.sign(v) === Math.sign(d.dx);
    if(far || flick){
      this.grade(d.dx > 0 ? 'knew' : 'again', v);
    } else {
      this.release(el, d, v * 1000);
    }
  }

  cancel(el){
    const d = this.drag;
    if(d && d.el === el && d.active) this.release(el, d, 0);
    else this.drag = null;
  }

  release(el, d, velocityPxPerS){
    this.drag = null;
    const dy = d.dy;
    this.springBack = spring({from: d.dx, velocity: velocityPxPerS, stiffness: 600, damping: 26,
      onUpdate: x => this.paint(el, x, dy * Math.min(1, Math.abs(x) / Math.max(1, Math.abs(d.dx)))),
      onDone: () => {
        this.painted = null;
        el.classList.remove('dragging');
        el.style.transform = '';
        el.querySelectorAll('.stamp').forEach(s => { s.style.opacity = 0; });
        if(this.els[1]) this.els[1].style.transform = '';
      }});
  }
}

export {isReduced};
