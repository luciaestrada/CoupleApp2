export function createSignedUrlCache(sign: (path: string) => Promise<string>, now = Date.now) {
  const entries = new Map<string, { url: string; renewAt: number }>();
  const pending = new Map<string, Promise<string>>();
  let revision = 0;
  return {
    async get(path: string, force = false): Promise<string> {
      const cached = entries.get(path);
      if (!force && cached && cached.renewAt > now()) return cached.url;
      const running = pending.get(path);
      if (running) return running;
      const stamp = revision;
      const operation = sign(path).then(url => {
        if (stamp === revision) entries.set(path, { url, renewAt: now() + 240_000 });
        return url;
      }).finally(() => { if (pending.get(path) === operation) pending.delete(path); });
      pending.set(path, operation);
      return operation;
    },
    clear() { revision++; entries.clear(); pending.clear(); },
  };
}
