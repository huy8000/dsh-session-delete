# 第二轮执行报告：1.1.0-rc.1 候选

## 本轮修复

开始时实际 HEAD 为 `main` / `e4077a36be21158fa7d1116b33fb91b30f0a26ef`，工作区干净。没有把上一轮基线 CI 当作本轮新代码的证明。本轮仅修改删除状态、相关提示、增量测试和文档。

- 写所有权、Flush 和归档前的最终路径验证先于 archive：这些失败保留原有归档/置顶，不需要风险回滚。
- 归档后出错，返回初始/当前归档、数据与保护状态。rc.2 无 CAS/归档 owner，禁止无条件 unarchive/re-pin；其他客户端的操作不被回滚。
- Prepared 阶段不再提前标记 partial。新建且未被使用的保护，在 writer 和准备记录清理成功后释放；已使用、旧实例、恢复尝试及释放失败的保护保留。
- 清理调用之后或旧恢复记录的失败才返回 partial，表示可能不完整；不能声称每个 partial 都已经删掉文件。
- 启动扫描恢复记录目录一层，重建有效 journal 的保护，包括被其他客户端恢复归档的 ID；不自动继续删盘。
- 断网、无效响应显示 Host 结果未知；明确完成后才更新客户端，保留仅刷新重试。
- 恢复记录无法读取/解析时，不再误报数据保留；报告完整性未知并保留保护和原记录，不覆盖证据。

## 最新删除流程

1. Preflight：部署/版本/路径、恢复记录、activity/live 检查，读取 Header 并精确定位。
2. Prepared：官方 writer open + Flush、复核路径后才 archive；独立检查活动/归档，建立 ID 保护、写 durable journal、再次验证目标目录。尚未调用日志/缓存删除。
3. Destructive：检查通过后提交第一个日志 unlink，当前 generation 最后；无日志时由有序缓存删除进入该阶段。失败保留必要保护和恢复证据。
4. Completed：Cache 磁盘/内存清理、Close、stat/live 验证、Workspace detach、pin/archive/journal 清理，等待标准 removed 事件监听者结算。客户端再移除/刷新。
5. Partial：清理调用已经开始，或继承未完成 journal 后再次失败；修复原因并显式重试同一 ID，不自动继续，不承诺跨文件事务。

## 状态一致性与并发

同 ID 请求继续共享一个操作，不同 ID 独立；插件 close 等待已接受请求。原有 native writer lease、Domain 队列及迟到写入测试全部保留。

保护使用原 Map/WeakMap 适配，仅增加 intercepted 位；put 和 Workspace predicate 命中均置位。清理准备记录存在 await，释放前再次检查该位，防止清理间隙的写入被拦截后保护仍被撤销。Workspace 的可见 sessionIds 本身也用 predicate，因此保留保护时可能过滤仍有完整日志的行；提示明确要求重试，或重启并核对完整性。durable Workspace 关联未被伪造删除。

archive 返回 void、没有条件恢复凭据。即使另一客户端 archive 是 no-op，用户意图也不可观察。保留状态并说明原因，比自行推断独占归档后回滚更可靠。归档成功可能取消 pin；之后失败不擅自重新置顶。返回的 before/after 是观察值，不是状态版本。

## live 研究结论

**当前 rc.2 不支持第三方插件安全卸载既有 live Session。发现了需要上游提供能力的明确路径，本轮没有实现 live 删除。**

AgentHandle 是创建/恢复 owner 的 capability；get 仅给裸 Agent。官方 teardown 会 stop/drain、释放 scope、Close、detach；Controller 的现有公共 RPC 无 unload/retire。客户端 release 只关闭浏览器引用/Remote stream。真实上游测试证明 Session detach 返回后 JSONL close 仍可能持有 writer。Cache 最后写入亦无公开 per-ID retire 屏障。

关键固定源码与最小 API：见 [审查记录](upstream-audit.md) 和 [接口建议](upstream-api-proposal.md)。建议由官方 owner 提供 idle retirement lease，原子阻止新工作，等待最终关闭和 cache/Workspace 退休；另提供精确存储 remove 与条件归档恢复。不能用私有 detach、fiber 销毁或替换内部 Map 代替。

