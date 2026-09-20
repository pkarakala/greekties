/** Local test double, not SQL/RLS verification. Allows precise response ordering. */
export function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export type Query = {
  table: string;
  op: string;
  filters: Record<string, any>;
  row?: any;
  single?: boolean;
  limit?: number;
  before?: string;
  ascending?: boolean;
};
export function createMessageDb() {
  const rows = new Map<string, any>();
  const identities = new Set<string>();
  const calls: Query[] = [];
  const subscriptions: {
    table: string;
    event: string;
    filter: string;
    callback: (payload: any) => void;
  }[] = [];
  let access = true;
  let status = 'accepted';
  let intercept: ((query: Query) => any) | null = null;
  const rowKey = (table: string, id: string) => `${table}:${id}`;
  function base(query: Query): any {
    if (query.table === 'profiles') return { data: [], error: null };
    if (query.table === 'channels')
      return {
        data: access ? { id: query.filters.id, name: 'general', chapter_id: 'chapter' } : null,
        error: null,
      };
    if (query.table === 'mentorship_requests')
      return {
        data: access
          ? {
              id: query.filters.id,
              from_user_id: 'me',
              to_user_id: 'peer',
              chapter_id: 'chapter',
              status,
            }
          : null,
        error: null,
      };
    if (query.op === 'insert') {
      if (!access || (query.table === 'messages' && status !== 'accepted'))
        return { data: null, error: { code: '42501' } };
      const key = rowKey(query.table, query.row.id);
      if (identities.has(key)) return { data: null, error: { code: '23505' } };
      identities.add(key);
      const row = { ...query.row, created_at: '2026-09-17T12:00:00.000Z' };
      rows.set(key, row);
      return { data: row, error: null };
    }
    let data = [...rows.entries()]
      .filter(([key]) => key.startsWith(`${query.table}:`))
      .map(([, row]) => row);
    if (!access || (query.table === 'messages' && status !== 'accepted')) data = [];
    data = data.filter((row) =>
      Object.entries(query.filters).every(([key, value]) =>
        Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
      ),
    );
    if (query.before) data = data.filter((row) => row.created_at < query.before!);
    data.sort((a, b) => (query.ascending ? 1 : -1) * a.created_at.localeCompare(b.created_at));
    if (query.limit) data = data.slice(0, query.limit);
    return { data: query.single ? (data[0] ?? null) : data, error: null };
  }
  function from(table: string) {
    const q: Query = { table, op: 'select', filters: {} };
    const execute = async () => {
      calls.push({ ...q, filters: { ...q.filters } });
      const result = intercept?.(q);
      return result === undefined ? base(q) : await result;
    };
    const builder = {
      select: (_columns?: string) => builder,
      insert: (row: any) => {
        q.op = 'insert';
        q.row = row;
        return builder;
      },
      eq: (key: string, value: any) => {
        q.filters[key] = value;
        return builder;
      },
      in: (key: string, value: any) => {
        q.filters[key] = value;
        return builder;
      },
      lt: (_key: string, value: string) => {
        q.before = value;
        return builder;
      },
      order: (_key: string, options: { ascending: boolean }) => {
        q.ascending = options.ascending;
        return builder;
      },
      limit: (count: number) => {
        q.limit = count;
        return builder;
      },
      maybeSingle: () => {
        q.single = true;
        return execute();
      },
      then: (yes: any, no: any) => execute().then(yes, no),
    };
    return builder;
  }
  function channel() {
    const builder = {
      on: (_type: string, filter: any, callback: any) => {
        subscriptions.push({ ...filter, callback });
        return builder;
      },
      subscribe: () => builder,
    };
    return builder;
  }
  return {
    from,
    channel,
    rows,
    calls,
    identities,
    subscriptions,
    base,
    setAccess: (value: boolean) => {
      access = value;
    },
    setStatus: (value: string) => {
      status = value;
    },
    intercept: (fn: typeof intercept) => {
      intercept = fn;
    },
    seed: (table: string, row: any) => {
      rows.set(rowKey(table, row.id), row);
      identities.add(rowKey(table, row.id));
    },
    remove: (table: string, id: string) => {
      rows.delete(rowKey(table, id));
    },
    emit: (table: string, event: string, row: any) => {
      subscriptions
        .filter((s) => s.table === table && s.event === event)
        .forEach((s) => s.callback(event === 'DELETE' ? { old: row } : { new: row }));
    },
  };
}
