import { describe, expect, it } from 'vitest';
import { TabQueue } from '../../../lib/agent-tools/browser-control/background/tab-queue';

describe('TabQueue', () => {
  it('runs mutations for a tab in request order', async () => {
    const queue = new TabQueue();
    const events: string[] = [];

    const first = queue.enqueue(1, 'first', async () => {
      events.push('first:start');
      await Promise.resolve();
      events.push('first:end');
      return 1;
    });
    const second = queue.enqueue(1, 'second', async () => {
      events.push('second:start');
      return 2;
    });

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('removes queued work and aborts active work on cancellation', async () => {
    const queue = new TabQueue();
    let rejectActive!: (error: Error) => void;
    const active = queue.enqueue(1, 'active', (signal) =>
      new Promise((_, reject) => {
        rejectActive = reject;
        signal.addEventListener('abort', () => reject(new Error('active aborted')));
      }),
    );
    const queued = queue.enqueue(1, 'queued', async () => 'never');

    await Promise.resolve();
    queue.cancel('queued');
    queue.cancel('active');
    rejectActive(new Error('active aborted'));

    await expect(active).rejects.toThrow('active aborted');
    await expect(queued).rejects.toMatchObject({ code: 'COMMAND_CANCELLED' });
  });
});
