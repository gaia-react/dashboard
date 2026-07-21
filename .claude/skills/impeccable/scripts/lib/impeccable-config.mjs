/**
 * CLI-side reader/writer for the unified `.impeccable` config.
 *
 * The CLI (published to npm) and the skill scripts (bundled into the install)
 * live in separate trees and cannot share runtime code, so this duplicates a
 * small slice of skill/scripts/hook-lib.mjs — the config-path layout, detector
 * ignore semantics, and the `.git/info/exclude` handling. Keep the schema,
 * ignore filtering, and exclude marker in sync if either side changes.
 *
 * Schema (config.json shared / config.local.json gitignored, per-developer):
 *   {
 *     "detector": { "ignoreRules": [], "ignoreFiles": [], "ignoreValues": [], "designSystem": { "enabled": true } },
 *     "hook": { "consent": "accepted" | "declined", ... },
 *     "updateCheck": bool
 *   }
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';

export const getConfigPath = (root) => join(root, '.impeccable', 'config.json');

export const getLocalConfigPath = (root) =>
  join(root, '.impeccable', 'config.local.json');

const safeReadJson = (filePath) => {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));

    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  } catch {
    return null;
  }
};

const hookSection = (raw) =>
  raw && raw.hook && typeof raw.hook === 'object' && !Array.isArray(raw.hook) ?
    raw.hook
  : null;

const detectorSection = (raw) =>
  (
    raw &&
    raw.detector &&
    typeof raw.detector === 'object' &&
    !Array.isArray(raw.detector)
  ) ?
    raw.detector
  : null;

const DETECTOR_CONFIG_KEYS = new Set([
  'designSystem',
  'ignoreFiles',
  'ignoreRules',
  'ignoreValues',
]);

const DEFAULT_DETECTION_CONFIG = Object.freeze({
  designSystem: {enabled: true},
  ignoreFiles: [],
  ignoreRules: [],
  ignoreValues: [],
});

const cloneDetectionConfig = () => ({
  designSystem: {...DEFAULT_DETECTION_CONFIG.designSystem},
  ignoreFiles: [],
  ignoreRules: [],
  ignoreValues: [],
});

const cloneRawDetectionConfig = () => ({
  ignoreFiles: [],
  ignoreRules: [],
  ignoreValues: [],
});

const applyDetectionConfigSource = (config, raw) => {
  if (!raw || typeof raw !== 'object') return config;

  if (
    raw.designSystem &&
    typeof raw.designSystem === 'object' &&
    !Array.isArray(raw.designSystem)
  ) {
    config.designSystem = {
      ...config.designSystem,
      enabled: raw.designSystem.enabled !== false,
    };
  }

  if (Array.isArray(raw.ignoreRules)) {
    config.ignoreRules = uniqueStrings([
      ...config.ignoreRules,
      ...raw.ignoreRules,
    ]);
  }

  if (Array.isArray(raw.ignoreFiles)) {
    config.ignoreFiles = uniqueStrings([
      ...config.ignoreFiles,
      ...raw.ignoreFiles,
    ]);
  }

  if (Array.isArray(raw.ignoreValues)) {
    config.ignoreValues = mergeIgnoreValues(
      config.ignoreValues,
      raw.ignoreValues
    );
  }

  return config;
};

const uniqueStrings = (values) => [...new Set(values.map(String))];

/**
 * Detector filters shared by `npx impeccable detect` and the design hook.
 * `hook.enabled` remains hook lifecycle state; manual CLI scans still run when
 * the hook is disabled, but they honor the same ignore rules and design-system
 * toggle.
 */
export const readDetectionConfig = (root) => {
  const config = cloneDetectionConfig();

  for (const filePath of [getConfigPath(root), getLocalConfigPath(root)]) {
    const raw = safeReadJson(filePath);
    // Back-compat: old builds stored detector filters under hook.*.
    applyDetectionConfigSource(config, hookSection(raw));
    applyDetectionConfigSource(config, detectorSection(raw));
  }

  return config;
};

export const readRawDetectionConfig = (root, options = {}) => {
  const raw = safeReadJson(
    options.local ? getLocalConfigPath(root) : getConfigPath(root)
  );
  const config = cloneRawDetectionConfig();
  applyDetectionConfigSource(config, hookSection(raw));
  applyDetectionConfigSource(config, detectorSection(raw));

  return config;
};

