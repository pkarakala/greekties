/** Server-owned deletion. Dependencies are injected for focused failure tests. */
interface ApiResult<T> {
  data: T | null;
  error: unknown;
}
interface StorageEntry {
  name: string;
  id: string | null;
}
export interface DeletionBackend {
  authenticate(jwt: string): Promise<ApiResult<{ id: string }>>;
  begin(uid: string): Promise<ApiResult<unknown>>;
  list(prefix: string, offset: number, limit: number): Promise<ApiResult<StorageEntry[]>>;
  remove(paths: string[]): Promise<ApiResult<unknown>>;
  finish(uid: string): Promise<ApiResult<unknown>>;
}
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const reply = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

export async function handleDeleteAccount(
  req: Request,
  backend: DeletionBackend,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  const jwt = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!jwt) return reply(401, { error: 'A signed-in account is required.' });
  try {
    const user = await backend.authenticate(jwt);
    if (user.error || !user.data || !/^[0-9a-f-]{36}$/i.test(user.data.id))
      return reply(401, { error: 'Invalid or expired session.' });
    // No caller-supplied identity or object paths are accepted, including query
    // strings/body fields. Reject them so clients cannot mistake this for admin deletion.
    const body = await req.text();
    if (new URL(req.url).search || (body.trim() && body.trim() !== '{}'))
      return reply(400, { error: 'This endpoint only deletes the signed-in account.' });
    const uid = user.data.id;
    const started = await backend.begin(uid);
    if (started.error) throw new Error('begin');
    // Finish listing before removal; deleting during offset pagination skips rows.
    const folders = [uid];
    const files: string[] = [];
    let pages = 0;
    for (let folderIndex = 0; folderIndex < folders.length; folderIndex++) {
      const prefix = folders[folderIndex];
      for (let offset = 0; ; offset += 100) {
        if (++pages > 1000) throw new Error('cleanup limit');
        const page = await backend.list(prefix, offset, 100);
        if (page.error || !Array.isArray(page.data)) throw new Error('list');
        for (const item of page.data) {
          if (!item.name || item.name.includes('/') || item.name === '.' || item.name === '..')
            throw new Error('invalid object name');
          const objectPath = `${prefix}/${item.name}`;
          if (item.id === null) folders.push(objectPath);
          else if (typeof item.id === 'string') files.push(objectPath);
          else throw new Error('invalid storage entry');
        }
        if (page.data.length < 100) break;
      }
    }
    for (let i = 0; i < files.length; i += 100) {
      const removed = await backend.remove(files.slice(i, i + 100));
      if (removed.error) throw new Error('remove');
    }
    // The server-only transaction verifies no avatar rows remain, then deletes
    // app/Auth data atomically. Fence persists across errors/retries and deletion.
    const finished = await backend.finish(uid);
    if (finished.error) throw new Error('finish');
    return reply(200, { success: true });
  } catch {
    // Do not leak tokens, object names, SQL details or API bodies into logs/UI.
    return reply(503, { error: 'Account deletion could not finish. Please retry.' });
  }
}
