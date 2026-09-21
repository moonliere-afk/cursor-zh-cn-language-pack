const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  applyAll,
  getStatus,
  restoreAll,
  scanInstallation,
} = require("../lib/patch");

const extensionRoot = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-agent-zh-test-"));

function write(rel, value) {
  const file = path.join(temp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, "utf8");
}

function seed(version, distro) {
  write("package.json", JSON.stringify({ name: "Cursor", version, distro }));
  write("product.json", JSON.stringify({ checksums: {} }));
  write("out/nls.keys.json", "[]");
  write("out/nls.messages.json", "[]");
  write(
    "out/vs/code/electron-sandbox/workbench/workbench.js",
    'console.log("workbench");\n'
  );
  const bundle =
    'const ui={title:"Add Symbol to Current Chat",label:"Clone repo"};\n';
  write("out/vs/workbench/workbench.glass.main.js", bundle);
  write("out/vs/workbench/workbench.desktop.main.js", bundle);
}

try {
  seed("1.0.0", "build-a");
  const first = applyAll(temp, extensionRoot);
  assert.equal(first.appBuild, "1.0.0-build-a");
  assert.equal(getStatus(temp, extensionRoot).applied, true);
  assert.match(
    fs.readFileSync(
      path.join(temp, "out/vs/workbench/workbench.desktop.main.js"),
      "utf8"
    ),
    /将符号添加到当前对话/
  );

  const firstHash = getStatus(temp, extensionRoot);
  applyAll(temp, extensionRoot);
  assert.equal(getStatus(temp, extensionRoot).applied, true);
  assert.equal(getStatus(temp, extensionRoot).appBuild, firstHash.appBuild);

  const scan = scanInstallation(temp, extensionRoot);
  assert.ok(fs.existsSync(scan.reportFile));

  const restored = restoreAll(temp);
  assert.equal(restored.skipped.length, 0);
  assert.equal(getStatus(temp, extensionRoot).applied, false);
  assert.doesNotMatch(
    fs.readFileSync(
      path.join(temp, "out/vs/workbench/workbench.desktop.main.js"),
      "utf8"
    ),
    /将符号添加到当前对话/
  );

  // Simulate an updater replacing all product files while old state/backups remain.
  seed("1.1.0", "build-b");
  const upgraded = applyAll(temp, extensionRoot);
  assert.equal(upgraded.appBuild, "1.1.0-build-b");
  assert.equal(getStatus(temp, extensionRoot).applied, true);

  write(".cursor-agent-zh.lock", "other window");
  assert.throws(
    () => applyAll(temp, extensionRoot),
    (error) => error.code === "CURSOR_AGENT_ZH_BUSY"
  );
  fs.rmSync(path.join(temp, ".cursor-agent-zh.lock"), { force: true });

  console.log("all tests passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  for (const name of ["upgrade-1.0.0-build-a.json", "upgrade-1.1.0-build-b.json"]) {
    fs.rmSync(path.join(extensionRoot, "reports", name), { force: true });
  }
}
