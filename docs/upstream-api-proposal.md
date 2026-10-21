# 上游最小生命周期 API 建议

> 本地已实现 owner 委托、准入关闭、Flush/处置完成及移除通知排序的最小补丁，见 [实际实现](../patches/README.md)。本页的 provider remove、共享存储及完整租约方案仍是建议，未实现、未提交上游。

基于 `dsh-v0.2.1-rc.2` / `687f282e8625c6b8d11ff58211a90524be2e4317`。以下 API **均不存在**，插件没有实现或模拟它们；未修改、提交上游。英文 Issue 见 [草稿](upstream-issue-draft.md)。

## 生命周期依赖

AgentRegistry.create/resume 把调用方的 Cordis context 交给 factory，生命周期 effect 归该 owner；AgentLoop factory 同时是结构 owner。普通 UI 会话由 Session Controller 发起 resume，它只返回 handle.agent，没有按 ID 委托卸载入口。ACP、子代理等有其他 owner。第三方 agents.get 只得到裸 Agent，不能夺取 dispose capability，也不能卸载整个 factory 来删除一个会话。

官方 teardown 是 memoized Promise：等待 publication；cancel(disposed) + whenIdle；dispose scoped world；await writer.close；detach Agent/Session；收集并传播失败。它是“停止并销毁”，不是原子“仅空闲时销毁”。whenIdle 只等 driver activityDone 稳定；status 把 maintenance 也显示为 idle，inject 还可以在不唤醒 driver 时保留 pending inbox。因此 status 或一次 activity waterfall 不能授权销毁。

writer.close 只覆盖该句柄收到的写入。Session detach 随后派发不汇总 await 的 disposed；Cache flushSoft、coldSnapshot 回写、await 前挂起的 write，以及 Workspace header/path 候选和排队 attach，属于其他 owner/队列。客户端 release/retireScope 只释放浏览器 Scope/Remote stream，不关闭 Host Agent。固定源码见 [审查](upstream-audit.md)。

## 最小接口与归属

建议首版限定单 Host、受支持 provider、合作 owner，不同时引入共享目录框架。

- `core/agent` 定义退休 capability 和 generation/factory 委托契约；`core/agent-loop` 实现真实准入和 owner teardown。保留 AgentHandle ownership，不暴露他人的裸 disposer。
- `api/session-controller` 提供协调入口 retireIfIdle(id)，调用官方 capability。第一版可只支持明确登记此能力的普通 Session owner；其他 owner 返回 unsupported-owner，而不是接管 ACP/子代理。
- Session Persistence 契约增加 provider 自己实现的 remove(retirementLease)，验证所属存储和 incarnation，精确删除它认识的日志。Projection Cache 与 Workspace 提供同一 lease 下的 retire/drain/remove，插件不再复制路径算法或修改私有表。

示意内部契约，**不是可调用代码**：

```ts
retireIfIdle(id): Promise<
  | { state: 'rejected'; reason: 'active' | 'busy' | 'unsupported-owner' | 'unknown' }
  | { state: 'retired'; lease: RetirementLease }
>
remove(lease): Promise<
  | { state: 'deleted' | 'already-absent' }
  | { state: 'partial'; operationId: string; phase: string }
>
```

lease 是 Host 内不透明 capability，不通过 RPC 序列化。HTTP/RPC 门面复用 Connection 的 Host/Origin/authentication，要求 owner principal，并沿用普通 Session、子代理、remote 的资源授权。知道 ID 或持有客户端引用不等于拥有删除权限。Host 插件调用也不能绕过 owner 委托。

## 准入、完成与代际

