import { describe, expect, it, vi } from 'vitest';
import { TabLeaseStore } from '../../../lib/agent-tools/browser-control/background/tab-leases';

describe('TabLeaseStore', () => {
  it('keeps tab control exclusive while allowing its owner to refresh', () => {
    const leases = new TabLeaseStore(() => 100);

    expect(leases.claim(1, { sessionId: 's1', origin: 'embedded', label: 'Chat session' })).toEqual(
      expect.objectContaining({ sessionId: 's1' }),
    );
    expect(leases.claim(1, { sessionId: 's1', origin: 'embedded', label: 'Chat session' })).toEqual(
      expect.objectContaining({ sessionId: 's1' }),
    );
    expect(() => leases.claim(1, { sessionId: 's2', origin: 'mcp', label: 'Codex' })).toThrow(
      expect.objectContaining({ code: 'TAB_LEASED', origin: 'embedded' }),
    );
  });

  it('closes a newly-created tab if claiming it fails', async () => {
    const leases = new TabLeaseStore(() => 100);
    leases.claim(9, { sessionId: 'other', origin: 'embedded', label: 'Other chat' });
    const closeTab = vi.fn().mockResolvedValue(undefined);

    await expect(
      leases.claimCreatedTab(
        async () => 9,
        closeTab,
        { sessionId: 'mine', origin: 'mcp', label: 'Codex' },
      ),
    ).rejects.toMatchObject({ code: 'TAB_LEASED' });

    expect(closeTab).toHaveBeenCalledWith(9);
  });

  it('lets a reloaded embedded client reclaim only an orphaned embedded lease', () => {
    const leases = new TabLeaseStore(() => 100);
    leases.claim(1, { sessionId: 'old-chat', origin: 'embedded', label: 'Chat session' });
    leases.orphanSession('old-chat');

    expect(
      leases.claim(1, { sessionId: 'new-chat', origin: 'embedded', label: 'Chat session' }),
    ).toEqual(expect.objectContaining({ sessionId: 'new-chat', state: 'active' }));

    leases.orphanSession('new-chat');
    expect(() =>
      leases.claim(1, { sessionId: 'mcp-session', origin: 'mcp', label: 'Codex' }),
    ).toThrow(expect.objectContaining({ code: 'TAB_LEASED' }));
  });
});
