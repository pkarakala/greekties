/**
 * Keep service-role notification fan-out subject to membership and blocking.
 * Service-role reads bypass RLS, so this must fail closed on either lookup.
 */
export async function approvedRecipientIds(
  admin: any,
  userIds: string[],
  chapterId: string,
  actorUserId?: string,
): Promise<string[]> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const usersToValidate = actorUserId
    ? [...new Set([...unique, actorUserId])]
    : unique;
  const { data, error } = await admin
    .from('profiles')
    .select('user_id')
    .eq('chapter_id', chapterId)
    .eq('status', 'approved')
    .in('user_id', usersToValidate);
  if (error) return [];
  const approvedIds = new Set<string>(
    ((data ?? []) as { user_id: string }[]).map((row) => row.user_id),
  );
  // A service-role query bypasses RLS, so validate the event actor as well as
  // its recipients. This rejects stale/corrupt cross-chapter webhook rows.
  if (actorUserId && !approvedIds.has(actorUserId)) return [];
  const approved = unique.filter((userId) => approvedIds.has(userId));
  if (!actorUserId || approved.length === 0) return approved;

  const { data: blockRows, error: blocksError } = await admin
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${actorUserId},blocked_id.eq.${actorUserId}`);
  if (blocksError) return [];

  const blockedRecipients = new Set<string>();
  for (const row of blockRows ?? []) {
    if (row.blocker_id === actorUserId) blockedRecipients.add(row.blocked_id as string);
    if (row.blocked_id === actorUserId) blockedRecipients.add(row.blocker_id as string);
  }
  return approved.filter((userId) => !blockedRecipients.has(userId));
}
