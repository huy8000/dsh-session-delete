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
