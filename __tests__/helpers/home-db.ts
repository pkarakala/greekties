/** Synthetic query service: no real client, keys, storage, or network. */
export type Row = Record<string, any>;
export type Result = { data: any; error: { message: string } | null };
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function homeDb() {
  const rows: Record<string, Row[]> = {
    chapters: [
      {
        id: 'chapter-a',
        name: 'Sigma Phi Epsilon',
        designation: 'California Gamma',
        university: 'UCSB',
      },
      { id: 'chapter-b', name: 'Pi Beta Phi', designation: 'California Zeta', university: 'UCSB' },
    ],
    events: [],
    job_postings: [],
    channel_messages: [],
  };
  const queued: Record<string, Promise<Result>[]> = {};
  const calls: { table: string; steps: [string, ...any[]][] }[] = [];
  function from(table: string) {
    const call = { table, steps: [] as [string, ...any[]][] };
    calls.push(call);
    const queuedResult = queued[table]?.shift();
    let filtered = [...rows[table]];
    let single = false;
    const value = (row: Row, key: string) => key.split('.').reduce((v, k) => v?.[k], row);
    const query: any = {};
    for (const method of ['select', 'eq', 'gt', 'or', 'not', 'order', 'limit', 'maybeSingle']) {
      query[method] = (...args: any[]) => {
        call.steps.push([method, ...args]);
        const [column, param] = args;
        if (method === 'eq') filtered = filtered.filter((r) => value(r, column) === param);
        if (method === 'gt') filtered = filtered.filter((r) => value(r, column) > param);
        if (method === 'not')
          filtered = filtered.filter(
            (r) => !args[2].slice(1, -1).split(',').includes(value(r, column)),
          );
        if (method === 'or' && column.startsWith('is_open'))
          filtered = filtered.filter((r) => r.is_open !== false);
        if (method === 'or' && column.startsWith('ends_at'))
          filtered = filtered.filter(
            (r) => !r.ends_at || r.ends_at > column.split('ends_at.gt.')[1],
          );
        if (method === 'order')
          filtered.sort(
            (a, b) =>
              String(value(a, column)).localeCompare(String(value(b, column))) *
              (param.ascending ? 1 : -1),
          );
        if (method === 'limit') filtered = filtered.slice(0, column);
        if (method === 'maybeSingle') single = true;
        return query;
      };
    }
    query.then = (yes: any, no: any) =>
      (
        queuedResult ??
        Promise.resolve({ data: single ? (filtered[0] ?? null) : filtered, error: null })
      ).then(yes, no);
    return query;
  }
  return { rows, queued, calls, from };
}
