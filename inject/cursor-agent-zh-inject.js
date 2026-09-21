/* cursor-agent-zh-inject */
const MAP = {};
const NLS_PATCH = {};
const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);
const MAP_CI = Object.create(null);
for (const k in MAP) MAP_CI[k.toLowerCase()] = MAP[k];
const CHROME_ONLY = new Set(["Go", "&&Go"]);
const CHROME_SEL =
  '[role="menubar"], [role="menuitem"], .menubar, .menubar-menu-button, .menubar-menu-title, .titlebar, .titlebar-left, .titlebar-center, [data-component="glass-titlebar"]';
const REL_AGO = /^(\d+)\s*([mhdw])\s+ago$/i;
const REL_AGO_BARE = /^(\d+)\s+ago$/i;
const REL_UNITS = { m: "分钟前", h: "小时前", d: "天前", w: "周前" };
const COUNT_NOUNS = [
  ["background terminals", "个后台终端"],
  ["background terminal", "个后台终端"],
  ["browser actions", "个浏览器操作"],
  ["browser action", "个浏览器操作"],
  ["directories", "个目录"],
  ["directory", "个目录"],
  ["searches", "次搜索"],
  ["search", "次搜索"],
  ["fetches", "次获取"],
  ["fetch", "次获取"],
  ["Working", "项进行中"],
  ["working", "项进行中"],
  ["files hidden by filters", "个文件被筛选隐藏"],
  ["file hidden by filters", "个文件被筛选隐藏"],
  ["machines available", "台机器可用"],
  ["machine available", "台机器可用"],
  ["commits ahead", "个提交超前"],
  ["commit ahead", "个提交超前"],
  ["MCP servers", "个 MCP 服务器"],
  ["MCP server", "个 MCP 服务器"],
  ["Files Changed", "个文件已更改"],
  ["File Changed", "个文件已更改"],
  ["files changed", "个文件已更改"],
  ["repositories", "个仓库"],
  ["repository", "个仓库"],
  ["subagents", "个子智能体"],
  ["subagent", "个子智能体"],
  ["teammates", "位队友"],
  ["teammate", "位队友"],
  ["comments", "条评论"],
  ["comment", "条评论"],
  ["commands", "条命令"],
  ["command", "条命令"],
  ["deletes", "处删除"],
  ["delete", "处删除"],
  ["agents", "个智能体"],
  ["agent", "个智能体"],
  ["warnings", "个警告"],
  ["warning", "个警告"],
  ["questions", "个问题"],
  ["question", "个问题"],
  ["matches", "个匹配"],
  ["match", "个匹配"],
  ["Changes", "处更改"],
  ["Change", "处更改"],
  ["Commits", "个提交"],
  ["Commit", "个提交"],
  ["Images", "张图片"],
  ["Image", "张图片"],
  ["Videos", "个视频"],
  ["Video", "个视频"],
  ["minutes", "分钟"],
  ["minute", "分钟"],
  ["seconds", "秒"],
  ["second", "秒"],
  ["skills", "个技能"],
  ["skill", "个技能"],
  ["hooks", "个钩子"],
  ["hook", "个钩子"],
  ["rules", "条规则"],
  ["rule", "条规则"],
  ["lines", "行"],
  ["line", "行"],
  ["tools", "个工具"],
  ["tool", "个工具"],
  ["files", "个文件"],
  ["file", "个文件"],
  ["days", "天"],
  ["day", "天"],
];

function inChrome(el) {
  return Boolean(el && el.closest && el.closest(CHROME_SEL));
}

function relativeTime(core) {
  if (core === "Just now" || core === "just now") return MAP[core] || "刚刚";
  let m = core.match(REL_AGO);
  if (m) {
    const u = REL_UNITS[m[2].toLowerCase()];
    return u ? `${m[1]} ${u}` : null;
  }
  m = core.match(REL_AGO_BARE);
  if (m) return `${m[1]} 前`;
  return null;
}

function countPhrase(core) {
  let m = core.match(/^in (\d+) (days?)$/i);
  if (m) return `${m[1]} 天内`;
  m = core.match(/^(\d+) (lines?) collapsed$/i);
  if (m) return `${m[1]} 行已折叠`;
  m = core.match(/^(\d+)\s+(.+)$/);
  if (!m) return null;
  const n = m[1];
  const rest = m[2].toLowerCase();
  for (let i = 0; i < COUNT_NOUNS.length; i++) {
    if (rest === COUNT_NOUNS[i][0].toLowerCase()) return `${n} ${COUNT_NOUNS[i][1]}`;
  }
  return null;
}

function verbCountPhrase(core) {
  const m = core.match(/^(\S+)\s+(\d+\s+.+)$/);
  if (!m) return null;
  const counted = countPhrase(m[2]);
  if (!counted) return null;
  const verb = m[1];
  const zh =
    MAP[verb] ||
    MAP_CI[verb.toLowerCase()] ||
    { 已运行: "已运行", 运行了: "运行了", 已编辑: "已编辑", 探索了: "探索了", 已列出: "已列出" }[verb] ||
    verb;
  return `${zh} ${counted}`;
}

function formatDurationTokens(s) {
  if (!s) return null;
  const t = s.trim();
  if (!/^(\d+(?:\.\d+)?\s*[hms]\s*)+$/i.test(t)) return null;
  const units = { h: "小时", m: "分", s: "秒" };
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*([hms])/gi;
  let m;
  while ((m = re.exec(t))) out.push(`${m[1]} ${units[m[2].toLowerCase()]}`);
  return out.length ? out.join(" ") : null;
}

function durationPhrase(core) {
  let m = core.match(
    /^(?:Waiting|正在等待)(?:，)?\s*(?:up to|最多)\s+(.+?)\s+(?:for|以完成)\s+(.+)$/i
  );
  if (m) {
    const d = formatDurationTokens(m[1]) || m[1];
    return `正在等待，最多 ${d} 以完成 ${m[2]}`;
  }
  m = core.match(/^up to\s+(.+?)\s+for\s+(.+)$/i);
  if (m) {
    const d = formatDurationTokens(m[1]) || m[1];
    return `最多 ${d} 以完成 ${m[2]}`;
  }
  m = core.match(/^(?:Waiting|正在等待)\s+for\s+(.+)$/i);
  if (m) return `正在等待以完成 ${m[1]}`;
  if (/^(?:Waited|已等待)\s+(?:briefly|片刻)$/i.test(core)) return "等待了片刻";
  m = core.match(/^(?:Waited|已等待)\s+for\s+(.+)$/i);
  if (m) return `已等待以完成 ${m[1]}`;
  m = core.match(/^(?:Waited|已等待)\s+(.+)$/i);
  if (m) {
    const d = formatDurationTokens(m[1]);
    if (d) return `已等待 ${d}`;
  }
  m = core.match(/^Command timed out after (\d+)\s*ms$/i);
  if (m) return `命令在 ${m[1]}ms 后超时`;
  m = core.match(/^Timed out after (.+)$/i);
  if (m) return `在 ${m[1]} 后超时`;
  m = core.match(/^(?:Worked|已完成|Done|完成)\s+for\s+(.+)$/i);
  if (m) {
    const d = formatDurationTokens(m[1]);
    if (d) return `工作了 ${d}`;
  }
  m = core.match(/^for\s+(.+)$/i);
  if (m) {
    const d = formatDurationTokens(m[1]);
    if (d) return `耗时 ${d}`;
  }
  const standalone = formatDurationTokens(core);
  if (standalone) return standalone;
  m = core.match(
    /^Your agent worked for (.+?) on your last prompt\. Consider moving this agent to the cloud, where it can keep working in a secure, isolated VM even if you close your computer\.?$/i
  );
  if (m) {
    const d = formatDurationTokens(m[1]);
    if (d)
      return `你的智能体在上一次提问中工作了 ${d}。可以考虑把它移到云端，这样即使关闭电脑，它也能在安全隔离的虚拟机里继续工作。`;
  }
  return null;
}

