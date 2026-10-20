# 上游源码审查与实现边界

核对对象：`dsh-v0.2.1-rc.2`，commit `687f282e8625c6b8d11ff58211a90524be2e4317`。本次从上游拉取对应 tag，并使用 npm 发布的同版本模块做真实集成测试。源码检出保存在忽略的 `.work/upstream`，不进入 npm 包或 Git Diff。

## 关键结论

| 接口/实现 | 源码事实 | 修复决策 |
|---|---|---|
| `workspaceRegistry.archiveSession` | 已归档直接返回，不检查活动；普通请求查询 waterfall 后写归档状态；本身不取得 Session 写所有权 | 删除前、归档后、取得写句柄后独立检查 activity；不传 stopActivity |
| `workspaceRegistry.unarchiveSession` | 无存在性检查，排队删除标记并等待持久化 | Host 完成文件及关联清理后执行，错误传播 |
| `workspace/session-activity` | Agent、job、subagent、schedule 通过 waterfall 报告活动；归档不等于没有活动 | 活动或未知查询结果一律拒绝；不用客户端 running |
| archive gate | `agent/pre-step` 拒绝归档 Session/其子代理的模型步骤；不是通用的 Session/磁盘锁，也不阻止手动关联、冷读或所有插件事件 | 不把 archive 当作互斥或已关闭证明 |
| `sessions.get` | 只查 live store | live Session 或仍存在 Agent 都拒绝 |
| `sessions.flush` | 等待该 live Session 的所有 flush 观察者；返回是否有监听者；不等于关闭 | 不将 Flush 当作卸载。没有 teardown 能力的 live 路径不进入磁盘清理 |
| `sessions.liveEntryFor` / `SessionEntry.detach` | 前者明确 private；后者同步从 store 移除并派发 disposed，没有持久化关闭 Promise | 移除旧实现的调用，不用运行时可访问性推断公开稳定性 |
| `session/disposed` | SessionStore 对观察者隔离异常，不汇总 await；JSONL listener 发起 `writer.close().catch(...)`；缓存 listener 发起 flushSoft | detach 返回后仍可写磁盘，不能使用 50ms sleep 补语义 |
| `AgentHandle.dispose` | 官方可等待的 Agent 生命周期能力，但仅创建/恢复它的 owner 能持有；`agents.get` 只返回裸 Agent | 本插件无权取得现有 AgentHandle，live 安全卸载被阻塞，不侵入 owner 的内部句柄 |
| `sessionPersistence.stat` | 返回 Header/revision 或明确 undefined；可能读失败；部分格式需要迁移 | I/O 错误拒绝，迁移格式拒绝；不将异常当成 absent |
| Persistence `open/write/flush/close` | 同进程 writer claim + 跨进程 write lease；close 等待本句柄链、最终 drain 和锁释放。没有公开 remove/delete 接口 | 冷会话使用官方 write handle；现有 writer 尚未关闭时拒绝，不猜测等待时长 |
| JSONL 路径 | root 可独立配置；projectKey(cwd) + encodeSegment(id)，最高 canonical generation 为读取源 | 取有效 root、复制固定版本 projectKey，限 cache safe-key ID 子集；Header 与目录不符/多个匹配则拒绝 |
| `session.lock` | POSIX flock 锁定 inode；释放不删除文件；移除并重建锁文件会丧失互斥 | 删除已识别日志，保留锁与空目录；测试跨进程占用和 inode 保持 |
| Projection Cache | `write()` 可能 await sessions.flush 后才 put；coldSnapshot 也 fire-and-forget 回写；内存表是读源 | 直接 rm 缓存文件不够。限定私有表适配，通过已有 KvTable.delete 等待队列并清内存 |
| Cache Domain | 已 open 的域不能再次 open；KvTable.delete 在链中决定记录存在性；没有公开 Cache 删除/全写入等待 API | 不双开域；最终 put 入口封禁清理中的 ID；只允许释放未进入清理且未被使用的新保护 |
| `workspace.detachSession` | 每个 entity 通过表 update 链串行持久化，不是纯内存更新；registry 保留 Header/path index | 逐个 await，异常变成 partial；在其队列内使用的 candidateMatches 加 ID 屏障，拦截迟到 attach |
| `api-session/removed` | 标准移除事件；live disposed 自动发出，冷删除需要显式发出；客户端标记驻留对象 removed | 完成约定清理后 Host 通过 Cordis parallel 分发同一个事件，并等待所有已注册监听者结算；不伪造 disposed 事件 |
| Client Session Controller | refresh 单飞；移除 mutation 会覆盖刷新开始前取得的旧 baseline；view selection 归 UI owner | 先 replay removal 再 refresh；真实模块测试两个客户端；不强制切换到别的会话 |
| menu / overlay | 根作用域 menu Hook 在组件渲染时取得 setter；overlay 在菜单外存活 | 保持 order 900 和原 slot；修正 Hook，确认框显示 title、忙碌保护和焦点循环 |
| `connection.fetch.register` | 共享 `/api` carrier 先应用 Host/Origin、认证；exact route 另要求 owner principal | 继续使用它，不新开裸 HTTP 服务；真实 Connection 测试恶意来源、未认证与 guest 拒绝 |

