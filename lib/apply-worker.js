const { parentPort, workerData } = require("worker_threads");
const { applyAll, getStatus, restoreAll, scanInstallation } = require("./patch");

try {
  let result;
  if (workerData.action === "apply") {
    result = applyAll(workerData.appRoot, workerData.extDir);
  } else if (workerData.action === "restore") {
    result = restoreAll(workerData.appRoot);
  } else if (workerData.action === "status") {
    result = getStatus(workerData.appRoot, workerData.extDir);
  } else if (workerData.action === "scan") {
    result = scanInstallation(workerData.appRoot, workerData.extDir);
  } else {
    throw new Error(`未知操作：${workerData.action}`);
  }
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    code: error?.code,
    error: error?.stack || error?.message || String(error),
  });
}
