# 上游最小生命周期 API 建议

这是设计建议，rc.2 **没有**这些接口，插件没有实现或模拟它们。

## 核心能力

由官方 Session Controller/Agent owner 提供单 Session 的 `retireIfIdle(id)`，返回一个拥有明确代际身份的 retirement lease。内部由原 owner 执行销毁，而非把裸 Agent 的私有 detach 暴露给第三方。

建议语义：

1. 在每 ID 的统一 admission 边界中，检查模型、工具、inbox、job、subagent、schedule 等必要活动及 owner 引用；活动/未知/不可释放引用返回拒绝，不能强制停止任务。将“检查 idle”和“阻止新工作/恢复/创建”作为一个受保护的操作。
2. 保持 admission 关闭，等待正在创建/恢复的同 ID 操作结算；由真正 owner 卸载 Agent，等待 Session writer 最终 Flush/Close、Session/Agent store 退出。任一步失败必须返回失败及可重试状态，不能授予成功 lease。
3. Cache 提供同 ID 的 retire/invalidate：覆盖已排队、await 前挂起、cold-read 回写与 disposed 最后写入，等待其完成并保证退休期间不能回写。Workspace 同样阻止迟到关联。只 await `session/disposed` 或 writer.close 仍不够。
4. lease 绑定原 Session generation，持有期间不能复用 ID；官方持久化 remove(lease) 精确删除所属日志和缓存，Workspace 清理在同一生命周期边界内完成。失败可显式重试，不能把部分删除当成成功。
5. lease.close 仅释放 admission/资源，不恢复已经删除的数据。未删除时能否重新打开、失败的退休状态如何恢复，由 owner 明确规定；关闭浏览器不取消 Host 已接受的清理。

这样插件只负责确认 UI、调用官方 retire/remove 和展示结果，便可移除复制的路径算法、cache/Workspace monkey patch。若仅提供 unload 而不提供存储 remove，插件仍需要当前的限定存储适配。

## 两项独立补充

- 归档/置顶应暴露条件更新凭据：返回状态 revision/changed token，并提供在同一队列中执行的 compare-and-restore。它必须能处理其他客户端的幂等 archive 意图；仅比较当前是否 archived 不够。没有这种能力时，插件继续不自动回滚。
- 如需支持共享目录，Session、Cache、Workspace 及所有 Host 必须共同遵守存储层的删除 lease/退休标记。进程内锁、临时进程扫描或单独的 writer flock 不能提供全存储独占保证；这是单 Host idle 卸载以外的另一项工作。

## 上游验收用例

真实创建/恢复的 idle Agent 可退休；active、inbox 未结算、子代理/作业活动均拒绝且不取消工作；并发 prompt/resume 与 retire 只有一个被准入；Flush/Close/Cache 失败不授权删盘；挂起的 cache 回写和 Workspace attach 不能越过退休边界；一个 Session 的退休不影响另一个；断连、owner unload、Host 重启后结果和重试一致。所有磁盘用例只使用临时目录。