## 实际测试

| 命令/动作 | 结果 |
|---|---|
| 新增回归用例对旧代码运行 | 观察到失败，原始输出 `.work/round2-*-before.log` |
| `npm ci` | 通过，无新增依赖 |
| `npm run check` | 通过 |
| `npm test`，Node 24.12.0 | 74 通过，0 失败，0 跳过 |
| `npx --yes --package=node@22.19.0 node --test test/*.test.js` | 74 通过，0 失败，0 跳过 |
| `npm run pack:check` | 通过 |
| 实际 npm pack、临时解包并 import 插件入口 | 通过，16 个发布文件；版本/lock 一致，不含 test/.work/node_modules |
| `git diff --check`、版本/lock 与包内容核对 | 通过 |
| GitHub check run 39390886294 | e4077a3 基线四个矩阵成功；不代表本轮新代码远程通过 |

新增 22 项测试保留原 52 项：归档/置顶、锁/Flush、并发归档恢复、Prepared 故障、保护拦截与释放竞态、journal 释放失败、writer 释放失败、启动恢复、真实 detach/close 异步边界和双语未知结果。原有部分删除重试、子进程崩溃恢复、卸载 drain、缓存排队与迟到写入、路径/权限等无回归。

本轮所有磁盘用例仅使用临时目录，没有改动真实用户 ~/.dsh，没有再次启动用户 Desktop。上一轮 Desktop 实测只对应当时基线，见历史记录；本轮完整 Desktop/Web、多客户端 UI、屏幕阅读器、Windows 与 Linux 新候选运行未实测。React renderer 的弃用提示仍存在，不视作功能失败。

## 文件变更

| 文件 | 目的 |
|---|---|
| host.js | 调整归档/准备/清理边界，保护释放和恢复，明确故障状态 |
| client.js | 双语归档/保护状态、网络未知结果，继续仅凭明确 Host 成功同步 |
| test/state.test.js（新增） | 19 项状态一致性与真实生命周期增量回归 |
| test/client.test.js | 3 项新增双语反馈用例；旧响应夹具补上实际 Host 返回的 sessionId |
| package.json / package-lock.json | 同步版本 1.1.0-rc.1，不增依赖、不扩大 engines |
| README.md / CHANGELOG.md | 安装、独占声明、阶段/错误、候选版本与限制 |
| docs/testing.md | 本轮覆盖、失败复现、命令和 CI 证据 |
| docs/upstream-audit.md | 归档 CAS 缺失、live owner/引用、私有适配必要性 |
| docs/upstream-api-proposal.md（新增） | 最小官方 API 和验收语义 |
| docs/execution-report.md | 本轮报告 |

## 剩余风险

- P0：本轮未发现独占、可信存储边界内新增的已知误删路径；不提供恶意文件系统替换或共享目录保证，不能理解为绝对安全。
- P1：live 安全退休、跨 Host 协调、归档条件恢复均缺少上游能力。继续拒绝 live/未声明独占；归档后失败可能保留归档/失去原 pin，结果已明确。已有恢复记录/被使用保护可能要求重试，重启不恢复已删除数据。
- P2：仍有固定 rc.2 的 root/cache table/Workspace predicate 私有适配；不能移除长期屏障而保留迟到写入保证。完整 UI/新候选远程矩阵尚待验证，未扩展 DSH 版本范围。

## 发布状态

版本为 **1.1.0-rc.1**。可供明确接受上述边界的开发者在独占隔离环境继续预发布验收；**不建议普通用户直接替换重要数据环境，不满足稳定 1.1.0 完整发布条件**。需要上游能力的 live 成功路径仍是功能缺失，而非“安全拒绝测试通过即功能完成”。

本轮从 main / e4077a3 开始实施，修复与验证后用户另行授权提交并推送到 main，不创建 Tag 或 Release。CI 配置未修改；新代码远程 CI 需按实际提交 SHA 单独确认，不能由基线或本地结果代替。
