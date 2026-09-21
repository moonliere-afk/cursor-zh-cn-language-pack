const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const {
  applyOfficialStructuredTranslations,
  buildOfficialTranslationMemory,
  mergeScanResults,
  scanSource,
} = require("./scanner");

const MARKER = "cursor-agent-zh-inject";
const IMPORT_LINE = `import "./${MARKER}.js";\n`;
const STATE_NAME = ".cursor-agent-zh-state.json";
const BACKUP_ROOT = ".cursor-agent-zh-backups";
const BUNDLE_RELS = [
  "out/vs/workbench/workbench.glass.main.js",
  "out/vs/workbench/workbench.desktop.main.js",
];
const WORKBENCH_REL = "out/vs/code/electron-sandbox/workbench/workbench.js";
const INJECT_REL = `out/vs/code/electron-sandbox/workbench/${MARKER}.js`;
const NLS_REL = "out/nls.messages.json";
const PRODUCT_REL = "product.json";

function sha256b64(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("base64")
    .replace(/=+$/, "");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function atomicWrite(file, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, data);
  try {
    fs.renameSync(temp, file);
  } catch {
    // Windows can reject replacement by rename even on the same volume.
    fs.copyFileSync(temp, file);
    fs.rmSync(temp, { force: true });
  }
}

function loadDict(extDir) {
  const file = path.join(extDir, "translations", "zh-cn.json");
  if (!fs.existsSync(file)) return {};
  const dict = readJson(file);
  for (const [english, chinese] of Object.entries(dict)) {
    if (typeof chinese !== "string" || !chinese.trim()) {
      throw new Error(`无效译文：${english}`);
    }
  }
  return dict;
}

function loadBundleLiteralKeys(extDir) {
  const file = path.join(extDir, "translations", "bundle-literals.json");
  if (!fs.existsSync(file)) return [];
  const raw = readJson(file);
  return [...new Set(Array.isArray(raw) ? raw : Object.keys(raw))].sort(
    (a, b) => b.length - a.length
  );
}

function loadBundleSnippets(extDir) {
  const file = path.join(extDir, "translations", "bundle-snippets.json");
  if (!fs.existsSync(file)) return [];
  const raw = readJson(file);
  if (!Array.isArray(raw)) throw new Error("bundle-snippets.json 必须是数组");
  const seen = new Map();
  for (const snippet of raw) {
    if (!snippet || typeof snippet.from !== "string" || typeof snippet.to !== "string") {
      throw new Error("bundle-snippets.json 存在无效条目");
    }
    if (seen.has(snippet.from) && seen.get(snippet.from) !== snippet.to) {
      throw new Error(`bundle snippet 冲突：${snippet.from.slice(0, 80)}`);
    }
    seen.set(snippet.from, snippet.to);
  }
  return [...seen].map(([from, to]) => ({ from, to })).sort(
    (a, b) => b.from.length - a.from.length
  );
}