function translateActivityPart(part) {
  const t = part.trim();
  if (!t) return t;
  if (MAP[t]) return MAP[t];
  let m = t.match(/^explored\s+(.+)$/i);
  if (m) return `探索了 ${translateActivityPart(m[1])}`;
  m = t.match(/^(?:Edited|edited)\s+(.+)$/i);
  if (m) return `已编辑 ${translateActivityPart(m[1])}`;
  m = t.match(/^(?:Listed|listed)\s+(.+)$/i);
  if (m) return `已列出 ${translateActivityPart(m[1])}`;
  m = t.match(/^(?:已运行|运行了|ran)\s+(\d+)\s+commands?$/i);
  if (m) return `运行了 ${m[1]} 条命令`;
  m = t.match(/^Ran\s+(\d+)\s+(?:browser )?actions?$/i);
  if (m) return `运行了 ${m[1]} 个操作`;
  const mixed = verbCountPhrase(t);
  if (mixed) return mixed;
  const counted = countPhrase(t);
  if (counted) return counted;
  return t;
}

function activityLooksTranslatable(part) {
  const t = part.trim();
  if (!t) return false;
  if (MAP[t]) return true;
  if (/^(explored|edited|listed|ran|read|grepped)\b/i.test(t)) return true;
  if (/^(已运行|运行了|已编辑|探索了|已列出)\s/.test(t)) return true;
  if (/^\d+\s+\S+/.test(t)) return true;
  return false;
}

function activityPhrase(core) {
  if (core.includes(",")) {
    const parts = core.split(",");
    if (parts.length > 1 && parts.every(activityLooksTranslatable)) {
      return parts.map(translateActivityPart).join("，");
    }
  }
  const one = translateActivityPart(core);
  return one !== core ? one : null;
}

function showMorePhrase(core) {
  let m = core.match(/^Show (\d+) more$/i);
  if (m) return `显示另外 ${m[1]} 项`;
  m = core.match(/^show (\d+) more$/i);
  if (m) return `显示另外 ${m[1]} 项`;
  return null;
}

function thoughtPhrase(core) {
  if (core === "Thought briefly" || core === "thought briefly") return "略微思考";
  if (core === "Waited briefly" || core === "waited briefly") return "等待了片刻";
  let m = core.match(/^Thought (.+)$/i);
  if (m) {
    const d = formatDurationTokens(m[1]);
    if (d) return `思考了 ${d}`;
  }
  m = core.match(/^Waited (.+)$/i);
  if (m) {
    const d = formatDurationTokens(m[1]);
    if (d) return `等待了 ${d}`;
  }
  return null;
}

function toolActionPhrase(core) {
  const verbs = [
    ["Reading", "正在读取"],
    ["Writing", "正在写入"],
    ["Editing", "正在编辑"],
    ["Listing", "正在列出"],
    ["Grepping", "正在搜索"],
    ["Running", "正在运行"],
    ["Searching", "正在搜索"],
    ["Deleting", "正在删除"],
    ["Fetching", "正在获取"],
    ["Read", "已读取"],
    ["Wrote", "已写入"],
    ["Write", "已写入"],
    ["Edited", "已编辑"],
    ["Edit", "编辑"],
    ["Listed", "已列出"],
    ["List", "列出"],
    ["Grepped", "已搜索"],
    ["Grep", "搜索"],
    ["Ran", "已运行"],
    ["Run", "运行"],
    ["Searched", "已搜索"],
    ["Search", "搜索"],
    ["Deleted", "已删除"],
    ["Fetched", "已获取"],
    ["Fetch", "获取"],
  ];
  for (let i = 0; i < verbs.length; i++) {
    const en = verbs[i][0];
    const zh = verbs[i][1];
    if (core === en || core.toLowerCase() === en.toLowerCase()) return zh;
    const p = en + " ";
    if (core.length > p.length && core.slice(0, p.length).toLowerCase() === p.toLowerCase()) {
      const rest = core.slice(p.length);
      const counted = countPhrase(rest);
      return zh + " " + (counted || rest);
    }
  }
  return null;
}

function approvalPhrase(core) {
  let m = core.match(/^Awaiting approval to edit (.+)$/i);
  if (m) return `等待批准以编辑 ${m[1]}`;
  m = core.match(/^Awaiting approval to run (.+)$/i);
  if (m) return `等待批准以运行 ${m[1]}`;
  m = core.match(/^(\d+)\/(\d+) To-Dos Completed$/i);
  if (m) return `${m[1]}/${m[2]} 项待办已完成`;
  m = core.match(/^Awaiting review from(.*)$/i);
  if (m) return `等待审核来自${m[1]}`;
  return null;
}

function usagePhrase(core) {
  if (core === "-% used" || core === "% used") return "% 已用";
  let m = core.match(/^(\d+(?:\.\d+)?)% used$/i);
  if (m) return `${m[1]}% 已用`;
  m = core.match(/^Included in (.+)$/i);
  if (m) return `${m[1]} 方案包含`;
  m = core.match(/^Your usage resets on (.+) \((\d+) days?\)\.$/i);
  if (m) return `你的用量将于 ${m[1]} 重置（${m[2]} 天）。`;
  m = core.match(/^Your usage resets on (.+)\.$/i);
  if (m) return `你的用量将于 ${m[1]} 重置。`;
  m = core.match(/^Usage limits reset on (.+?)\s*\((.+)\)$/i);
  if (m) {
    const inner = usagePhrase(m[2]) || m[2];
    return `用量限额将于 ${m[1]} 重置（${inner}）`;
  }
  m = core.match(/^(\d+) days? left$/i);
  if (m) return `剩余 ${m[1]} 天`;
  m = core.match(/^(\d+) hours? and (\d+) minutes? left$/i);
  if (m) return `剩余 ${m[1]} 小时 ${m[2]} 分钟`;
  m = core.match(/^(\d+) hours? left$/i);
  if (m) return `剩余 ${m[1]} 小时`;
  m = core.match(/^(\d+) minutes? left$/i);
  if (m) return `剩余 ${m[1]} 分钟`;
  if (/^0 minutes left$/i.test(core)) return "已到期";
  m = core.match(/^Upgrade to (.+) to keep going\.$/i);
  if (m) return `升级到 ${m[1]} 以继续使用。`;
  m = core.match(/^Adjust your limits to continue, or upgrade to (.+)\.$/i);
  if (m) return `请调整限额以继续，或升级到 ${m[1]}。`;
  m = core.match(/^Get more usage to (continue|switch models)$/i);
  if (m) return m[1].toLowerCase() === "switch models" ? "获取更多用量以切换模型" : "获取更多用量以继续";
  m = core.match(/^Additional usage beyond limits consumes (.+)$/i);
  if (m) {
    const tail = {
      "on-demand spend.": "按需支出。",
      "on-demand usage.": "按需用量。",
      "Other Models quota or on-demand spend.": "其他模型配额或按需支出。",
      "API quota or on-demand spend.": "API 配额或按需支出。",
      "API quota or on-demand usage.": "API 配额或按需用量。",
    }[m[1]];
    if (tail) return `超出限额的额外用量将消耗${tail}`;
  }
  m = core.match(/^Your plan ends on (.+)\. Resubscribe to keep using Cursor\.$/i);
  if (m) return `你的方案将于 ${m[1]} 到期。重新订阅以继续使用 Cursor。`;
  m = core.match(/^Link GitHub account (.+) to your current Cursor account\?$/i);
  if (m) return `将 GitHub 账户 ${m[1]} 关联到当前 Cursor 账户？`;
  m = core.match(/^Sharing will activate in (\d+) hours?\.$/i);
  if (m) return `共享将在 ${m[1]} 小时后启用。`;
  m = core.match(/^Data Sharing is controlled by (your|the) team admin\.$/i);
  if (m) return m[1].toLowerCase() === "the" ? "数据共享由该团队管理员控制。" : "数据共享由你的团队管理员控制。";
  return null;
}

