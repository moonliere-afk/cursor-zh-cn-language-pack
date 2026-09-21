const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const translations = path.join(root, "translations");
const dict = JSON.parse(fs.readFileSync(path.join(translations, "zh-cn.json"), "utf8"));
const literalKeys = JSON.parse(
  fs.readFileSync(path.join(translations, "bundle-literals.json"), "utf8")
);
const snippets = JSON.parse(
  fs.readFileSync(path.join(translations, "bundle-snippets.json"), "utf8")
);
const inject = fs.readFileSync(
  path.join(root, "inject", "cursor-agent-zh-inject.js"),
  "utf8"
);

const errors = [];
const warnings = [];
const dangerousGlobalLiterals = new Set([
  "Configure",
  "New",
  "Interrupt",
  "Allowlist",
  "Show",
  "Hide",
  "Default",
  "Disable",
  "Skip",
  "Go",
  "Pin",
  "Copied",
  "Open",
  "Toggle",
  "Stop",
  "Copy",
  "Create",
  "File",
  "Edit",
  "View",
  "Help",
  "Settings",
  "Tab",
]);

if (!Array.isArray(literalKeys)) errors.push("bundle-literals.json 必须是键数组");
for (const key of literalKeys) {
  if (!Object.prototype.hasOwnProperty.call(dict, key)) {
    errors.push(`bundle literal 缺少主词典译文：${key}`);
  }
  if (dangerousGlobalLiterals.has(key)) {
    errors.push(`禁止全局替换危险短词：${key}`);
  }
}

const snippetMap = new Map();
for (const snippet of snippets) {
  if (!snippet?.from || typeof snippet.to !== "string") {
    errors.push("bundle snippet 存在无效条目");
    continue;
  }
  if (snippetMap.has(snippet.from)) {
    const previous = snippetMap.get(snippet.from);
    errors.push(
      previous === snippet.to
        ? `重复 bundle snippet：${snippet.from.slice(0, 100)}`
        : `冲突 bundle snippet：${snippet.from.slice(0, 100)}`
    );
  }
  snippetMap.set(snippet.from, snippet.to);
}

if (inject.includes("data-placeholder")) errors.push("注入脚本禁止访问 data-placeholder");
if (/const ATTRS\s*=\s*\[[^\]]*(?:placeholder|aria-placeholder)/.test(inject)) {
  errors.push("运行时属性观察列表禁止包含编辑器 placeholder");
}
if (!inject.includes("isTypedTextHost(el)")) {
  errors.push("属性翻译必须跳过可编辑区域");
}
if (/\.textContent\s*=/.test(inject)) {
  errors.push("运行时不得用 textContent 覆盖 React 子树");
}
if (!inject.includes("requestIdleCallback")) {
  errors.push("初始 DOM 扫描必须空闲分片");
}

for (const [english, chinese] of Object.entries(dict)) {
  const commands =
    english.match(/\/(?:create-hook|split-to-prs|name|goal)(?![a-z0-9-])/g) || [];
  for (const command of commands) {
    if (!chinese.includes(command)) errors.push(`译文丢失命令 ${command}：${english}`);
  }
  const shortcuts = english.match(/(?:Ctrl|Cmd|Alt|Shift)\+[A-Za-z]+/g) || [];
  for (const shortcut of shortcuts) {
    if (!chinese.includes(shortcut)) warnings.push(`译文可能丢失快捷键 ${shortcut}：${english}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  dictionaryEntries: Object.keys(dict).length,
  sourcePatchedLiteralKeys: literalKeys.length,
  contextualSnippets: snippets.length,
  errors,
  warnings,
};
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports", "audit.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
