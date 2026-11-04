import {isReduced} from './motion.js';

const canvas = document.getElementById('fx');
const ctx = canvas.getContext('2d');
const MAX = 420;
let particles = [], rings = [], raf = 0, last = 0, dpr = 1;

function resize(){
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
}
resize();
addEventListener('resize', resize);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

export const PALETTE = {
  good: ['#3ddc97', '#8ff0c4', '#ffd166', '#ffffff'],
  gold: ['#ffd166', '#ffb020', '#fff3c4', '#ff9a3d'],
  crit: ['#ffb020', '#ff6ad5', '#6ea8ff', '#3ddc97', '#ffd166'],
  calm: ['#6ea8ff', '#a9c8ff'],
  fire: ['#ff6a3d', '#ffb020', '#ffd166'],
  cyan: ['#4fd1ff', '#a6ecff', '#ffffff'],
  violet: ['#a98bff', '#d7c9ff', '#ff6ad5'],
  party: ['#ffb020', '#3ddc97', '#6ea8ff', '#ff6ad5', '#a98bff', '#ffd166'],
};

function add(p){
  if(particles.length >= MAX) particles.shift();
  particles.push(p);
}

export function burst(x, y, {count = 18, colors = PALETTE.good, speed = [220, 520], angle = -Math.PI / 2, spread = Math.PI * 2, gravity = 900, size = [2.5, 5.5], life = [0.5, 0.9], shape = 'spark'} = {}){
  if(isReduced()) return;
  for(let i = 0; i < count; i++){
    const a = angle + (Math.random() - .5) * spread;
    const s = rand(...speed);
    add({x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: gravity, drag: shape === 'confetti' ? 2.2 : 3.2,
      size: rand(...size), color: pick(colors), life: rand(...life), age: 0, shape,
      rot: rand(0, Math.PI * 2), vr: rand(-12, 12), flutter: rand(4, 9)});
  }
  start();
}

export function confetti({count = 140, origin = 'sides', colors = PALETTE.party} = {}){
  if(isReduced()) return;
  const w = innerWidth, hgt = innerHeight;
  const emit = (x, y, angle, spread) => burst(x, y, {count: Math.round(count / (origin === 'sides' ? 2 : 1)), colors, angle, spread,
    speed: [520, 1100], gravity: 820, size: [6, 11], life: [1.6, 2.6], shape: 'confetti'});
  if(origin === 'sides'){
    emit(-10, hgt * .85, -Math.PI / 3, .9);
    emit(w + 10, hgt * .85, -Math.PI * 2 / 3, .9);
  } else if(origin === 'top'){
    burst(w / 2, -20, {count, colors, angle: Math.PI / 2, spread: 2.6, speed: [200, 700], gravity: 520, size: [6, 11], life: [1.8, 2.8], shape: 'confetti'});
  } else {
    emit(origin.x, origin.y, -Math.PI / 2, 1.6);
  }
}

export function ring(x, y, {color = '#ffffff', radius = 180, width = 6, life = .55} = {}){
  if(isReduced()) return;
  rings.push({x, y, color, radius, width, life, age: 0});
  start();
}

function start(){
  if(raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function frame(now){
  const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter(p => (p.age += dt) < p.life);
  for(const p of particles){
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vy = p.vy * k + p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    const fade = 1 - Math.pow(p.age / p.life, 3);
    ctx.globalAlpha = Math.max(0, fade);
    ctx.fillStyle = p.color;
    if(p.shape === 'confetti'){
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.age * p.flutter));
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * fade), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  rings = rings.filter(r => (r.age += dt) < r.life);
  for(const r of rings){
    const t = r.age / r.life, e = 1 - Math.pow(1 - t, 3);
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * (1 - t) + .5;
    ctx.beginPath(); ctx.arc(r.x, r.y, 12 + r.radius * e, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if(particles.length || rings.length){ raf = requestAnimationFrame(frame); }
  else { ctx.clearRect(0, 0, innerWidth, innerHeight); raf = 0; }
}
