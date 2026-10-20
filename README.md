# dsh-session-delete

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 侧栏提供永久删除操作，保留原有菜单位置、确认流程和中英文界面。

**当前代码是可靠性修复候选，版本仍为 `1.0.0`，尚不满足完整的 `1.1.0` 发布条件。**

> 删除不可恢复。插件没有回收站，也不删除导出副本、外部备份或第三方插件保存的数据。先备份重要对话。所有开发测试必须使用隔离临时目录，禁止使用真实用户 `~/.dsh` 做删除测试。

## 支持范围与发布阻塞

- 仅核对并自动化验证 DSH **`0.2.1-rc.2`**，对应上游提交 `687f282e8625c6b8d11ff58211a90524be2e4317`。不再声称整个 `<0.3.0` 范围兼容。
- 使用 JSONL Session Persistence 与 JSON per-record Projection Cache；支持未压缩及 `.zstd` 日志。实际位置取自正在运行的存储实例，不根据 `process.env.DSH_HOME` 猜测，因此也支持 DSH 正确配置后的自定义路径。
- **只删除不活动的冷会话。live 会话明确拒绝删除**，不会停止任务，也不会调用私有 `liveEntryFor()`。上游没有向本插件提供现有 Agent 的官方销毁句柄；Session detach 也不等待异步 disposed 观察者完成。重启 Host，在打开目标会话之前重试，可以让普通历史会话成为冷会话。启动时自动创建的 live 会话仍可能无法删除。
- 缓存和 Workspace 仍需要限定版本的私有适配；缺失、被替换或不能核实版本时拒绝。详见 [上游审查记录](docs/upstream-audit.md)。部分布局没有必需服务时插件不会加载。
- **仅面向一个 Host 独占存储目录的部署。共享目录、多 Host 同时运行不受支持。未显式配置 `singleHost: true` 时默认拒绝磁盘删除和启动归档清理。** DSH 写句柄能排除其他进程的 Session 写入，但不能排除另一 Host 的冷读缓存回写或 Workspace 写入；插件无法可靠检测所有此类进程，因此不能声称跨进程删除完全安全。此边界也是公开发布前仍需解决的问题。
- 当前验证为 macOS、Node `24.12.0` / `22.19.0` 的自动化测试；CI 配置增加 Linux/macOS 与 Node 22.19/24。另在真实 Desktop `0.2.1-rc.2` 的隔离存储验证了冷删除、live/默认配置拒绝、中文确认框及重启不回弹，见 [桌面实测记录](docs/desktop-smoke-test.md)。完整 Web/多客户端验收、远程 CI 和 Windows 未验证。

## 安装与使用

本修复候选请先在临时 `DSH_HOME` 中验证，不建议直接替换唯一数据副本的环境。

在 DSH **Plugins → Add plugin** 输入本仓库的本地绝对路径，Install → Enable，重启 Host。也可通过以下仓库地址安装；请核对所选 ref，`main` 的修复候选与历史 `1.0.0` 代码行为不同：

```text
git+https://github.com/huy8000/dsh-session-delete.git
```

CLI 安装示例（先启动过 Desktop profile，然后完全退出 Desktop）：

```sh
dsh plugin --profile desktop add "git+https://github.com/huy8000/dsh-session-delete.git"
```

CLI 安装依赖后仍需在插件页启用 bundle 并重启。不要绕过 DSH 的版本限制。若包管理布局使插件无法解析 DSH 的版本元信息，删除会返回 `unsupported-runtime`，应修复安装布局而非取消校验。

在临时实例确认只有一个 Host 使用 Session、Cache 和 Workspace 存储后，才在插件配置中设置：

```yaml
singleHost: true
```

bundle 默认值为 `false`。可在临时 profile 的 `cordis.patch.yml` 用以下 patch 覆盖插件配置，然后重启：

```yaml
- id: dsh-session-delete
  config:
    singleHost: true
```