## 源码入口（固定 commit）

- [SessionStore：flush、detach、disposed](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/session/src/index.ts)
- [AgentHandle 的 owner 能力](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent/src/index.ts)
- [Workspace Registry](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/workspace/workspace/src/index.ts) / [Entity 持久化更新](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/workspace/workspace/src/entity.ts)
- [JSONL writer、flush、close 和 disposed listener](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/session-persistence-jsonl/src/storage.ts)
- [JSONL backend 与目录规则](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/session-persistence-jsonl/src)
- [Projection Cache](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/session-projection-cache/src/index.ts) / [Domain 队列](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/storage/storage-domain/src/domain.ts)
- [Connection exact routes、owner admission](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/connection/src/rpc-host.ts) / [Host/Origin 防护](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/connection/src/api-request-trust.ts)
- [Client Session Manager 刷新合并](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/client/sessions/manager.ts) / [归档模型步骤 gate](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/archived-session-gate.ts)
- [菜单 slot 契约](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-workspace/src/client/contract/slots.ts) / [shell.overlay](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-layout/src/client/index.ts)

## 原实现问题分级

- **P0**：Flush/Detach 异常后继续递归删目录；假定 archive 排除已归档任务；固定延时掩盖未完成写入；按 ID 删除全部匹配目录；未经验证的私有 detach 留下 Agent。
- **P1**：吞掉 I/O、Workspace 错误并返回成功；缓存只删磁盘留内存；客户端承担 unarchive 并强制移除；无并发/部分操作状态和恢复记录；正常冷会话被错误 ID 长度规则拒绝。
- **P2**：Hook 调用位置、确认框缺标题、同一事件轮重复提交、焦点循环、中英文错误、兼容范围过宽和无行为 CI。

## 仍然不是公开 API 的适配

`host.js` 的有效 Session root、`sessionProjectionCache.table`、`table.host.unit`（确认 JSON per-record 路径）及 `workspaceRegistry.host.candidateMatches` 均属于固定版本的私有实现。尽管表的 delete/write 语义本身是公开存储契约，取得缓存持有的表没有公开入口。代码对版本、字段、方法替换做显式拒绝，测试使用发布模块确认这些字段确实存在；这不构成未来稳定性承诺。

屏障不覆盖不合作插件直接保存原始 put/candidateMatches 后绕开它、跨 Host 的缓存/Workspace 写入或同 ID 的新生命周期重用。插件没有可靠识别共享目录所有访问者的官方能力。因此默认拒绝磁盘删除与启动清理，只有部署者显式声明 `singleHost: true` 时才允许隔离的冷会话路径；该声明不能把共享目录变安全。这些限制不能由进程内 Map、Session 写锁或更多 sleep 消除。

## 未完成的发布条件

1. 上游需要向会话 owner 提供可委托的、拒绝活动并可等待最终存储关闭的删除/卸载入口；仅公开 bare Session detach 仍不够。
2. 存储层需要官方的 per-session delete/retire 与缓存失效边界，覆盖冷读回写、Workspace 索引和必要的跨进程协调。
3. 完成新候选的 Desktop/Web、多客户端、网络断连、主题与屏幕阅读器验收及远程 CI。`e4077a3` 的四个远程矩阵已核实成功，新候选需按其实际提交单独验证 CI。

