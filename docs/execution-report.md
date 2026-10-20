# 执行报告：可靠性修复候选

## 1. 修改总结

基线为 `main`、`e5febc7`、版本 `1.0.0`，开始时工作区干净。已完成当前上游条件下可安全实施的修复，并建立真实 rc.2 模块集成验证；**尚未达到全部发布验收，不建议按完整 1.1.0 功能公开发布**。

- 去掉 Flush/Detach 失败后继续删盘、私有 `liveEntryFor` 卸载及固定 50ms 等待。
- 独立检查普通/已归档会话活动，live Session/Agent 明确拒绝，不强制取消任务。
- 冷会话使用官方写所有权和 Flush/Close；精确定位并限制文件范围，拒绝异常路径、链接、重复目标、大小写别名和未知结构。
- 通过现有 Domain 表队列清理缓存内存与磁盘；阻止同一 Host 的迟到缓存写入和 Workspace 重新关联。
- 按 ID 合并并发请求，明确成功、已不存在、拒绝和部分完成；保存可重试的最小恢复记录。
- 修正 Hook、标题和双击保护，补充双语错误、焦点/关闭保护与仅刷新重试；只按 Host 明确完成结果同步客户端。

## 2. 关键实现

删除路径：显式单 Host 部署声明 → 版本/路径/活动/live 检查 → archive → 再检查 → 官方 write open → Flush → 持久化恢复记录 → 精确日志删除 → Domain 队列缓存删除 → Close → stat/live 验证 → Workspace detach → pin/archive 清理 → 恢复记录清理 → Cordis parallel 分发标准移除事件并等待监听者结算。

缓存 put 与 Workspace candidateMatches 的 ID 屏障保留至对应服务退出，避免禁用插件后迟到回写；进程内相同 ID 请求共享操作，其他 ID 隔离。写句柄的原生锁保护 Session writer，不代表 Cache/Workspace 跨进程互斥。

发生不可逆步骤前的故障返回 rejected；进入删盘后故障返回 partial，不伪装成功。重试只使用同一 ID/原 Header 的已验证目标。Host 中途退出后的显式重试已用子进程验证。事件分发成功不代表每个浏览器都确认接收，重连仍需上游刷新。

保留 `session.lock` 的稳定 inode 与空会话目录，避免破坏 POSIX 锁。当前删除契约不包含外部导出、备份、缓存 `.bak` 副本或未知第三方附件。

## 3. 文件变更

| 文件 | 用途 |
|---|---|
| `index.js` | 必需服务、共享认证路由、请求校验、卸载时等待清理 |
| `host.js`（新增） | 安全删除服务、版本适配、路径检查、写锁/队列屏障、恢复和结果状态 |
| `client.js` | Hook/确认框/忙碌状态/无障碍、双语错误与客户端同步 |
| `cordis.patch.yml` | 默认 `singleHost: false`，未经独占部署声明拒绝删除 |
| `locale/en.json`、`locale/zh.json` | 元信息准确描述冷会话与 live 拒绝 |
| `package.json` | 精确 DSH 兼容声明、测试脚本、固定开发依赖、发布文件清单 |
| `package-lock.json`（新增） | 可复现安装；与 manifest 元信息一致 |
| `.github/workflows/check.yml` | npm ci、语法、行为测试、打包；Linux/macOS、Node 22.19/24 矩阵 |
| `test/helpers.js`（新增） | 临时目录中挂载真实上游模块，统一释放和清理 |
| `test/host.test.js`（新增） | 删除、异常、并发、路径、写入竞态和恢复行为 |
| `test/client.test.js`（新增） | React 组件、Hook、确认框、双语和失败状态 |
| `test/upstream.test.js`（新增） | 真实 Connection 权限和 Session Controller 刷新合并 |
| `test/fixtures/lease-holder.js`、`test/fixtures/crash-delete.js`（新增） | 真实跨进程写锁和异常退出夹具 |
| `README.md`、`CHANGELOG.md` | 实际行为、版本、安装、限制与未发布状态 |
| `docs/upstream-audit.md`（新增） | 固定 tag/commit 的上游结论、源码链接和发布阻塞 |
| `docs/testing.md`（新增） | 覆盖范围、未覆盖部分和只用临时 DSH_HOME 的手动步骤 |
| `docs/execution-report.md`（新增） | 本交付报告 |
| `docs/desktop-smoke-test.md`（新增） | 真实 Desktop 隔离删除、重启和配置恢复记录 |

