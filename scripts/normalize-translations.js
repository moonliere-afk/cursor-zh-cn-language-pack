const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "translations");
const canonicalName = "zh-cn.json";
const translationFiles = fs
  .readdirSync(dir)
  .filter((name) => /^zh-cn(?:\..+)?\.json$/.test(name))
  .sort();

const merged = {};
const sources = new Map();
const conflicts = [];

for (const name of translationFiles) {
  const values = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  for (const [english, chinese] of Object.entries(values)) {
    if (Object.prototype.hasOwnProperty.call(merged, english) && merged[english] !== chinese) {
      conflicts.push({
        english,
        previous: merged[english],
        next: chinese,
        previousFile: sources.get(english),
        nextFile: name,
      });
    }
    // Preserve the old extension's effective order: alphabetically later files won.
    merged[english] = chinese;
    sources.set(english, name);
  }
}

const literalFile = path.join(dir, "bundle-literals.json");
const literalRaw = JSON.parse(fs.readFileSync(literalFile, "utf8"));
const literalKeys = Array.isArray(literalRaw) ? literalRaw : Object.keys(literalRaw);
if (!Array.isArray(literalRaw)) {
  for (const [english, chinese] of Object.entries(literalRaw)) {
    if (!Object.prototype.hasOwnProperty.call(merged, english)) {
      merged[english] = chinese;
    }
  }
}

const ordered = Object.fromEntries(
  Object.entries(merged).sort(([a], [b]) => a.localeCompare(b, "en"))
);
const uniqueLiteralKeys = [...new Set(literalKeys)].sort((a, b) => a.localeCompare(b, "en"));

fs.writeFileSync(
  path.join(dir, canonicalName),
  `${JSON.stringify(ordered, null, 2)}\n`,
  "utf8"
);
fs.writeFileSync(literalFile, `${JSON.stringify(uniqueLiteralKeys, null, 2)}\n`, "utf8");

for (const name of translationFiles) {
  if (name !== canonicalName) fs.rmSync(path.join(dir, name));
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceFiles: translationFiles,
  canonicalEntries: Object.keys(ordered).length,
  sourcePatchedLiteralKeys: uniqueLiteralKeys.length,
  resolvedConflicts: conflicts,
};
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports", "translation-normalization.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);

console.log(
  `normalized ${translationFiles.length} files -> ${Object.keys(ordered).length} entries; ` +
    `${conflicts.length} conflicts resolved`
);
