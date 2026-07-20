// Instrumented test bench for the browser-control e2e suite.
//
// Serves a small TWO-PAGE site whose every control reports its live state
// changes back here; each event is appended to events.ndjson. That file is the
// GROUND TRUTH the runner scores against — the agent cannot fake it, because the
// page's own DOM listeners fire the events, not the agent.
//
// Pages:
//   GET /        step 1: text/email, two <select>, checkbox, radio group,
//                range slider, textarea, a dynamic "load promo" button, a link
//                to /page2, and a submit button.
//   GET /page2   step 2: textarea, checkbox, link back to /.
// API:
//   POST /log    append one JSON event
//   POST /reset  clear the event log (runner calls this before each scenario)
//   GET  /events dump events.ndjson as text
import { createServer } from 'node:http';
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderTokenPng } from './badge.mjs';

const PORT = Number(process.env.BENCH_PORT || 4599);
const DIR = dirname(fileURLToPath(import.meta.url));
const LOG = join(DIR, 'events.ndjson');
writeFileSync(LOG, '');

// A random token rendered ONLY into a server-side PNG (never in the DOM/JS), so
// the screenshot scenario genuinely requires vision to read it. The runner reads
// it from /badge-token (an endpoint the page never references) to know what to
// expect; the agent only ever sees the image.
const BADGE_TOKEN = String(Math.floor(1000 + Math.random() * 9000));
const BADGE_PNG = renderTokenPng(BADGE_TOKEN);

// Shared instrumentation: log page load (with path) + every field change, and
// re-instrument dynamically added fields. Injected verbatim into every page.
const INSTRUMENT = `
  const log = (event) => {
    const body = JSON.stringify({ ts: Date.now(), path: location.pathname, ...event });
    try { navigator.sendBeacon('/log', body); }
    catch { fetch('/log', { method: 'POST', body }); }
  };
  const show = (t) => { const s = document.getElementById('status'); if (s) s.textContent = t; };
  const valueOf = (el) => (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
  const kindOf = (el) => (el.type === 'checkbox' || el.type === 'radio') ? 'checked' : 'value';
  window.__instrument = (el) => {
    if (el.__wired) return; el.__wired = true;
    const emit = (event) => {
      const rec = { event, id: el.id };
      rec[kindOf(el)] = valueOf(el);
      if (el.name) rec.name = el.name;
      if (el.type === 'radio') rec.value = el.value;
      log(rec); show(el.id + ' = ' + valueOf(el));
    };
    el.addEventListener('input', () => emit('input'));
    el.addEventListener('change', () => emit('change'));
  };
  for (const el of document.querySelectorAll('input, select, textarea')) window.__instrument(el);
  const sub = document.getElementById('submit');
  if (sub) sub.addEventListener('click', () => log({ event: 'click', id: 'submit' }));
  const form = document.getElementById('form');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault(); // keep the page + uid registry alive for inspection
    log({ event: 'submit' }); show('SUBMITTED');
  });
  const loadmore = document.getElementById('loadmore');
  if (loadmore) loadmore.addEventListener('click', () => {
    show('loading…');
    setTimeout(() => {
      if (document.getElementById('promo')) return;
      const wrap = document.createElement('div'); wrap.className = 'row';
      wrap.innerHTML = '<label for="promo">Promo code</label><input id="promo" name="promo" type="text" placeholder="Enter promo" /><div id="promo-note">Promo unlocked</div>';
      form.appendChild(wrap); // append is robust regardless of child nesting
      window.__instrument(document.getElementById('promo'));
      show('promo unlocked');
    }, 700); // deliberate delay so the agent must wait_for the field
  });
  // The badge is a server-rendered <img> (see /badge.png); nothing to draw here.
  // Log page loads via pageshow so back/forward bfcache restores are counted too
  // (a restored page does NOT re-run this script, but pageshow still fires).
  window.addEventListener('pageshow', () => log({ event: 'page-loaded' }));
  show('ready');
`;

const STYLE = `
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; }
  h1 { font-size: 20px; } fieldset { border: 1px solid #ccc; border-radius: 6px; margin: 14px 0; }
  label { display: block; margin: 12px 0 4px; font-weight: 600; }
  input[type=text], input[type=email], select, textarea { width: 100%; padding: 8px; font-size: 15px; box-sizing: border-box; }
  .row { margin-bottom: 8px; } .cb, .radio { display: flex; align-items: center; gap: 8px; }
  .cb input, .radio input { width: auto; }
  button { margin-top: 14px; padding: 10px 18px; font-size: 15px; cursor: pointer; }
  #status { margin-top: 16px; padding: 10px; background: #f0f0f0; border-radius: 6px; min-height: 20px; }
  a { display: inline-block; margin-top: 14px; }
`;

