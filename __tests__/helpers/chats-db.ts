/** Synthetic query double; this does not establish database enforcement. */
export function chatsDb() {
  const rows: Record<string, any[]> = {
    channels: [],
    mentorship_requests: [],
    profiles: [],
    channel_messages: [],
    messages: [],
    chapters: [],
  };
  const calls: { table: string; steps: [string, ...any[]][] }[] = [];
  const queue: Record<string, Promise<any>[]> = {};
  const denied = new Set<string>();
  function from(table: string) {
    const call = { table, steps: [] as [string, ...any[]][] };
    calls.push(call);
    const held = queue[table]?.shift();
    const query: any = {};
    for (const method of ['select', 'eq', 'or', 'in', 'not', 'order', 'limit', 'maybeSingle'])
      query[method] = (...args: any[]) => {
        call.steps.push([method, ...args]);
        return query;
      };
    query.then = (yes: any, no: any) => {
      let data = [...rows[table]];
      for (const [method, column, value, third] of call.steps) {
        if (method === 'eq') data = data.filter((r) => r[column] === value);
        if (method === 'in') data = data.filter((r) => value.includes(r[column]));
        if (method === 'not')
          data = data.filter((r) => !third.slice(1, -1).split(',').includes(r[column]));
        if (method === 'or')
          data = data.filter((r) =>
            column.split(',').some((c: string) => {
              const [k, , v] = c.split('.');
              return r[k] === v;
            }),
          );
      }
      const orders = call.steps.filter(([m]) => m === 'order');
      data.sort((a, b) => {
        for (const [, k, o] of orders) {
          const d = String(a[k]).localeCompare(String(b[k])) * (o?.ascending === false ? -1 : 1);
          if (d) return d;
        }
        return 0;
      });
      const limit = call.steps.find(([m]) => m === 'limit')?.[1];
      if (limit) data = data.slice(0, limit);
      return (
        held ??
        Promise.resolve({
          data: call.steps.some(([m]) => m === 'maybeSingle') ? (data[0] ?? null) : data,
          error: null,
        })
      ).then(yes, no);
    };
    return query;
  }
  return {
    rows,
    calls,
    queue,
    denied,
    from,
    rpc: async (_name: string, params: any) => ({
      data: !denied.has(params.p_channel_id),
      error: null,
    }),
  };
}
