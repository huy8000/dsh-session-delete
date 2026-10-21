# 本地 DSH 空闲会话关闭补丁

此补丁针对 DeepSeek Harness `dsh-v0.2.1-rc.2`（`687f282e8625c6b8d11ff58211a90524be2e4317`）。它是本地源码修改，没有提交上游。2026-10-21 经用户授权，已将同版 Desktop 的五个生命周期模块替换为正式构建产物，使用本机签名；见 [Desktop 记录](../docs/desktop-smoke-test.md)。

在该版本的独立 DSH 源码副本中执行（将补丁路径替换为本仓库的绝对路径）：

```sh
git apply --check /path/to/dsh-session-delete/patches/dsh-idle-retirement.patch
git apply /path/to/dsh-session-delete/patches/dsh-idle-retirement.patch
```

在 DSH 源码目录按原生项目引用进行构建，本轮实际执行的命令为：

```sh
pnpm install --frozen-lockfile --ignore-scripts
DSH_GATE_CONCURRENCY=1 DSH_GATE_FAIL_FAST=1 pnpm run build
```

完整构建会检查 Host/Client 包及聚合工程，并生成原生模块、Host、Desktop bundle 和 Web 产物。不要将工作区源码与 npm 发布的声明混合为临时 TypeScript 工程；此前临时检查的内存耗尽已通过使用原生工程配置解决。

之后按 DSH 自身说明启动。不要把 TypeScript 源文件直接复制到 Desktop 安装包。此补丁不自动部署；单独更新删除插件不能给原版 Desktop 增加 Host 接口。插件仍要求 `singleHost: true`，且只支持一个 Host 独占该套存储。

`agents.retireIfIdle(id)` 先同步取得标准 AgentLoop 的空闲关闭许可，关闭输入、维护和同 ID 恢复/发布，再检查 Workspace 活动。尚未发布的创建/恢复、运行、维护或待处理输入都会拒绝，不调用强制停止。关闭复用原 owner 的 disposer，等待 Flush、作用域和 writer 关闭，以及 `session/disposed` 返回的 Promise。普通 detach 的同步语义保留。未知 owner 明确拒绝。

关闭前发现活动会释放许可。开始关闭后，无论成功或失败，同 ID 都保留至 Host 重启；重复调用加入同一个结果。失败不授权磁盘删除。插件保留原有缓存最终写入保护、精确文件删除、Workspace 清理与恢复记录；只在全部成功后发出 `api-session/removed`。retirement 本身不代表删除。

本轮使用临时存储、官方 CLI 的 Web Profile 和真实标准 Agent 实测了：

- live 空闲删除，日志/缓存消失，移除事件一次。
- 运行中轮次、已归档维护操作、尚未发布的创建及待处理输入拒绝；工作结束后可删除。
- disposed Promise 被显式挂起时，请求等待、日志保留、无移除事件；新 send/resume/append 被拒绝，释放后删除成功。
- Flush 故障保留文件、live 实例和可见记录；重启后重试成功；重复删除、相同/不同 ID 并发删除。
- 实际浏览器从侧栏确认删除当前查看的、任务已结束的 live 会话；会话行消失且返回新会话入口，Host 重启后日志/缓存/关联仍不存在。

2026-10-21 的后续验证已使用上游官方完整构建：9 项全部通过，0 失败、0 跳过。修改文件的类型感知 lint 和上游导出 JSDoc 检查通过。没有恢复或运行已移除的测试套件，也没有调用付费模型。

正式构建产物通过官方 CLI Web Profile 在临时目录启动，未使用此前的 esbuild 替换或自定义模块加载器。Node 24.12.0 和 22.19.0 环境均验证了空闲 live 删除、忙碌拒绝、异步 disposed 失败时保留日志和 Workspace 关联且不发送 removed、失败后同 Host 重试继续拒绝；Node 22 环境另验证重启后可安全重试。此前的 UI 验收仍见上文。

完整类型检查和 bundle 构建阻塞已解除。随后已完成本地 Desktop 模块替换和启动检查，详见 Desktop 记录。这是对现有应用包的局部替换，不是重新生成官方安装程序。

仍使用 rc.2 的私有缓存/Workspace 适配；fire-and-forget 的第三方后台任务不属于 returned-Promise 完成语义；多个 Host 共享存储不受支持。补丁不提供存储事务、跨进程删除租约或底层 provider remove 接口。保留候选版本 `1.1.0-rc.1`。