const PAGE1 = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>Browser Control Test Bench</title><style>${STYLE}</style></head><body>
<h1>Browser Control Test Bench — Step 1</h1>
<form id="form">
  <div class="row"><label>Rendered badge</label><img id="badge" src="/badge.png" alt="rendered badge graphic" style="border:1px solid #ccc;border-radius:6px;max-width:100%;display:block" /></div>
  <div class="row"><label for="fullname">Full name</label><input id="fullname" name="fullname" type="text" placeholder="Enter your name" /></div>
  <div class="row"><label for="email">Email</label><input id="email" name="email" type="email" placeholder="you@example.com" /></div>
  <div class="row"><label for="color">Favorite color</label>
    <select id="color" name="color"><option value="">— choose —</option>
      <option value="red">Red</option><option value="green">Green</option>
      <option value="blue">Blue</option><option value="purple">Purple</option></select></div>
  <div class="row"><label for="size">Shirt size</label>
    <select id="size" name="size"><option value="">— choose —</option>
      <option value="s">Small</option><option value="m">Medium</option>
      <option value="l">Large</option><option value="xl">Extra Large</option></select></div>
  <div class="row cb"><input id="subscribe" name="subscribe" type="checkbox" />
    <label for="subscribe" style="margin:0;font-weight:400;">Subscribe to newsletter</label></div>
  <fieldset><legend>Preferred contact</legend>
    <div class="radio"><input id="contact-email" name="contact" type="radio" value="email" /><label for="contact-email" style="margin:0;font-weight:400;">Email</label></div>
    <div class="radio"><input id="contact-phone" name="contact" type="radio" value="phone" /><label for="contact-phone" style="margin:0;font-weight:400;">Phone</label></div>
    <div class="radio"><input id="contact-none" name="contact" type="radio" value="none" /><label for="contact-none" style="margin:0;font-weight:400;">Do not contact</label></div>
  </fieldset>
  <div class="row"><label for="quantity">Quantity (1–10)</label><input id="quantity" name="quantity" type="range" min="1" max="10" value="1" style="width:100%" /></div>
  <div class="row"><label for="message">Message</label><textarea id="message" name="message" rows="3" placeholder="Say something"></textarea></div>
  <button id="loadmore" type="button">Load promo field</button>
  <a id="tolink" href="/page2">Go to step 2</a>
  <button id="submit" type="submit">Submit order</button>
</form>
<div id="status">waiting…</div>
<script>${INSTRUMENT}</script></body></html>`;

const PAGE2 = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>Test Bench — Step 2</title><style>${STYLE}</style></head><body>
<h1>Browser Control Test Bench — Step 2</h1>
<form id="form">
  <div class="row"><label for="feedback">Feedback</label><textarea id="feedback" name="feedback" rows="3" placeholder="Your feedback"></textarea></div>
  <div class="row cb"><input id="confirm" name="confirm" type="checkbox" />
    <label for="confirm" style="margin:0;font-weight:400;">I confirm the details are correct</label></div>
  <a id="backlink" href="/">Back to step 1</a>
</form>
<div id="status">waiting…</div>
<script>${INSTRUMENT}</script></body></html>`;

const readBody = (req) =>
  new Promise((resolve) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => resolve(b)); });

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/log') {
    const body = await readBody(req);
    appendFileSync(LOG, body.trim() + '\n');
    try { console.log('[event]', JSON.stringify(JSON.parse(body))); } catch { console.log('[event]', body); }
    return res.writeHead(204).end();
  }
  if (req.method === 'POST' && req.url === '/reset') {
    writeFileSync(LOG, ''); console.log('[reset]');
    return res.writeHead(204).end();
  }
  if (req.url === '/events') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(readFileSync(LOG, 'utf8'));
  }
  if (req.url === '/badge.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    return res.end(BADGE_PNG);
  }
  if (req.url === '/badge-token') {
    // For the runner only — the page never links here, so the agent can't use it.
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(BADGE_TOKEN);
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(req.url && req.url.startsWith('/page2') ? PAGE2 : PAGE1);
}).listen(PORT, () => console.log(`Test bench on http://localhost:${PORT}  (badge token ${BADGE_TOKEN}; events -> ${LOG})`));
