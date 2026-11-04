// Dev-only recording helpers. Loaded only with ?demo=1, and the server side exists only when MUNKI_DEMO=1.
// ?demo=1&prime=levelup,combo,quest,streak&critical=1&coach=reset
import {$, post, params, h} from './lib.js';
import * as rewards from './rewards.js';
import * as feed from './views/feed.js';

const PRIMES = ['levelup', 'combo', 'combo19', 'quest', 'streak'];

async function prime(names){
  try{
    await post('/api/demo/prime', {scenarios: names});
  }catch(err){
    rewards.toast({icon: '⚠️', title: 'Demo API is off', sub: 'Start the server with MUNKI_DEMO=1'});
    throw err;
  }
  await rewards.refresh({animate: false});
}

function panel(){
  const el = h(`<div class="demo-panel" data-hook="demo-panel"><b>DEMO</b>
    ${PRIMES.map(p => `<button class="btn small" data-prime="${p}" data-hook="demo-${p}">${p}</button>`).join('')}
    <button class="btn small" data-hook="demo-critical" id="demo-critical">critical</button></div>`);
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-prime]');
    if(b) await prime([b.dataset.prime]);
    if(e.target.closest('#demo-critical')){ feed.setForceCritical(); await feed.reload(); }
  });
  document.body.appendChild(el);
}

export async function init(){
  if(params.get('coach') === 'reset') localStorage.removeItem('munki.coach');
  if(params.get('coach') === 'skip') localStorage.setItem('munki.coach', 'done');
  const names = (params.get('prime') || '').split(',').filter(n => PRIMES.includes(n));
  if(names.length) await prime(names);
  if(params.get('critical') === '1' || params.get('coach')){ if(params.get('critical') === '1') feed.setForceCritical(); await feed.reload(); }
  if(params.get('panel') !== '0') panel();
  document.documentElement.dataset.demoReady = '1';
}
