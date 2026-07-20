// Automated driver for the browser-control e2e suite.
//
// Prereqs (see README): dev bridge relay running, `pnpm dev` running, and the
// side panel OPEN in the dev build. Start the bench separately:
//     node test/browser-control/bench-server.mjs
// Then run:
//     node test/browser-control/run.mjs            # all scenarios
//     node test/browser-control/run.mjs fill-form  # one scenario by name
//
// It: waits for the panel → reloads it (loads the latest build) → enables the
// opt-in browser-control module for this run via the dev bridge → runs each
// scenario → scores real DOM/page-load events → writes report.json + report.txt.
// The runner does the DETERMINISTIC checks; an AI reviewer then reads the report
// + transcripts for semantic validation (see README "AI reviewer").
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scenarios } from './scenarios.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const RELAY = process.env.DEVBRIDGE_URL || 'http://127.0.0.1:9234';
const BENCH = process.env.BENCH_URL || 'http://localhost:4599';
const only = process.argv[2]; // optional scenario name filter
const BROWSER_CONTROL_ID = 'browser-control'; // matches BROWSER_CONTROL_MODULE_ID

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

async function relay(method, args = {}) {
  const res = await fetch(`${RELAY}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, args }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `command failed: ${method}`);
  return data.result;
}
async function connected() {
  try {
    const h = await (await fetch(`${RELAY}/health`)).json();
    return !!h.extensionConnected;
  } catch {
    return false;
  }
}
const benchReset = () => fetch(`${BENCH}/reset`, { method: 'POST' }).catch(() => {});
const benchToken = async () => (await (await fetch(`${BENCH}/badge-token`)).text()).trim();
const benchEvents = async () => {
  const raw = (await (await fetch(`${BENCH}/events`)).text()).trim();
  return raw ? raw.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
};

// Reduce the raw event stream + transcript into the ctx the checks consume.
function buildCtx(events, turns, badgeToken) {
  const finalValues = {};
  let submitted = false;
  const paths = [];
  for (const ev of events) {
    if (ev.event === 'page-loaded') paths.push(ev.path);
    if (ev.event === 'submit' || (ev.event === 'click' && ev.id === 'submit')) submitted = true;
    if (ev.id && 'value' in ev) finalValues[ev.id] = ev.value;
    if (ev.id && 'checked' in ev) finalValues[ev.id] = ev.checked;
  }
  const lastAssistant = [...(turns || [])].reverse().find((t) => t.role === 'assistant') || { tools: [], text: '' };
  const rawTools = lastAssistant.tools || [];
  const toolNames = rawTools.map((t) => String(t.type).replace(/^tool-/, ''));
  return { finalValues, submitted, paths, transcript: lastAssistant.text || '', toolNames, rawTools, badgeToken, turns };
}

async function main() {
  writeFileSync(join(DIR, 'report.txt'), '');
  const out = [];
  const say = (s) => { log(s); out.push(s); };

  say('Waiting for the side panel to connect…');
  for (let i = 0; i < 400 && !(await connected()); i++) await sleep(3000);
  if (!(await connected())) { say('TIMED OUT — open the side panel in the dev build.'); process.exit(1); }
  say('Panel connected. Reloading to load the latest build…');

  await relay('reload');
  await sleep(7000);
  for (let i = 0; i < 12; i++) {
    try { if ((await relay('status')) === 'ready') break; } catch { /* reconnecting */ }
    await sleep(2000);
  }
  const model = await relay('model').catch(() => 'unknown');
  say(`Panel ready. model: ${model}`);

  const badgeToken = await benchToken().catch(() => '');
  const list = only ? scenarios.filter((s) => s.name === only) : scenarios;
  if (!list.length) { say(`No scenario named "${only}".`); process.exit(1); }

  const report = [];
  let hardPass = 0, hardFail = 0;
  for (const sc of list) {
    say(`\n======== scenario: ${sc.name} ========`);
    // Fresh session per scenario so screenshot-heavy history from earlier
    // scenarios/runs can't pollute the model's behaviour. newChat resets dev
    // tool modules, so re-enable browser-control right after.
    await relay('newChat');
    await sleep(1200); // let the new ChatScreen mount + reinstall the bridge
    await relay('setToolModules', { ids: [BROWSER_CONTROL_ID] });
    await benchReset();
    const turns = await relay('sendAndWait', { text: sc.prompt });
    await sleep(1500); // let trailing beacons land
    const events = await benchEvents();
    const ctx = buildCtx(events, turns, badgeToken);

    say(`paths: ${JSON.stringify(ctx.paths)}  tools: ${JSON.stringify(ctx.toolNames)}`);
    const results = [];
    for (const chk of sc.checks) {
      let ok = false;
      try { ok = !!chk.fn(ctx); } catch { ok = false; }
      const tag = chk.advisory ? (ok ? 'ok  ' : 'note') : (ok ? 'PASS' : 'FAIL');
      say(`  [${tag}] ${chk.name}`);
      if (!chk.advisory) ok ? hardPass++ : hardFail++;
      results.push({ name: chk.name, advisory: !!chk.advisory, ok });
    }
    report.push({ scenario: sc.name, prompt: sc.prompt, paths: ctx.paths, toolNames: ctx.toolNames, finalValues: ctx.finalValues, submitted: ctx.submitted, reply: ctx.transcript, results });
  }

  say(`\n=== RESULT: ${hardPass} hard checks passed, ${hardFail} failed ===`);
  writeFileSync(join(DIR, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(DIR, 'report.txt'), out.join('\n') + '\n');
  say('Wrote report.json (full transcripts) + report.txt (this log).');
  process.exit(hardFail === 0 ? 0 : 2);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
