# Cursor 简体中文语言包｜Cursor 中文汉化工具

面向 Cursor IDE 的简体中文语言包与完整汉化工具。它保留官方中文语言包的译文，并补齐官方语言包覆盖不到的 Agent、Chat、Composer、Glass、Cursor Settings、菜单栏、命令面板、快捷键说明和状态文案。

适合搜索 **Cursor 中文、Cursor 汉化、Cursor 简体中文语言包、Cursor Chinese Language Pack、Cursor Agent 中文** 的用户。

## 覆盖范围

- Agent / Chat：模式、模型、用量、审批、工具执行、后台任务、Hooks、Skills、Rules、MCP、浏览器与自动审阅。
- Cursor 客户端：开始页、布局切换、设置页标题、原生菜单、编辑器右键菜单和 Go 菜单。
- 命令面板与快捷键：Glass 硬编码的 `jr({ title: ... })` 命令，以及官方 NLS 消息。
- 动态文案：时间、数量、等待状态、工具动作和部分带参数文案。
- 保留项：命令 ID、协议值、URL、快捷键、斜杠命令和产品/技术名称不会被全局翻译。

当前主词典已整合为 `translations/zh-cn.json`，共 2469 条；源代码静态补丁键只保留英文键列表，不再重复保存译文。

## 安装

从 [GitHub Releases](https://github.com/moonliere-afk/cursor-zh-cn-language-pack/releases/latest) 下载 `.vsix`：

```powershell
cursor --install-extension cursor-agent-zh-1.0.1.vsix
```

安装后先从命令面板运行一次 `Cursor Agent 中文：安装版本升级自动修复`（Windows 会请求管理员权限），再完全退出并重新打开 Cursor。也可以手动运行：

- `Cursor Agent 中文：应用汉化`
- `Cursor Agent 中文：还原英文`
- `Cursor Agent 中文：查看状态`
- `Cursor Agent 中文：扫描升级增量`
- `Cursor Agent 中文：安装版本升级自动修复`
- `Cursor Agent 中文：移除版本升级自动修复`

如果 Cursor 安装在受保护的 `Program Files` 且当前进程没有写权限，请以管理员身份启动一次 Cursor 后运行“应用汉化”。

## 升级自动跟随

Windows 版使用独立的计划任务 `CursorZhPackAutoUpdate`，在用户登录 5 分钟后检查，并每 30 分钟执行一次轻量探测。轻量探测只读取版本、状态和文件元数据，不启动 Node、不读取大型 bundle；发现变化后，如果 Cursor 仍在运行则推迟处理，只有 Cursor 完全关闭后才执行完整校验和重应用。它不依赖 Cursor 扩展宿主，因此 Agents/Glass 窗口没有激活第三方扩展时仍然有效。

1. 版本与哈希未变化：不做磁盘写入。
2. Cursor 已升级或安装文件被替换：在后台工作线程中重新应用补丁。
3. 使用官方中文语言包建立“英文原文 → 官方中文”翻译记忆，对新版本新增的结构化 UI 文案自动补全。
4. 无法可靠自动翻译的新增文案写入 `reports/upgrade-<版本>.json`，不会盲目机器翻译。
5. 完成后提示完全重启 Cursor。

计划任务使用 Cursor 自带的 Electron Node 执行工具，不要求另装 Node.js；日志位于 `%LOCALAPPDATA%\CursorZhPack\updater.log`。`cursorAgentZh.externalAutoUpdate` 控制扩展是否尝试安装监控；已安装的任务请用“移除版本升级自动修复”命令移除。扩展宿主内的备用自动应用默认关闭，避免与正在运行的 Agent 窗口争用内存。

## 安全设计

### 版本化备份

备份按 Cursor 的 `version + distro` 分目录保存。工具不会在升级后继续使用旧版本 `.bak`，因此不会把旧 bundle 覆盖到新 Cursor 上。

### 事务写入与回滚

所有输出先在内存中生成并校验。写入过程中若有任一步失败，会按反向顺序恢复本次操作前的文件。`product.json` 校验和只在对应文件生成成功后更新。

### 严格还原

还原前会比较当前文件哈希。文件被 Cursor 升级器或其他程序修改后，工具会跳过它，不会用旧备份强行覆盖新文件。

### 避免启动卡死

- 不观察或修改编辑器内部占位装饰属性。
- 不修改 `contenteditable`、输入框、Monaco、终端或聊天消息正文。
- 不用 `textContent` 覆盖 React 子树。
- 定时任务平时不读取或哈希大型 bundle，只在检测到版本或元数据变化时执行一次完整处理。
- Cursor 运行期间不执行完整补丁扫描或大文件重写。
- 初始 DOM 扫描使用 `requestIdleCallback` 分片，每片最多约 7ms。
- MutationObserver 只在启动后 60 秒观察节点增删；之后由点击、键盘、焦点事件和低频定向扫描处理菜单、对话框等动态 UI，不再常驻监听整个 Agent 对话。
- 主要菜单和设置文案优先在 bundle 源中做精确或上下文替换，运行时注入只作为动态文案补充。

## 开发与验证

```powershell
npm install
npm run normalize
npm run audit
npm test
npm run package
```

- `normalize`：合并词典、消除重复键和冲突，生成规范化报告。
- `audit`：检查危险短词、丢失的斜杠命令、重复 snippet 和冻结禁区。
- `test`：在临时伪 Cursor 安装中验证首次应用、幂等重应用、升级换基线、扫描与还原。
- `package`：生成可分发 VSIX。

## 实现层次

1. 官方 NLS 覆盖：复用已安装的官方/第三方简体中文语言包。
2. 精确字面量补丁：只替换审核过的完整字符串。
3. 上下文 snippet：处理空状态 HTML、原生菜单和编译后特定结构。
4. 官方翻译记忆：只对明确的 `title`、`label`、`description` 等 UI 字段自动应用已有官方译文。
5. 安全运行时翻译：处理动态数量、时间和状态，不进入可编辑区、终端和消息正文。

## 注意

Cursor 更新可能引入全新的 UI 文案。工具会自动检测并生成报告，但无法确认语义的字符串不会自动猜译。这样可以避免把命令 ID、协议枚举或模型输出误改成中文。
