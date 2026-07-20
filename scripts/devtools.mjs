/**
 * Live extension control via the Chrome DevTools Protocol.
 *
 * Requires a Chrome started with --remote-debugging-port (use
 * scripts/launch-debug-chrome.ps1), with the side panel OPEN.
 *
 * Commands:
 *   node scripts/devtools.mjs targets                 # list debuggable targets
 *   node scripts/devtools.mjs eval "<js>"             # eval in the side panel
 *   node scripts/devtools.mjs storage                 # dump chrome.storage.local
 *   node scripts/devtools.mjs read                    # print the conversation
 *   node scripts/devtools.mjs status                  # chat status + model
 *   node scripts/devtools.mjs send "<prompt>"         # send a message, wait, print reply
 *   node scripts/devtools.mjs logs [seconds]          # stream console logs
 *   node scripts/devtools.mjs network [seconds]       # stream Copilot API requests
 *   node scripts/devtools.mjs screenshot [file.png]   # capture the side panel
 *
 * Options: --port 9222 (default), --target <substr> (default: sidepanel.html)
 */
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const PORT = opt('--port', '9222');
const TARGET = opt('--target', 'sidepanel.html');
// Positional args = everything that isn't a --flag or a --flag's value.
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) i++; // skip flag + its value
  else positional.push(argv[i]);
}
const cmd = positional[0];
const rest = positional.slice(1);

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`).catch(() => null);
  if (!res) {
    throw new Error(
      `No Chrome on port ${PORT}. Start it with scripts/launch-debug-chrome.ps1`,
    );
  }
  return res.json();
}

async function pickTarget() {
  const targets = await listTargets();
  const match = targets.find((t) => (t.url || '').includes(TARGET));
  if (!match) {
    const pages = targets
      .filter((t) => t.type === 'page' || t.type === 'service_worker')
      .map((t) => `  [${t.type}] ${t.title} ${t.url}`)
      .join('\n');
    throw new Error(
      `No target matching "${TARGET}". Is the side panel open?\nAvailable:\n${pages}`,
    );
  }
  return match;
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('WebSocket error')));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      (listeners.get(msg.method) || []).forEach((cb) => cb(msg.params));
    }
  });
  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, cb) {
      listeners.set(method, [...(listeners.get(method) || []), cb]);
    },
    close: () => ws.close(),
  };
}

async function withPanel(fn) {
  const target = await pickTarget();
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  try {
    return await fn(cdp);
  } finally {
    cdp.close();
  }
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  }
  return result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- commands -------------------------------------------------------------

async function cmdTargets() {
  const targets = await listTargets();
  for (const t of targets) {
    if (t.type === 'page' || t.type === 'service_worker' || t.type === 'background_page') {
      console.log(`[${t.type}] ${t.title || ''}\n    ${t.url}`);
    }
  }
}

const requireBridge = `(window.__chatDev || (()=>{throw new Error('window.__chatDev missing — open the side panel (dev build)')})())`;

async function cmdEval(expr) {
  await withPanel(async (cdp) => console.log(JSON.stringify(await evaluate(cdp, expr), null, 2)));
}

async function cmdStorage() {
  await withPanel(async (cdp) =>
    console.log(JSON.stringify(await evaluate(cdp, 'chrome.storage.local.get(null)'), null, 2)),
  );
}

async function cmdRead() {
  await withPanel(async (cdp) => printTranscript(await evaluate(cdp, `${requireBridge}.transcript()`)));
}

async function cmdStatus() {
  await withPanel(async (cdp) => {
    const s = await evaluate(cdp, `({status:${requireBridge}.status(),model:window.__chatDev.model()})`);
    console.log(`status: ${s.status}   model: ${s.model}`);
  });
}

async function cmdSend(text) {
  if (!text) throw new Error('Usage: send "<prompt>"');
  await withPanel(async (cdp) => {
    await evaluate(cdp, `${requireBridge}.send(${JSON.stringify(text)})`);
    console.log(`→ sent: ${text}\n  waiting for reply…`);
    const deadline = Date.now() + 120000;
    let status = 'submitted';
    while (Date.now() < deadline) {
      await sleep(700);
      status = await evaluate(cdp, `window.__chatDev.status()`);
      if (status === 'ready' || status === 'error') break;
    }
    printTranscript(await evaluate(cdp, `window.__chatDev.transcript()`));
    console.log(`\n(status: ${status})`);
  });
}

async function cmdLogs(seconds) {
  const ms = (Number(seconds) || 30) * 1000;
  await withPanel(async (cdp) => {
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.on('Runtime.consoleAPICalled', (p) => {
      const text = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      console.log(`[${p.type}] ${text}`);
    });
    cdp.on('Log.entryAdded', (p) => console.log(`[${p.entry.level}] ${p.entry.text}`));
    cdp.on('Runtime.exceptionThrown', (p) =>
      console.log(`[exception] ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`),
    );
    console.log(`Streaming console for ${ms / 1000}s…`);
    await sleep(ms);
  });
}

async function cmdNetwork(seconds) {
  const ms = (Number(seconds) || 30) * 1000;
  await withPanel(async (cdp) => {
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', (p) => {
      if ((p.request.url || '').includes('githubcopilot.com')) {
        console.log(`→ ${p.request.method} ${p.request.url}`);
      }
    });
    cdp.on('Network.responseReceived', (p) => {
      if ((p.response.url || '').includes('githubcopilot.com')) {
        console.log(`← ${p.response.status} ${p.response.url}`);
      }
    });
    console.log(`Watching Copilot API for ${ms / 1000}s…`);
    await sleep(ms);
  });
}

async function cmdScreenshot(file) {
  const out = file || 'sidepanel.png';
  await withPanel(async (cdp) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`Saved ${out}`);
  });
}

function printTranscript(turns) {
  for (const t of turns) {
    const head = t.role === 'user' ? 'USER' : 'ASSISTANT';
    console.log(`\n── ${head} ──`);
    for (const tool of t.tools || []) {
      console.log(`  🔧 ${tool.type} [${tool.state}]` + (tool.error ? ` ERROR: ${tool.error}` : ''));
      if (tool.output !== undefined) {
        console.log(`     out: ${JSON.stringify(tool.output).slice(0, 300)}`);
      }
    }
    if (t.reasoning) console.log(`  (thinking) ${t.reasoning.slice(0, 400)}`);
    if (t.text) console.log(t.text);
  }
}

// ---- main -----------------------------------------------------------------

try {
  switch (cmd) {
    case 'targets': await cmdTargets(); break;
    case 'eval': await cmdEval(rest[0]); break;
    case 'storage': await cmdStorage(); break;
    case 'read': await cmdRead(); break;
    case 'status': await cmdStatus(); break;
    case 'send': await cmdSend(rest[0]); break;
    case 'logs': await cmdLogs(rest[0]); break;
    case 'network': await cmdNetwork(rest[0]); break;
    case 'screenshot': await cmdScreenshot(rest[0]); break;
    default:
      console.log('Commands: targets | eval | storage | read | status | send | logs | network | screenshot');
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