function settingsMiscPhrase(core) {
  if (core === "Upgrade" || core === "upgrade") return "升级";
  if (core === "Upgrading…" || core === "Upgrading...") return "正在升级…";
  if (core === "Interrupt" || core === "interrupt") return "中断";
  let m = core.match(/^Cycle (.+)$/i);
  if (m) return `循环切换${paramLabelZh(m[1])}`;
  m = core.match(/^Unlock (\d+)x more usage on Agent & more$/i);
  if (m) return `解锁 ${m[1]} 倍智能体用量及更多权益`;
  let s = core
    .replace(/\s*\(controlled by admin\)/gi, "（由管理员控制）")
    .replace(/\s*\(Deprecated\)/gi, "（已弃用）")
    .replace(/\s*-\s*DEPRECATED$/i, "（已弃用）");
  m = core.match(/^Automatically parse links when pasted into Quick Edit \((.+)K\) input$/i);
  if (m) return `粘贴到 Quick Edit（${m[1]}K）输入框时自动解析链接`;
  m = core.match(/^Accept the next word of a suggestion via (.+)$/i);
  if (m) return `通过 ${m[1]} 接受建议的下一个词`;
  m = core.match(/^Go to Chat (\d+)$/i);
  if (m) return `转到对话 ${m[1]}`;
  m = core.match(/^Go to Tab (\d+)$/i);
  if (m) return `转到标签页 ${m[1]}`;
  m = core.match(/^Fold Level (\d+)$/i);
  if (m) return `折叠级别 ${m[1]}`;
  m = core.match(/^Switch to Agents? Window(?: \(Glass\))?$/i);
  if (m) return "切换到智能体窗口";
  m = core.match(/^切换到\s*Agents?\s*Window(?: \(Glass\))?$/i);
  if (m) return "切换到智能体窗口";
  const heads = [
    ["Switch to Agents Window (Glass)", "切换到智能体窗口"],
    ["Try a new window for running parallel agents", "打开新窗口以并行运行智能体"],
    ["Add Symbol to Current Chat...", "将符号添加到当前对话..."],
    ["Add Symbol to Current Chat", "将符号添加到当前对话"],
    ["Add Symbol to New Chat...", "将符号添加到新对话..."],
    ["Add Symbol to New Chat", "将符号添加到新对话"],
    ["Add Directory to New Cursor Chat", "将目录添加到新的 Cursor 对话"],
    ["Add Directory to Cursor Chat", "将目录添加到 Cursor 对话"],
    ["Add File to New Cursor Chat", "将文件添加到新的 Cursor 对话"],
    ["Add File to Cursor Chat", "将文件添加到 Cursor 对话"],
    ["Add Files to New Chat", "将文件添加到新对话"],
    ["Add Files to Chat", "将文件添加到对话"],
    ["Open project pull requests page", "打开项目拉取请求页"],
    ["Open project agents page", "打开项目智能体页"],
    ["Switch to Agents Window", "切换到智能体窗口"],
    ["Switch to Agent Window", "切换到智能体窗口"],
    ["切换到 Agents Window", "切换到智能体窗口"],
    ["切换到 Agent Window", "切换到智能体窗口"],
    ["切换到Agents Window", "切换到智能体窗口"],
    ["切换到Agent Window", "切换到智能体窗口"],
    ["Open project config", "打开项目配置"],
    ["Quick Open View", "快速打开视图"],
    ["Recent projects", "最近的项目"],
    ["Create project", "创建项目"],
    ["Open project", "打开项目"],
    ["Open View...", "打开视图..."],
    ["Agents Window", "智能体窗口"],
    ["Try it now", "立即试用"],
    ["Add symbol to Current Chat", "将符号添加到当前对话"],
    ["Add symbol to New Chat", "将符号添加到新对话"],
    ["Clone repo", "克隆仓库"],
    ["Open View", "打开视图"],
    ["Customize your Cursor experience", "自定义你的 Cursor 体验"],
    ["No project agents have access yet.", "还没有项目智能体获得访问权限。"],
    ["No MCP tools are connected yet.", "尚未连接 MCP 工具。"],
    ["Enable or disable individual tools.", "启用或禁用单个工具。"],
    ["Recent Workspaces", "最近的工作区"],
    ["Recently Viewed", "最近查看"],
    ["Recent Actions", "最近操作"],
    ["Dynamic Configs", "动态配置"],
    ["Get Started", "开始使用"],
    ["In-App Ads", "应用内广告"],
    ["All Files", "所有文件"],
    ["Fold All Block Comments", "折叠全部块注释"],
    ["Unfold All Regions", "展开全部区域"],
    ["Fold All Regions", "折叠全部区域"],
    ["Unfold All", "全部展开"],
    ["Fold All", "全部折叠"],
    ["Developer: Relaunch Active Terminal for Backport Verification", "开发人员: 为回移植验证重新启动活动终端"],
    ["Developer: Reset Max Mode Confirmation (model picker)", "开发人员: 重置 Max 模式确认（模型选择器）"],
    ["Developer: Stop Tracking Disposables and Copy Report", "开发人员: 停止跟踪可释放对象并复制报告"],
    ["Toggle Workbench Lifecycle Metric (Performance Bar)", "切换工作台生命周期指标（性能栏）"],
    ["Agent Exec: Toggle Simulate Temporary Unavailable", "智能体执行: 切换模拟暂时不可用"],
    ["Connection: Simulate Connection Drop (transient)", "连接: 模拟连接中断（暂时）"],
    ["Toggle: Simulate No Terminal Sandbox (Dev Only)", "切换: 模拟无终端沙盒（仅开发）"],
    ["Developer: Reset Design Mode Quick Action Pill", "开发人员: 重置设计模式快捷操作胶囊"],
    ["Show Dummy Quick Pick (With Short Description)", "显示示例快速选择（短描述）"],
    ["Show Dummy Quick Pick (With Long Description)", "显示示例快速选择（长描述）"],
    ["Show Dummy Quick Pick (With Multi Select)", "显示示例快速选择（多选）"],
    ["Connection: Simulate Permanent Disconnect", "连接: 模拟永久断开"],
    ["Developer: Snapshot Tracked Disposables", "开发人员: 快照已跟踪的可释放对象"],
    ["Developer: New Additional Agents Window", "开发人员: 新建额外智能体窗口"],
    ["Developer: Reload and Start Glass FTUX", "开发人员: 重新加载并开始 Glass 首次体验"],
    ["Resolve Workspace Path For Inline Code", "解析内联代码的工作区路径"],
    ["Developer: Start Tracking Disposables", "开发人员: 开始跟踪可释放对象"],
    ["Toggle Indexed Agent Search Dev Tools", "切换索引智能体搜索开发人员工具"],
    ["Open subagent preview in agents tray", "在智能体托盘中打开子智能体预览"],
    ["Insert Selection into Glass Composer", "将选区插入 Glass Composer"],
    ["Clear Forced Skill Migration Banner", "清除强制技能迁移横幅"],
    ["New Agent (preserve editor panel)", "新建智能体（保留编辑器面板）"],
    ["Try Open Subagent Preview by ID", "尝试按 ID 打开子智能体预览"],
    ["Show Notification Progress Demo", "显示通知进度演示"],
    ["Glass Image Preview: Reset Zoom", "Glass 图片预览: 重置缩放"],
    ["Developer: Startup Performance", "开发人员: 启动性能"],
    ["Switch to Model Slug In Glass", "在 Glass 中切换到模型别名"],
    ["Developer: Set Anyrun Cluster", "开发人员: 设置 Anyrun 集群"],
    ["Connection: Trigger Reconnect", "连接: 触发重新连接"],
    ["Glass Image Preview: Zoom Out", "Glass 图片预览: 缩小"],
    ["Toggle Chat Switch Trace HUD", "切换对话切换跟踪 HUD"],
    ["Toggle Performance Debug Bar", "切换性能调试栏"],
    ["Toggle Corner Clipping Debug", "切换圆角裁剪调试"],
    ["Inject cursor-socket failure", "注入 cursor-socket 故障"],
    ["Glass Image Preview: Zoom In", "Glass 图片预览: 放大"],
    ["Open Pull Request Externally", "在外部打开拉取请求"],
    ["Force Skill Migration Banner", "强制显示技能迁移横幅"],
    ["Open Cloud Agent View by ID", "按 ID 打开云端智能体视图"],
    ["Manage Experiment Overrides", "管理实验覆盖"],
    ["Apply IDE Workspace Handoff", "应用 IDE 工作区交接"],
    ["Force High CPU Usage Toast", "强制高 CPU 占用提示"],
    ["Show Output Channel in Tab", "在标签页中显示输出通道"],
    ["Open Least Recent Agents", "打开最早的智能体"],
    ["Simulate Limit Hit Stage", "模拟额度用尽阶段"],
    ["Add Project Item to Chat", "将项目项添加到对话"],
    ["Toggle Selection of File", "切换文件选中"],
    ["Toggle Expansion of File", "切换文件展开"],
    ["Find Previous in Preview", "在预览中查找上一个"],
    ["Toggle Cursor Dev Tools", "切换 Cursor 开发人员工具"],
    ["SSH Connect Dialog Back", "SSH 连接对话框返回"],
    ["WSL Connect Dialog Back", "WSL 连接对话框返回"],
    ["Cycle Instance Selector", "循环切换实例选择器"],
    ["Get Active File Tab URI", "获取活动文件标签 URI"],
    ["Edit Pull Request Title", "编辑拉取请求标题"],
    ["Hard Reload Browser Tab", "硬重新加载浏览器标签页"],
    ["Open Project Tasks Page", "打开项目任务页"],
    ["Open Cloud Agent by ID", "按 ID 打开云端智能体"],
    ["Manage Private Workers", "管理私有 Worker"],
    ["Show Dummy Quick Input", "显示示例快速输入"],
    ["Manage Dynamic Configs", "管理动态配置"],
    ["Search Cursor Settings", "搜索 Cursor 设置"],
    ["Open Instance Selector", "打开实例选择器"],
    ["Focus Customize Search", "聚焦自定义搜索"],
    ["Previous Search Result", "上一个搜索结果"],
    ["New Agent with Context", "带上下文新建智能体"],
    ["Open File (Right Pane)", "打开文件（右侧窗格）"],
    ["Show Dummy Quick Pick", "显示示例快速选择"],
    ["Jump to Previous File", "跳到上一个文件"],
    ["Toggle Local / GitHub", "切换本地 / GitHub"],
    ["Find Previous in Plan", "在计划中查找上一个"],
    ["Close Find in Preview", "关闭预览查找"],
    ["Switch to Model Slug", "切换到模型别名"],
    ["Manage Feature Flags", "管理功能标志"],
    ["Open Branch Selector", "打开分支选择器"],
    ["Activate Browser Tab", "激活浏览器标签页"],
    ["Focus in Code Editor", "聚焦代码编辑器"],
    ["Find Next in Preview", "在预览中查找下一个"],
    ["Export Current Chat", "导出当前对话"],
    ["Show Output Channel", "显示输出通道"],
    ["Developer: Storage", "开发人员: 存储"],
    ["Open Recent Agents", "打开最近的智能体"],
    ["Next Search Result", "下一个搜索结果"],
    ["Select All in File", "在文件中全选"],
    ["Select All in Diff", "在差异中全选"],
    ["Retarget File Tabs", "重新定位文件标签"],
    ["New Composer Chat", "新建 Composer 对话"],
    ["Simulate New User", "模拟新用户"],
    ["Open MCP Settings", "打开 MCP 设置"],
    ["Close Browser Tab", "关闭浏览器标签页"],
    ["Focus in Terminal", "聚焦终端"],
    ["Jump to Next File", "跳到下一个文件"],
    ["Customize Sidebar", "自定义侧边栏"],
    ["Find Next in Plan", "在计划中查找下一个"],
    ["Clone Repository", "克隆仓库"],
    ["Add to Side Chat", "添加到侧边对话"],
    ["Close Customize", "关闭自定义"],
    ["Refresh Changes", "刷新更改"],
    ["Format Document", "格式化文档"],
    ["Close Plan Find", "关闭计划查找"],
    ["Select Backend", "选择后端"],
    ["Open Workspace", "打开工作区"],
    ["Save All Files", "全部保存"],
    ["Open diff menu", "打开差异菜单"],
    ["Review Changes", "审阅更改"],
    ["Reload Window", "重新加载窗口"],
    ["New Side Chat", "新建侧边对话"],
    ["Commit & Push", "提交并推送"],
    ["Copy Auth ID", "复制 Auth ID"],
    ["Report Issue", "报告问题"],
    ["Switch Theme", "切换主题"],
    ["Close Window", "关闭窗口"],
    ["New Tab Menu", "新建标签页菜单"],
    ["Browse Files", "浏览文件"],
    ["Show Minimap", "显示缩略图"],
    ["Open Gallery", "打开图库"],
    ["Import Chat", "导入对话"],
    ["Open Folder", "打开文件夹"],
    ["Scroll Down", "向下滚动"],
    ["Open Canvas", "打开画布"],
    ["Report Bug", "报告错误"],
    ["Report Lag", "报告卡顿"],
    ["Go to File", "转到文件"],
    ["Select All", "全选"],
    ["Save File", "保存文件"],
    ["Scroll Up", "向上滚动"],
    ["Open Plan", "打开计划"],
    ["Run Task", "运行任务"],
    ["Choose how Agents run tools like command execution, MCP, and file writes.", "选择智能体如何运行命令执行、MCP 和文件写入等工具。"],
    ["A classifier will run for each action and decide whether it's safe to execute this command. Allowlists are still respected.", "分类器会对每项操作进行判断，决定此命令是否可以安全执行。允许列表仍然有效。"],
    ["Many commands will run automatically inside the sandbox, and a classifier will run for the actions that cannot run in the sandbox. Allowlists are still respected.", "许多命令会在沙箱中自动运行；无法在沙箱中运行的操作会先经过分类器。允许列表仍然有效。"],
    ["Prevent Agent from creating or modifying files outside of the workspace automatically", "阻止智能体自动在工作区外创建或修改文件"],
    ["Prevent Agent from deleting files automatically", "阻止智能体自动删除文件"],
    ["Prevent Agent from automatically running MCP tools", "阻止智能体自动运行 MCP 工具"],
    ["Prevent Agent from automatically running Browser tools", "阻止智能体自动运行浏览器工具"],
    ["You can configure Shell, MCP, Fetch, and Read allowlists for Auto mode. However, Auto works well without these.", "你可以在 Auto 模式下配置 Shell、MCP、Fetch 和 Read 允许列表。不过不配置这些，Auto 通常也能正常工作。"],
    ["You can configure Shell, MCP and Fetch allowlists for Auto mode. However, Auto works well without these.", "你可以在 Auto 模式下配置 Shell、MCP 和 Fetch 允许列表。不过不配置这些，Auto 通常也能正常工作。"],
    ["Use with caution. Skip symlinks during .cursorignore file discovery. Enable only when all .cursorignore files are reachable without symlinks（由管理员控制）. Changing this setting requires restarting Cursor.", "请谨慎使用。在发现 .cursorignore 文件时跳过符号链接。仅当所有 .cursorignore 文件无需经过符号链接即可访问时再启用（由管理员控制）。更改此设置需要重启 Cursor。"],
    ["Use with caution. Skip symlinks during .cursorignore file discovery. Enable only when all .cursorignore files are reachable without symlinks. Changing this setting requires restarting Cursor.", "请谨慎使用。在发现 .cursorignore 文件时跳过符号链接。仅当所有 .cursorignore 文件无需经过符号链接即可访问时再启用。更改此设置需要重启 Cursor。"],
    ["Apply .cursorignore files to all subdirectories（由管理员控制）. Changing this setting requires restarting Cursor.", "将 .cursorignore 应用到所有子目录（由管理员控制）。更改此设置需要重启 Cursor。"],
    ["Apply .cursorignore files to all subdirectories. Changing this setting requires restarting Cursor.", "将 .cursorignore 应用到所有子目录。更改此设置需要重启 Cursor。"],
    ["By default, get notifications for stable updates. In Early Access, pre-release builds may be unstable for production work.", "默认接收稳定版更新通知。在抢先体验中，预发布版本可能不稳定，不适合用于生产工作。"],
    ["Commands that can't run automatically", "无法自动运行的命令"],
    ["File paths and glob patterns agents can read without approval", "智能体无需批准即可读取的文件路径和 glob 模式"],
    ["Mark Agent commits as 'Made with Cursor'", "将智能体提交标记为由 Cursor 制作"],
    ["将智能体提交标记为 Made with Cursor", "将智能体提交标记为由 Cursor 制作"],
    ["Mark pull requests as made with Cursor", "将 Pull Request 标记为由 Cursor 制作"],
    ["分层 Cursor Ignore", "分层应用 .cursorignore"],
    ["在 Cursor Ignore 搜索中忽略符号链接", "在 .cursorignore 搜索中跳过符号链接"],
    ["Copy Domains", "复制域名"],
    ["Running Diagnostic", "正在运行诊断"],
    ["Run Diagnostic", "运行诊断"],
    ["正在运行 Diagnostic", "正在运行诊断"],
    ["运行 Diagnostic", "运行诊断"],
    ["Show Logs", "显示日志"],
    ["Hide Logs", "隐藏日志"],
    ["Cursor 托管的 Worktree", "Cursor 托管的工作树"],
    ["Cursor托管的Worktree", "Cursor 托管的工作树"],
    ["Inherit from parent", "继承自父级"],
    ["Recent Files", "最近的文件"],
    ["Go Back", "后退"],
    ["Go Forward", "前进"],
    ["Pin / Unpin Agent", "固定/取消固定智能体"],
    ["Dictate", "语音输入"],
    ["Run in background", "在后台运行"],
    ["运行 in background", "在后台运行"],
    ["Agent is waiting for a command to finish.", "智能体正在等待命令结束。"],
    ["Agent is waiting for commands to finish.", "智能体正在等待多条命令结束。"],
    ["Command timed out", "命令已超时"],
    ["Waiting up to 50s for shell", "正在等待，最多 50 秒 以完成 shell"],
    ["Toggle Git Blame", "切换 Git 追溯"],
    ["Open Plugins", "打开插件"],
    ["Open MCPs", "打开 MCP"],
    ["Open Skills", "打开技能"],
    ["Open skills", "打开技能"],
    ["Open Subagents", "打开子智能体"],
    ["Open Rules", "打开规则"],
    ["Open Commands", "打开命令"],
    ["Open Hooks", "打开钩子"],
    ["System Theme", "系统主题"],
    ["High Contrast Theme", "高对比度主题"],
    ["Switch to Cursor Light", "切换到 Cursor 浅色"],
    ["Switch to Cursor Dark", "切换到 Cursor 深色"],
    ["Switch to Cursor High Contrast", "切换到 Cursor 高对比度"],
    ["Reset In-App Ad Views", "重置应用内广告浏览"],
    ["Toggle Developer Tools", "切换开发人员工具"],
    ["Developer: Open Logs Folder", "开发人员: 打开日志文件夹"],
    ["Developer:Open Logs Folder", "开发人员: 打开日志文件夹"],
    ["Open Logs Folder", "打开日志文件夹"],
    ["Developer: Reveal User Data Folder", "开发人员: 打开用户数据文件夹"],
    ["Developer:Reveal User Data Folder", "开发人员: 打开用户数据文件夹"],
    ["Reveal User Data Folder", "打开用户数据文件夹"],
    ["Connect via SSH", "通过 SSH 连接"],
    ["Connect via WSL", "通过 WSL 连接"],
    ["Open SSH Configuration File", "打开 SSH 配置文件"],
    ["Generate Remote SSH Connection Report", "生成 Remote SSH 连接报告"],
    ["Show Remote SSH Output", "显示 Remote SSH 输出"],
    ["Kill Remote SSH Server and Reload Window", "终止 Remote SSH 服务器并重新加载窗口"],
    ["Reinstall Remote SSH Server and Reload Window", "重新安装 Remote SSH 服务器并重新加载窗口"],
    ["Group by Workspace", "按工作区分组"],
    ["Group by Repository", "按仓库分组"],
    ["Group by Updated", "按更新时间分组"],
    ["Group by Status", "按状态分组"],
    ["Group by Environment", "按环境分组"],
    ["Copy Relative Path of Active File", "复制活动文件相对路径"],
    ["Copy Path of Active File", "复制活动文件路径"],
    ["Open Developer Tools for Extension Host", "打开扩展宿主的开发人员工具"],
    ["Show Terminal Texture Atlas", "显示终端纹理图集"],
    ["Show Terminal Quick Fixes", "显示终端快速修复"],
    ["Show Terminal List", "显示终端列表"],
    ["Hide Terminal List", "隐藏终端列表"],
    ["Show terminal list", "显示终端列表"],
    ["Hide terminal list", "隐藏终端列表"],
    ["Show Terminal", "显示终端"],
    ["Open Automations", "打开自动化"],
    ["Save Automation", "保存自动化"],
    ["Back From Automation", "返回自动化"],
    ["Open Browser Tab", "打开浏览器标签页"],
    ["Toggle File Tree", "切换文件树"],
    ["Toggle Search in Files", "切换在文件中搜索"],
    ["Hide Sidebar", "隐藏侧边栏"],
    ["Show Sidebar", "显示侧边栏"],
    ["Open Apps Panel", "打开应用面板"],
    ["Show Apps Panel", "显示应用面板"],
    ["Hide Apps Panel", "隐藏应用面板"],
    ["Enter Full Screen", "进入全屏"],
    ["Exit Full Screen", "退出全屏"],
    ["Toggle Fullscreen", "切换全屏"],
    ["Toggle Design Mode", "切换设计模式"],
    ["Hide Status Bar", "隐藏状态栏"],
    ["Show Status Bar", "显示状态栏"],
    ["Hide Minimap", "隐藏缩略图"],
    ["New Output View", "新建输出视图"],
    ["Set Log Level...", "设置日志级别..."],
    ["Start File Watch Recording", "开始文件监视录制"],
    ["Show Running Extensions", "显示正在运行的扩展"],
    ["Start Extension Host Heap Allocation Profiler", "启动扩展宿主堆分配分析器"],
    ["Start Extension Host CPU Profiler", "启动扩展宿主 CPU 分析器"],
    ["Start Remote Server CPU Profiler", "启动远程服务器 CPU 分析器"],
    ["Developer: Start Network & IPC Profiler", "开发人员: 启动网络和 IPC 分析器"],
    ["Open Workspace Process Explorer", "打开工作区进程资源管理器"],
    ["Open Process Explorer", "打开进程资源管理器"],
    ["Process Explorer", "进程资源管理器"],
    ["Start Electron Trace", "开始 Electron 跟踪"],
    ["Capture and Send Debugging Data", "捕获并发送调试数据"],
    ["A Capture and Send Debugging Data", "捕获并发送调试数据"],
    ["Delete Cloud-Agent Cache", "删除云端智能体缓存"],
    ["Developer: Prune PR Lifecycle Cache", "开发人员: 精简 PR 生命周期缓存"],
    ["Developer: Delete Old Chats…", "开发人员: 删除旧对话…"],
    ["Delete Old Chats...", "删除旧对话..."],
    ["Delete Old Chats", "删除旧对话"],
    ["Delete chats older than how many days?", "删除多少天之前的对话？"],
    ["GC Agent KV Blobs: starting...", "回收智能体 KV 数据块：正在开始..."],
    ["GC Agent KV Blobs", "回收智能体 KV 数据块"],
    ["Workspace Diagnostics", "工作区诊断"],
    ["Display Workspace Metadata", "显示工作区元数据"],
    ["Display Explorer Orchestrator Cache", "显示资源管理器编排器缓存"],
    ["Network & IPC Profiler is running", "网络和 IPC 分析器正在运行"],
    ["Stop profiler and show results", "停止分析器并显示结果"],
    ["Deleted all Cloud-Agent cache data.", "已删除全部云端智能体缓存数据。"],
    ["Find Previous in Browser Page", "在浏览器页面中查找上一个"],
    ["Find Next in Browser Page", "在浏览器页面中查找下一个"],
    ["Reopen Last Closed Chat Tab", "重新打开上次关闭的聊天标签页"],
    ["Reopen Last Closed Tab", "重新打开上次关闭的标签页"],
    ["Debug: Open Skill Publishing Logs", "调试: 打开技能发布日志"],
    ["Debug:Open Skill Publishing Logs", "调试: 打开技能发布日志"],
    ["Open Skill Publishing Logs", "打开技能发布日志"],
    ["Close All Open Files", "关闭所有打开的文件"],
    ["Close Browser Find", "关闭浏览器查找"],
    ["Find in Browser Page", "在浏览器页面中查找"],
    ["Checking for Updates...", "正在检查更新..."],
    ["Check for Updates...", "检查更新..."],
    ["Downloading Update...", "正在下载更新..."],
    ["Installing Update...", "正在安装更新..."],
    ["Download Update", "下载更新"],
    ["Restart to Update", "重启以更新"],
    ["Check for Updates", "检查更新"],
    ["Find in Changes", "在更改中查找"],
    ["Find in Terminal", "在终端中查找"],
    ["Find in Output", "在输出中查找"],
    ["Find in Files", "在文件中查找"],
    ["Find in File", "在当前文件中查找"],
    ["Find in Plan", "在计划中查找"],
    ["Previous Palette Filter", "上一个面板筛选"],
    ["Next Palette Filter", "下一个面板筛选"],
    ["Actions Palette", "操作面板"],
    ["Close Chat Tab", "关闭聊天标签页"],
    ["Update Cursor", "更新 Cursor"],
  ];
  for (const [en, zh] of heads) {
    if (s === en) return zh;
    if (s.startsWith(en)) {
      const suffix = s.slice(en.length);
      if (/^(?:\s*[(:：\-–—]|\s+\d)/.test(suffix)) return zh + suffix;
    }
  }
  if (s !== core) return s;
  return null;
}

function customizePhrase(core) {
  let m = core.match(/^Configured Hooks \((\d+)\)$/i);
  if (m) return `已配置的钩子（${m[1]}）`;
  m = core.match(/^Open (.+) in Customize$/i);
  if (m) {
    const left = MAP[m[1]] || MAP_CI[m[1].toLowerCase()] || m[1];
    return `在「自定义」中打开${left}`;
  }
  m = core.match(/^(.+) are moving to Customize$/i);
  if (m) {
    const left = MAP[m[1]] || MAP_CI[m[1].toLowerCase()] || m[1];
    return `${left} 将移至「自定义」`;
  }
  m = core.match(/^(.+) in Customize$/i);
  if (m) {
    const left = MAP[m[1]] || MAP_CI[m[1].toLowerCase()] || m[1];
    return `${left}（自定义）`;
  }
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const REVIEW_PAIRS = [
  ["这是一条具有完全权限、会读取工作区外内容的本机脚本，具体副作用不可见，因此可能在未确认目标的情况下进行无范围更改或暴露数据。用户要求的是 打补丁并验证, 而不是 execute an 外部辅助程序 that may do more than read。当前请求是打补丁并验证，而不是以完全权限执行外部辅助程序。", "这是一条具有完全权限、会读取工作区外内容的本机脚本，具体副作用不可见，因此可能在未确认目标的情况下进行无范围更改或暴露数据。用户要求的是打补丁并验证，而不是执行可能超出只读范围的外部辅助程序。当前请求是打补丁并验证，而不是以完全权限执行外部辅助程序。"],
  ["The request says to apply a patch and verify it, but not to execute an external helper with full permissions.", "当前请求是打补丁并验证，而不是以完全权限执行外部辅助程序。"],
  ["The request says to apply a patch and verify it, but not to execute an extemal helper with full permissions.", "当前请求是打补丁并验证，而不是以完全权限执行外部辅助程序。"],
  ["The trusted request is only to apply and verify the patch, not to execute an external helper whose exact behavior is not visible here.", "当前只需打补丁并验证，而不是执行行为在此处不可见的外部辅助程序。"],
  ["The user asked to apply a patch and verify it, but not to execute an external helper that may do more than read.", "用户要求的是打补丁并验证，而不是执行可能超出只读范围的外部辅助程序。"],
  ["The user asked to apply a patch and verify it, not to execute an external helper that may do more than read.", "用户要求的是打补丁并验证，而不是执行可能超出只读范围的外部辅助程序。"],
  ["The user asked to apply a patch and verify it, not to run an external helper that may do more than read.", "用户要求的是打补丁并验证，而不是运行可能超出只读范围的外部辅助程序。"],
  ["The request says to apply a patch and verify it, but not to execute an external helper that may do more than read.", "当前请求是打补丁并验证，而不是执行可能超出只读范围的外部辅助程序。"],
  ["The user asked to apply a patch and verify it, not to run an uninspected executable outside the workspace.", "用户要求的是打补丁并验证，而不是运行工作区外未经检查的可执行文件。"],
  ["用户要求的是 打补丁并验证, 而不是 execute an 外部辅助程序 that may do more than read。", "用户要求的是打补丁并验证，而不是执行可能超出只读范围的外部辅助程序。"],
  ["用户要求的是打补丁并验证, 而不是 execute an 外部辅助程序 that may do more than read。", "用户要求的是打补丁并验证，而不是执行可能超出只读范围的外部辅助程序。"],
  ["用户要求的是打补丁并验证，而不是 execute an 外部辅助程序 that may do more than read。", "用户要求的是打补丁并验证，而不是执行可能超出只读范围的外部辅助程序。"],
  ["execute an 外部辅助程序 that may do more than read", "执行可能超出只读范围的外部辅助程序"],
  ["execute an external helper that may do more than read", "执行可能超出只读范围的外部辅助程序"],
  ["This is a host-side external helper with full permissions, and its behavior is not visible from the command alone, so it could make unscoped changes or reveal more than the requested UI text extraction.", "这是具有完全权限的本机外部辅助程序，仅从命令本身看不到具体行为，因此可能进行无范围更改，或暴露超出所请求界面文本提取的内容。"],
  ["This is a host-side script with full permissions that reads outside the workspace, so its exact side effects are not visible and it could make unscoped changes or expose data without confirming the target.", "这是一条具有完全权限、会读取工作区外内容的本机脚本，具体副作用不可见，因此可能在未确认目标的情况下进行无范围更改或暴露数据。"],
  ["This runs a host-side script from outside the workspace whose behavior is not visible here, so it could make unscoped file changes or other side effects without confirming the exact target.", "这会在本机运行工作区外的脚本，此处看不到它的具体行为，因此可能在未确认目标的情况下进行无范围文件更改或其他副作用。"],
  ["This fetches a remote install script from the network; even though it only prints a few lines, it is an untrusted external download and not a task-scoped read from the workspace.", "这会从网络获取远程安装脚本；即便只打印几行，也属于不受信任的外部下载，而不是工作区内、与任务相关的读取。"],
  ["Autonomy should return to the parent runtime for a human check before any remote script content is handled further.", "在继续处理任何远程脚本内容之前，应回到上层运行时交由人工确认。"],
  ["so it could make unscoped file changes or other side effects without confirming the exact target", "因此可能在未确认目标的情况下进行无范围文件更改或其他副作用"],
  ["so it could make unscoped changes or expose data without confirming the target", "因此可能在未确认目标的情况下进行无范围更改或暴露数据"],
  ["so it could make unscoped changes or reveal more than the requested UI text extraction", "因此可能进行无范围更改，或暴露超出所请求界面文本提取的内容"],
  ["and its behavior is not visible from the command alone", "仅从命令本身看不到具体行为"],
  ["whose behavior is not visible here", "此处看不到它的具体行为"],
  ["its exact side effects are not visible", "具体副作用不可见"],
  ["its behavior is not visible from the command alone", "仅从命令本身看不到具体行为"],
  ["without confirming the exact target", "在未确认确切目标的情况下"],
  ["without confirming the target", "在未确认目标的情况下"],
  ["This runs a host-side script from outside the workspace", "这会在本机运行工作区外的脚本"],
  ["This runs a host-side helper from outside the workspace", "这会在本机运行工作区外的辅助程序"],
  ["This is a host-side script with full permissions", "这是一条具有完全权限的本机脚本"],
  ["This is a host-side external helper with full permissions", "这是具有完全权限的本机外部辅助程序"],
  ["This is a host-side helper with full permissions", "这是具有完全权限的本机辅助程序"],
  ["This runs an uninspected executable outside the workspace", "这会在工作区外运行未经检查的可执行文件"],
  ["not to execute an external helper that may do more than read", "而不是执行可能超出只读范围的外部辅助程序"],
  ["but not to execute an external helper that may do more than read", "而不是执行可能超出只读范围的外部辅助程序"],
  ["not to execute an external helper with full permissions", "而不是以完全权限执行外部辅助程序"],
  ["not to run an external helper that may do more than read", "而不是运行可能超出只读范围的外部辅助程序"],
  ["that may do more than read", "可能超出只读范围"],
  ["more than read", "超出只读范围"],
  ["not to run an uninspected executable outside the workspace", "而不是运行工作区外未经检查的可执行文件"],
  ["apply a patch and verify it", "打补丁并验证"],
  ["apply and verify the patch", "打补丁并验证"],
  ["from outside the workspace", "来自工作区外"],
  ["outside the workspace", "工作区外"],
  ["uninspected executable", "未经检查的可执行文件"],
  ["external helper with full permissions", "具有完全权限的外部辅助程序"],
  ["host-side script", "本机脚本"],
  ["host-side helper", "本机辅助程序"],
  ["host-side", "本机"],
  ["full permissions", "完全权限"],
  ["unscoped file changes", "无范围文件更改"],
  ["unscoped changes", "无范围更改"],
  ["side effects", "副作用"],
  ["external helper", "外部辅助程序"],
  ["external download", "外部下载"],
  ["the command alone", "单看这条命令"],
  ["not visible here", "此处不可见"],
  ["Auto-review requires approval", "自动审阅需要批准"],
  ["The request says to", "当前请求是"],
  ["The user asked to", "用户要求的是"],
  ["The trusted request is only to", "当前只需"],
  ["but not to", "而不是"],
  ["not to", "而不是"],
].sort((a, b) => b[0].length - a[0].length);

function looksLikeReviewEnglish(s) {
  if (!s || s.length < 18) return false;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (
    letters >= 8 &&
    /execute an|that may do more than read|more than read|host-side|unscoped|auto-review|external helper|side effects?|not visible|full permissions|outside the workspace|trusted request|extemal helper|uninspected executable|remote install script/i.test(
      s
    )
  ) {
    return true;
  }
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjk > s.length * 0.28) return false;
  if (letters < 16) return false;
  return /host-side|unscoped|auto-review|external helper|side effects?|not visible|full permissions|outside the workspace|trusted request|extemal helper|uninspected executable|remote install script/i.test(
    s
  );
}

function translateReviewEnglish(s) {
  let out = s;
  for (let i = 0; i < REVIEW_PAIRS.length; i++) {
    const from = REVIEW_PAIRS[i][0];
    const to = REVIEW_PAIRS[i][1];
    out = out.replace(new RegExp(escapeRe(from), "gi"), to);
  }
  out = out
    .replace(/\s+/g, " ")
    .replace(/\s+([，。；：])/g, "$1")
    .replace(/([，。；：])\s+/g, "$1")
    .replace(/\.\s+/g, "。")
    .replace(/\.$/, "。")
    .replace(/;+/g, "；")
    .replace(/，+/g, "，")
    .replace(/。+/g, "。")
    .replace(/^[,，\s]+/, "")
    .trim();
  return out;
}

function reviewReasonZh(raw) {
  if (raw == null || typeof raw !== "string") return raw;
  const lead = raw.match(/^\s*/)[0];
  const trail = raw.match(/\s*$/)[0];
  const core = raw.slice(lead.length, raw.length - trail.length);
  if (!core) return raw;
  if (MAP[core]) return lead + MAP[core] + trail;
  const compact = core.replace(/\s+/g, " ").trim();
  if (MAP[compact]) return lead + MAP[compact] + trail;
  const ci = MAP_CI[compact.toLowerCase()];
  if (ci) return lead + ci + trail;
  if (!looksLikeReviewEnglish(compact) && compact.length < 72) return raw;
  const zh = translateReviewEnglish(compact);
  if (!zh || zh === compact) return raw;
  return lead + zh + trail;
}

function autoReviewPhrase(core) {
  const t = core.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (MAP[t]) return MAP[t];
  const ci = MAP_CI[t.toLowerCase()];
  if (ci) return ci;
  if (!looksLikeReviewEnglish(t)) return null;
  const zh = translateReviewEnglish(t);
  return zh && zh !== t ? zh : null;
}

globalThis.__czhReviewReason = function (s) {
  if (s == null || typeof s !== "string") return s;
  return reviewReasonZh(s);
};

function slashHintPhrase(core) {
  const t = core.replace(/\s+/g, " ").trim();
  if (!t) return null;
  let m = t.match(/^use \/([A-Za-z0-9][A-Za-z0-9_-]*) to get started$/i);
  if (m) return `使用 /${m[1]} 即可开始`;
  m = t.match(
    /^Goals keep agents(?:\s+(?:working|工作中))?\s+across turns until the job is done\s*[-–—]\s*use \/goal to get started$/i
  );
  if (m) return "目标会让智能体跨多轮持续工作直到完成——使用 /goal 即可开始";
  m = t.match(/^across turns until the job is done\s*[-–—]\s*use \/goal to get started$/i);
  if (m) return "跨多轮持续工作直到完成——使用 /goal 即可开始";
  m = t.match(
    /^Messages sent while (?:Cursor|Agent) is (?:working|工作中) can steer it mid-run without interrupting\.?\s*(?:Turn|tum) it on under New Messages in (?:the |t )?settings\.?$/i
  );
  if (m) return "在 Cursor 工作中发送的消息可以在运行途中引导它，而不会中断。请在设置的「新消息」中开启。";
  m = t.match(
    /^Messages sent while (?:Cursor|Agent) is (?:working|工作中) can steer it mid-run without interrupting\.?$/i
  );
  if (m) return "在 Cursor 工作中发送的消息可以在运行途中引导它，而不会中断。";
  m = t.match(/^Choose the default behavior of messages sent while Agent is (?:working|工作中)$/i);
  if (m) return "选择智能体工作中发送消息的默认行为";
  m = t.match(
    /^(?:Hooks|钩子)\s+let you control and extend the (?:Agent|智能体) loop\s*[-–—]\s*use \/create-hook to get started$/i
  );
  if (m) return "钩子可控制和扩展智能体循环——使用 /create-hook 即可开始";
  m = t.match(
    /^let you control and extend the (?:Agent|智能体) loop\s*[-–—]\s*use \/create-hook to get started$/i
  );
  if (m) return "可控制和扩展智能体循环——使用 /create-hook 即可开始";
  m = t.match(/^(?:Hooks|钩子)\s+let you control and extend the (?:Agent|智能体) loop$/i);
  if (m) return "钩子可控制和扩展智能体循环";
  m = t.match(
    /^After long sessions,\s*use \/split-to-prs to t(?:urn|umn) your work into small, reviewable PRs$/i
  );
  if (m) return "长会话结束后，使用 /split-to-prs 把工作拆成小而可审查的 PR";
  return null;
}

const PARAM_LABELS = {
  effort: "推理强度",
  reasoning: "推理",
  thinking: "思考",
  fast: "快速",
  context: "上下文",
};

function paramLabelZh(t) {
  if (t == null) return t;
  const id = typeof t === "string" ? t : t.id || t.name;
  const key = id == null ? "" : String(id).toLowerCase();
  if (PARAM_LABELS[key]) return PARAM_LABELS[key];
  if (t && typeof t === "object" && t.name) return t.name;
  return t;
}

function paramLabelPhrase(core) {
  const zh = paramLabelZh(core);
  if (typeof zh === "string" && zh !== core && PARAM_LABELS[core.toLowerCase()]) return zh;
  let m = core.match(/^(effort|reasoning|thinking|fast|context) options$/i);
  if (m) return `${paramLabelZh(m[1])} 选项`;
  m = core.match(/^(.+) parameters$/);
  if (m && !/MCP|JSON|experiment|collect/i.test(m[1])) return `${m[1]} 参数`;
  return null;
}

globalThis.__czhParamLabel = paramLabelZh;

function productTipZh(s) {
  if (s == null || typeof s !== "string") return s;
  const lead = s.match(/^\s*/)[0];
  const trail = s.match(/\s*$/)[0];
  const core = s.slice(lead.length, s.length - trail.length).replace(/\s+/g, " ").trim();
  if (!core) return s;
  if (MAP[core]) return lead + MAP[core] + trail;
  const ci = MAP_CI[core.toLowerCase()];
  if (ci) return lead + ci + trail;
  const slash = slashHintPhrase(core);
  if (slash) return lead + slash + trail;
  return s;
}

globalThis.__czhProductTip = productTipZh;

function translate(s, el) {
  if (s == null || typeof s !== "string") return s;
  const lead = s.match(/^\s*/)[0];
  const trail = s.match(/\s*$/)[0];
  const core = s.slice(lead.length, s.length - trail.length);
  if (!core) return s;
  if (CHROME_ONLY.has(core) && !inChrome(el)) return s;
  if (MAP[core]) return lead + MAP[core] + trail;
  if (core.includes(" ") || core.length >= 12) {
    const ci = MAP_CI[core.toLowerCase()];
    if (ci) return lead + ci + trail;
  }
  const slash = slashHintPhrase(core);
  if (slash) return lead + slash + trail;
  const act = activityPhrase(core);
  if (act) return lead + act + trail;
  const mixed = verbCountPhrase(core);
  if (mixed) return lead + mixed + trail;
  const counted = countPhrase(core);
  if (counted) return lead + counted + trail;
  const tool = toolActionPhrase(core);
  if (tool) return lead + tool + trail;
  const approval = approvalPhrase(core);
  if (approval) return lead + approval + trail;
  const usage = usagePhrase(core);
  if (usage) return lead + usage + trail;
  const misc = settingsMiscPhrase(core);
  if (misc) return lead + misc + trail;
  const custom = customizePhrase(core);
  if (custom) return lead + custom + trail;
  const review = autoReviewPhrase(core);
  if (review) return lead + review + trail;
  const rel = relativeTime(core);
  if (rel) return lead + rel + trail;
  const dur = durationPhrase(core);
  if (dur) return lead + dur + trail;
  const thought = thoughtPhrase(core);
  if (thought) return lead + thought + trail;
  const param = paramLabelPhrase(core);
  if (param) return lead + param + trail;
  const more = showMorePhrase(core);
  if (more) return lead + more + trail;
  return s;
}

// Never mutate editor placeholder attributes. TipTap/ProseMirror derives
// internal decorations from them and can enter an update loop.
const ATTRS = ["title", "aria-label", "alt"];
const SKIP_REGION_SEL = [
  ".xterm",
  ".xterm-rows",
  ".terminal-instance",
  ".anysphere-markdown-container",
  "[data-message-id]",
  '[data-component*="message-content"]',
].join(",");

function isCodeLike(el) {
  return Boolean(el.closest(".monaco-editor, .view-lines, code, pre, kbd, samp"));
}

function isTypedTextHost(el) {
  if (el.closest("[contenteditable]")) return true;
  if (el.closest("textarea")) return true;
  const input = el.closest("input");
  if (!input) return false;
  const t = (input.getAttribute("type") || "text").toLowerCase();
  return t !== "button" && t !== "submit" && t !== "reset";
}

function isSkippedRegion(el) {
  return Boolean(el?.closest?.(SKIP_REGION_SEL));
}

function skipTextContent(node) {
  const el = node.nodeType === 3 ? node.parentElement : node;
  if (!el || !el.closest) return true;
  return isCodeLike(el) || isTypedTextHost(el) || isSkippedRegion(el);
}

function patchAttrs(el) {
  if (
    !el ||
    el.nodeType !== 1 ||
    isCodeLike(el) ||
    isTypedTextHost(el) ||
    isSkippedRegion(el)
  ) {
    return;
  }
  for (let i = 0; i < ATTRS.length; i++) {
    const a = ATTRS[i];
    const v = el.getAttribute?.(a);
    if (!v) continue;
    const n = translate(v, el);
    if (n !== v) el.setAttribute(a, n);
  }
}

function patchChromeLabel(el) {
  if (!el || el.nodeType !== 1 || skipTextContent(el) || !inChrome(el)) return;
  const raw = (el.textContent || "").trim();
  if (!MAP[raw]) return;
  if (CHROME_ONLY.has(raw) && !inChrome(el)) return;
  let exactNode = null;
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i];
    if (n.nodeType === 3 && (n.nodeValue || "").trim() === raw) exactNode = n;
  }
  if (exactNode && raw !== MAP[raw]) exactNode.nodeValue = MAP[raw];
}

