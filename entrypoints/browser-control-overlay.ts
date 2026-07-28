import { defineUnlistedScript } from '#imports';
import { CursorMoveSchema } from '@ai-page-chat/browser-control-protocol';
import { CursorController } from '@/lib/agent-tools/browser-control/overlay/cursor-controller';

export default defineUnlistedScript(() => {
  const cursor = new CursorController({
    document,
    reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    onArrived: (arrival) => {
      // A page can retain this isolated world for a moment while the extension
      // reloads. Treat that context-invalidated race as teardown, not as an
      // unhandled page error in chrome://extensions.
      try {
        chrome.runtime.sendMessage(arrival, () => {
          // Reading lastError consumes Chrome's callback-form delivery failure.
          void chrome.runtime.lastError;
        });
      } catch {
        // An invalidated extension context can throw before registering a callback.
      }
    },
  });
  chrome.runtime.onMessage.addListener((message) => {
    const parsed = CursorMoveSchema.safeParse(message);
    if (!parsed.success) return;
    void cursor.move(parsed.data);
  });
  addEventListener('pagehide', () => cursor.dispose(), { once: true });
});
