export function ownerQaTargetError(
  url: string | undefined,
  projectRef: string | null,
): string | null;
export function createOwnerQaFetch(
  url: string | undefined,
  projectRef: string | null,
  send: typeof fetch,
): typeof fetch;
