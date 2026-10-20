# 验证与手动测试

## 自动化

```sh
npm ci
npm run check
npm test
npm run pack:check
```

Node 原生测试，无需真实 DSH 配置、凭据、模型调用或用户 `~/.dsh`。`test/helpers.js` 使用 mkdtemp + realpath，并显式声明临时夹具为 singleHost，在临时目录挂载发布的 rc.2 Session/Agent/Persistence/Cache/Workspace；after hook 等待资源释放并删除目录。子进程只接收父测试显式传入的临时 root，不推导用户 home。

- `host.test.js`：冷会话、压缩日志、活动/已归档活动、live 拒绝、必要 Flush/Close、writer 争用、缓存排队与 await 前迟到写入、磁盘和 Workspace 失败、重试/并发、未知/重复/链接路径、权限、自定义 root、启动孤儿记录与迟到 Workspace attach。
- `state.test.js`：第二轮增量回归。写锁/Flush 保留归档与 pin，归档后的外部 archive/unarchive，最终目录变化、首个 unlink 前异常，未使用保护释放、已使用保护保留、清理期间迟到 put、旧实例保护、准备记录释放失败、writer 释放失败、恢复记录的启动保护。另用真实 SessionStore/JSONL 发布模块证明 detach 返回后 close 尚未完成，不能据此删除 live 数据。
- `upstream.test.js`：真实共享 API carrier 的 Host/Origin、认证和 owner admission；解析错误；真实发布的客户端 bundle，两个 Controller 各自验证移除覆盖旧的单飞 refresh。
- `client.test.js`：真实 React Hook/状态机渲染，标题、可访问性属性、双击保护、忙碌时 Escape/遮罩/关闭阻止、焦点包装与恢复、双语错误和仅刷新重试；网络异常/无效 JSON 显示结果未知，拒绝后的归档与保护可读且不伪造移除。DOM 用受控对象提供，不能证明真实浏览器布局或屏幕阅读器行为。
- 两个子进程用例分别验证真实跨进程原生写锁、Host 突然退出后的显式重试；只证明 Session writer exclusion，不证明共享存储下完整删除安全。

没有“正常 live 卸载成功”测试，因为上游没有给本插件安全 owner 能力。测试验证它明确拒绝且没有调用 private detach、没有删文件。不要把该用例改成模拟成功来声称已验收。

开发依赖 `zustand`/`immer` 用于发布的上游 client-store bundle（它在该版本把运行所需项放在 devDependencies 中）；React test renderer 只用于组件测试，会输出弃用提示。它们均不是插件运行时依赖。

## 第二轮执行证据

从干净的 `main` / `e4077a3` 开始。先增添回归用例并对旧实现执行，观察到写锁失败归档/丢 pin、最终验证误报 partial、缺少保护结果、网络错误误报失败等断言失败，再修复代码。启动保护的 archived/unarchived 两类用例也先观察到失败后修复。

当前候选 `1.1.0-rc.1`：Node `24.12.0` 与 `22.19.0` 各 **74/74** 通过，0 失败、0 跳过。`npm ci`、`npm run check`、`npm run pack:check` 通过。本地原始输出在 Git 忽略的 `.work/round2-*.log`，不进入 npm 包。

