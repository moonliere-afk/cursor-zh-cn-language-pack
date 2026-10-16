const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appRoot =
  process.argv[2] || "C:\\Program Files\\cursor\\resources\\app";
const files = [
  path.join(appRoot, "out/vs/workbench/workbench.glass.main.js"),
  path.join(appRoot, "out/vs/workbench/workbench.desktop.main.js"),
].filter((file) => fs.existsSync(file));
const dictionary = JSON.parse(
  fs.readFileSync(path.join(root, "translations", "zh-cn.json"), "utf8")
);
const fields = [
  "label",
  "title",
  "heading",
  "placeholder",
  "ariaLabel",
  "displayName",
  "subtitle",
  "body",
  "tooltip",
];
const pattern =
  `(?:${fields.join("|")}):"[A-Za-z][A-Za-z-]{1,23}"`;
const result = spawnSync(
  "rg",
  ["-o", "-N", "-P", pattern, ...files],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
);
if (result.error) throw result.error;
if (result.status !== 0 && result.status !== 1) {
  throw new Error(result.stderr || `rg exited ${result.status}`);
}

const counts = new Map();
const matcher = new RegExp(
  `(${fields.join("|")}):"([A-Za-z][A-Za-z-]{1,23})"`,
  "g"
);
for (const line of result.stdout.split(/\r?\n/)) {
  let match;
  while ((match = matcher.exec(line))) {
    const [, field, text] = match;
    if (dictionary[text]) continue;
    const key = `${field}\t${text}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
}

const candidates = [...counts]
  .map(([key, count]) => {
    const [field, text] = key.split("\t");
    return { text, field, count };
  })
  .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));

console.log(JSON.stringify({ appRoot, candidates }, null, 2));
