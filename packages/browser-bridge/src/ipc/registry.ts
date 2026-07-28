import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import type { BridgePaths } from './paths.js';

const HEARTBEAT_MAX_AGE_MS = 30_000;

export interface BridgeInstance {
  id: string;
  pid: number;
  socketPath: string;
  token: string;
  heartbeatAt: number;
}

export class InstanceSelectionError extends Error {}

/** File-backed discovery is local-only; no TCP endpoint or shared registry exists. */
export class BridgeRegistry {
  constructor(private readonly paths: BridgePaths) {}

  /** Create and restrict the private runtime directories before socket bind. */
  prepare(): Promise<void> {
    return this.ensureRoot();
  }

  async register(instance: BridgeInstance): Promise<void> {
    await this.ensureRoot();
    const entries = await this.all();
    const next = [...entries.filter((entry) => entry.id !== instance.id), instance];
    await writeFile(this.paths.registry, JSON.stringify(next), { mode: 0o600 });
    await chmod(this.paths.registry, 0o600);
  }

  async unregister(instanceId: string): Promise<void> {
    await this.ensureRoot();
    const entries = await this.all();
    await writeFile(
      this.paths.registry,
      JSON.stringify(entries.filter((entry) => entry.id !== instanceId)),
      { mode: 0o600 },
    );
    await chmod(this.paths.registry, 0o600);
  }

  async healthy(now = Date.now()): Promise<BridgeInstance[]> {
    return (await this.all()).filter((entry) => now - entry.heartbeatAt <= HEARTBEAT_MAX_AGE_MS);
  }

  async select(id?: string): Promise<BridgeInstance> {
    const instances = await this.healthy();
    if (id) {
      const selected = instances.find((entry) => entry.id === id);
      if (!selected) throw new InstanceSelectionError(`Extension instance ${id} is unavailable.`);
      return selected;
    }
    if (instances.length === 0) throw new InstanceSelectionError('No healthy extension instance is available.');
    if (instances.length > 1) throw new InstanceSelectionError('More than one extension instance is available; choose --instance.');
    return instances[0];
  }

  private async all(): Promise<BridgeInstance[]> {
    try {
      const text = await readFile(this.paths.registry, 'utf8');
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isInstance) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.paths.socketDirectory, { recursive: true, mode: 0o700 });
    await chmod(this.paths.root, 0o700);
    await chmod(this.paths.socketDirectory, 0o700);
  }
}

function isInstance(value: unknown): value is BridgeInstance {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<BridgeInstance>;
  return typeof item.id === 'string' && typeof item.pid === 'number' && typeof item.socketPath === 'string' && typeof item.token === 'string' && typeof item.heartbeatAt === 'number';
}
