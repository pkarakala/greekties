/** Local synthetic query engine. It exercises query construction, not SQL/RLS. */
export type Row = Record<string, any>;
export type Result = { data: any; error: { message: string } | null; count?: number | null };
export type Call = { table: string; steps: [string, ...any[]][] };
export { deferred } from './home-db';
export function slice5Db() {
  const rows: Record<string, Row[]> = {
    events: [],
    event_rsvps: [],
    profiles: [],
    job_postings: [],
    channels: [],
  };
  const calls: Call[] = [];
  let intercept: ((call: Call, fallback: Result) => Promise<Result> | Result | undefined) | null =
    null;
  function from(table: string) {
    const call: Call = { table, steps: [] };
    calls.push(call);
    const q: any = {};
    for (const method of [
      'select',
      'eq',
      'neq',
      'gt',
      'or',
      'in',
      'order',
      'range',
      'limit',
      'maybeSingle',
      'upsert',
      'update',
      'delete',
      'insert',
    ]) {
      q[method] = (...args: any[]) => {
        call.steps.push([method, ...args]);
        return q;
      };
    }
    q.then = (yes: any, no: any) => {
      let data = [...(rows[table] ?? [])];
      let single = false,
        head = false;
      const orders: any[] = [];
      for (const [m, a, b] of call.steps) {
        if (m === 'eq') data = data.filter((r) => r[a] === b);
        if (m === 'neq') data = data.filter((r) => r[a] !== b);
        if (m === 'in') data = data.filter((r) => b.includes(r[a]));
        if (m === 'gt') data = data.filter((r) => r[a] > b);
        if (m === 'or' && a.startsWith('name.imatch.')) {
          const match = /^name\.imatch\.("(?:[^"\\]|\\.)*")/.exec(a)!;
          const literal = JSON.parse(match[1]);
          const regex = new RegExp(literal, 'i');
          data = data.filter((r) =>
            ['name', 'company', 'job_title', 'city', 'role'].some((c) => regex.test(r[c] ?? '')),
          );
        }
        if (m === 'or' && a.startsWith('starts_at.gt.')) {
          const now = a.split(',')[0].slice('starts_at.gt.'.length);
          data = data.filter((r) => r.starts_at > now || r.ends_at > now);
        }
        if (m === 'select') head = b?.head === true;
        if (m === 'order') orders.push([a, b]);
        if (m === 'maybeSingle') single = true;
      }
      data.sort((a, b) => {
        for (const [key, opt] of orders) {
          const cmp = String(a[key] ?? '\uffff').localeCompare(String(b[key] ?? '\uffff'));
          if (cmp) return cmp * (opt?.ascending === false ? -1 : 1);
        }
        return 0;
      });
      const count = data.length;
      for (const [m, a, b] of call.steps) {
        if (m === 'range') data = data.slice(a, b + 1);
        if (m === 'limit') data = data.slice(0, a);
      }
      const fallback = {
        data: head ? null : single ? (data[0] ?? null) : data,
        count,
        error: null,
      };
      return Promise.resolve()
        .then(() => intercept?.(call, fallback) ?? fallback)
        .then(yes, no);
    };
    return q;
  }
  return {
    rows,
    calls,
    from,
    setIntercept: (value: typeof intercept) => {
      intercept = value;
    },
  };
}