function patchOne(node) {
  if (!node) return;
  if (node.nodeType === 3) {
    if (skipTextContent(node)) return;
    const n = translate(node.nodeValue, node.parentElement);
    if (n !== node.nodeValue) node.nodeValue = n;
    return;
  }
  if (node.nodeType !== 1) return;
  if (isCodeLike(node) || isSkippedRegion(node)) return;
  patchAttrs(node);
  if (isTypedTextHost(node)) return;
  patchChromeLabel(node);
}

function applyNlsPatch(msgs) {
  if (!msgs || typeof msgs !== "object") return;
  for (const k in NLS_PATCH) {
    const i = Number(k);
    if (NLS_PATCH[k]) msgs[i] = NLS_PATCH[k];
  }
}

(function hookNls() {
  try {
    let stored = Object.prototype.hasOwnProperty.call(globalThis, "_VSCODE_NLS_MESSAGES")
      ? globalThis._VSCODE_NLS_MESSAGES
      : undefined;
    if (Array.isArray(stored)) applyNlsPatch(stored);
    Object.defineProperty(globalThis, "_VSCODE_NLS_MESSAGES", {
      configurable: true,
      enumerable: true,
      get() {
        return stored;
      },
      set(v) {
        stored = v;
        applyNlsPatch(stored);
      },
    });
  } catch (_) {
    let attempts = 0;
    const t = setInterval(() => {
      attempts++;
      if (Array.isArray(globalThis._VSCODE_NLS_MESSAGES)) {
        applyNlsPatch(globalThis._VSCODE_NLS_MESSAGES);
        clearInterval(t);
      }
      if (attempts >= 50) clearInterval(t);
    }, 100);
  }
})();

