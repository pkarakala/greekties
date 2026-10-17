> Superseded safety status: the review followup blocks account finalization.
> P1 remains unresolved; see [coordination limits](ACCOUNT_DELETION_COORDINATION_LIMITS.md).
> Do not deploy this as a completed deletion flow or treat the earlier local results as current availability.

# Server-owned account deletion — local QA draft

The client calls `delete-account` with its session and an empty body. The Edge
Function independently validates the JWT with Auth `getUser`, derives the user
ID there, and rejects target IDs/paths in the request. Service credentials stay
in the function environment. Gateway JWT verification stays enabled.

`20261014151406_server_owned_account_deletion.sql` adds server-only begin/finish
RPCs and a private, RLS-protected deletion fence. Begin serializes with avatar
metadata writes using a transaction advisory lock. A Storage INSERT/UPDATE trigger
checks that fence for both old and new avatar path owners, including upserts and
moves. It does not bypass RLS or alter Storage's direct-delete protections.
Deletion requests permanently fence avatar writes, including stale JWT and signed
uploads after Auth deletion. A failed deletion leaves the account usable for
retry, with further avatar writes disabled. This is an irreversible deletion
request; the fence is deliberately not reset automatically after errors.

Ownership follows the existing avatars policy: the first object-path segment is
the Auth user UUID. Public reads are unchanged. The server lists that entire
folder recursively, in stable 100-entry offset pages, before removing batches.
No dependency on profile existence or `avatar_url`. Each returned/raised API error
fails closed. Pagination is capped at 1,000 pages per request to bound runtime;
accounts beyond that bound require reviewed operational cleanup, not false success.

Finish verifies the fence and zero remaining avatar metadata rows, then deletes
app/Auth data in one transaction using the existing dependency order and Auth
foreign-key cascades. It never deletes Storage metadata through SQL. Storage API
removal cleans backing files. Failure after a removed batch is safe to retry:
already removed objects stay gone, remaining objects are enumerated again, and
Auth/profile/messages are not destroyed until cleanup and finalization succeed.
Concurrent deletion requests are idempotent while authenticated; a request after
Auth is gone receives 401 and cannot affect any other account.

## Compatibility and rollout requirements

Nothing has been applied outside disposable local QA. Historical migrations are
unchanged. Do not reapply the historical account-deletion migration after this
one: that would restore the unsafe RPC. Preserve migration ordering and review
live schema, Auth FK behavior, Storage version/trigger privileges and function
ownership before any separately authorized rollout. Tested versions are recorded
in the QA handoff. Migration is transactional and must fail if the required
Storage objects table/trigger privileges are unavailable.

Deploying the server function alone is insufficient: it requires the new RPCs and
fence. Applying the migration alone disables deletion for older clients. The
legacy `delete_own_account` RPC is replaced with a rejecting stub and all client
and service EXECUTE grants are revoked, so it cannot bypass cleanup. Older
clients that call it will show their deletion error and must update or use an
approved support path. There is deliberately no insecure RPC fallback. Coordinate
migration, function and supported client versions in a reviewed release window;
verify the supported app actually invokes this endpoint before external release.
No deployment or release window is authorized by this document.

Keep the gateway JWT check enabled and configure its asymmetric verification
keys when required; do not disable verification to solve a configuration error.
The function also validates live Auth identity, so expired/deleted users fail.
Use the existing server-only service role for begin/finish. Never expose that key
in an app, QA browser, request payload or test fixture committed to the repository.

The fence retains only UUID and request/completion timestamps, without email,
profile or avatar data. It has no cascading FK, because deletion must not reopen
uploads from still-valid credentials. Any future tombstone retention change must
account for maximum token/signed-upload lifetimes and be reviewed separately.
Standard avatar uploads are tested, including a streamed upload crossing deletion.
Avatar resumable/S3 multipart upload clients are not used by this app or verified
here; validate their cancellation and temporary-part cleanup before introducing
them. Public/CDN caches, backups and externally downloaded copies cannot be
retracted by origin deletion and are not covered by local Storage assertions.

## Verification and remaining release gaps

See `ACCOUNT_DELETION_HANDOFF.txt` beside the release QA handoff for exact commands,
source hashes, real-local integration tests, failure injection and screenshots.
Component evidence uses mocks; local Edge/Auth/Storage integration is separate.
W01 remains an unresolved historical membership reload observation with passing
bounded diagnostics. No speculative auth change or repeated search was made.
Native execution and external-service verification remain deferred; local QA is
not evidence of production readiness.