这是部署者对存储独占条件的明确声明，并不是自动检测或跨进程锁。条件不成立时保持默认拒绝，不要开启；本次没有改动任何真实 DSH 配置。

在会话行 `...` → **删除会话**，确认框会显示会话标题和不可恢复提示。进行中不能重复提交、关闭或更换目标；失败会保留错误信息。Host 删除完成但客户端刷新失败时，可单独重试刷新，不会再次提交删除。

## 实际删除流程

1. 校验 ID、已加载版本、服务结构和精确存储路径，并要求显式单 Host 部署声明。当前仅接受 `[A-Za-z0-9_-]{1,200}`；包含点、非 ASCII 等其他上游自定义 ID 明确拒绝，不声称这是 DSH 本身的完整 ID 规则。
2. 独立调用 `workspace/session-activity`。普通与已归档会话均检查；存在任何活动或 live Session/Agent 就拒绝。
3. 通过 `archiveSession(id, {})` 归档，再次检查状态，取得官方 `sessionPersistence.open(id, 'write')` 写所有权，并等待句柄 Flush。任何失败都不开始文件删除。
4. 保存最小恢复记录，再次检查目标结构。按可信 Header 的 `cwd` 和 ID 定位目录；只删除这个目录内已识别的日志 generation，最后删除当前日志。不递归删除未知内容。
5. 同一 Host 的缓存写入和 Workspace 关联设置按 ID 的生命周期屏障。缓存通过现有 Domain/KvTable 队列删除，磁盘与内存同时清理；较早排队的写入先完成，尚未到达 put 的迟到写入被拒绝。
6. 等待插件取得的写句柄 Close，验证 Session 不在 live store 且 Persistence 不再返回目标，逐个等待 Workspace detach，清理 pin/archive，清除恢复记录，通过 Cordis `parallel` 分发 `api-session/removed` 并等待监听者结算（不等于浏览器接收确认）。
7. 客户端仅接受明确的 Host 完成结果；使用 DSH 的移除处理和刷新。移除先于加入已有刷新，复用上游列表 mutation journal，防止旧结果恢复会话行。客户端不再负责 unarchive，也不在 Host 失败后假装本地删除成功。

**没有固定时间等待。** 不活动并不等于可以安全卸载，所以 live 路径在第 2 步就拒绝，尚未实现原有“直接删除 live 会话”的目标。

## 文件范围和保留内容

```text
<Session Persistence 实际 root>/<Header 对应 project>/<id>/session*.jsonl[.zstd]
<Projection Cache 实际 domain 目录>/sessions/<id>.json
```

仅删除上述已识别文件。遇到重复匹配目录、符号链接、硬链接、未知文件/子目录、元数据不一致或非 ENOENT I/O 错误会拒绝或报告部分失败，不扩大搜索和删除范围。目录检查只在 Session root 下扫描项目与目标 ID 两层。

会保留 **`session.lock` 及空会话目录**。上游 POSIX 锁依赖稳定 inode；删除锁文件会破坏互斥，Windows 也未验证过整目录删除。本实现不以“整个目录消失”作为成功标准。

恢复记录位于 `<Session root>/.dsh-session-delete/<id>.json`，仅保存 Header（可能包含项目路径），成功后清除。缓存后端保留的 `.json.bak.*`、导出文件、外部备份和第三方会话附件不在本次删除契约中；发现未知 Session 目录内容会拒绝，需人工检查。

## 结果、故障与重试

| 状态 | 含义与操作 |
|---|---|
| `deleted` | 约定的日志、当前缓存、关联、pin/archive 与恢复记录清理完成，已发布移除通知 |
| `already-absent` | Session 已不存在，相关残留清理完成；重复请求可安全返回此状态 |
| `rejected` | 未开始日志/缓存删除。归档步骤已成功时可能保留归档状态；检查错误后重试 |
| `partial` | 已进入不可逆清理，仍有必要步骤失败。不是成功；修复权限/存储/Workspace 错误后重试同一 ID |

