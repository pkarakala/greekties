# Account deletion: upload coordination finding

## Smallest supported design considered before implementation

A supported hosted design would have to route every avatar upload through a
server-owned admission path. That path registers a durable per-upload record
before Storage authorization, uses a unique immutable object key, and retains
that record through transfer, metadata commit and any compensating cleanup.
Deletion closes admission atomically, waits for all registered uploads to settle,
then removes all objects through Storage API before finalization. No lease expiry,
transaction advisory lock, delay, or empty metadata query can prove settlement.
Client-direct/signed uploads must be closed during a separately reviewed cutover,
and previously admitted unregistered transfers must be accounted for.

## Unsupported guarantee: not represented as a completed fix

Supabase's supported Storage APIs expose committed objects, not a durable
operation-status/compensation-completion barrier or raw uncommitted versions.
An upload can pass its rollback-only permission check, transfer binary bytes,
and fail metadata commit after deletion fencing. On interruption or failed
compensation, a client/server timeout cannot prove those bytes are gone. A new
upload proxy and durable ledger alone do not resolve this ambiguity. Existing
clients also bypass such a new proxy until a reviewed access/capability cutover.

This bounded pass does not introduce an unproven proxy or modify hosted Storage
internals. QA-only instrumentation may demonstrate these states locally. The
P1 guarantee remains UNRESOLVED. It requires a verified provider-supported
settlement/cleanup contract or a separately designed storage/upload architecture
that can establish it, including failure recovery and old-client migration.

## Local safety mitigation prepared in this pass

A follow-on migration disables account finalization unconditionally rather than
allowing success based only on metadata emptiness. Begin still fences new avatar
writes. The existing endpoint may clean committed files, but returns failure and
retains Auth/account data. Repeated attempts cannot report successful deletion.
There is no operator boolean, fixed sleep, polling heuristic or bypass to enable
finalization. This deliberately makes deletion unavailable; it is a mitigation,
not feature completion and not deployable release clearance.

The same migration changes the fence lookup to an indexable UUID comparison.
Malformed/noncanonical owner-folder paths fail safely, without an unsafe cast or
allowing a case-variant UUID to bypass a tombstone. Historical migrations remain
unchanged. The legacy RPC remains disabled. No Storage protection/RLS is weakened.

## Release and recovery implications

Both owner-only TestFlight rollout and external/public release remain HOLD for
account-deletion clearance. Do not deploy this mitigation as a completed deletion
flow. Do not restore the historical RPC/function or remove fences to recover.
Partial failures retain accounts and retry safety but cannot promise completed
physical cleanup or eventual account deletion with the current interfaces.
Older clients require an approved secure deletion/support/update path and an
admission/draining plan; none is assumed to exist. W01 and deferred native checks
remain separate historical gaps, with no speculative auth changes in this pass.
