const path = require("path");
const fs = require("fs");
const vscode = require("vscode");
const { execFile } = require("child_process");
const { Worker } = require("worker_threads");
const { getStatus } = require("./lib/patch");

function appRoot() {
  return vscode.env.appRoot;
}

function needsLightweightCheck(context) {
  try {
    const appPackage = JSON.parse(
      fs.readFileSync(path.join(appRoot(), "package.json"), "utf8")
    );
    const state = JSON.parse(
      fs.readFileSync(
        path.join(appRoot(), ".cursor-agent-zh-state.json"),
        "utf8"
      )
    );
    const appBuild =
      `${appPackage.version || "unknown"}-${appPackage.distro || "unknown"}`;
    if (
      state.appBuild !== appBuild ||
      state.toolVersion !== context.extension.packageJSON.version
    ) {
      return true;
    }
    if (state.languagePackPath) {
      const stat = fs.statSync(state.languagePackPath);
      if (
        stat.size !== state.languagePackSize ||
        Math.trunc(stat.mtimeMs) !== Math.trunc(state.languagePackMtimeMs)
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

function runWorker(action) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "lib", "apply-worker.js"), {
      workerData: { action, appRoot: appRoot(), extDir: __dirname },
    });
    let settled = false;
    worker.once("message", (message) => {
      settled = true;
      if (message.ok) resolve(message.result);
      else {
        const error = new Error(message.error);
        error.code = message.code;
        reject(error);
      }
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (!settled && code !== 0) reject(new Error(`后台汉化进程退出：${code}`));
    });
  });
}

function runPowerShellScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, "windows", scriptName);
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        ...args,
      ],
      { windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr || stdout || error.message).trim()));
        } else {
          resolve(String(stdout || "").trim());
        }
      }
    );
  });
}

async function installExternalUpdater(context, interactive) {
  if (process.platform !== "win32") {
    if (interactive) {
      vscode.window.showInformationMessage("独立升级监控目前仅支持 Windows。");
    }
    return;
  }
  const args = interactive ? [] : ["-Quiet", "-NoElevation"];
  await runPowerShellScript("install-auto-update.ps1", args);
  await context.globalState.update(
    "externalUpdaterVersion",
    context.extension.packageJSON.version
  );
  if (interactive) {
    vscode.window.showInformationMessage(
      "已安装升级监控。Cursor 更新后会在登录时及每 5 分钟自动检测并重应用简体中文。"
    );
  }
}

async function confirmRestart(message) {
  const pick = await vscode.window.showInformationMessage(message, "立即退出 Cursor");
  if (pick) await vscode.commands.executeCommand("workbench.action.quit");
}

async function applyAndNotify(auto = false) {
  const prefix = auto ? "检测到 Cursor 版本升级，" : "";
  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${prefix}正在安全应用简体中文界面…`,
        cancellable: false,
      },
      () => runWorker("apply")
    );
    const pending =
      result.untranslatedCount > 0 && result.reportFile
        ? `；增量扫描发现 ${result.untranslatedCount} 类待人工确认文案，已写入报告`
        : result.reportError
          ? "；补丁已生效，但增量报告写入失败"
        : "";
    await confirmRestart(
      `${prefix}语言补丁已完成事务写入并通过校验${pending}。完全退出并重新打开 Cursor 后生效。`
    );
    return result;
  } catch (error) {
    if (error?.code === "CURSOR_AGENT_ZH_BUSY") {
      if (!auto) vscode.window.showInformationMessage("另一个 Cursor 窗口正在应用语言补丁。");
      return { busy: true };
    }
    const message = String(error?.message || error);
    const permissionHint = /EACCES|EPERM|permission/i.test(message)
      ? " 当前安装目录不可写，请以管理员身份启动 Cursor 后重试。"
      : "";
    vscode.window.showErrorMessage(`应用简体中文界面失败：${message}${permissionHint}`);
    throw error;
  }
}

async function autoApplyAfterUpgrade(context) {
  const config = vscode.workspace.getConfiguration("cursorAgentZh");
  if (!config.get("autoApplyAfterUpgrade", false)) return;
  if (!needsLightweightCheck(context)) return;
  const status = getStatus(appRoot(), __dirname);
  if (!status.needsApply) return;
  const failureKey =
    `autoApplyFailure:${status.appBuild || "unknown"}:${status.toolHash || "unknown"}:${status.languagePackHash || status.reason || "unknown"}`;
  const lastFailure = context.globalState.get(failureKey, 0);
  if (Date.now() - lastFailure < 15 * 60 * 1000) return;
  try {
    await applyAndNotify(true);
    await context.globalState.update(failureKey, undefined);
  } catch {
    // Retry after a short cooldown; never suppress one build permanently.
    await context.globalState.update(failureKey, Date.now());
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorAgentZh.apply", () => applyAndNotify(false)),
    vscode.commands.registerCommand("cursorAgentZh.restore", async () => {
      try {
        const result = await runWorker("restore");
        if (result.skipped?.length) {
          vscode.window.showWarningMessage(
            `仅还原了 ${result.restored.length} 个文件；${result.skipped.length} 个文件已被 Cursor 升级或其他程序修改，为避免破坏安装未覆盖。`
          );
          return;
        }
        await confirmRestart("已安全还原原始界面。请完全退出并重新打开 Cursor。");
      } catch (error) {
        vscode.window.showErrorMessage(`还原失败：${error?.message || error}`);
      }
    }),
    vscode.commands.registerCommand("cursorAgentZh.status", () => {
      const status = getStatus(appRoot(), __dirname);
      vscode.window.showInformationMessage(
        status.applied
          ? `简体中文界面已完整应用（Cursor ${status.appBuild}）。`
          : `简体中文界面需要重新应用：${status.reason || "状态不完整"}。`
      );
    }),
    vscode.commands.registerCommand("cursorAgentZh.scan", async () => {
      try {
        const result = await runWorker("scan");
        const document = await vscode.workspace.openTextDocument(result.reportFile);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`增量扫描失败：${error?.message || error}`);
      }
    }),
    vscode.commands.registerCommand("cursorAgentZh.installAutoUpdate", async () => {
      try {
        await installExternalUpdater(context, true);
      } catch (error) {
        vscode.window.showErrorMessage(
          `安装升级监控失败：${error?.message || error}`
        );
      }
    }),
    vscode.commands.registerCommand("cursorAgentZh.removeAutoUpdate", async () => {
      try {
        await runPowerShellScript("uninstall-auto-update.ps1");
        await context.globalState.update("externalUpdaterVersion", undefined);
        vscode.window.showInformationMessage("已移除简体中文升级监控。");
      } catch (error) {
        vscode.window.showErrorMessage(
          `移除升级监控失败：${error?.message || error}`
        );
      }
    })
  );

  const config = vscode.workspace.getConfiguration("cursorAgentZh");
  const updaterVersion = context.globalState.get("externalUpdaterVersion");
  if (
    process.platform === "win32" &&
    config.get("externalAutoUpdate", true) &&
    updaterVersion !== context.extension.packageJSON.version
  ) {
    installExternalUpdater(context, false).catch(() => {
      // A standard-rights window cannot create the highest-privilege task.
      // The explicit install command requests UAC and remains available.
    });
  }

  // Delay disk work until the window has reached an idle, usable state.
  const timer = setTimeout(() => autoApplyAfterUpgrade(context), 5000);
  context.subscriptions.push({ dispose: () => clearTimeout(timer) });
}

function deactivate() {}

module.exports = { activate, deactivate };
