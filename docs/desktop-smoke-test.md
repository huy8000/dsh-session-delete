# 本地 Desktop 安装记录（2026-10-21）

用户授权替换现有 DSH。安装位置 `/Applications/DeepSeek Harness.app`，版本保持 `0.2.1-rc.2`，插件 `1.1.0-rc.1`。在完整备份原应用及 Desktop Profile 配置后，仅将五个生命周期包的已存在 `lib/index.js` / `lib/types/index.js` 文件替换为本地正式构建产物，并添加本地补丁元数据；共 9 个 ASAR 文件变化，另外 18,303 个文件内容不变。保留原界面、运行库及插件，更新 ASAR integrity，以原有 entitlements 进行本机 ad-hoc 签名，深度严格签名校验通过。这不是官方签名发行包，后续官方升级可能覆盖补丁。

备份位于 `~/Library/Application Support/DSH Local Backups/20261021091946`，包含原应用、原配置和 `ROLLBACK.md`。用户 Desktop Profile 仅追加删除插件的 `singleHost: true`；它仍是操作者对独占存储的声明，不是跨进程锁。

替换前使用该应用包自身的 CLI，在隔离临时目录验证：空闲 live 会话删除成功、维护中会话返回 `session-active`、异步 disposed 失败返回 `retire-failed` 且日志/Workspace 保留、removed 事件为 0。临时 Host 已停止，数据目录已清理。实际安装后成功打开已有“简单确认回复”，显示已完成的原对话，侧栏删除菜单存在；随后经用户明确授权，在原生 Desktop 中删除已经打开且处于空闲状态的“简单确认回复”（`session-76375141-0ec2-4076-90b0-426dd3cc6191`）。删除框关闭，侧栏目标行消失，当前页面回到新会话入口。磁盘目标日志、投影缓存和 Workspace 关联均不存在，会话目录仅保留 provider 的 `session.lock`；其余 7 条会话日志 SHA-256 与替换前相同。没有通过额外文件操作代替插件执行删除。完整退出 Desktop 和 Host 后重新启动，并展开全部会话：目标行没有回弹；再次检查目标日志、缓存及 Workspace ID 仍不存在，其余 7 条原有日志哈希仍未变化。重启正常建立了一个空白“新会话”，没有发送模型请求。

替换前 8 个用户 Session 日志哈希均未改变。启动并恢复当前会话后，7 个仍相同，1 个日志增长 81 字节，8 个均仍存在；不把正常恢复后的写入声称为数据完全未变化。没有发送新的模型请求。

以下为此前各阶段的历史记录，不代表当前安装状态。

---

# 第三阶段 Desktop 状态与历史实测

第三阶段基线为 `246f787` / `1.1.0-rc.1`，实际应用仍为 DSH `0.2.1-rc.2`。本轮**没有修改正在使用的 Desktop Profile，也没有对真实会话做删除测试**。此前用户授权的插件更新已完成，安装路径链接本仓库；这不等于本轮修复已经通过 Desktop UI 回归。

固定源码 `apps/desktop/src/paths.ts` 使用 DSH_HOME/profiles/desktop，single-instance.ts 先取得单实例锁；CLI 拒绝管理 Electron 的 desktop 启动。现有原生控制接口不能携带独立 DSH_HOME/启动参数，无法可靠启动第二个完全隔离的 Desktop，故停止这一部分实机验收。没有为方便测试而退出用户 Desktop、替换其 root 或覆盖其 patch。

替代的真实 Web 使用应用随附同版 CLI，独立 DSH_HOME、AGENTS_HOME、Profile、Workspace、Session/Cache 根。中文/浅色、英文/深色、双客户端、磁盘/重启、故障及两处 UI 修复的结果见 [第三阶段报告](execution-report.md)。这是真实 Web 验收，不称为 Desktop 验收。记录的 25 个用户 Session/Storage 文件在本轮前后 size/SHA-256 均未变化。

以下是第一轮的历史证据，版本、恢复动作和覆盖范围仅适用于当时，不能解释为当前安装状态或本轮通过：

---

# DSH Desktop 隔离实测记录

日期：2026-10-20。实际启动 `/Applications/DeepSeek Harness.app`，版本 `0.2.1-rc.2`；测试当前工作区的修改版插件（package 仍为 `1.0.0`）。没有把原先安装的旧插件测试结果当成新版结果。