1. Registry create/resume/publication 和 loop send/followup/steer/inject、maintenance、driver wake 必须共同遵守 per-ID generation 准入。Controller 的 resumes 单飞、claims 队列只覆盖部分创建，不够。持有旧 Agent 对象的调用也须被 loop 拒绝。
2. 任何 await 前同步关闭准入，在真实 phase/inbox/maintenance 边界检查 idle。活动、pending inbox、未结束 setup/publication、job/subagent/schedule 引用、无法确认可释放的 owner 均拒绝。其他活动 provider 必须参与准入；不合作则 unsupported。不能先 dispose 再判断 idle。
3. 与 resume/send 竞争时只有一方被接受：先接受的工作使 retire 拒绝；先接受的 retire 使新工作返回 retiring。已获准但未发布的创建需结算，再检查 idle，不能当作不存在。
4. 保持准入关闭，由原 owner teardown，等待 scope、必要 flush/close、store 退出和具有耐久意义的 disposed observers。必要步骤失败不授予成功 lease；保留明确、可重试的退休状态，不能伪报冷会话。
5. Cache 在最终 put 边界禁止旧 generation 写入，排空已排队操作，覆盖 await 前挂起的 write/cold-read 回写，再清磁盘和内存。Workspace 在 entity update 队列内校验 lease，阻止旧 attach，再 await detach、pin/archive 清理。仅 unlink 缓存不够。
6. lease 绑定 owner、storage incarnation、generation 和 operation nonce。旧 lease/observer/removed 事件不能操作新生命周期。首版可以禁止退休 ID 重用；若允许重用，Session/Cache/Workspace/事件必须携带可比较 generation，不能只比较 ID。

generation 隔离进程内生命周期；持久化 operationId/incarnation 用于跨重启恢复，两者不能混用。可用现有 Storage 服务的小记录，无需数据库事务。重启不接受旧进程的裸 lease，重新验证恢复记录/provider，默认不自动继续破坏性清理。

## 结果与重试

- rejected：未开始清理，不能取消活动。仅在能证明准备保护未被使用、owner 完整时释放；否则由 owner 明确恢复。
- retired：必要写入已结束，准入仍关闭；这是 remove 的先决条件，不代表已经删除。
- deleted/already-absent：日志、当前缓存、Workspace、pin/archive 必要步骤完成后才发布标准 removed、返回成功。不删除第三方数据/备份，不承诺跨文件原子性。
- partial：保留精确身份、operationId、阶段。同 ID 请求加入同一操作，重试只清同一 incarnation；浏览器关闭不取消 Host 已接受的清理，授权客户端可查询结果。
- 释放 lease 资源**不能无条件重新开放准入**。未删除的 abort 由原 owner 验证恢复；部分删除保持封锁；成功作废旧 generation。超时是结果未知，不能据此认定失败或盲目启动第二次清理。

只增加 retire、没有 provider remove/cache completion 时，插件仍不能移除私有存储适配。

## 最小 PR 切片

| 切片 | 上游模块 | 验收 |
|---|---|---|
| Idle capability | core/agent、core/agent-loop；api/session-controller owner 委托 | 真实 idle create/resume；active/inbox/maintenance/setup 拒绝且不 cancel；send/resume/retire 竞争；未知 owner；其他 ID 不受影响 |
| Completion/removal | core/session、session/session-persistence-jsonl、session/session-projection-cache | 挂起 flush/close/disposed、late cold-read/write；失败不授权 remove；路径/锁 inode；stale lease |
| Accounting/transport | workspace/workspace、api/session-controller、client/connection；原 client manager | late attach；Workspace partial；owner/guest/Origin；双客户端旧 refresh；断连/退出后显式重试；旧 generation 隔离 |

先写真实 owner/admission 的失败复现，再实现首片，不先暴露安全语义不完整的删除 RPC。所有磁盘用例 mkdtemp，无付费调用或用户 profile。

共享目录另议：所有 Host 的 Session/Cache/Workspace 必须遵守同一 durable retirement 规则，Session flock 不够。归档 revision/CAS 也独立处理：应记录幂等 archive 意图并支持 compare-and-restore，仅比较 archived 布尔值不能安全回滚其他客户端操作。
