# 第三阶段执行报告：真实 Web 验收与上游贡献准备

> 历史记录：随后按用户要求移除了 test/、测试专用依赖、npm test 和 CI 测试步骤。下述测试数量、命令及文件清单描述移除前的验收，不是当前工作区可执行的测试套件，下述旧结果不覆盖本轮本地补丁；当前行为以 README 为准。

日期：2026-10-20。开始时 `main` / `246f787e1d5e6b89111c06d2561ec1af40dfc082`，工作区干净；版本保持 **1.1.0-rc.1**，目标 DSH **0.2.1-rc.2**。本轮修改未提交、未推送；没有 Release、Tag、npm publish 或上游 Issue/PR 提交。

## 环境与隔离

使用 `/Applications/DeepSeek Harness.app` 随附的真实 rc.2 CLI/Host，独立 `delete-acceptance` Profile。DSH_HOME、DSH_AGENTS_HOME、documentsDirectory、Session Persistence、Storage/Projection Cache 全部位于忽略的 `.work/phase3`。Host 仅监听 127.0.0.1:57533；插件通过官方 CLI 在临时 Profile 安装本仓库链接。先 false 验证拒绝，再只对临时独占目录启用 singleHost:true。

11 个可丢弃的具名会话通过发布的 Persistence/Session/Workspace 服务和 turn/title/end 事件准备；实际 Host 完整 projection 服务生成列表缓存，启动前完成准备。没有发送付费模型请求。live 夹具是真实 entered Session + official writer；busy 夹具通过受控 workspace/session-activity provider 报告活动，**不是实际运行模型/工具任务**。另有真实客户端打开的普通会话用于 live 拒绝验证。

浏览器验收使用 Chrome 两个独立页面，以及独立 IAB 页面。原生 Chrome 控制后期出现窗口不可操作，转用已可用的 IAB 完成窄视口、DOM 焦点和 live UI 回归。没有把原生操作尝试当作成功。Desktop 无法在现有控制接口下启动独立 DSH_HOME 的第二实例，本轮未做 Desktop 回归，见 [说明与历史证据](desktop-smoke-test.md)。真实 Desktop Profile 未被覆盖/重启；记录的 25 个用户 Session/Storage 文件前后 size/SHA-256 完全相同。

## 真实执行的场景

UI = 实际浏览器；HTTP = 实际安装插件的 Host（不是测试 mock）。自动化覆盖另列，不能当作已执行 UI。

| 场景 | 结果和证据层次 |
|---|---|
| 默认 singleHost:false | UI 中文错误明确拒绝；HTTP 503 exclusive-storage-unverified；目标日志/缓存仍在 |
| 冷会话删除 | Chrome A 确认后行消失；B 未手动刷新也移除；磁盘日志/当前缓存/Workspace ID/journal 清理；稳定 session.lock 保留 |
| 其他会话隔离 | 对照日志、锁、缓存 SHA-256 在删除及 Host 重启后均不变 |
| 切换页面/重启不回弹 | 两次后续 Host 启动及重新认证后目标行未返回；五个已清理目标日志/缓存仍不存在 |
| 重复删除 | HTTP 返回 already-absent，必要清理完成，无额外破坏 |
| 已打开、空闲 live 会话 | IAB 实际查看普通会话后删除，英文 live-unload-unsupported 提示；框保留，Escape 后原视图和行仍在，日志保留；独立 live 夹具也被 HTTP 拒绝 |
| 活动状态 | busy 受控 provider 的 HTTP 请求 session-active，数据保留；未运行真实模型/工具任务 |
| 已归档冷会话 | HTTP 成功；日志/缓存/关联及归档标记清理 |
| 写所有权失败/原 pin | 子进程持有真实 zstd writer lease，HTTP session-owned；pin 保留、未新增归档，日志保留 |
| 同 ID 重复、不同 ID 并发 | 真实 HTTP 并发请求成功、最终磁盘和关联一致；不是两个浏览器同时点确认的 UI 测试 |
| 无效 ID | HTTP 400 bad-request；未扩大文件定位范围 |
| 不可逆清理中途故障 | 临时缓存目录移除写权限，日志清理后 cache 阶段返回 partial，保留缓存与恢复记录；finally 恢复权限 |
| Host 重启、恢复记录 | 重启后 journal/cache 仍在，没有自动完成破坏性清理；显式 HTTP 重试成功，必要清理完成 |
| 网络中断 | 确认框打开后停止本测试 Host，再点删除，UI 显示 Host 结果未知；不能解释为 Host 已受理后中断也通过 |
| 中文浅色/英文深色/长标题 | 实际标题、风险、按钮和错误可读；长标题换行且限制高度；没有声称所有语言×主题组合都测过 |
| Tab / Shift+Tab / Escape / 取消 / 遮罩 | 真浏览器执行；取消不删除；焦点循环。修复后 Escape 返回 treeitem，下一次 Tab 正常；遮罩关闭通过 |
| 窄视口 | 先在 Chrome 400% 放大复现高度溢出；修复后 IAB 360×240 可滚动，Tab 到 Delete 时按钮和 Cancel 均在视口内 |
| 查看中目标被其他客户端删除 | 查看产生 live，按支持范围拒绝，不强制切换/停止；未证明可直接删除该 live 目标 |

