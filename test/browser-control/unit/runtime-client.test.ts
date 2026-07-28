import { describe, expect, it, vi } from 'vitest';
import { BrowserControlClient } from '../../../lib/agent-tools/browser-control/client/runtime-client';
import { PROTOCOL_VERSION, type BrowserControlRequest } from '@ai-page-chat/browser-control-protocol';

class FakePort {
  readonly onMessage = { listeners: new Set<(message: unknown) => void>(), addListener: (listener: (message: unknown) => void) => this.onMessage.listeners.add(listener), removeListener: (listener: (message: unknown) => void) => this.onMessage.listeners.delete(listener) };
  readonly onDisconnect = { listeners: new Set<() => void>(), addListener: (listener: () => void) => this.onDisconnect.listeners.add(listener), removeListener: (listener: () => void) => this.onDisconnect.listeners.delete(listener) };
  sent: BrowserControlRequest[] = [];

  postMessage(message: BrowserControlRequest) {
    this.sent.push(message);
  }

  respond(message: unknown) {
    for (const listener of this.onMessage.listeners) listener(message);
  }

  disconnect() {
    for (const listener of this.onDisconnect.listeners) listener();
  }
}

async function respondAfterRequest(port: FakePort, requestIndex: number, message: unknown) {
  await vi.waitFor(() => expect(port.sent).toHaveLength(requestIndex + 1));
  port.respond(message);
}

describe('BrowserControlClient', () => {
  it('calls the default ID factory with its Crypto receiver', async () => {
    const port = new FakePort();
    port.postMessage = (message: BrowserControlRequest) => {
      port.sent.push(message);
      queueMicrotask(() => port.respond({
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        ok: true,
        result: { browserSessionId: 'session-1', resumeToken: 'resume-1' },
      }));
    };
    const strictCrypto = {
      randomUUID() {
        if (this !== strictCrypto) throw new TypeError('Illegal invocation');
        return 'request-1';
      },
    };
    vi.stubGlobal('crypto', strictCrypto);
    try {
      await expect(new BrowserControlClient({ connect: () => port }).startSession())
        .resolves.toEqual({ browserSessionId: 'session-1', resumeToken: 'resume-1' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects pending requests when its runtime port disconnects', async () => {
    const port = new FakePort();
    const client = new BrowserControlClient({ connect: () => port, createId: () => 'request-1' });

    const pending = client.request({ type: 'browser.status' });
    port.disconnect();

    await expect(pending).rejects.toMatchObject({ code: 'CONNECTION_LOST' });
  });

  it('retains the session resume token in process memory and resumes after reconnect', async () => {
    const first = new FakePort();
    const second = new FakePort();
    let connections = 0;
    const ids = ['request-1', 'request-2'];
    const client = new BrowserControlClient({
      connect: () => (connections++ === 0 ? first : second),
      createId: () => ids.shift()!,
    });

    const started = client.startSession();
    first.respond({ protocolVersion: PROTOCOL_VERSION, requestId: 'request-1', ok: true, result: { browserSessionId: 'session-1', resumeToken: 'token-1' } });
    await started;
    first.disconnect();
    const resumed = client.resumeSession();
    second.respond({ protocolVersion: PROTOCOL_VERSION, requestId: 'request-2', ok: true, result: { browserSessionId: 'session-1' } });
    await resumed;

    expect(second.sent[0]).toMatchObject({ browserSessionId: 'session-1', command: { type: 'session.resume', resumeToken: 'token-1' } });
  });

  it('claims the active tab when a new turn starts so existing tools remain lease-safe', async () => {
    const port = new FakePort();
    const ids = ['start', 'turn', 'list', 'claim', 'end'];
    const client = new BrowserControlClient({ connect: () => port, createId: () => ids.shift()! });

    const turn = client.startTurn();
    await respondAfterRequest(port, 0, { protocolVersion: PROTOCOL_VERSION, requestId: 'start', ok: true, result: { browserSessionId: 'session-1', resumeToken: 'token-1' } });
    await respondAfterRequest(port, 1, { protocolVersion: PROTOCOL_VERSION, requestId: 'turn', ok: true, result: { turnId: 'turn-1' } });
    await respondAfterRequest(port, 2, { protocolVersion: PROTOCOL_VERSION, requestId: 'list', ok: true, result: { tabs: [{ id: 7, active: true }] } });
    await respondAfterRequest(port, 3, { protocolVersion: PROTOCOL_VERSION, requestId: 'claim', ok: true, result: { tabId: 7 } });

    await expect(turn).resolves.toBe('turn-1');
    expect(port.sent.map((request) => request.command.type)).toEqual([
      'session.start',
      'turn.start',
      'tabs.list',
      'tabs.claim',
    ]);

    const ended = client.endTurn();
    await respondAfterRequest(port, 4, { protocolVersion: PROTOCOL_VERSION, requestId: 'end', ok: true, result: { ended: true } });
    await ended;
    expect(port.sent[4]).toMatchObject({
      browserSessionId: 'session-1',
      turnId: 'turn-1',
      command: { type: 'turn.end' },
    });
  });

  it('ends the active turn and browser session when its owning chat is disposed', async () => {
    const port = new FakePort();
    const ids = ['start', 'turn', 'list', 'claim', 'turn-end', 'session-end'];
    const client = new BrowserControlClient({ connect: () => port, createId: () => ids.shift()! });

    const turn = client.startTurn();
    await respondAfterRequest(port, 0, { protocolVersion: PROTOCOL_VERSION, requestId: 'start', ok: true, result: { browserSessionId: 'session-1', resumeToken: 'token-1' } });
    await respondAfterRequest(port, 1, { protocolVersion: PROTOCOL_VERSION, requestId: 'turn', ok: true, result: { turnId: 'turn-1' } });
    await respondAfterRequest(port, 2, { protocolVersion: PROTOCOL_VERSION, requestId: 'list', ok: true, result: { tabs: [{ id: 7, active: true }] } });
    await respondAfterRequest(port, 3, { protocolVersion: PROTOCOL_VERSION, requestId: 'claim', ok: true, result: { tabId: 7 } });
    await turn;

    const ended = client.endSession();
    await respondAfterRequest(port, 4, { protocolVersion: PROTOCOL_VERSION, requestId: 'turn-end', ok: true, result: { ended: true } });
    await respondAfterRequest(port, 5, { protocolVersion: PROTOCOL_VERSION, requestId: 'session-end', ok: true, result: { ended: true } });
    await ended;
    await client.endSession();

    expect(port.sent.map((request) => request.command.type)).toEqual([
      'session.start',
      'turn.start',
      'tabs.list',
      'tabs.claim',
      'turn.end',
      'session.end',
    ]);
  });
});