已通过 GitHub API 核实 [基线 check run](https://github.com/huy8000/dsh-session-delete/actions/runs/39390886294)，headSha 为 `e4077a36be21158fa7d1116b33fb91b30f0a26ef`，Linux/macOS × Node 22.19/24 四个任务及其测试/打包步骤均成功。新候选的 CI 必须按其实际提交 SHA 查询，不能把基线成功当成本轮新代码在 Linux 已通过。

## 已知未覆盖

真实 Desktop 已另做隔离存储实测：两条模型对话、冷删除、live/独占声明拒绝、确认框键盘及重启不回弹，详见 [桌面实测记录](desktop-smoke-test.md)。Web、多客户端、运行中任务的界面拒绝、工具执行、英文界面布局、主题切换、屏幕阅读器、关闭后原菜单/行焦点恢复、Windows、恶意本地进程路径替换、共享存储与电源故障仍未实测。远程 CI 状态需推送后另查，本地结果不代表远程矩阵通过。

## 手动步骤（只用全新临时 DSH_HOME）

在新的测试终端运行，不复用已打开的用户 Desktop 实例：

```sh
manual_home="$(mktemp -d "${TMPDIR:-/tmp}/dsh-delete-manual.XXXXXX")"
export DSH_HOME="$(cd "$manual_home" && pwd -P)"
mkdir -p "$DSH_HOME/test-project"
printf 'Temporary test home: %s\n' "$DSH_HOME"
npx --yes @deepseek-ai/dsh@0.2.1-rc.2 web --no-open
```

这是另行复现 Web 验收的手动指引；Desktop 实测采用临时 root 配置覆盖，方法和恢复证据见实测记录。首次启动初始化临时 web profile。进入这个实例的 Plugins，安装本仓库的本地绝对路径并启用；重启时保持同一个测试终端的临时 `DSH_HOME`。不要在真实 Desktop 的 Plugins 页面操作。若无法确认打开的是临时实例，停止手动测试。先验证默认删除会提示缺少独占存储声明且文件不变；再仅在这个独占临时 profile 中按 README 的 patch 设置 `singleHost: true` 并重启。

1. 加入临时 test-project，建立几个只含无关紧要内容的会话并保存。记录标题、目录、其他会话对照文件。
2. 重启这个临时 Host，不打开目标历史会话，在菜单确认框核对名称、长中英文标题、浅色/深色主题及风险提示；取消、Escape、遮罩均应关闭。
3. 确认删除冷会话。只识别出的日志与当前缓存被删除；稳定锁文件保留；Workspace、pin/archive 与行消失。对照会话内容不变。
4. 打开另一会话使其成为 live，再删除：应显示重启/不要先打开的说明，文件仍在；有活动模型任务时显示等待任务完成，不应强制停止任务。
5. 对一个临时会话先归档，再制造活动（仅在隔离开发环境）；应仍拒绝，而不是把 archive 的幂等返回当成通过。
6. 同时打开两个测试浏览器客户端删除同一冷会话。只产生一次必要清理，两边最终无该行；刷新过程中不能恢复旧行。对不同会话并发操作应隔离。
7. 在临时目录注入目录写权限失败，确认错误而非成功；恢复权限后重试同一 ID。对已有 partial 记录，不手改 Header 或换成其他会话目录。
8. 网络故障后确认对话框区分“Host 未确认”和“Host 已删除、客户端同步失败”；后一种按钮只重试刷新。关闭发起请求的浏览器后，另一个客户端应能观察 Host 最终结果。
9. 用键盘 Tab/Shift+Tab 检查焦点留在确认框；进行中不允许重复提交/关闭。取消后焦点合理返回原菜单/行；菜单卸载和 Host 原生焦点恢复的组合需要在真浏览器核实。
10. 查看中的会话通常是 live，预期拒绝并保留当前视图。只读冷历史若可被删除，检查 DSH 原生 removed 状态及打开视图表现；插件不擅自选择另一会话。
11. 仅在隔离夹具占用目标 writer，再从 UI 删除：普通会话应保持未归档/原 pin，已归档会话保持归档。释放 writer 后重试同一 ID。
12. 在归档之后、删盘之前注入失败，检查错误包含当前归档和保护状态；另一个客户端主动 archive/unarchive 不应被自动回滚。未使用保护应释放，已拦截 put/Workspace 筛选的保护应保留并给出重试/重启说明。不要把手动恢复归档当成解除写入保护。

结束后停止所有测试 Host。确认变量指向刚创建的临时目录并人工检查其中只有测试内容，再由测试人员自行清理。不要复制任何宽泛的 `rm -rf ~/.dsh` 命令。
