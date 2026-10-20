# dsh-session-delete

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 侧栏加一个**删除会话**动作：归档、卸载 live 会话、删除日志与投影缓存，并从 workspace 记账中移除。

> [!WARNING]
> **删除不可恢复。** 这个插件会把会话目录（`~/.dsh/sessions/...`）和投影缓存（`~/.dsh/storages/session_projcache/...`）从磁盘删除，没有备份、没有回收站、没有“撤销删除”。
>
> 请先在 DSH 里导出或备份重要对话，并只在你愿意承担数据丢失的环境中使用。不要在生产、共享或唯一副本的 DSH 上直接使用。

## 功能

- 在会话行的 `...` 菜单中增加 **删除会话**。
- 二次确认后执行完整删除链路：
  1. 走 DSH 的 archive 门禁，拒绝仍在运行工作的会话；
  2. `flush` 并 detach live 会话，释放 persistence writer 和 `session.lock`；
  3. 删除会话目录、日志和投影缓存；
  4. 从 workspace 的 `sessionIds` 记账中移除；
  5. 从客户端会话列表移除该行；
  6. 清理归档集合里的标记；
  7. 下次启动时清理没有 live 会话、也没有持久化日志的孤儿归档 id。
- 中英文界面文案。

## 安装

要求：DeepSeek Harness `>=0.2.1-rc.2 <0.3.0`。当前只在 macOS Desktop 的 `0.2.1-rc.2` 上实测过。

### 方式 A：从 DSH 插件页安装（推荐）

1. 打开侧栏 **Plugins** → **Add plugin**。
2. 输入：

   ```text
   git+https://github.com/huy8000/dsh-session-delete.git
   ```

3. 点击 **Install**，完成后 **Enable**。
4. 重启 DeepSeek Harness。

### 方式 B：用 `dsh` CLI 安装

```sh
dsh plugin --profile desktop add "git+https://github.com/huy8000/dsh-session-delete.git"
```

然后在 **Plugins** 页面启用 `dsh-session-delete`，重启 DeepSeek Harness。

> `dsh plugin add` 只负责安装依赖；启用 bundle 仍要在插件页完成。

### 方式 C：下载 ZIP 后本地安装

1. 在 GitHub 页面点击 **Code** → **Download ZIP**，解压。
2. **Plugins** → **Add plugin**，输入解压后的**绝对路径**。
3. **Install** → **Enable** → 重启。

## 使用

1. 在侧栏找到要删除的会话。
2. 悬停该行，点击右侧 `...`。
3. 选择 **删除会话**。
4. 确认。

删除成功后该行立即消失。会话仍在运行时，插件会先尝试停止/卸载；如果 Host 拒绝，会提示稍后再删。

如果删除后仍显示为“归档”，查看 DSH 日志里 `dsh-session-delete:` 开头的警告；这通常意味着 live 会话没有被成功 detach。重启 DSH 后该残留会消失。

## 它会删除什么

以会话 `session-<id>` 为例：

```text
~/.dsh/sessions/<project>/session-<id>/       整个目录（日志、锁文件等）
~/.dsh/storages/session_projcache/sessions/session-<id>.json
```

同时会：

- 从 workspace 的 `sessionIds` 中移除；
- 从 `workspace.json` 的 `archivedSessionIds` 中清理；
- 从当前客户端会话列表中移除；
- 释放 Host 内存中的 live 会话和 persistence writer。

**不会**删除 workspace 本身，也不会影响其他会话。

## 兼容性与限制

- 当前版本依赖 DSH 的内部接口（`sessions.liveEntryFor`、`entry.detach`、`workspace.detachSession`、`sessionPersistence.stat`），这些接口没有稳定性承诺；升级 DSH 后可能失效。
- 已在 `package.json` 声明 `engines.dsh`；请勿在范围外的 DSH 上强行安装。
- 只测试了 macOS Desktop；Web/其他平台理论可用，但未验证。
- 如果 live 会话 detach 失败，插件会保留归档标记，避免出现“可点击但打不开”的普通行；此时需要重启 DSH 清理。
- 这不是 DSH 官方插件，也不属于官方 Session 删除能力；使用风险自负。

## 卸载

1. **Plugins** → 找到 `dsh-session-delete` → **Uninstall**。
2. 重启 DSH。

卸载插件**不会**恢复已经删除的会话。

## 开发

```sh
git clone https://github.com/huy8000/dsh-session-delete.git
cd dsh-session-delete

node --check index.js
node --check client.js
npm run check
npm run pack:check
```

目录结构：

```text
index.js            Host 侧：注册删除路由、卸载 live 会话、删文件、清理记账
client.js           浏览器侧：菜单项、确认框、列表移除、归档标记清理
cordis.patch.yml    bundle patch，插入 dsh-session-delete 行
locale/             中英文元信息
icon.svg            插件图标
```

## License

[MIT](LICENSE) © 2026 huy8000

---

# dsh-session-delete (English)

Adds a **Delete session** action to the DeepSeek Harness sidebar. It archives the session, unloads the live instance, removes the session directory and projection cache, detaches it from the workspace account, and removes the row from the client list.

**Deletion is permanent and irreversible.** Back up important conversations first. This is an unofficial plugin that uses internal DSH APIs; it is tested only on DSH `0.2.1-rc.2` (macOS Desktop) and may break on other versions.

Install from **Plugins → Add plugin** with:

```text
git+https://github.com/huy8000/dsh-session-delete.git
```

Then enable the bundle and restart DeepSeek Harness.
