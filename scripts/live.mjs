/**
 * Drive the live extension in your NORMAL Chrome profile (full auth intact),
 * via the dev bridge relay — no remote debugging, no separate profile.
 *
 * Prereqs (all in your own terminals, left running):
 *   1. node scripts/devbridge-server.mjs    # the relay
 *   2. pnpm dev                             # the dev build
 *   3. open the side panel in Chrome (dev build), signed in
 *
 * Commands:
 *   node scripts/live.mjs health                 # is the panel connected?
 *   node scripts/live.mjs status                 # chat status + model
 *   node scripts/live.mjs send "summarize this page"   # drive the agent, print reply
 *   node scripts/live.mjs read                   # transcript (text + tool calls)
 *   node scripts/live.mjs logs                   # recent side-panel console logs
 *   node scripts/live.mjs external on|off        # enable the dev bridge's MCP route
 *   node scripts/live.mjs stop                   # abort the current stream
 */
const RELAY = process.env.DEVBRIDGE_URL || 'http://127.0.0.1:9234';
const [cmd, ...rest] = process.argv.slice(2);

async function call(method, args = {}) {
  let res;
  try {
    res = await fetch(`${RELAY}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args }),
    });
  } catch {
    throw new Error(`relay not running — start it: node scripts/devbridge-server.mjs`);
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'command failed');
  return data.result;
}

function printTranscript(turns) {
  for (const t of turns || []) {
    console.log(`\n── ${t.role === 'user' ? 'USER' : 'ASSISTANT'} ──`);
    for (const tool of t.tools || []) {
      console.log(`  🔧 ${tool.type} [${tool.state}]` + (tool.error ? ` ERROR: ${tool.error}` : ''));
      if (tool.output !== undefined) {
        console.log(`     out: ${JSON.stringify(tool.output).slice(0, 300)}`);
      }
    }
    for (const sa of t.subagents || []) {
      console.log(`  🤖 ${sa.label} [${sa.status}] · ${(sa.steps || []).length} steps`);
      for (const step of sa.steps || []) {
        if (step.kind === 'reasoning') {
          const txt = (step.text || '').replace(/\s+/g, ' ').trim();
          if (txt) console.log(`     💭 ${txt.slice(0, 200)}`);
        } else {
          let line = `     🔧 ${step.toolName} [${step.state}]`;
          if (step.errorText) line += ` ERROR: ${step.errorText}`;
          else if (step.output !== undefined)
            line += ` out: ${JSON.stringify(step.output).slice(0, 200)}`;
          console.log(line);
        }
      }
    }
    if (t.reasoning) console.log(`  (thinking) ${t.reasoning.slice(0, 400)}`);
    if (t.text) console.log(t.text);
  }
}

try {
  switch (cmd) {
    case 'health': {
      const res = await fetch(`${RELAY}/health`).catch(() => null);
      if (!res) throw new Error('relay not running — start it: node scripts/devbridge-server.mjs');
      const h = await res.json();
      console.log(h.extensionConnected ? '✓ side panel connected' : '✗ side panel NOT connected (open it in the dev build)');
      console.log(JSON.stringify(h));
      break;
    }
    case 'status': {
      const [status, model] = await Promise.all([call('status'), call('model')]);
      console.log(`status: ${status}   model: ${model}`);
      break;
    }
    case 'send':
      if (!rest[0]) throw new Error('Usage: live.mjs send "<prompt>"');
      console.log(`→ sent: ${rest[0]}\n  waiting for reply…`);
      printTranscript(await call('sendAndWait', { text: rest[0] }));
      break;
    case 'read':
      printTranscript(await call('transcript'));
      break;
    case 'logs':
      for (const l of await call('logs')) console.log(`[${l.level}] ${l.text}`);
      break;
    case 'stop':
      console.log(await call('stop'));
      break;
    case 'reload':
      console.log(await call('reload'));
      break;
    case 'tools': {
      // Dev: add opt-in tool modules to the next send without persisting them.
      // e.g. node scripts/live.mjs tools browser-control
      const ids = rest.filter(Boolean);
      console.log(await call('setToolModules', { ids }));
      console.log(`extra tool modules for next send: ${ids.join(', ') || '(none)'}`);
      break;
    }
    case 'external': {
      const enabled = rest[0] !== 'off';
      console.log(await call('setExternalBrowserControl', { enabled }));
      break;
    }
    case 'browser-status':
      console.log(JSON.stringify(await call('browserControlStatus'), null, 2));
      break;
    case 'inspect': {
      // Dev: run a JS expression in the active tab, print the JSON result.
      // e.g. node scripts/live.mjs inspect "document.title"
      if (!rest[0]) throw new Error('Usage: live.mjs inspect "<js expression>"');
      const out = await call('evalInTab', { code: rest[0] });
      console.log(JSON.stringify(out, null, 2));
      break;
    }
    default:
      console.log('Commands: health | status | browser-status | send "<prompt>" | read | logs | stop | reload | tools <id…> | external on|off | inspect "<js>"');
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
