/** Keep service-role notification fan-out subject to the approved-member invariant. */
export async function approvedRecipientIds(
  admin: any,
  userIds: string[],
  chapterId: string,
): Promise<string[]> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const { data, error } = await admin
    .from('profiles')
    .select('user_id')
    .eq('chapter_id', chapterId)
    .eq('status', 'approved')
    .in('user_id', unique);
  if (error) return [];
  return (data ?? []).map((row: { user_id: string }) => row.user_id);
}
