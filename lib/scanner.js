const fs = require("fs");
const path = require("path");

const UI_FIELD_RE =
  /\b(title|label|description|placeholder|aria-label|ariaLabel|children|heading|buttonText|emptyTitle|emptyDescription|displayName|subtitle|body|tooltip):"((?:\\.|[^"\\]){2,180})"/g;
const HAN_RE = /[\u3400-\u9fff]/;
const ENGLISH_RE = /[A-Za-z]/;

const PRESERVE_EXACT = new Set([
  "OpenAI",
  "AWS Bedrock",
  "MCP",
  "GitHub",
  "Graphite",
  "Origin",
  "Electron",
  "CPU",
  "IPC",
  "SSH",
  "WSL",
  "HUD",
  "FTUX",
  "iOS",
  "URI",
  "Max",
]);

function decodeJsString(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return null;
  }
}

function encodeJsString(value) {
  return JSON.stringify(value).slice(1, -1);
}

function isUiCandidate(value) {
  if (!value || !ENGLISH_RE.test(value) || HAN_RE.test(value)) return false;
  if (PRESERVE_EXACT.has(value)) return false;
  if (/^(?:https?:|file:|vscode:|cursor:|[./\\#])/.test(value)) return false;
  if (/^[a-z][A-Za-z0-9_.:/-]*$/.test(value) && !value.includes(" ")) return false;
  if (/[{}<>]=?|\\[nrtux]/.test(value)) return false;
  return value.length <= 180;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function buildOfficialTranslationMemory(appRoot, languagePackPath, originalMessages) {
  const memory = {};
  const keysPath = path.join(appRoot, "out", "nls.keys.json");
  const messagesPath = path.join(appRoot, "out", "nls.messages.json");
  if (
    !languagePackPath ||
    !fs.existsSync(languagePackPath) ||
    !fs.existsSync(keysPath) ||
    !fs.existsSync(messagesPath)
  ) {
    return memory;
  }

  const keys = readJson(keysPath);
  const originals = originalMessages
    ? JSON.parse(Buffer.isBuffer(originalMessages) ? originalMessages.toString("utf8") : originalMessages)
    : readJson(messagesPath);
  const contents = readJson(languagePackPath).contents || {};
  let index = 0;
  for (const [moduleName, moduleKeys] of keys) {
    const translated = contents[moduleName] || {};
    for (const key of moduleKeys) {
      const english = originals[index++];
      const chinese = translated[key];
      if (
        typeof english === "string" &&
        typeof chinese === "string" &&
        english !== chinese &&
        ENGLISH_RE.test(english) &&
        HAN_RE.test(chinese)
      ) {
        memory[english] = chinese;
      }
    }
  }
  return memory;
}

function scanSource(source, knownMap, officialMemory) {
  const unknown = new Map();
  const officialMatches = new Map();
  let match;
  UI_FIELD_RE.lastIndex = 0;
  while ((match = UI_FIELD_RE.exec(source))) {
    const value = decodeJsString(match[2]);
    if (!isUiCandidate(value)) continue;
    if (knownMap[value]) continue;
    if (officialMemory[value]) {
      officialMatches.set(value, (officialMatches.get(value) || 0) + 1);
    } else {
      unknown.set(value, (unknown.get(value) || 0) + 1);
    }
  }
  return { unknown, officialMatches };
}

function applyOfficialStructuredTranslations(source, knownMap, officialMemory) {
  let hits = 0;
  const values = new Set();
  const output = source.replace(UI_FIELD_RE, (full, field, raw) => {
    const english = decodeJsString(raw);
    if (!isUiCandidate(english)) return full;
    const chinese = knownMap[english] || officialMemory[english];
    if (!chinese || !HAN_RE.test(chinese)) return full;
    hits++;
    values.add(english);
    return `${field}:"${encodeJsString(chinese)}"`;
  });
  return { output, hits, values: [...values].sort() };
}

function mergeScanResults(results) {
  const unknown = new Map();
  const officialMatches = new Map();
  for (const result of results) {
    for (const [value, count] of result.unknown) {
      unknown.set(value, (unknown.get(value) || 0) + count);
    }
    for (const [value, count] of result.officialMatches) {
      officialMatches.set(value, (officialMatches.get(value) || 0) + count);
    }
  }
  const byCount = (a, b) => b.count - a.count || a.text.localeCompare(b.text, "en");
  return {
    unknown: [...unknown].map(([text, count]) => ({ text, count })).sort(byCount),
    officialMatches: [...officialMatches]
      .map(([text, count]) => ({ text, count }))
      .sort(byCount),
  };
}

module.exports = {
  applyOfficialStructuredTranslations,
  buildOfficialTranslationMemory,
  isUiCandidate,
  mergeScanResults,
  scanSource,
};
