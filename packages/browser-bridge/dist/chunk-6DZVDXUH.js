// src/ipc/registry.ts
import { mkdir, readFile, writeFile, chmod } from "fs/promises";
var HEARTBEAT_MAX_AGE_MS = 3e4;
var InstanceSelectionError = class extends Error {
};
var BridgeRegistry = class {
  constructor(paths) {
    this.paths = paths;
  }
  paths;
  /** Create and restrict the private runtime directories before socket bind. */
  prepare() {
    return this.ensureRoot();
  }
  async register(instance) {
    await this.ensureRoot();
    const entries = await this.all();
    const next = [...entries.filter((entry) => entry.id !== instance.id), instance];
    await writeFile(this.paths.registry, JSON.stringify(next), { mode: 384 });
    await chmod(this.paths.registry, 384);
  }
  async unregister(instanceId) {
    await this.ensureRoot();
    const entries = await this.all();
    await writeFile(
      this.paths.registry,
      JSON.stringify(entries.filter((entry) => entry.id !== instanceId)),
      { mode: 384 }
    );
    await chmod(this.paths.registry, 384);
  }
  async healthy(now = Date.now()) {
    return (await this.all()).filter((entry) => now - entry.heartbeatAt <= HEARTBEAT_MAX_AGE_MS);
  }
  async select(id) {
    const instances = await this.healthy();
    if (id) {
      const selected = instances.find((entry) => entry.id === id);
      if (!selected) throw new InstanceSelectionError(`Extension instance ${id} is unavailable.`);
      return selected;
    }
    if (instances.length === 0) throw new InstanceSelectionError("No healthy extension instance is available.");
    if (instances.length > 1) throw new InstanceSelectionError("More than one extension instance is available; choose --instance.");
    return instances[0];
  }
  async all() {
    try {
      const text = await readFile(this.paths.registry, "utf8");
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.filter(isInstance) : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
  async ensureRoot() {
    await mkdir(this.paths.socketDirectory, { recursive: true, mode: 448 });
    await chmod(this.paths.root, 448);
    await chmod(this.paths.socketDirectory, 448);
  }
};
function isInstance(value) {
  if (!value || typeof value !== "object") return false;
  const item = value;
  return typeof item.id === "string" && typeof item.pid === "number" && typeof item.socketPath === "string" && typeof item.token === "string" && typeof item.heartbeatAt === "number";
}

export {
  InstanceSelectionError,
  BridgeRegistry
};
