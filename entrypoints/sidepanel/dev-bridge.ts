import type { AppUIMessage } from '@/lib/chat/app-message';

/**
 * Development-only bridge. Exposes chat controls + state on window.__chatDev and
 * connects out to the local relay (scripts/devbridge-server.mjs) so the CLI
 * (scripts/live.mjs) can drive the side panel running in the user's NORMAL
 * Chrome profile — keeping all Copilot/website auth intact, without remote
 * debugging. Installed only when import.meta.env.DEV is true, so none of this
 * ships in a production build.
 */
export interface ChatDevApi {
  send: (text: string) => void;
  stop: () => void;
  getStatus: () => string;
  getMessages: () => AppUIMessage[];
  getModel: () => string;
  /**
   * Dev-only: add extra tool modules to the next send (e.g. 'browser-control')
   * without persisting or touching DEFAULT_TOOL_MODULES. Used by the
   * browser-control e2e harness to enable the opt-in module for a test run.
   */
  setToolModules: (ids: string[]) => void;
  /**
   * Dev-only: start a fresh chat session, so the e2e harness can isolate each
   * scenario and avoid cross-run context pollution. Resets dev tool modules, so
   * callers must re-issue setToolModules afterwards.
   */
  newChat: () => void;
}

interface FlatPart {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
}

const RELAY = 'http://127.0.0.1:9234';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let relayStarted = false;
const logBuffer: { level: string; text: string; ts: number }[] = [];

export function installDevBridge(api: ChatDevApi): void {
  const transcript = () =>
    api.getMessages().map((m) => {
      const text = m.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('\n');
      const reasoning = m.parts
        .filter((p) => p.type === 'reasoning')
        .map((p) => (p as { text: string }).text)
        .join('\n');
      const tools: FlatPart[] = m.parts
        .filter((p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool')
        .map((p) => {
          const tp = p as unknown as Record<string, unknown>;
          return {
            type: String(tp.type),
            state: tp.state as string | undefined,
            input: tp.input,
            output: tp.output,
            error: tp.errorText as string | undefined,
          };
        });
      // Sub-agent traces (thinking + nested tool calls), so the CLI can verify
      // delegated work end-to-end. Additive — doesn't touch the tools mapping.
      const subagents = m.parts
        .filter((p) => p.type === 'data-subagent')
        .map((p) => (p as unknown as { data: unknown }).data);
      return { role: m.role, text, reasoning, tools, subagents };
    });

  const bridge = {
    send: (text: string) => api.send(text),
    stop: () => api.stop(),
    status: () => api.getStatus(),
    model: () => api.getModel(),
    transcript,
    raw: () => api.getMessages(),
    logs: () => [...logBuffer],
    setToolModules: (ids: string[]) => api.setToolModules(ids),
    newChat: () => api.newChat(),
  };
  (globalThis as Record<string, unknown>).__chatDev = bridge;

  startRelayOnce();
  console.info('[dev-bridge] window.__chatDev ready');
}

/** Reads the current bridge (latest session) each call. */
function current(): Record<string, (...a: unknown[]) => unknown> | undefined {
  return (globalThis as Record<string, unknown>).__chatDev as never;
}

async function runCommand(method: string, args: Record<string, unknown>) {
  const dev = current();
  if (!dev) return { ok: false, error: 'bridge not ready' };
  try {
    switch (method) {
      case 'status':
        return { ok: true, result: dev.status() };
      case 'model':
        return { ok: true, result: dev.model() };
      case 'transcript':
        return { ok: true, result: dev.transcript() };
      case 'raw':
        return { ok: true, result: dev.raw() };
      case 'logs':
        return { ok: true, result: dev.logs() };
      case 'stop':
        dev.stop();
        return { ok: true, result: 'stopped' };
      case 'reload':
        setTimeout(() => location.reload(), 50);
        return { ok: true, result: 'reloading' };
      case 'evalInTab':
        return { ok: true, result: await evalInActiveTab(String(args.code ?? '')) };
      case 'setToolModules':
        dev.setToolModules((args.ids as string[]) ?? []);
        return { ok: true, result: 'set' };
      case 'newChat':
        dev.newChat();
        return { ok: true, result: 'new-chat' };
      case 'send':
        dev.send(String(args.text ?? ''));
        return { ok: true, result: 'sent' };
      case 'sendAndWait': {
        dev.send(String(args.text ?? ''));
        const deadline = Date.now() + 150_000;
        await sleep(400);
        while (Date.now() < deadline) {
          const s = dev.status();
          if (s === 'ready' || s === 'error') break;
          await sleep(400);
        }
        return { ok: true, result: dev.transcript() };
      }
      default:
        return { ok: false, error: `unknown method: ${method}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Dev-only: run a snippet in the user's active tab and return its value. Used to
 * inspect real third-party DOM (e.g. self-hosted Jira) when writing scrapers,
 * instead of guessing selectors. Needs host access to that tab (activeTab grant
 * via the icon, or the all-sites permission). The snippet's last expression is
 * returned; wrap multi-statement code in an IIFE that returns a value.
 */
async function evalInActiveTab(code: string): Promise<unknown> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('no active tab');
  // The snippet is eval'd in the page's MAIN world. We cannot build a function
  // from the string on the panel side (the extension CSP forbids new Function),
  // so we inject a fixed function that evals the passed-in source in the page.
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    args: [code],
    func: (src: string) => {
      try {
        // eslint-disable-next-line no-eval
        return { ok: true, value: (0, eval)(`(${src})`) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
  return res?.result;
}

function startRelayOnce() {
  if (relayStarted) return;
  relayStarted = true;
  captureConsole();
  startKeepAlive();
  void pollLoop();
}

/**
 * Chrome throttles/freezes setTimeout in background (unfocused) windows, which
 * stalls streaming when the panel is driven headlessly. A page playing audio is
 * exempt from that throttling, so we run a silent oscillator. Resumes on any
 * interaction in case the AudioContext starts suspended.
 */
function startKeepAlive() {
  try {
    const AC =
      (globalThis as Record<string, unknown>).AudioContext ||
      (globalThis as Record<string, unknown>).webkitAudioContext;
    if (typeof AC !== 'function') return;
    const ctx = new (AC as new () => AudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001; // inaudible but counts as "playing"
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    const resume = () => {
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    };
    resume();
    for (const ev of ['focus', 'pointerdown', 'keydown', 'visibilitychange']) {
      window.addEventListener(ev, resume, { capture: true });
    }
  } catch {
    /* keep-alive is best-effort */
  }
}

async function pollLoop() {
  for (;;) {
    try {
      const res = await fetch(`${RELAY}/next`);
      if (res.status === 200) {
        const cmd = await res.json();
        const out = await runCommand(cmd.method, cmd.args ?? {});
        await fetch(`${RELAY}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: cmd.id, ...out }),
        });
      }
      // 204 = no work; loop and poll again immediately.
    } catch {
      // Relay not running yet; back off and retry.
      await sleep(1500);
    }
  }
}

function captureConsole() {
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...a: unknown[]) => {
      try {
        logBuffer.push({
          level,
          text: a
            .map((x) => (typeof x === 'string' ? x : safeStringify(x)))
            .join(' '),
          ts: Date.now(),
        });
        if (logBuffer.length > 300) logBuffer.shift();
      } catch {
        /* ignore logging failures */
      }
      original(...a);
    };
  }
}

function safeStringify(x: unknown): string {
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}
