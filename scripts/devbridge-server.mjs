/**
 * Dev bridge relay (real-profile live control, no remote debugging).
 *
 * A dependency-free HTTP long-poll relay that lets the CLI (scripts/live.mjs)
 * drive the extension running in your NORMAL Chrome profile — so all your
 * Copilot and website (e.g. Jira) auth is intact.
 *
 *   CLI  --POST /command-->  relay  --GET /next (long-poll)-->  extension
 *   CLI  <--result--------   relay  <--POST /result---------    extension
 *
 * The extension side is the dev-only window.__chatDev bridge
 * (entrypoints/sidepanel/dev-bridge.ts), active only in dev builds.
 *
 * Run it (and leave it running, alongside `pnpm dev`):
 *   node scripts/devbridge-server.mjs            # default port 9234
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.DEVBRIDGE_PORT) || 9234;
const POLL_HOLD_MS = 25_000; // how long /next is held open
const COMMAND_TIMEOUT_MS = 180_000; // max wait for a command result
const DELIVERY_TIMEOUT_MS = 8_000; // fail fast if the extension isn't connected

let counter = 0;
const queue = []; // commands awaiting an extension poll
const polls = []; // pending /next responses (the extension waiting for work)
const pending = new Map(); // id -> { resolve, timer }
let lastPollAt = 0;

const json = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });

function deliverNext() {
  while (queue.length && polls.length) {
    const res = polls.shift();
    res.__cleanup?.();
    // A panel reload can leave its long poll queued briefly. Never consume a
    // command with that dead response or the caller waits for the full timeout.
    if (res.destroyed || res.writableEnded) continue;
    const cmd = queue.shift();
    json(res, 200, cmd);
  }
}

const server = createServer(async (req, res) => {
  const { method } = req;
  const url = new URL(req.url, 'http://localhost');

  if (method === 'OPTIONS') return json(res, 204, {});

  // --- extension: long-poll for the next command ---
  if (method === 'GET' && url.pathname === '/next') {
    lastPollAt = Date.now();
    if (queue.length) return json(res, 200, queue.shift());
    res.__cleanup = () => {
      clearTimeout(res.__holdTimer);
      const i = polls.indexOf(res);
      if (i >= 0) polls.splice(i, 1);
    };
    res.__holdTimer = setTimeout(() => {
      res.__cleanup();
      if (!res.destroyed && !res.writableEnded) json(res, 204, {});
    }, POLL_HOLD_MS);
    polls.push(res);
    req.once('close', res.__cleanup);
    res.once('close', res.__cleanup);
    return;
  }

  // --- extension: report a command result ---
  if (method === 'POST' && url.pathname === '/result') {
    const { id, ok, result, error } = await readBody(req);
    const waiter = pending.get(id);
    if (waiter) {
      clearTimeout(waiter.timer);
      pending.delete(id);
      waiter.resolve({ ok, result, error });
    }
    return json(res, 200, {});
  }

  // --- CLI: submit a command, wait for the result ---
  if (method === 'POST' && url.pathname === '/command') {
    const { method: cmdMethod, args } = await readBody(req);
    const id = ++counter;
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, error: 'timed out waiting for the extension' });
      }, COMMAND_TIMEOUT_MS);
      pending.set(id, { resolve, timer });

      queue.push({ id, method: cmdMethod, args: args ?? {} });
      deliverNext();

      // If nothing picked it up promptly, the panel probably isn't open.
      setTimeout(() => {
        const i = queue.findIndex((c) => c.id === id);
        if (i >= 0) {
          queue.splice(i, 1);
          const w = pending.get(id);
          if (w) {
            clearTimeout(w.timer);
            pending.delete(id);
            w.resolve({
              ok: false,
              error:
                'extension not connected — open the side panel in the dev build (and check pnpm dev is running)',
            });
          }
        }
      }, DELIVERY_TIMEOUT_MS);
    });
    return json(res, 200, result);
  }

  // --- CLI: health / connection check ---
  if (method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      extensionConnected: polls.length > 0 || Date.now() - lastPollAt < 30_000,
      waitingPolls: polls.length,
      queued: queue.length,
    });
  }

  json(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dev bridge relay listening on http://127.0.0.1:${PORT}`);
  console.log('Leave this running. Open the side panel (dev build) to connect.');
});
