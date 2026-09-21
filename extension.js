const path = require("path");
const vscode = require("vscode");
const { Worker } = require("worker_threads");
const { getStatus } = require("./lib/patch");

function appRoot() {
  return vscode.env.appRoot;
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
  if (!config.get("autoApplyAfterUpgrade", true)) return;
  const status = getStatus(appRoot(), __dirname);
  if (!status.needsApply) return;
  const failureKey =
    `autoApplyFailure:${status.appBuild || "unknown"}:${status.toolHash || "unknown"}:${status.languagePackHash || status.reason || "unknown"}`;
  if (context.globalState.get(failureKey)) return;
  try {
    await applyAndNotify(true);
    await context.globalState.update(failureKey, undefined);
  } catch {
    // Do not retry on every window in the same build.
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
    })
  );

  // Delay disk work until the window has reached an idle, usable state.
  const timer = setTimeout(() => autoApplyAfterUpgrade(context), 5000);
  context.subscriptions.push({ dispose: () => clearTimeout(timer) });
}

function deactivate() {}

module.exports = { activate, deactivate };