export const writeDetectionConfig = (root, detectorConfig, options = {}) => {
  const filePath =
    options.local ? getLocalConfigPath(root) : getConfigPath(root);
  if (options.local) ensureConfigGitExclude(root);
  const existing = safeReadJson(filePath) || {};
  const existingHook = hookSection(existing);
  const nextHook = stripDetectorKeys(existingHook);
  const nextDetector = {
    ...detectorSection(existing),
    ...normalizeDetectionConfigForWrite(detectorConfig),
  };
  const next = {
    ...existing,
    detector: nextDetector,
  };

  if (nextHook && Object.keys(nextHook).length > 0) {
    next.hook = nextHook;
  } else {
    delete next.hook;
  }
  mkdirSync(dirname(filePath), {recursive: true});
  writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`);

  return filePath;
};

const normalizeDetectionConfigForWrite = (config) => {
  const out = {};

  if (Array.isArray(config?.ignoreRules)) {
    out.ignoreRules = uniqueStrings(
      config.ignoreRules
        .map((rule) => normalizeIgnoreRule(rule))
        .filter(Boolean)
    );
  }

  if (Array.isArray(config?.ignoreFiles)) {
    out.ignoreFiles = uniqueStrings(
      config.ignoreFiles
        .filter((v) => typeof v === 'string' && v.trim())
        .map((v) => v.trim())
    );
  }
  out.ignoreValues = normalizeIgnoreValueEntries(config?.ignoreValues || []);

  if (
    config?.designSystem &&
    typeof config.designSystem === 'object' &&
    !Array.isArray(config.designSystem)
  ) {
    out.designSystem = {
      enabled: config.designSystem.enabled !== false,
    };
  }

  return out;
};

const stripDetectorKeys = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!DETECTOR_CONFIG_KEYS.has(key)) out[key] = value;
  }

  return out;
};

export const normalizeIgnoreValue = (value) =>
  String(value || '')
    .trim()
    .replaceAll(/^["']|["']$/g, '')
    .replaceAll('+', ' ')
    .replaceAll(/\s+/g, ' ')
    .toLowerCase();

const normalizeIgnoreRule = (rule) =>
  String(rule || '')
    .trim()
    .toLowerCase();

const colorIgnoreKey = (value) => {
  const color = parseIgnoreColor(value);
  if (!color) return '';

  return `${color.r},${color.g},${color.b},${Math.round(color.a * 255)}`;
};

const parseIgnoreColor = (value) => {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text) return null;

  const hex = text.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) return parseHexIgnoreColor(hex[1]);

  const rgb = text.match(/^rgba?\((.*)\)$/i);

  if (rgb) {
    const parts = splitColorArgs(rgb[1]);
    if (parts.length < 3 || parts.length > 4) return null;
    const r = parseRgbChannel(parts[0]);
    const g = parseRgbChannel(parts[1]);
    const b = parseRgbChannel(parts[2]);
    const a = parts[3] === undefined ? 1 : parseAlphaChannel(parts[3]);
    if ([a, b, g, r].includes(null)) return null;

    return {a, b, g, r};
  }

  const hsl = text.match(/^hsla?\((.*)\)$/i);

  if (hsl) {
    const parts = splitColorArgs(hsl[1]);
    if (parts.length < 3 || parts.length > 4) return null;
    const h = parseHueChannel(parts[0]);
    const s = parsePercentChannel(parts[1]);
    const l = parsePercentChannel(parts[2]);
    const a = parts[3] === undefined ? 1 : parseAlphaChannel(parts[3]);
    if ([a, h, l, s].includes(null)) return null;

    return hslToRgb(h, s, l, a);
  }

  return null;
};

const parseHexIgnoreColor = (hex) => {
  if (hex.length === 3 || hex.length === 4) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;

    return {a, b, g, r};
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;

  return {a, b, g, r};
};

const splitColorArgs = (body) => {
  const text = String(body || '').trim();
  if (!text) return [];

  if (text.includes(',')) {
    const parts = text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const last = parts.at(-1);

    if (last && last.includes('/')) {
      const split = last
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean);

      return [...parts.slice(0, -1), ...split];
    }

    return parts;
  }

  return text
    .replaceAll(/\s*\/\s*/g, ' / ')
    .split(/\s+/)
    .filter((part) => part && part !== '/');
};

const parseRgbChannel = (raw) => {
  const text = String(raw || '').trim();
  const match = text.match(/^(-?\d*\.?\d+)(%)?$/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const scaled = match[2] ? value * 2.55 : value;
  if (scaled < 0 || scaled > 255) return null;

  return Math.round(scaled);
};

const parseAlphaChannel = (raw) => {
  const text = String(raw || '').trim();
  const match = text.match(/^(-?\d*\.?\d+)(%)?$/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const alpha = match[2] ? value / 100 : value;

  return alpha >= 0 && alpha <= 1 ? alpha : null;
};

const parseHueChannel = (raw) => {
  const text = String(raw || '').trim();
  const match = text.match(/^(-?\d*\.?\d+)(deg|rad|turn|grad)?$/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2] || 'deg';
  if (unit === 'turn') return value * 360;
  if (unit === 'rad') return value * (180 / Math.PI);
  if (unit === 'grad') return value * 0.9;

  return value;
};

const parsePercentChannel = (raw) => {
  const text = String(raw || '').trim();
  const match = text.match(/^(-?\d*\.?\d+)%$/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;

  return value >= 0 && value <= 100 ? value / 100 : null;
};

const hslToRgb = (hue, saturation, lightness, alpha) => {
  const h = (((hue % 360) + 360) % 360) / 360;

  if (saturation === 0) {
    const gray = clampByte(Math.round(lightness * 255));

    return {a: alpha, b: gray, g: gray, r: gray};
  }
  const q =
    lightness < 0.5 ?
      lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  const toRgb = (t) => {
    let channel = t;
    if (channel < 0) channel += 1;
    if (channel > 1) channel -= 1;
    if (channel < 1 / 6) return p + (q - p) * 6 * channel;
    if (channel < 1 / 2) return q;
    if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;

    return p;
  };

  return {
    a: alpha,
    b: clampByte(Math.round(toRgb(h - 1 / 3) * 255)),
    g: clampByte(Math.round(toRgb(h) * 255)),
    r: clampByte(Math.round(toRgb(h + 1 / 3) * 255)),
  };
};

const clampByte = (value) => Math.min(255, Math.max(0, value));

const ignoreValueMatches = (rule, entryValue, findingValue) => {
  if (entryValue === findingValue) return true;
  if (rule !== 'design-system-color') return false;
  const entryColor = colorIgnoreKey(entryValue);

  return Boolean(entryColor && entryColor === colorIgnoreKey(findingValue));
};

export const normalizeIgnoreValueEntries = (entries) => {
  if (!Array.isArray(entries)) return [];
  const out = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const rule = normalizeIgnoreRule(entry.rule);
    const value = normalizeIgnoreValue(entry.value);
    if (!rule || !value) continue;
    const normalized = {rule, value};
    const files = uniqueStrings([
      ...(typeof entry.file === 'string' && entry.file.trim() ?
        [entry.file.trim()]
      : []),
      ...(Array.isArray(entry.files) ?
        entry.files
          .filter((v) => typeof v === 'string' && v.trim())
          .map((v) => v.trim())
      : []),
    ]);
    if (files.length > 0) normalized.files = files;

    if (typeof entry.reason === 'string' && entry.reason.trim()) {
      normalized.reason = entry.reason.trim();
    }

    if (typeof entry.createdAt === 'string' && entry.createdAt.trim()) {
      normalized.createdAt = entry.createdAt.trim();
    }
    out.push(normalized);
  }

  return out;
};

const mergeIgnoreValues = (existing, incoming) => {
  const map = new Map();

  for (const entry of normalizeIgnoreValueEntries(existing)) {
    map.set(
      `${entry.rule}\0${entry.value}\0${ignoreValueFilesKey(entry.files)}`,
      entry
    );
  }

  for (const entry of normalizeIgnoreValueEntries(incoming)) {
    map.set(
      `${entry.rule}\0${entry.value}\0${ignoreValueFilesKey(entry.files)}`,
      entry
    );
  }

  return [...map.values()];
};

const ignoreValueFilesKey = (files) =>
  Array.isArray(files) && files.length > 0 ? files.join('\u001F') : '';

// Glob -> RegExp. Supports `**`, `*`, `?`, and `{a,b}` alternation.
const globToRegex = (glob) => {
  let re = '^';
  let index = 0;

  while (index < glob.length) {
    const c = glob[index];

    if (c === '*') {
      if (glob[index + 1] === '*') {
        re += '.*';
        index += 2;
        if (glob[index] === '/') index += 1;
      } else {
        re += '[^/]*';
        index += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      index += 1;
    } else if (c === '{') {
      const end = glob.indexOf('}', index);

      if (end === -1) {
        re += String.raw`\{`;
        index += 1;
        continue;
      }
      const parts = glob
        .slice(index + 1, end)
        .split(',')
        .map((p) => p.replaceAll(/[.+^$()|[\]\\]/g, String.raw`\$&`));
      re += `(?:${parts.join('|')})`;
      index = end + 1;
    } else if (/[.+^$()|[\]\\]/.test(c)) {
      re += `\\${c}`;
      index += 1;
    } else {
      re += c;
      index += 1;
    }
  }
  re += '$';

  return new RegExp(re);
};

export const matchesAnyGlob = (filePath, globs) => {
  if (!Array.isArray(globs) || globs.length === 0) return false;
  const normalized = String(filePath || '')
    .split(sep)
    .join('/');

  for (const glob of globs) {
    try {
      const re = globToRegex(String(glob));
      if (re.test(normalized)) return true;
      const base = normalized.split('/').pop();
      if (re.test(base)) return true;
    } catch {
      /* malformed glob, skip */
    }
  }

  return false;
};

export const shouldIgnoreDetectionFile = (filePath, root, config) => {
  const globs = config?.ignoreFiles || [];
  if (!Array.isArray(globs) || globs.length === 0) return false;
  const raw = String(filePath || '').trim();
  if (!raw) return false;
  if (matchesAnyGlob(raw, globs)) return true;

  try {
    const abs = isAbsolute(raw) ? raw : resolve(root, raw);
    if (matchesAnyGlob(abs, globs)) return true;
    const rel = relative(root, abs);

    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
      return matchesAnyGlob(rel, globs);
    }
  } catch {
    /* ignore */
  }

  return false;
};

export const filterDetectionFindings = (findings, config) => {
  if (!Array.isArray(findings) || findings.length === 0) return [];
  const ignoreRules = new Set(
    (config?.ignoreRules || []).map((rule) => normalizeIgnoreRule(rule))
  );
  const ignoreValues = normalizeIgnoreValueEntries(config?.ignoreValues || []);

  return findings.filter((finding) => {
    if (!finding || typeof finding !== 'object') return false;
    if (ignoreRules.has(normalizeIgnoreRule(finding.antipattern))) return false;
    if (isIgnoredFindingValue(finding, ignoreValues)) return false;

    return true;
  });
};

const isIgnoredFindingValue = (finding, ignoreValues) => {
  if (!Array.isArray(ignoreValues) || ignoreValues.length === 0) return false;
  const rule = normalizeIgnoreRule(finding.antipattern);
  const value = extractFindingIgnoreValue(finding);
  if (!rule || !value) return false;

  return ignoreValues.some((entry) => {
    const wildcardValue = entry.value === '*';
    if (
      entry.rule !== rule ||
      (!wildcardValue && !ignoreValueMatches(rule, entry.value, value))
    )
      return false;
    if (!Array.isArray(entry.files) || entry.files.length === 0)
      return !wildcardValue;

    return findingMatchesScopedIgnoreFile(finding, entry.files);
  });
};

const findingMatchesScopedIgnoreFile = (finding, globs) => {
  const filePath = String(finding?.file || '').trim();
  if (!filePath) return false;
  if (matchesAnyGlob(filePath, globs)) return true;

  const normalized = filePath.split(sep).join('/');
  const parts = normalized.split('/').filter(Boolean);

  for (let index = 0; index < parts.length; index++) {
    const suffix = parts.slice(index).join('/');
    if (matchesAnyGlob(suffix, globs)) return true;
  }

  return false;
};

export const extractFindingIgnoreValue = (finding) => {
  if (!finding || typeof finding !== 'object') return '';
  const rule = normalizeIgnoreRule(finding.antipattern);
  const directValueRules = new Set([
    'bounce-easing',
    'design-system-color',
    'design-system-font',
    'design-system-radius',
    'overused-font',
  ]);
  if (!directValueRules.has(rule)) return '';

  return normalizeIgnoreValue(extractFindingIgnoreValueRaw(finding, rule));
};

const extractFindingIgnoreValueRaw = (
  finding,
  rule = normalizeIgnoreRule(finding?.antipattern)
) => {
  const direct = cleanIgnoreValueDisplay(
    finding.ignoreValue || finding.value || ''
  );
  if (direct) return direct;

  const candidates = [finding.detail, finding.snippet].filter(
    (v) => typeof v === 'string' && v
  );

  for (const text of candidates) {
    if (rule === 'bounce-easing') {
      const motion = extractMotionIgnoreValue(text);
      if (motion) return motion;
      continue;
    }

    const primary = text.match(/Primary font:\s*([^()\n;]+)/i);
    if (primary) return cleanIgnoreValueDisplay(primary[1]);

    const family = text.match(/font-family\s*:\s*["']?([^'",;\n]+)/i);
    if (family) return cleanIgnoreValueDisplay(family[1]);

    const google = text.match(/[?&]family=([^&:;\n]+)/i);

    if (google) {
      try {
        return cleanIgnoreValueDisplay(decodeURIComponent(google[1]));
      } catch {
        return cleanIgnoreValueDisplay(google[1]);
      }
    }
  }

  return '';
};

const extractMotionIgnoreValue = (text) => {
  const tailwind = text.match(/\banimate-bounce\b/i);
  if (tailwind) return cleanIgnoreValueDisplay(tailwind[0]);

  const bezier = text.match(/cubic-bezier\([^)]+\)/i);
  if (bezier) return cleanIgnoreValueDisplay(bezier[0]);

  const animation = text.match(/animation(?:-name)?\s*:\s*([^;\n]+)/i);

  if (animation) {
    const token = animation[1]
      .split(/[,\s]+/)
      .find((part) => /bounce|elastic|wobble|jiggle|spring/i.test(part));
    if (token) return cleanIgnoreValueDisplay(token);
  }

  return '';
};

const cleanIgnoreValueDisplay = (value) =>
  String(value || '')
    .trim()
    .replaceAll(/^["']|["']$/g, '')
    .replaceAll('+', ' ')
    .replaceAll(/\s+/g, ' ');

/**
 * The recorded design-hook decision: 'accepted' | 'declined' | undefined.
 * config.local.json (per-developer) overrides config.json.
 */
export const getHookConsent = (root) => {
  let consent;

  for (const filePath of [getConfigPath(root), getLocalConfigPath(root)]) {
    const hook = hookSection(safeReadJson(filePath));
    if (hook && (hook.consent === 'accepted' || hook.consent === 'declined'))
      consent = hook.consent;
  }

  return consent;
};

/**
 * Persist the per-developer decision to config.local.json, preserving any
 * sibling keys, and ensure the file is gitignored.
 */
export const setHookConsent = (root, value) => {
  const filePath = getLocalConfigPath(root);
  const existing = safeReadJson(filePath) || {};
  const hook = hookSection(existing) || {};
  const next = {...existing, hook: {...hook, consent: value}};
  mkdirSync(dirname(filePath), {recursive: true});
  writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`);
  ensureConfigGitExclude(root);

  return filePath;
};