## 隔离与恢复

完全退出 Desktop 后，备份原 profile patch 字节和 SHA-256、原插件 symlink 目标，以及原有 Session/Workspace/Cache 共 7 个文件的 size/mtime。暂时把插件链接指向本仓库，并覆盖 session-persistence-jsonl.root、storage-json.root、workspace-controller.documentsDirectory 到 `.work/desktop-smoke-32avdrs0` 下；所有删除对象均为隔离测试数据。

开始设置 `singleHost: false`，验证拒绝后，仅在这个独占临时存储设置为 true。结束时完全退出 Host，核对 profile 未被其他操作修改，再恢复原始 patch 字节和旧插件链接；恢复前原有 7 个数据文件的 size/mtime 均未变化。重新打开原来的 Desktop，原有会话仍在。新版没有永久安装。测试数据随后清理，截图和断言结果保留在被 Git 忽略的 `.work/desktop-ui-evidence/`。

## 实际执行与结果

| 操作 | 观察结果 |
|---|---|
| 新建目标对话，发送只回复 OK、不用工具的测试提示 | 模型实际完成并返回 OK |
| 原生重命名为长中英文标题，菜单打开删除框 | 显示 DSH 提供的 displayTitle 并换行；DSH 自身已截短原输入标题 |
| 初始焦点、Tab 循环、Escape | 初始在取消；Tab 到删除再到关闭；Escape 关闭 |
| 默认未声明独占时点击删除 | 显示独占存储错误，框保留，日志和缓存保留 |
| singleHost:true 后删除已打开的 live 会话 | 显示需重启、打开前重试的错误，日志和缓存保留 |
| 建第二条对照对话，同样只回复 OK | 模型实际返回 OK，没有工具调用 |
| 选中对照对话并重启，从未打开目标行的操作菜单删除冷目标 | 删除框关闭，目标行消失，对照对话及 OK 保持可见 |
| 立即检查磁盘 | 目标压缩日志、当前缓存、Workspace 中 ID 和恢复 journal 均不存在；只保留 session.lock；对照日志/锁/缓存的 SHA-256 不变 |
| 再次正常退出和重启 | 目标行未回弹，目标日志与缓存未重建；对照会话可正常显示 |
| 恢复原环境 | 原 patch SHA-256 和旧 symlink 目标完全一致，原有数据元信息不变，原 Desktop 正常打开 |

目标 ID：`session-8dc980ea-aeac-4075-ba7c-a91b96ab1844`。
对照 ID：`session-22e3c78c-80d2-4bbb-9813-d624cbad0b55`。

本地证据：`confirmation-zh.png`、`default-refused.png`、`live-refused.png`、`cold-deleted.png`、`after-restart.png`；`before-delete.json`、`filesystem-result.json`、`restoration-result.json`。这些文件不进入 npm 包。

## 未证明的部分

未实测 Web/多客户端、英文界面布局、主题切换、屏幕阅读器、真实运行中任务的界面拒绝和工具执行。Escape 后 AX 焦点回到了页面 HTML，未证明能恢复到原会话行；组件单测不能替代此项原生行为。自动化另覆盖活动/已归档活动、并发、迟到写入及各类故障。

**live 删除仍保守拒绝，未实现安全卸载成功路径。** Desktop 自动恢复上次选中的会话，因此重启前需选择另一条会话，重启后从目标行的操作菜单删除，不能先打开目标；这个可用性限制仍是完整 1.1.0 发布的阻塞之一。

## 确认框文案和排版（2026-10-21）

本次仅调整客户端展示：标题改为“删除会话？”，按钮改为“永久删除”，风险说明使用“聊天记录”而非内部日志/投影术语。会话名称独立显示，按钮宽度收紧；失败原因和数据状态分层，省略普通的未归档状态，保留部分删除、未知结果、已归档及清理保护等必要说明。

使用实际 `client.js` 和 React 的隔离浏览器预览检查中文普通确认框、模拟活动拒绝、Escape 关闭及英文长标题换行。预览使用模拟响应，不连接真实 Host 或用户数据，不代表重新执行了删除生命周期验收。本次未删除会话，未恢复自动化测试套件；当前已安装插件链接本仓库，下次 Desktop 重启加载新版。语法、打包和 diff 空白检查通过。
