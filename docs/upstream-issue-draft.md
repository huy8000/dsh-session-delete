# Draft: owner-mediated idle Session retirement with a storage completion boundary

> 本地已实现 owner 委托、准入关闭、Flush/处置完成及移除通知排序的最小补丁，见 [实际实现](../patches/README.md)。本页的 provider remove、共享存储及完整租约方案仍是建议，未实现、未提交上游。

Unsubmitted issue draft. Baseline: dsh-v0.2.1-rc.2, commit 687f282e8625c6b8d11ff58211a90524be2e4317.

## Use case

Session-management extensions need to retire an inactive conversation before removing its persisted data. A previously viewed Session may remain live after its browser scope is released. Extensions currently have to refuse or depend on implementation details. Safe storage maintenance needs the same capability, independent of a particular delete plugin.

## Reproduction and missing boundary

1. Create/resume a conversation, let it become idle, and release the client scope. This does not dispose its Host Agent.
2. agents.get(id) returns an Agent rather than its owner-held AgentHandle. The Controller resume path extracts .agent and offers no delegated retire operation. Unloading the whole owner/factory affects unrelated Sessions.
3. Session detach synchronously removes the live entry and emits disposed. Its persistence observer starts asynchronous close without making detach await it. An integration test can hold close pending: detach has returned while another write-open still reports ownership held.
4. AgentHandle.dispose awaits teardown but cancels work. Checking status and then disposing is not atomic: maintenance can report idle, pending inbox input need not wake a driver, and send/resume can race the check.
5. writer.close does not drain Cache disposed/cold-read/await-before-put work or queued Workspace attach. Unlinking a cache file can leave memory records or allow late regeneration.

Relevant fixed-version sources:

- [Agent registry/ownership](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent/src/index.ts)
- [Owner teardown](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent-loop/src/index.ts#L543), [driver/inbox admission](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent-loop/src/agent.ts)
- [Controller resume](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/agent.ts#L425), [client release](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/client/sessions/service.ts#L543)
- [Session store](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/session/src/index.ts), [JSONL storage](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/session-persistence-jsonl/src/storage.ts)
- [Projection Cache](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/session-projection-cache/src/index.ts), [Workspace entity queue](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/workspace/workspace/src/entity.ts)

## Suggested capability

Could DSH offer owner-mediated retireIfIdle(id), returning a stable refusal or an opaque, generation-bound retirement lease? Names and placement are suggestions, not a request to adopt an extension's architecture.

The Agent contract/factory should own admission. Session Controller can coordinate ordinary Sessions under existing authenticated owner/resource authorization. Unsupported owners/providers should refuse explicitly; do not expose another owner's raw disposer.

Required guarantees:

- Atomically check real idle state and close send/inbox/maintenance/wake/create/resume admission, including callers retaining an Agent object. Never cancel active work to make retirement succeed.
- Settle setup/publication, delegate to the owner, await scope teardown, final flush/close and required disposed completion work. Failure must not grant a successful lease.
- Provide Cache retire/drain/invalidate and Workspace queue coordination covering both queued and suspended writes.
- Bind capabilities to owner, storage incarnation and generation. Reject stale leases; initially prohibiting ID reuse is preferable to affecting a replacement lifecycle.
- Separately add provider-owned Persistence remove(lease), avoiding copied backend path rules. Expose completed/partial outcomes and retryable operation identity, while preserving existing client events.

A first PR can support cooperating single-Host owners. Multi-Host storage requires separate durable coordination; a Session writer lock does not cover Cache or Workspace writers. No cross-file atomicity is assumed. Lease disposal must not reopen a partially deleted Session. The transport should expose results/status rather than serialize the Host capability; disconnect does not cancel an accepted operation.

## Minimum acceptance tests

Use temporary roots and deterministic Agents without model calls. Cover idle create/resume; active, pending inbox, maintenance and setup rejection without cancellation; concurrent send/resume/retire; held flush/close/disposed/cache work; late Workspace attach; unrelated IDs; stale generations; failure then explicit retry; owner versus guest/invalid Origin; two clients and older list refresh; disconnect/process exit and recovery. Required work that is pending or failed must prevent deletion authorization.

## Compatibility and PR scope

An additive contract can preserve current create/resume/dispose semantics. Factories/providers without retirement support report unsupported; client release retains its current meaning. Suggested slices: (1) core/agent, core/agent-loop and Controller owner delegation/admission; (2) core/session completion, JSONL provider remove and Cache drain; (3) Workspace accounting, authenticated Controller transport and existing client synchronization tests. Each slice should state which guarantees it actually provides. Full semantics and module/test plan: [proposal](upstream-api-proposal.md). No issue or PR has been submitted.