本地证据位于忽略的 `.work/phase3`：before-delete.json、http-results.json、restart-retry.json、final-storage.json、user-data-before/after.json；evidence/narrow-dialog.png、en-dark-dialog.png、live-refused.png。只包含固定夹具的页面截图不进入 npm 包；临时认证信息不写入发布文档。

HTTP 故障脚本调试中修正了夹具配置：writer compression 必须匹配 zstd；无效 ID 的实际协议是 400 bad-request。初始缺少完整 projection 元数据导致冷标题未显示，通过真实 Host 的投影服务重建夹具后才开始验收。这些是测试准备问题，没有据此改动产品或降低现有回归断言。

## 实际缺陷与最小修复

| 级别 | 复现/根因 | 修复与验证 |
|---|---|---|
| P2 焦点丢失 | 打开会话菜单→删除框→Escape；原实现捕获卸载的菜单项/页面根。rc.2 rowActions 关闭后 display:none，连接着的 trigger 也无法 focus | 菜单打开时记录焦点；关闭时先还给连接的 trigger，失败则聚焦其 ARIA treeitem。临时 tabindex=-1 到 blur 再恢复，立即移除会再次失焦。Chrome AX 与 IAB DOM 都验证返回行，下一次 Tab 正常。被移除的 trigger 不强行聚焦 |
| P2 短视口溢出 | 英文深色长标题，浏览器 400% 时 modal 高度超出视口，按钮难以访问 | dialog max-height:100% + overflow:auto，内容/页脚不压缩；IAB 360×240 实测滚动和键盘到达按钮 |

host.js、路由、并发、路径、持久化和现有拒绝策略均未重构；没有新增依赖、私有 Host 适配或版本范围。

## 测试与 CI