错误包含稳定 `error` 和 `phase`；日志只记录 ID、阶段和错误类别，不记录对话或原始异常内容。Flush、写所有权、Close、磁盘、缓存、Workspace、归档和恢复记录清理错误均不会当成成功。

同一服务实例中相同 ID 的同时请求共享一个操作；其他 ID 可以并行。启动仅清理确认不存在、没有恢复记录的孤儿归档关联，不自动继续破坏性工作。中断的删除保留恢复记录供显式重试；原 Header 与新 Session 不匹配会拒绝。操作不是事务，关闭浏览器不会取消已经接受的 Host 清理；突然退出 Host 的测试验证了可重试，但不承诺电源故障下的事务原子性。

缓存/Workspace 屏障保留至对应服务实例退出，即使禁用删除插件也不撤销，以免迟到写入重新生成记录。同一 Host 生命周期内不要重用已删除的 Session ID；存储或缓存热替换后需要重启。

目录的符号链接及硬链接会预检拒绝；Node 文件 API 无法提供跨平台 `openat` 式完整路径事务，因此不支持不可信本地进程在检查和 unlink 之间主动替换存储结构的环境。

## 开发与验证

```sh
npm ci
npm run check
npm test
npm run pack:check
```

无新增运行时第三方依赖。开发依赖固定上游模块版本，以 Node 原生 test runner 驱动真实持久化、原生写锁、Domain、Workspace、Connection、Session Controller 和 React 组件行为测试；测试使用临时目录并清理资源。React 测试渲染器会输出弃用提示，未将该提示视作浏览器验收。

覆盖冷会话、压缩日志、live 拒绝、两类活动会话、Flush/Close/文件/缓存/Workspace/归档故障、缓存迟到写入、跨进程写锁、进程中断恢复、并发/幂等、路径异常、自定义 root、孤儿标记与中英文组件行为。**安全卸载 live 会话尚未实现，测试断言的是保守拒绝，不是成功删除。** 详见 [测试与手动步骤](docs/testing.md)。

## English

This safety-hardening candidate keeps version **1.0.0** and is **not ready for the full 1.1.0 release**. It verifies only DSH **0.2.1-rc.2**. Inactive **cold** sessions can be deleted; live sessions are explicitly refused because the plugin has no official ownership capability to destroy their Agents and await all disposal writes. Restart the Host and retry before opening an ordinary historical session.

Deletion is irreversible. The exact recognized JSONL generations, current projection-cache record, Workspace accounting and pin/archive markers are cleaned. The stable `session.lock` inode and its directory are retained. Backups, exports and third-party artifacts are outside this contract. Unknown files, links, ambiguous paths, storage errors and unsupported interfaces fail closed.

Flush/write-ownership failures prevent disk deletion. Later failures return `partial`, keep recovery information where available and allow an explicit retry. Per-session requests join in process. Cache writes are fenced at the existing Domain table and queued writes are drained through its ordered deletion. Workspace updates cannot reattach a fenced ID. No fixed sleep or private `liveEntryFor()` is used. Successful cleanup publishes DSH's removal event; failed requests never trigger a forged local success.

The cache/Workspace adapters still access pinned private fields and keep their fences for the services' lifetimes, including plugin unload. Disk deletion is disabled by default. Set `singleHost: true` only for storage actually used by one Host; this is an operator declaration, not automatic detection. Shared directories/multiple Hosts and adversarial concurrent filesystem replacement remain unsupported. A Session write lease is not a global lock for caches or Workspace data. These limitations and the missing live teardown capability prevent claiming full release acceptance.

Install this working-tree candidate by its absolute local path in **Plugins → Add plugin**, enable it, and restart inside an isolated test home first. Run `npm ci`, `npm run check`, `npm test`, and `npm run pack:check`. See the audit and testing documents above for evidence and manual checks. Uninstalling the plugin does not restore deleted data.

## License

[MIT](LICENSE) © 2026 huy8000