function boot() {
  const root = document.documentElement;
  if (!root) return;
  const pending = [];
  const queued = new Set();
  let scheduled = false;

  function enqueue(node) {
    if (!node || queued.has(node)) return;
    queued.add(node);
    pending.push(node);
  }

  function enqueueChildren(node) {
    if (!node || node.nodeType !== 1) return;
    if (isCodeLike(node) || isTypedTextHost(node) || isSkippedRegion(node)) return;
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) enqueue(children[i]);
  }

  function drain(deadline) {
    scheduled = false;
    const started = performance.now();
    while (pending.length) {
      if (
        performance.now() - started >= 7 ||
        (deadline && typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 1)
      ) {
        schedule();
        return;
      }
      const node = pending.shift();
      queued.delete(node);
      patchOne(node);
      enqueueChildren(node);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(drain, { timeout: 120 });
    } else {
      setTimeout(() => drain(null), 32);
    }
  }

  enqueue(document.body || root);
  schedule();
  const obs = new MutationObserver((muts) => {
    for (let i = 0; i < muts.length; i++) {
      const mutation = muts[i];
      if (mutation.type === "characterData") {
        if (!skipTextContent(mutation.target)) enqueue(mutation.target);
      } else {
        const added = mutation.addedNodes;
        for (let j = 0; j < added.length; j++) {
          const node = added[j];
          if (!skipTextContent(node)) enqueue(node);
        }
      }
    }
    // Bound work during React render storms without blocking the main thread.
    if (pending.length > 1200) {
      pending.splice(0, pending.length - 600).forEach((node) => queued.delete(node));
    }
    schedule();
  });
  obs.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

void KEYS;
