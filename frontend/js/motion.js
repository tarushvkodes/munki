const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
export const isReduced = () => reducedQuery.matches;

export const EASE = {
  out: 'cubic-bezier(.23,1,.32,1)',
  inOut: 'cubic-bezier(.77,0,.175,1)',
  in: 'cubic-bezier(.55,0,1,.45)',
  spring: 'cubic-bezier(.34,1.56,.64,1)',
  springSoft: 'cubic-bezier(.3,1.3,.5,1)',
};

// Reduced motion keeps opacity changes and drops every spatial keyframe.
export function anim(el, frames, opts){
  if(!el) return null;
  if(isReduced()){
    const fades = frames.map(({opacity}) => (opacity === undefined ? {} : {opacity}));
    const hasFade = fades.some(f => 'opacity' in f);
    return el.animate(hasFade ? fades : [{}, {}], {...opts, duration: hasFade ? Math.min(opts.duration ?? 200, 160) : 0, delay: 0});
  }
  return el.animate(frames, opts);
}

export function pop(el, scale = 1.18, duration = 420){
  return anim(el, [
    {transform: 'scale(1)'},
    {transform: `scale(${scale})`, offset: .32},
    {transform: 'scale(.98)', offset: .7},
    {transform: 'scale(1)'},
  ], {duration, easing: EASE.out});
}

// Damped harmonic oscillator, integrated per frame. x in px, v in px/s.
export function spring({from, to = 0, velocity = 0, stiffness = 520, damping = 30, onUpdate, onDone}){
  if(isReduced()){ onUpdate(to, 0); onDone?.(); return {stop(){}}; }
  let x = from, v = velocity, last = performance.now(), raf = 0;
  const step = now => {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    const sub = 4, hstep = dt / sub;
    for(let i = 0; i < sub; i++){
      const a = -stiffness * (x - to) - damping * v;
      v += a * hstep; x += v * hstep;
    }
    if(Math.abs(v) < 4 && Math.abs(x - to) < 0.4){ onUpdate(to, 0); onDone?.(); return; }
    onUpdate(x, v);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return {stop(){ cancelAnimationFrame(raf); }};
}

const tweens = new WeakMap();
export function countUp(el, to, duration = 650){
  const prev = tweens.get(el);
  if(prev) cancelAnimationFrame(prev.raf);
  const from = prev ? prev.value : (Number(el.textContent.replace(/[^\d-]/g, '')) || 0);
  if(isReduced() || from === to){ el.textContent = to; tweens.delete(el); return; }
  const start = performance.now();
  const state = {value: from, raf: 0};
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    state.value = Math.round(from + (to - from) * e);
    el.textContent = state.value;
    if(t < 1) state.raf = requestAnimationFrame(step);
    else tweens.delete(el);
  };
  state.raf = requestAnimationFrame(step);
  tweens.set(el, state);
}

const center = r => ({x: r.left + r.width / 2, y: r.top + r.height / 2});

// Two nested layers so x and y get different easings: the chip travels a curved path.
export function flyChip({from, toEl, html, className = '', duration = 620, onArrive}){
  const to = center(toEl.getBoundingClientRect());
  const fly = document.createElement('div');
  fly.className = 'fly ' + className;
  fly.innerHTML = `<span>${html}</span>`;
  document.body.appendChild(fly);
  const inner = fly.firstElementChild;
  const w = inner.offsetWidth, hgt = inner.offsetHeight;
  const sx = from.x - w / 2, sy = from.y - hgt / 2, ex = to.x - w / 2, ey = to.y - hgt / 2;
  const done = () => { fly.remove(); onArrive?.(); };
  if(isReduced()){
    fly.style.transform = `translate(${ex}px, ${ey}px)`;
    inner.animate([{opacity: 0}, {opacity: 1, offset: .3}, {opacity: 0}], {duration: 500}).finished.then(done, done);
    return;
  }
  fly.animate([
    {transform: `translate(${sx}px, ${sy}px)`},
    {transform: `translate(${sx}px, ${sy}px)`, offset: .2, easing: 'cubic-bezier(.5,0,.6,1)'},
    {transform: `translate(${ex}px, ${sy}px)`},
  ], {duration, fill: 'forwards'});
  inner.animate([
    {transform: 'translateY(16px) scale(.6)', opacity: 0, easing: EASE.out},
    {transform: 'translateY(-14px) scale(1.15)', opacity: 1, offset: .2, easing: 'cubic-bezier(.2,.75,.35,1)'},
    {transform: `translateY(${ey - sy}px) scale(.5)`, opacity: .85},
  ], {duration, fill: 'forwards'}).finished.then(done, done);
}

export function rectCenter(el){ return center(el.getBoundingClientRect()); }
