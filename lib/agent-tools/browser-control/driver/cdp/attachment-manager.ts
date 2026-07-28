import type { DebuggerTransport } from './debugger-transport';
import { isRestrictedUrl } from '../extension/restricted-urls';

interface Attachment {
  sessions: Set<string>;
  childSessions: Map<string, string | undefined>;
  pendingChildSessions: Set<string>;
}

interface TargetInfo {
  type?: string;
  targetId?: string;
  url?: string;
}

/** Owns debugger lifetime independently of any model tool implementation. */
export class AttachmentManager {
  private readonly attachments = new Map<number, Attachment>();
  private readonly operations = new Map<number, Promise<void>>();

  constructor(private readonly transport: DebuggerTransport) {
    transport.onEvent((event) => {
      if (event.method !== 'Target.attachedToTarget') return;
      const params = event.params as { sessionId?: string; targetInfo?: TargetInfo } | undefined;
      if (!params?.sessionId || params.targetInfo?.type !== 'iframe') return;
      if (params.targetInfo.url && isRestrictedUrl(params.targetInfo.url)) return;
      void this.registerChild(event.tabId, params.sessionId, params.targetInfo);
    });
    transport.onDetach(({ tabId, reason, sessionId, targetId }) => {
      const attachment = this.attachments.get(tabId);
      if (!attachment) return;
      if (sessionId) {
        attachment.childSessions.delete(sessionId);
        return;
      }
      if (targetId) {
        for (const [childSessionId, childTargetId] of attachment.childSessions) {
          if (childTargetId === targetId) attachment.childSessions.delete(childSessionId);
        }
        return;
      }
      // Chrome omits child identity when some auto-attached iframe targets
      // close. Verify the root's real debugger state before interpreting the
      // ambiguous event as a root detach.
      if (reason === 'target_closed') {
        void this.removeIfRootDetached(tabId);
        return;
      }
      this.attachments.delete(tabId);
    });
  }

  async ensure(tabId: number, browserSessionId: string): Promise<void> {
    return this.serialize(tabId, () => this.ensureExclusive(tabId, browserSessionId));
  }

  async release(tabId: number, browserSessionId: string): Promise<void> {
    return this.serialize(tabId, () => this.releaseExclusive(tabId, browserSessionId));
  }

  /** Release every debugger reference owned by a session during end/disconnect. */
  async releaseSession(browserSessionId: string): Promise<void> {
    await Promise.all(
      [...this.attachments.entries()]
        .filter(([, attachment]) => attachment.sessions.has(browserSessionId))
        .map(([tabId]) => this.release(tabId, browserSessionId)),
    );
  }

  async markSuspect(tabId: number): Promise<void> {
    return this.serialize(tabId, async () => {
      if (!this.attachments.has(tabId)) return;
      this.attachments.delete(tabId);
      await this.transport.detach(tabId).catch(() => {});
    });
  }

  isAttached(tabId: number): boolean {
    return this.attachments.has(tabId);
  }

  childSessionIds(tabId: number): string[] {
    return [...(this.attachments.get(tabId)?.childSessions.keys() ?? [])];
  }

  childFrameId(tabId: number, sessionId: string): string | undefined {
    return this.attachments.get(tabId)?.childSessions.get(sessionId);
  }

  async reconcile(activeTabIds: Set<number>): Promise<void> {
    await Promise.all(
      [...this.attachments.keys()]
        .filter((tabId) => !activeTabIds.has(tabId))
        .map((tabId) => this.markSuspect(tabId)),
    );
  }

  private async ensureExclusive(tabId: number, browserSessionId: string): Promise<void> {
    const existing = this.attachments.get(tabId);
    if (existing) {
      existing.sessions.add(browserSessionId);
      return;
    }
    await this.transport.attach(tabId);
    const attachment: Attachment = {
      sessions: new Set([browserSessionId]),
      childSessions: new Map(),
      pendingChildSessions: new Set(),
    };
    this.attachments.set(tabId, attachment);
    try {
      await this.initializeRoot(tabId);
    } catch (error) {
      this.attachments.delete(tabId);
      await this.transport.detach(tabId).catch(() => {});
      throw error;
    }
  }

  private async releaseExclusive(tabId: number, browserSessionId: string): Promise<void> {
    const attachment = this.attachments.get(tabId);
    if (!attachment) return;
    attachment.sessions.delete(browserSessionId);
    if (attachment.sessions.size > 0) return;
    this.attachments.delete(tabId);
    await this.transport.detach(tabId);
  }

  private serialize<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
    // Session disposal and a replacement chat can overlap during React
    // unmount/remount. Queue attach/detach per tab so a late detach from the
    // old session cannot tear down the replacement session's fresh debugger.
    const previous = this.operations.get(tabId) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(() => undefined, () => undefined);
    this.operations.set(tabId, settled);
    void settled.then(() => {
      if (this.operations.get(tabId) === settled) this.operations.delete(tabId);
    });
    return result;
  }

  private async initializeRoot(tabId: number): Promise<void> {
    await this.transport.send(tabId, 'Page.enable');
    await this.transport.send(tabId, 'Runtime.enable');
    // A prior debugger or interrupted automation session can leave the target
    // silently ignoring otherwise valid Input-domain commands.
    await this.transport.send(tabId, 'Input.setIgnoreInputEvents', { ignore: false });
    // Target focus is distinct from tab activation when another Chrome window
    // is frontmost; emulate it so trusted pointer/key events are not discarded.
    await this.transport.send(tabId, 'Emulation.setFocusEmulationEnabled', { enabled: true });
  }

  private async initializeChild(tabId: number, sessionId: string): Promise<void> {
    await this.transport.send(tabId, 'Page.enable', undefined, sessionId);
    await this.transport.send(tabId, 'Runtime.enable', undefined, sessionId);
  }

  private async registerChild(tabId: number, sessionId: string, targetInfo: TargetInfo): Promise<void> {
    const attachment = this.attachments.get(tabId);
    if (
      !attachment
      || attachment.childSessions.has(sessionId)
      || attachment.pendingChildSessions.has(sessionId)
    ) return;
    attachment.pendingChildSessions.add(sessionId);
    try {
      const targets = await this.transport.getTargets();
      const discovered = targets.find((target) => {
        const info = target as { id?: string };
        return info.id === targetInfo.targetId;
      }) as { url?: string } | undefined;
      const url = targetInfo.url || discovered?.url;
      // Never issue a child command until Chrome identifies the target as an
      // ordinary web URL. Password-manager extension frames can initially
      // arrive with an empty URL and reject the entire command.
      if (!url || isRestrictedUrl(url)) return;
      await this.initializeChild(tabId, sessionId);
      if (this.attachments.get(tabId) === attachment) {
        attachment.childSessions.set(sessionId, targetInfo.targetId);
      }
    } catch {
      // A child target is optional. Root-page control must survive its failure.
    } finally {
      attachment.pendingChildSessions.delete(sessionId);
    }
  }

  private async removeIfRootDetached(tabId: number): Promise<void> {
    const targets = await this.transport.getTargets().catch(() => []);
    const rootStillAttached = targets.some((target) => {
      const info = target as { tabId?: number; attached?: boolean };
      return info.tabId === tabId && info.attached === true;
    });
    if (!rootStillAttached) this.attachments.delete(tabId);
  }
}