function findPolangMainI18n() {
  const dir = path.join(os.homedir(), ".cursor", "extensions");
  if (!fs.existsSync(dir)) return null;
  const hits = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("polang233.cursor-language-pack"))
    .sort();
  for (let index = hits.length - 1; index >= 0; index--) {
    const file = path.join(
      dir,
      hits[index],
      "translations",
      "zh-cn",
      "main.i18n.json"
    );
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function readAppBuild(appRoot) {
  const pkg = readJson(path.join(appRoot, "package.json"));
  return `${pkg.version || "unknown"}-${pkg.distro || "unknown"}`;
}

function readToolHash(extDir) {
  const rels = [
    "package.json",
    "lib/patch.js",
    "lib/scanner.js",
    "inject/cursor-agent-zh-inject.js",
    "translations/zh-cn.json",
    "translations/bundle-literals.json",
    "translations/bundle-snippets.json",
  ];
  const hash = crypto.createHash("sha256");
  for (const rel of rels) {
    const file = path.join(extDir, rel);
    hash.update(rel);
    if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
  }
  return hash.digest("base64").replace(/=+$/, "");
}

function statePath(appRoot) {
  return path.join(appRoot, STATE_NAME);
}

function readState(appRoot) {
  const file = statePath(appRoot);
  if (!fs.existsSync(file)) return null;
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

function backupPath(appRoot, appBuild, rel) {
  const safeBuild = appBuild.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(appRoot, BACKUP_ROOT, safeBuild, rel);
}

function legacyBackupFor(file) {
  return `${file}.cursor-agent-zh.bak`;
}

function looksLikeLegacyPatched(rel, current, legacy) {
  const now = current.toString("utf8");
  const old = legacy.toString("utf8");
  if (rel === WORKBENCH_REL) return now.includes(IMPORT_LINE) && !old.includes(IMPORT_LINE);
  if (BUNDLE_RELS.includes(rel)) {
    return (
      (now.includes("将符号添加到当前对话") &&
        old.includes("Add Symbol to Current Chat")) ||
      (now.includes('MenubarFileMenu,label:"文件"') &&
        old.includes('MenubarFileMenu,label:"File"'))
    );
  }
  return false;
}

function resolveBase(appRoot, rel, appBuild, state) {
  const file = path.join(appRoot, rel);
  if (!fs.existsSync(file)) {
    return { file, base: null, current: null, baseExists: false, migrated: false };
  }
  const current = fs.readFileSync(file);
  const entry = state?.appBuild === appBuild ? state.files?.[rel] : null;
  if (entry && sha256b64(current) === entry.patchedHash && fs.existsSync(entry.backup)) {
    const backup = fs.readFileSync(entry.backup);
    if (sha256b64(backup) === entry.baseHash) {
      return { file, base: backup, current, baseExists: true, migrated: false };
    }
  }

  const legacyFile = legacyBackupFor(file);
  if (!state && fs.existsSync(legacyFile)) {
    const legacy = fs.readFileSync(legacyFile);
    if (looksLikeLegacyPatched(rel, current, legacy)) {
      return { file, base: legacy, current, baseExists: true, migrated: true };
    }
  }

  return { file, base: current, current, baseExists: true, migrated: false };
}

function buildNlsOutput(appRoot, baseBuffer, languagePackPath) {
  if (!baseBuffer || !languagePackPath || !fs.existsSync(languagePackPath)) {
    return { output: baseBuffer, count: 0, patch: {}, reason: "missing language pack" };
  }
  const keysFile = path.join(appRoot, "out", "nls.keys.json");
  if (!fs.existsSync(keysFile)) {
    return { output: baseBuffer, count: 0, patch: {}, reason: "missing nls.keys.json" };
  }
  const keys = readJson(keysFile);
  const messages = JSON.parse(baseBuffer.toString("utf8"));
  const contents = readJson(languagePackPath).contents || {};
  const patch = {};
  let index = 0;
  let count = 0;
  for (const [moduleName, moduleKeys] of keys) {
    const translated = contents[moduleName] || {};
    for (const key of moduleKeys) {
      const value = translated[key];
      if (typeof value === "string" && value) {
        patch[index] = value;
        if (messages[index] !== value) {
          messages[index] = value;
          count++;
        }
      }
      index++;
    }
  }
  return {
    output: Buffer.from(JSON.stringify(messages), "utf8"),
    count,
    patch,
    reason: null,
  };
}

function buildInject(extDir, dict, nlsPatch) {
  const source = fs.readFileSync(
    path.join(extDir, "inject", "cursor-agent-zh-inject.js"),
    "utf8"
  );
  if (source.includes("data-placeholder")) {
    throw new Error("安全检查失败：注入脚本不得访问 data-placeholder");
  }
  if (!source.includes("if (isTypedTextHost(node)) return")) {
    throw new Error("安全检查失败：注入脚本必须跳过可编辑区域");
  }
  const output = source
    .replace("const MAP = {};", `const MAP = ${JSON.stringify(dict)};`)
    .replace("const NLS_PATCH = {};", `const NLS_PATCH = ${JSON.stringify(nlsPatch)};`);
  new vm.Script(output, { filename: "cursor-agent-zh-inject.js" });
  return Buffer.from(output, "utf8");
}

function replaceMany(source, replacements) {
  const entries = [...replacements]
    .filter(([from, to]) => from && from !== to)
    .sort((a, b) => b[0].length - a[0].length);
  if (!entries.length) return { output: source, hits: 0, counts: new Map() };
  const values = new Map(entries);
  const counts = new Map();
  const escaped = entries.map(([from]) =>
    from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const pattern = new RegExp(escaped.join("|"), "g");
  let hits = 0;
  const output = source.replace(pattern, (match) => {
    hits++;
    counts.set(match, (counts.get(match) || 0) + 1);
    return values.get(match);
  });
  return { output, hits, counts };
}

function patchBundle(source, dict, literalKeys, snippets, officialMemory) {
  const literalReplacements = literalKeys
    .filter((english) => dict[english] && dict[english] !== english)
    .map((english) => [JSON.stringify(english), JSON.stringify(dict[english])]);
  const literalPass = replaceMany(source, literalReplacements);
  const snippetPass = replaceMany(
    literalPass.output,
    snippets.map((snippet) => [snippet.from, snippet.to])
  );
  let output = snippetPass.output;
  const snippetMatches = snippets.map((snippet) => ({
    from: snippet.from.slice(0, 140),
    count: snippetPass.counts.get(snippet.from) || 0,
  }));

  const automatic = applyOfficialStructuredTranslations(output, dict, officialMemory);
  output = automatic.output;
  return {
    output,
    literalHits: literalPass.hits,
    snippetHits: snippetPass.hits,
    automaticHits: automatic.hits,
    automaticValues: automatic.values,
    snippetMatches,
  };
}

function writeReport(extDir, appBuild, report) {
  const dir = path.join(extDir, "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `upgrade-${appBuild.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
  atomicWrite(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

function acquireApplyLock(appRoot) {
  const file = path.join(appRoot, ".cursor-agent-zh.lock");
  try {
    const fd = fs.openSync(file, "wx");
    fs.writeFileSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
    return () => {
      try {
        fs.closeSync(fd);
      } finally {
        fs.rmSync(file, { force: true });
      }
    };
  } catch (error) {
    if (error.code === "EEXIST") {
      const age = Date.now() - fs.statSync(file).mtimeMs;
      if (age > 20 * 60 * 1000) {
        fs.rmSync(file, { force: true });
        return acquireApplyLock(appRoot);
      }
      const busy = new Error("另一个 Cursor 窗口正在应用语言补丁");
      busy.code = "CURSOR_AGENT_ZH_BUSY";
      throw busy;
    }
    throw error;
  }
}

function applyAllUnlocked(appRoot, extDir) {
  const appBuild = readAppBuild(appRoot);
  const toolHash = readToolHash(extDir);
  const previousState = readState(appRoot);
  if (previousState && previousState.appBuild !== appBuild) {
    const markerFile = path.join(appRoot, WORKBENCH_REL);
    if (
      fs.existsSync(markerFile) &&
      fs.readFileSync(markerFile, "utf8").includes(IMPORT_LINE)
    ) {
      throw new Error(
        "检测到 Cursor 已升级，但旧补丁仍混在新安装中。为避免写入旧版 bundle，已停止自动操作。请先使用“还原英文”后重试。"
      );
    }
  }

  const dict = loadDict(extDir);
  const literalKeys = loadBundleLiteralKeys(extDir);
  const snippets = loadBundleSnippets(extDir);
  const languagePackPath = findPolangMainI18n();
  const rels = [WORKBENCH_REL, ...BUNDLE_RELS, NLS_REL, PRODUCT_REL];
  const bases = Object.fromEntries(
    rels.map((rel) => [rel, resolveBase(appRoot, rel, appBuild, previousState)])
  );
  const officialMemory = buildOfficialTranslationMemory(
    appRoot,
    languagePackPath,
    bases[NLS_REL].base
  );

  for (const rel of [WORKBENCH_REL, ...BUNDLE_RELS, PRODUCT_REL]) {
    if (!bases[rel].base) throw new Error(`Cursor 安装文件不存在：${rel}`);
  }

  const scanResults = [];
  const bundleResults = {};
  const outputs = {};
  for (const rel of BUNDLE_RELS) {
    const source = bases[rel].base.toString("utf8");
    scanResults.push(scanSource(source, dict, officialMemory));
    const patched = patchBundle(source, dict, literalKeys, snippets, officialMemory);
    const header = `/* cursor-agent-zh ${appBuild} */\n`;
    outputs[rel] = Buffer.from(header + patched.output, "utf8");
    bundleResults[rel] = {
      literalHits: patched.literalHits,
      snippetHits: patched.snippetHits,
      automaticHits: patched.automaticHits,
      automaticValues: patched.automaticValues,
      unmatchedSnippets: patched.snippetMatches.filter((item) => item.count === 0).length,
    };
  }

  let workbench = bases[WORKBENCH_REL].base.toString("utf8");
  workbench = workbench.replace(IMPORT_LINE, "");
  outputs[WORKBENCH_REL] = Buffer.from(IMPORT_LINE + workbench, "utf8");

  const nls = buildNlsOutput(appRoot, bases[NLS_REL].base, languagePackPath);
  if (nls.output) outputs[NLS_REL] = nls.output;
  outputs[INJECT_REL] = buildInject(extDir, dict, nls.patch);

  const product = JSON.parse(bases[PRODUCT_REL].base.toString("utf8"));
  product.checksums ||= {};
  product.checksums["vs/code/electron-sandbox/workbench/workbench.js"] = sha256b64(
    outputs[WORKBENCH_REL]
  );
  product.checksums["vs/workbench/workbench.desktop.main.js"] = sha256b64(
    outputs[BUNDLE_RELS[1]]
  );
  outputs[PRODUCT_REL] = Buffer.from(`${JSON.stringify(product, null, "\t")}\n`, "utf8");

  const reportData = mergeScanResults(scanResults);
  const report = {
    appBuild,
    generatedAt: new Date().toISOString(),
    bundles: bundleResults,
    officialLanguagePack: languagePackPath,
    nlsPatched: nls.count,
    officialAutoTranslationCandidates: reportData.officialMatches,
    untranslatedCandidates: reportData.unknown.slice(0, 2000),
  };

  const originalFiles = new Map();
  const state = {
    schema: 2,
    appBuild,
    toolHash,
    languagePackHash:
      languagePackPath && fs.existsSync(languagePackPath)
        ? sha256b64(fs.readFileSync(languagePackPath))
        : null,
    appliedAt: new Date().toISOString(),
    files: {},
  };
  const writeOrder = [
    ...BUNDLE_RELS,
    INJECT_REL,
    WORKBENCH_REL,
    NLS_REL,
    PRODUCT_REL,
  ].filter((rel) => outputs[rel]);

  try {
    for (const rel of writeOrder) {
      const file = path.join(appRoot, rel);
      const baseInfo = bases[rel] || {
        current: fs.existsSync(file) ? fs.readFileSync(file) : null,
        base: null,
        baseExists: fs.existsSync(file),
      };
      originalFiles.set(rel, baseInfo.current);
      const backup = backupPath(appRoot, appBuild, rel);
      if (baseInfo.base) atomicWrite(backup, baseInfo.base);
      atomicWrite(file, outputs[rel]);
      state.files[rel] = {
        backup,
        baseExists: Boolean(baseInfo.base),
        baseHash: baseInfo.base ? sha256b64(baseInfo.base) : null,
        patchedHash: sha256b64(outputs[rel]),
      };
    }
    atomicWrite(statePath(appRoot), `${JSON.stringify(state, null, 2)}\n`);
  } catch (error) {
    for (const [rel, original] of [...originalFiles].reverse()) {
      const file = path.join(appRoot, rel);
      try {
        if (original) atomicWrite(file, original);
        else fs.rmSync(file, { force: true });
      } catch {
        // Keep the original error; the status command will expose mismatched hashes.
      }
    }
    throw new Error(`汉化事务失败，已尝试回滚：${error.message || error}`);
  }

  let reportFile = null;
  let reportError = null;
  try {
    reportFile = writeReport(extDir, appBuild, report);
  } catch (error) {
    reportError = error.message || String(error);
  }
  return {
    appBuild,
    bundleResults,
    injectJs: path.join(appRoot, INJECT_REL),
    nls: { patched: Boolean(nls.output), count: nls.count, reason: nls.reason },
    nlsPatchCount: Object.keys(nls.patch).length,
    reportFile,
    reportError,
    untranslatedCount: reportData.unknown.length,
  };
}

function applyAll(appRoot, extDir) {
  const release = acquireApplyLock(appRoot);
  try {
    return applyAllUnlocked(appRoot, extDir);
  } finally {
    release();
  }
}

function scanInstallation(appRoot, extDir) {
  const appBuild = readAppBuild(appRoot);
  const state = readState(appRoot);
  const dict = loadDict(extDir);
  const languagePackPath = findPolangMainI18n();
  const nlsBase = resolveBase(appRoot, NLS_REL, appBuild, state).base;
  const officialMemory = buildOfficialTranslationMemory(
    appRoot,
    languagePackPath,
    nlsBase
  );
  const results = [];
  for (const rel of BUNDLE_RELS) {
    const base = resolveBase(appRoot, rel, appBuild, state).base;
    if (base) results.push(scanSource(base.toString("utf8"), dict, officialMemory));
  }
  const merged = mergeScanResults(results);
  const report = {
    appBuild,
    generatedAt: new Date().toISOString(),
    mode: "scan-only",
    officialLanguagePack: languagePackPath,
    officialAutoTranslationCandidates: merged.officialMatches,
    untranslatedCandidates: merged.unknown.slice(0, 2000),
  };
  const reportFile = writeReport(extDir, appBuild, report);
  return {
    appBuild,
    reportFile,
    officialCandidateCount: merged.officialMatches.length,
    untranslatedCount: merged.unknown.length,
  };
}

function restoreAllUnlocked(appRoot) {
  const state = readState(appRoot);
  if (!state) return { restored: [], skipped: [], reason: "missing state" };
  const currentBuild = readAppBuild(appRoot);
  if (state.appBuild !== currentBuild) {
    return { restored: [], skipped: Object.keys(state.files || {}), reason: "version changed" };
  }

  const restored = [];
  const skipped = [];
  const entries = Object.entries(state.files || {}).reverse();
  const plan = [];
  for (const [rel, entry] of entries) {
    const file = path.join(appRoot, rel);
    const current = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!current || sha256b64(current) !== entry.patchedHash) {
      skipped.push(rel);
      continue;
    }
    if (entry.baseExists && fs.existsSync(entry.backup)) {
      const backup = fs.readFileSync(entry.backup);
      if (sha256b64(backup) !== entry.baseHash) {
        skipped.push(rel);
        continue;
      }
      plan.push({ rel, file, current, backup, remove: false });
    } else {
      plan.push({ rel, file, current, backup: null, remove: true });
    }
  }
  if (skipped.length) {
    return { restored: [], skipped, reason: "files changed after patch" };
  }
  try {
    for (const item of plan) {
      if (item.remove) fs.rmSync(item.file, { force: true });
      else atomicWrite(item.file, item.backup);
      restored.push(item.rel);
    }
    fs.rmSync(statePath(appRoot), { force: true });
    return { restored, skipped: [], reason: null };
  } catch (error) {
    for (const item of plan.reverse()) {
      try {
        atomicWrite(item.file, item.current);
      } catch {
        // Preserve the first restore failure.
      }
    }
    throw new Error(`还原事务失败，已尝试回滚：${error.message || error}`);
  }
}

function restoreAll(appRoot) {
  const release = acquireApplyLock(appRoot);
  try {
    return restoreAllUnlocked(appRoot);
  } finally {
    release();
  }
}

function getStatus(appRoot, extDir) {
  const state = readState(appRoot);
  if (!state) return { applied: false, reason: "missing state", needsApply: true };
  const appBuild = readAppBuild(appRoot);
  if (state.appBuild !== appBuild) {
    return { applied: false, reason: "cursor upgraded", needsApply: true, appBuild };
  }
  const mismatches = [];
  for (const [rel, entry] of Object.entries(state.files || {})) {
    const file = path.join(appRoot, rel);
    if (!fs.existsSync(file) || sha256b64(fs.readFileSync(file)) !== entry.patchedHash) {
      mismatches.push(rel);
    }
  }
  const toolHash = extDir ? readToolHash(extDir) : state.toolHash;
  const toolChanged = Boolean(extDir && state.toolHash !== toolHash);
  const languagePackPath = findPolangMainI18n();
  const languagePackHash =
    languagePackPath && fs.existsSync(languagePackPath)
      ? sha256b64(fs.readFileSync(languagePackPath))
      : null;
  const languagePackChanged = state.languagePackHash !== languagePackHash;
  return {
    applied: mismatches.length === 0 && !toolChanged && !languagePackChanged,
    needsApply: mismatches.length !== 0 || toolChanged || languagePackChanged,
    reason: mismatches.length
      ? "patched files changed"
      : toolChanged
        ? "language pack updated"
        : languagePackChanged
          ? "official language pack updated"
          : null,
    appBuild,
    toolHash,
    languagePackHash,
    mismatches,
    appliedAt: state.appliedAt,
  };
}

function isApplied(appRoot, extDir) {
  return getStatus(appRoot, extDir).applied;
}

function overlayNls(appRoot) {
  const languagePackPath = findPolangMainI18n();
  const file = path.join(appRoot, NLS_REL);
  if (!fs.existsSync(file)) return { patched: false, count: 0, reason: "missing nls" };
  const result = buildNlsOutput(appRoot, fs.readFileSync(file), languagePackPath);
  if (!result.output) return { patched: false, count: 0, reason: result.reason };
  atomicWrite(file, result.output);
  return { patched: true, count: result.count };
}

function patchBundles(appRoot, extDir) {
  return applyAll(appRoot, extDir).bundleResults;
}

function restoreBundles(appRoot) {
  return restoreAll(appRoot);
}

module.exports = {
  MARKER,
  applyAll,
  getStatus,
  isApplied,
  loadDict,
  overlayNls,
  patchBundles,
  restoreAll,
  restoreBundles,
  scanInstallation,
  sha256b64,
};
