export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ESC[ch]);

export function h(html){
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export class ApiError extends Error {
  constructor(message, status, data){ super(message); this.status = status; this.data = data; }
}

export async function api(path, opts = {}){
  const isForm = opts.body instanceof FormData;
  const headers = isForm ? opts.headers : {'Content-Type': 'application/json', ...opts.headers};
  const r = await fetch(path, {...opts, headers});
  const data = await r.json().catch(() => ({}));
  if(!r.ok) throw new ApiError(data.error || data.detail || `Request failed (${r.status})`, r.status, data);
  return data;
}
export const post = (path, body) => api(path, {method: 'POST', body: JSON.stringify(body)});

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function announce(text){
  const live = $('#sr-live');
  if(live) live.textContent = text;
}

export const params = new URLSearchParams(location.search);