## 4. 实际验证

| 命令/动作 | 结果 |
|---|---|
| `npm ci` | 成功；无新增运行时第三方依赖 |
| `npm run check` | index/host/client 语法通过 |
| `npm test`（Node 24.12.0） | 52 通过，0 失败，0 跳过 |
| `npx --yes --package=node@22.19.0 node --test test/*.test.js` | 52 通过，0 失败，0 跳过 |
| `npm run pack:check` | 通过 |
| 实际 npm pack、临时解包并 import Host 入口 | 通过；包含 host 与文档，未含 test/.work/node_modules |
| `git diff --check`、文件范围与 lock 元信息检查 | 通过 |
| 真实 Desktop 0.2.1-rc.2，两条模型对话、冷删除和重启 | 通过；目标无回弹，对照会话文件哈希不变 |
| 真实 Desktop 默认未声明独占 / live 删除 | 明确拒绝，日志和缓存保留 |
| 恢复原始 profile 和插件链接 | 通过；测试期间原有 7 个数据文件 size/mtime 不变 |

测试覆盖真实未压缩/压缩持久化、冷删除、活动/已归档活动、live 拒绝、Flush/Close/缓存/文件/Workspace/archive/异步通知故障、两类缓存迟到写入、跨进程 writer lease、进程中断恢复、幂等/并发、路径与大小写别名、真实权限错误、自定义 root、孤儿归档、迟到 Workspace attach、双语组件及旧刷新不回弹。

自动化使用全新临时目录。随后按用户要求启动已安装 Desktop，以临时覆盖 Session/Storage/Workspace 根目录并切换插件链接的方式实测，所有删除对象均为隔离测试数据；结束后恢复配置和旧插件链接。两次实际模型调用均返回 OK，没有工具调用。未执行 Web、多客户端、运行中任务的界面拒绝、英文界面布局、主题、工具任务、Windows、屏幕阅读器、多 Host 共享存储及电源故障验收。React renderer 的弃用提示仍存在；它仅为测试依赖，不代表组件失败。远程 GitHub Actions 未运行，不能用本地结果声称矩阵全部通过。

## 5. 剩余风险和阻塞

- **live 安全卸载仍未实现**：上游 AgentHandle.dispose 是 owner 能力，本插件拿不到现有 Agent 的该能力；raw detach 不等待最终持久化。该场景保守拒绝，测试没有伪造成功路径。
- **独占存储是人工部署前提**：默认拒绝磁盘删除/启动归档清理，只有明确设置 `singleHost: true` 才开放冷路径。该声明不是自动检测，不能在实际共享目录上启用。
- **私有适配仍存在**：有效 Session root、缓存持有的 table/unit 路径和 Workspace candidateMatches。只核实 rc.2；字段缺失/替换/版本未知拒绝。
- 缓存/Workspace 屏障不覆盖不合作插件绕过入口、跨 Host 写入、同 ID 新生命周期复用；主动恶意文件系统路径替换也不在保证范围。
- 保留锁目录、不删除备份副本；不承诺跨文件事务或每个客户端即时收到事件。Desktop 核心冷路径已实测；完整 Web、多客户端和其他 UI 验收尚待执行。

## 6. 最终状态

- 版本 **1.0.0**，DSH 声明缩小为 **0.2.1-rc.2**，没有升级 1.1.0。
- 两个 Node 版本的 52 项本地测试、语法和打包检查通过。
- 当前候选可继续审查和隔离环境验收；**存在阻塞，不适合宣称已完成全部发布条件**。
- 开始时 `main`、HEAD `e5febc7` 且无用户未提交改动。本报告覆盖新增源码、测试、lock 和文档；后续用户明确要求提交并推送这些修改到 `main`，不创建 Tag 或 Release。
- 测试时临时覆盖 Desktop profile 和插件链接，现已按原始字节/链接目标恢复，没有永久安装新版。`.work` 为既有忽略规则下的上游检出和验证产物，不进入发布包。
