let nextRealtimeTopicId = 0;

/** Avoid reusing a still-closing Supabase channel during fast refresh/navigation. */
export function createRealtimeTopic(namespace: string, key: string): string {
  nextRealtimeTopicId += 1;
  return `${namespace}:${key}:${Date.now().toString(36)}-${nextRealtimeTopicId}`;
}