第二轮版本为 `1.1.0-rc.1`，不是完整 `1.1.0`。修复完成后用户另行授权提交并推送；不创建 Tag 或 Release。

## 第二轮：归档与保护状态

`WorkspaceRegistry.archiveSession` / `unarchiveSession` 在同一 operationTail 上串行，但返回 `Promise<void>`，不暴露状态版本、归档 owner 或 CAS。已归档时的另一个客户端 archive 是不可观察的成功 no-op；仅比较 archivedSessionIds、前后数组对象或监听持久化事件，均不能证明恢复归档不会覆盖用户意图。archive 同次写入还会取消 pin，插件不能在失败时无条件恢复 pin。

因此先取得 writer、Flush、复核目标，再归档；写锁、Flush、初次最终验证失败保持原状态。归档之后失败返回 `archive.before/after/restoration`，不猜测本次归档是否仍由自己拥有，不自动回滚。另一个客户端在等待中 unarchive 时，删除在进入清理前再次检查并拒绝。

保护的 Map 记录一个 `intercepted` 位，缓存 put 或 Workspace predicate 命中都会置位。后者连只读 sessionIds 筛选也会触发，保守保留是有意选择：不能证明这些观察没有被上层使用。只释放本次新建、未被使用、没有既有恢复记录且写句柄和准备记录均清理成功的保护。unlink 调用前的检查失败仍为 rejected；提交清理调用后发生错误或重试旧恢复记录失败则为 partial（不能推断一定已经删除某个文件）。

### live 能力复核

结论：**当前 rc.2 不支持第三方插件安全卸载现有 live Session；存在明确的上游改进路径，但目前缺少所需能力。**

- `core/agent/src/index.ts:146-163`：AgentHandle.dispose 是 owner capability；get 返回裸 Agent。`setFactory` 不允许重复注册，不能靠非侵入插件接管现有 owner。
- `core/agent-loop/src/index.ts:543-594`：owner teardown 会 cancel/whenIdle、释放 scope、await writer.close，最后 detach Agent/Session；不能把它无条件套在用户仍运行的任务上。detach 触发的 cache flushSoft 仍是另一个异步边界。
- `api/session-controller/src/agent.ts:425-445`：Controller 的 resume 仅返回 `(await agents.resume(...)).agent`。公开 RPC 有 cancel、follow、control 等，没有 retire/unload；cancel 不是卸载。
- `api/session-controller/src/client/sessions/service.ts` 的 release/retireScope 与 `session.ts:599-610` 的 dispose，只释放客户端引用、浏览器作用域和 Remote iterator；Host Agent 不因最后一个 UI 引用释放而销毁。
- `core/session/src/index.ts:1247-1255` 和 `session-persistence-jsonl/src/storage.ts:562-568`：detach 同步删 store 后派发事件，writer.close 不被汇总 await。新增真实发布模块测试挂起该 close，证明 detach 已返回时 open(write) 仍报 SessionAlreadyOwnedError；释放 close 后才能取得写锁。
- Cache 的 dispose listener / coldSnapshot 回写缺少公开的 per-ID 完成屏障。复用上游内部 Map、直接处置别人的 fiber 或全局停用 factory 会越过生命周期所有权/影响其他会话，均不采用。

固定 commit 的 [Agent loop teardown](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/agent-loop/src/index.ts#L543)、[Controller resume](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/agent.ts#L425)、[客户端 dispose](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/client/sessions/session.ts#L599) 支持上述结论。最小接口方案见 [上游 API 建议](upstream-api-proposal.md)。

### 复杂度与独占条件

保留现有集中适配：root、cache table/unit、Workspace predicate 的字段验证；不新增私有生命周期依赖。路径遍历提取 `logFiles`，准备后的复核只检查目标目录，不再次扫描所有项目。缓存 put 和 Workspace predicate 的服务期屏障不能移除，因为没有公开 cache retire 与 Workspace 索引失效入口。

Storage Domain/JSON 的写入队列及 close 仅约束实例内操作，不提供所有 Session/Cache/Workspace 使用者共同遵守的全局独占凭据。因此 `singleHost` 仍是显式人工声明，默认 false；不扫描进程、不自动启用、不把 Session writer lease 当作全存储锁。
