export interface PageSnapshot<T> { items: T[]; more: boolean; loaded: boolean }

/** Cursor pagination reconciles the entire visible interval, not just page one. */
export function createPagedCollection<T extends { id: string }>({ load, compare, onData, pageSize = 50 }: {
  load(cursor: T | null): Promise<T[]>;
  compare(left: T, right: T): number;
  onData(snapshot: PageSnapshot<T>): void;
  pageSize?: number;
}) {
  let state: PageSnapshot<T> = { items: [], more: false, loaded: false };
  let disposed = false, again = false;
  let refreshPromise: Promise<void> | undefined;
  let serial = Promise.resolve();
  function enqueue(work: () => Promise<void>) {
    const result = serial.then(() => disposed ? undefined : work());
    serial = result.catch(() => {});
    return result;
  }
  const unique = (items: T[]) => [...new Map(items.map(item => [item.id, item])).values()].sort(compare);
  function publish(items: T[], more: boolean) {
    if (disposed) return;
    state = { items: unique(items), more, loaded: true };
    onData(state);
  }
  async function reconcile() {
    const boundary = state.items.at(-1) ?? null;
    let cursor: T | null = null, rows: T[] = [], page: T[];
    do {
      page = await load(cursor);
      if (disposed) return;
      rows.push(...page);
      const last = page.at(-1);
      if (!last || last.id === cursor?.id) break;
      cursor = last;
    } while (boundary && page.length === pageSize && cursor && compare(cursor, boundary) < 0);
    const visible = boundary ? rows.filter(row => compare(row, boundary) <= 0) : rows;
    publish(visible, rows.length > visible.length || page.length === pageSize);
  }
  function refresh(): Promise<void> {
    again = true;
    if (refreshPromise) return refreshPromise;
    refreshPromise = enqueue(async () => {
      do { again = false; await reconcile(); } while (again && !disposed);
    }).finally(() => { refreshPromise = undefined; });
    return refreshPromise;
  }
  function next() {
    return enqueue(async () => {
      if (state.loaded && !state.more) return;
      const rows = await load(state.items.at(-1) ?? null);
      publish([...state.items, ...rows], rows.length === pageSize);
    });
  }
  return { refresh, next, snapshot: () => state, dispose: () => { disposed = true; } };
}