| 实际命令 | 结果 |
|---|---|
| npm ci | 通过 |
| npm run check | 通过 |
| npm test（Node 24.12.0） | 77 通过，0 失败/跳过 |
| npx --yes --package=node@22.19.0 node --test test/*.test.js | 77 通过，0 失败/跳过 |
| npm run pack:check | 通过；最终包检查另核对文档和临时文件排除 |
| 实际 npm pack、解包并 import ESM 入口 | 通过；17 个文件，包含 Issue 草稿，不含 test/.work/node_modules；版本和 lock 一致 |
| git diff --check | 通过 |
| gh run view 39395891040 --json headSha,conclusion,jobs | HEAD 246f787，Linux/macOS × Node 22.19/24 四个任务全部 success |

新增焦点用例对基线 client.js 的隔离副本运行，两个对应断言确实失败；没有回退正在使用的源码或修改旧断言，输出为 .work/phase3/client-before.log。

3 个新增组件回归覆盖菜单项卸载后的 trigger、trigger 被另一客户端移除、hidden strip 的行回退及 blur 后 tabindex 恢复。原 74 个生命周期、故障、路径、跨进程、并发、网络/同步测试保留。样式修复通过真实浏览器验证，组件 mock 不作为布局证据。远程 run 仅对应已提交基线，**不证明本轮未提交代码已通过远程矩阵**。

## 未执行与剩余风险

- P0：在已声明的可信、单 Host 存储范围内，本轮未发现新增误删/写入竞态；这不是绝对安全证明。共享目录、多 Host 和恶意并发文件替换仍不受支持；singleHost 是人工声明，不是存储独占检测。
- P1 上游能力：live 退休缺 owner 委托、统一准入和 Cache/Workspace completion；maintenance/status 也不能单独证明 idle。归档缺 CAS，后续失败可能保留归档/丢 pin，继续明确报告而不冒险回滚。
- P1 验收缺口：本轮新 Desktop、Host 成功但 refresh 失败的实机仅同步重试、受理请求后关闭浏览器/断连、两个浏览器同时确认并与 archive/restore 交错未执行。准备失败、迟到写入、旧 refresh 覆盖和 busy 双击等由现有自动化验证，不冒充 UI 通过。Windows、屏幕阅读器、真实执行模型/工具未测。
- P2：仍依赖固定 rc.2 的 root/cache table/Workspace predicate 适配；未新增此类依赖。焦点触发元素或所属行因外部更新/布局变化而卸载时，不强行聚焦不存在节点。

## 文件与发布建议

收尾已关闭三个自建浏览器页面，停止隔离 Host，并删除临时 home、agents、documents 和解包目录。只保留忽略的脱敏日志、夹具脚本、配置快照、证据和本地打包产物。cleanup.json 确认 25 个用户数据文件 size/SHA-256 均未变化。

client.js：两处真实 UI 修复；test/client.test.js：三项针对性回归；README/CHANGELOG：准确的支持范围和验收；testing.md、desktop-smoke-test.md、upstream-audit.md：分开记录实测/自动化/未测；upstream-api-proposal.md 和新增 upstream-issue-draft.md：owner、权限、原子准入、generation、provider remove、失败重试及最小 PR 模块/测试计划；本文件：交付证据。

现有公开接口不能安全组成 live 删除流程；不侵入 owner，也不伪造完成。已准备可实施的上游方案和英文 Issue，但未提交。

保持 **1.1.0-rc.1**。当前冷会话支持范围可继续受控预发布，本轮未发现该范围内新的阻塞性删除缺陷；完整真实环境验收仍有上述缺口，暂不建议直接宣布稳定版或普通用户无条件安装。下一步先补齐新 Desktop 与受理后断连/同步故障回归，再决定限定“单 Host 冷会话删除”的稳定版；live 官方退休能力作为独立上游工作，不靠继续堆叠插件私有生命周期操作解决。

## 本轮空闲会话关闭实现

在独立 `DSH_HOME` 的官方 Web Profile 启动器中加载本地五个修改包，实际创建普通 Agent，并通过插件 HTTP 路由删除。已观察到：live 空闲会话删除后两个 store、日志、缓存均不存在；活动轮次、已归档维护操作和待处理输入被拒绝且未取消；挂起的 disposed Promise 结束前文件仍存在且没有 removed 事件；这期间 send/resume/append 均返回 `SESSION_RETIRING`。Flush 异常保留文件及会话行，重复和不同 ID 并发删除成功。没有调用付费模型，没有操作真实用户存储。

删除套件后未运行自动化测试。插件语法/打包与本地运行的验证结果及未完成的上游完整类型/构建检查见 [本轮说明](../patches/README.md)。

## 2026-10-21：完成官方构建验证

上次临时类型检查混用了工作区源码与 npm 声明。本轮安装上游锁定的开发依赖，改用原生 Project References；相关包及依赖类型检查通过。随后执行完整 `DSH_GATE_CONCURRENCY=1 DSH_GATE_FAIL_FAST=1 pnpm run build`，最终 9 项通过，0 失败、0 跳过，包含 Host/Client 编译与聚合检查、原生模块、Host/Desktop/Client bundle 和 Web 构建。

修正本次新增代码的六项 lint 问题：用捕获的计数对象维护并发 setup，避免非空断言；保持 disposed 回调同步发起并 await 返回值，汇总 unknown 错误，保留非 Error dispatch 异常的 cause；补齐 void 回调写法和公开拒绝代码说明。修改文件的类型感知 lint 与全仓导出 JSDoc 检查通过。

正式构建的 CLI Web Profile 使用独立临时存储，在 Node 24.12.0 验证四项、Node 22.19.0 验证五项实际接口结果：live 空闲删除成功；维护中拒绝且保留 Agent；disposed 返回的 Promise 拒绝时保留日志、缓存及 Workspace 关联、不发移除事件；失败后的同 Host 重试继续拒绝；重启后可安全清理先前失败的会话。没有恢复自动化套件，没有调用付费模型。

官方构建及上述接口验收通过后同步更新源码补丁。Desktop bundle 已生成，尚未打包或启动新的 Desktop 应用；已安装 Desktop 和真实用户数据未修改。版本仍为 `1.1.0-rc.1`，未创建 Tag/Release，未提交或推送远程。

## 本地 Desktop 安装（2026-10-21）

随后用户授权替换实际应用。已完成同版 Desktop 的局部 ASAR 替换、本机签名校验和实际启动；应用包自带 CLI 的隔离删除/活动拒绝/关闭失败保留验证通过。原生 Desktop 已删除一条用户授权的、已加载且空闲的现有对话；日志/缓存/Workspace 均清理，重启后未回弹，其余 7 条日志哈希不变。原应用及配置已备份，详情见 [Desktop 安装记录](desktop-smoke-test.md)。未生成官方安装程序，也未创建 Tag 或 Release；本地应用安装与 Git 代码推送相互独立。