const EXCLUDE_OPEN = '# impeccable-config-ignore-start';
const EXCLUDE_CLOSE = '# impeccable-config-ignore-end';
const EXCLUDE_PATTERNS = ['.impeccable/config.local.json'];

/**
 * Add config.local.json to `.git/info/exclude` so a developer's decision is
 * never committed. Idempotent via marker comments. Best-effort; returns false
 * when there is no resolvable git dir.
 */
export const ensureConfigGitExclude = (root) => {
  try {
    const gitDir = resolveGitDir(root);
    if (!gitDir) return false;
    const target = join(gitDir, 'info', 'exclude');
    const existing = existsSync(target) ? readFileSync(target, 'utf-8') : '';
    const block = [EXCLUDE_OPEN, ...EXCLUDE_PATTERNS, EXCLUDE_CLOSE].join('\n');
    const markerRe = new RegExp(
      String.raw`${escapeRegExp(EXCLUDE_OPEN)}[\s\S]*?${escapeRegExp(EXCLUDE_CLOSE)}`
    );
    let updated;

    if (markerRe.test(existing)) {
      updated = existing.replace(markerRe, block);
    } else {
      const prefix =
        existing.length === 0 ? ''
        : existing.endsWith('\n') ? existing
        : `${existing}\n`;
      updated = `${prefix}${block}\n`;
    }

    if (updated !== existing) {
      mkdirSync(dirname(target), {recursive: true});
      writeFileSync(target, updated);
    }

    return true;
  } catch {
    return false;
  }
};

const resolveGitDir = (root) => {
  const dotGit = join(root, '.git');
  if (!existsSync(dotGit)) return null;

  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
    // A `.git` file (worktree/submodule) points elsewhere: "gitdir: <path>".
    const match = readFileSync(dotGit, 'utf-8').match(/gitdir:\s*(.+)/);

    if (match) {
      const resolved = match[1].trim();

      return isAbsolute(resolved) ? resolved : join(root, resolved);
    }
  } catch {
    /* fall through */
  }

  return null;
};

const escapeRegExp = (value) =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
