const {
  applyAll,
  getStatus,
  refreshRuntimeInject,
  restoreAll,
  scanInstallation,
} = require("./lib/patch");

const args = process.argv.slice(2);
const action = ["apply", "restore", "status", "scan", "runtime"].includes(args[0])
  ? args.shift()
  : "apply";
const appRoot =
  args.shift() ||
  process.env.CURSOR_APP_ROOT ||
  "C:\\Program Files\\cursor\\resources\\app";

let result;
if (action === "restore") result = restoreAll(appRoot);
else if (action === "status") result = getStatus(appRoot, __dirname);
else if (action === "scan") result = scanInstallation(appRoot, __dirname);
else if (action === "runtime") result = refreshRuntimeInject(appRoot, __dirname);
else result = applyAll(appRoot, __dirname);

console.log(JSON.stringify({ action, appRoot, result }, null, 2));
