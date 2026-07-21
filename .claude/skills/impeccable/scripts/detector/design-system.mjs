import fs from 'node:fs';
import path from 'node:path';
import {finding} from './findings.mjs';
import {parseAnyColor, resolveLengthPx} from './rules/checks.mjs';
import {GENERIC_FONTS} from './shared/constants.mjs';

const DESIGN_NAMES = ['DESIGN.md', 'Design.md', 'design.md'];
const FALLBACK_DIRS = ['.agents/context', 'docs'];
const COLOR_CHANNEL_TOLERANCE = 6;
const RADIUS_TOLERANCE_PX = 0.5;

const CSS_COLOR_RE =
  /#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|oklch\([^)]+\)|hsla?\([^)]+\)/gi;
const FONT_DECL_RE = /font-family\s*:\s*([^;}\n]+)/gi;
const FONT_JS_RE = /fontFamily\s*[:=]\s*["'`]([^"'`]+)["'`]/g;
const GOOGLE_FONT_RE = /fonts\.googleapis\.com\/css2?\?[^"'\s)<>]*/gi;
const BORDER_RADIUS_RE = /border-radius\s*:\s*([^;}\n]+)/gi;
const BORDER_RADIUS_JS_RE = /borderRadius\s*[:=]\s*["'`]([^"'`]+)["'`]/g;
const STATIC_DESIGN_SKIP_TAGS = new Set([
  'head',
  'link',
  'meta',
  'noscript',
  'script',
  'source',
  'style',
  'template',
  'title',
]);

const firstExisting = (dir, names) => {
  for (const name of names) {
    const abs = path.join(dir, name);
    if (fs.existsSync(abs)) return abs;
  }

  return null;
};

const resolveDesignMdPath = (cwd = process.cwd()) => {
  const root = firstExisting(cwd, DESIGN_NAMES);
  if (root) return {contextDir: cwd, path: root};

  for (const rel of FALLBACK_DIRS) {
    const dir = path.resolve(cwd, rel);
    const found = firstExisting(dir, DESIGN_NAMES);
    if (found) return {contextDir: dir, path: found};
  }

  return null;
};

const resolveDesignSidecarPath = (cwd = process.cwd(), contextDir = cwd) => {
  const candidates = [
    path.join(cwd, '.impeccable', 'design.json'),
    path.join(cwd, 'DESIGN.json'),
    path.join(contextDir, 'DESIGN.json'),
  ];

  return (
    candidates.find(
      (candidate, index) =>
        candidates.indexOf(candidate) === index && fs.existsSync(candidate)
    ) || null
  );
};

const parseFrontmatter = (md) => {
  const lines = String(md || '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;

  for (let index = 1; index < lines.length; index++) {
    if (lines[index].trim() === '---') {
      end = index;
      break;
    }
  }
  if (end === -1) return null;

  try {
    return parseYamlSubset(lines.slice(1, end).join('\n'));
  } catch {
    return null;
  }
};

const parseYamlSubset = (yaml) => {
  const root = {};
  const stack = [{indent: -1, obj: root}];

  for (const raw of String(yaml || '').split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const indent = raw.match(/^\s*/)[0].length;
    const content = raw.slice(indent);
    const colonIndex = findTopLevelColon(content);
    if (colonIndex === -1) continue;

    while (stack.length > 1 && stack.at(-1).indent >= indent) stack.pop();

    const key = unquoteYamlKey(content.slice(0, colonIndex).trim());
    const rest = stripInlineYamlComment(content.slice(colonIndex + 1).trim());
    const parent = stack.at(-1).obj;

    if (rest === '') {
      const obj = {};
      parent[key] = obj;
      stack.push({indent, obj});
    } else {
      parent[key] = parseScalar(rest);
    }
  }

  return root;
};

const findTopLevelColon = (s) => {
  let inQuote = null;

  for (let index = 0; index < s.length; index++) {
    const ch = s[index];

    if (inQuote) {
      if (ch === inQuote && s[index - 1] !== '\\') inQuote = null;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ':') {
      return index;
    }
  }

  return -1;
};

const unquoteYamlKey = (key) => {
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    return key.slice(1, -1);
  }

  return key;
};

const stripInlineYamlComment = (s) => {
  let inQuote = null;

  for (let index = 0; index < s.length; index++) {
    const ch = s[index];

    if (inQuote) {
      if (ch === inQuote && s[index - 1] !== '\\') inQuote = null;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === '#' && index > 0 && /\s/.test(s[index - 1])) {
      return s.slice(0, index).trimEnd();
    }
  }

  return s;
};

const parseScalar = (raw) => {
  const s = raw.trim();

  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d*\.\d+$/.test(s)) return Number(s);

  return s;
};

const safeReadJson = (filePath) => {
  if (!filePath) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
};

const normalizeFontName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s*!important\s*$/i, '')
    .trim()
    .replaceAll(/^["']|["']$/g, '')
    .replaceAll('+', ' ')
    .replaceAll(/\s+/g, ' ')
    .toLowerCase();

const splitFontStack = (stack) =>
  String(stack || '')
    .replace(/\s*!important\s*$/i, '')
    .split(',')
    .map(normalizeFontName)
    .filter(Boolean);

const primaryFont = (stack) => {
  if (!stack || /var\(/i.test(stack) || !isLiteralFontStack(stack)) return '';

  return splitFontStack(stack).find((font) => !GENERIC_FONTS.has(font)) || '';
};

const isLiteralFontStack = (stack) => {
  const text = String(stack || '');

  return !/[$`{}]|\s\+\s|\|\|/.test(text);
};

const cssColorLabel = (raw) =>
  String(raw || '')
    .trim()
    .replaceAll(/\s+/g, ' ');

const colorKey = (color) => {
  if (!color) return '';

  return `${color.r},${color.g},${color.b}`;
};

const colorsClose = (a, b) => {
  if (!a || !b) return false;

  return (
    Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) <=
    COLOR_CHANNEL_TOLERANCE
  );
};

const hslToRgb = (H, S, L, alpha = 1) => {
  const h = (((H % 360) + 360) % 360) / 360;
  const s = Math.max(0, Math.min(1, S));
  const l = Math.max(0, Math.min(1, L));

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;

    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    a: alpha,
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
  };
};

const parseDesignColor = (value) => {
  const text = String(value || '').trim();
  const parsed = parseAnyColor(text);
  if (parsed) return parsed;
  const hsl = text.match(
    /hsla?\(\s*([-\d.]+)(?:deg)?\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%(?:\s*[,/]\s*([\d.]+))?\s*\)/i
  );

  if (hsl) {
    return hslToRgb(
      Number.parseFloat(hsl[1]),
      Number.parseFloat(hsl[2]) / 100,
      Number.parseFloat(hsl[3]) / 100,
      hsl[4] === undefined ? 1 : Number.parseFloat(hsl[4])
    );
  }

  return null;
};

const addDesignColor = (out, value, label) => {
  const parsed = parseDesignColor(value);
  if (!parsed) return;
  const key = colorKey(parsed);

  if (!out.allowedColorKeys.has(key)) {
    out.allowedColorKeys.set(key, {color: parsed, labels: []});
  }
  out.allowedColorKeys.get(key).labels.push(label || cssColorLabel(value));
};

const addColorObject = (out, colors, prefix = 'colors') => {
  if (!colors || typeof colors !== 'object') return;

  for (const [name, value] of Object.entries(colors)) {
    if (typeof value === 'string') {
      addDesignColor(out, value, `${prefix}.${name}`);
    }
  }
};

const addSidecarColors = (out, sidecar) => {
  const colorMeta = sidecar?.extensions?.colorMeta;
  if (!colorMeta || typeof colorMeta !== 'object') return;

  for (const [name, meta] of Object.entries(colorMeta)) {
    if (!meta || typeof meta !== 'object') continue;
    if (typeof meta.canonical === 'string')
      addDesignColor(out, meta.canonical, `sidecar.${name}`);

    if (Array.isArray(meta.tonalRamp)) {
      for (const [index, value] of meta.tonalRamp.entries()) {
        if (typeof value === 'string')
          addDesignColor(out, value, `sidecar.${name}.tonalRamp[${index}]`);
      }
    }
  }
};

const addTypographyFonts = (out, typography) => {
  if (!typography || typeof typography !== 'object') return;

  for (const role of Object.values(typography)) {
    if (!role || typeof role !== 'object') continue;
    if (typeof role.fontFamily !== 'string') continue;

    for (const font of splitFontStack(role.fontFamily)) {
      if (!GENERIC_FONTS.has(font)) out.allowedFonts.add(font);
    }
  }
};

const addRoundedScale = (out, rounded) => {
  if (!rounded || typeof rounded !== 'object') return;

  for (const [rawName, value] of Object.entries(rounded)) {
    const name = unquoteYamlKey(rawName).toLowerCase();
    addRoundedToken(out, name, value);
  }
};

const addRoundedToken = (out, name, value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const raw = String(value).trim();
  if (!raw || /var\(/i.test(raw) || raw.includes('%')) return;
  const px = resolveLengthPx(raw, 16);
  if (px == null || !Number.isFinite(px)) return;
  out.allowedRadii.push({name, px, value: raw});
  if (/(^|\.)(full|pill|round|rounded-full)$/.test(name))
    out.hasPillRadius = true;
};

const addSidecarRadii = (out, sidecar) => {
  const roundedMeta = sidecar?.extensions?.roundedMeta;
  if (!roundedMeta || typeof roundedMeta !== 'object') return;

  for (const [rawName, meta] of Object.entries(roundedMeta)) {
    const name = unquoteYamlKey(rawName).toLowerCase();

    if (typeof meta === 'string' || typeof meta === 'number') {
      addRoundedToken(out, `sidecar.${name}`, meta);
      continue;
    }
    if (!meta || typeof meta !== 'object') continue;

    for (const key of ['canonical', 'value']) {
      if (typeof meta[key] === 'string' || typeof meta[key] === 'number') {
        addRoundedToken(out, `sidecar.${name}.${key}`, meta[key]);
      }
    }

    for (const key of ['values', 'aliases']) {
      if (!Array.isArray(meta[key])) continue;

      for (const [index, value] of meta[key].entries()) {
        addRoundedToken(out, `sidecar.${name}.${key}[${index}]`, value);
      }
    }

    if (
      /^(full|pill|round|rounded-full)$/.test(name) ||
      /^(full|pill|round)$/i.test(String(meta.role || ''))
    ) {
      out.hasPillRadius = true;
    }
  }
};

const normalizeDesignSystem = (input = {}) => {
  const frontmatter = input.frontmatter || {};
  const sidecar = input.sidecar || null;
  const out = {
    allowedColorKeys: new Map(),
    allowedFonts: new Set(),
    allowedRadii: [],
    hasPillRadius: false,
    mdNewerThanJson: input.mdNewerThanJson === true,
    present: true,
    sidecarPath: input.sidecarPath || null,
    sourcePath: input.sourcePath || null,
  };

  addTypographyFonts(out, frontmatter.typography);
  addColorObject(out, frontmatter.colors);
  addSidecarColors(out, sidecar);
  addRoundedScale(out, frontmatter.rounded);
  addSidecarRadii(out, sidecar);

  out.hasFonts = out.allowedFonts.size > 0;
  out.hasColors = out.allowedColorKeys.size > 0;
  out.hasRadii = out.allowedRadii.length > 0;

  return out;
};

const loadDesignSystemForCwd = (cwd = process.cwd()) => {
  const md = resolveDesignMdPath(cwd);
  if (!md) return null;

  let frontmatter = null;
  let mdStat = null;

  try {
    mdStat = fs.statSync(md.path);
    frontmatter = parseFrontmatter(fs.readFileSync(md.path, 'utf-8'));
  } catch {
    return null;
  }
  if (!frontmatter || typeof frontmatter !== 'object') return null;

  const sidecarPath = resolveDesignSidecarPath(cwd, md.contextDir);
  const sidecar = safeReadJson(sidecarPath);
  let sidecarStat = null;

  try {
    if (sidecarPath) sidecarStat = fs.statSync(sidecarPath);
  } catch {
    sidecarStat = null;
  }

  return normalizeDesignSystem({
    frontmatter,
    mdNewerThanJson: !!(
      mdStat &&
      sidecarStat &&
      mdStat.mtimeMs > sidecarStat.mtimeMs + 1000
    ),
    sidecar,
    sidecarPath,
    sourcePath: md.path,
  });
};

const isAllowedFont = (font, designSystem) => {
  if (!font || GENERIC_FONTS.has(font)) return true;
  if (!designSystem?.hasFonts) return true;

  return designSystem.allowedFonts.has(font);
};

const isAllowedColorRaw = (raw, designSystem) => {
  if (!designSystem?.hasColors) return true;
  const text = String(raw || '')
    .trim()
    .toLowerCase();
  if (
    !text ||
    text === 'transparent' ||
    text === 'currentcolor' ||
    text === 'inherit' ||
    text === 'initial'
  )
    return true;
  if (text.includes('var(')) return true;
  const parsed = parseDesignColor(text);
  if (!parsed) return true;
  if ((parsed.a ?? 1) <= 0.05) return true;

  for (const entry of designSystem.allowedColorKeys.values()) {
    if (colorsClose(parsed, entry.color)) return true;
  }

  return false;
};

const isAllowedRadiusRaw = (raw, designSystem) => {
  if (!designSystem?.hasRadii) return true;
  const text = String(raw || '')
    .trim()
    .toLowerCase();
  if (
    !text ||
    text === '0' ||
    text === 'none' ||
    text === 'initial' ||
    text === 'inherit'
  )
    return true;
  if (text.includes('var(') || text.includes('%')) return true;
  const px = resolveLengthPx(text, 16);
  if (px == null || !Number.isFinite(px) || px <= RADIUS_TOLERANCE_PX)
    return true;
  if (designSystem.hasPillRadius && px >= 99) return true;

  return designSystem.allowedRadii.some(
    (entry) => Math.abs(entry.px - px) <= RADIUS_TOLERANCE_PX
  );
};

const lineLooksCommented = (line) => {
  const trimmed = String(line || '').trim();

  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('<!--')
  );
};

const isProbablyColorLiteral = (line, match) => {
  const raw = match?.[0] || '';
  const index = match.index ?? -1;
  if (index < 0) return false;
  if (isInsideCssAttributeSelector(line, index)) return false;

  const before = line.slice(0, index);
  const after = line.slice(index + raw.length);

  if (raw.startsWith('#')) {
    if (before.endsWith('&')) return false; // HTML numeric entity, e.g. &#8596;

    const prevNonSpace = before.match(/\S(?=\s*$)/)?.[0] || '';
    const nextNonSpace = after.match(/^\s*(\S)/)?.[1] || '';
    if (prevNonSpace === '>' && nextNonSpace === '<') return false; // plain text, e.g. PR #155
  }

  const styleContext =
    /(?:^|[{\s;"'`(,])(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke)\s*:\s*[^;{}"'`]*/i.test(
      before
    );
  const cssFunctionContext =
    /(?:linear-gradient|radial-gradient|conic-gradient|color-mix)\([^)]*$/i.test(
      before
    );
  const jsColorKeyContext =
    /(?:^|[,{]\s*)(?:color|background|backgroundColor|borderColor|outlineColor|fill|stroke|boxShadow|textShadow)\s*[:=]\s*["'`]?[^"'`,}]*/i.test(
      before
    );

  return styleContext || cssFunctionContext || jsColorKeyContext;
};

const isInsideCssAttributeSelector = (line, index) => {
  if (index < 0) return false;
  const before = line.slice(0, index);
  const lastOpen = before.lastIndexOf('[');
  if (lastOpen === -1) return false;
  const lastClose = before.lastIndexOf(']');
  if (lastClose > lastOpen) return false;
  const after = line.slice(index);
  const close = after.indexOf(']');
  const block = after.indexOf('{');

  return close !== -1 && (block === -1 || close < block);
};

const makeDesignFinding = (id, filePath, snippet, line = 0, extras = {}) => ({
  ...finding(id, filePath, snippet, line),
  ...extras,
});

const decodeGoogleFamily = (value) => {
  const family = String(value || '')
    .split(':', 1)[0]
    .replaceAll('+', ' ');

  try {
    return decodeURIComponent(family);
  } catch {
    return family;
  }
};

const checkFontStack = (stack, filePath, line, designSystem, context) => {
  const primary = primaryFont(stack);
  if (!primary || isAllowedFont(primary, designSystem)) return [];
  const display = primary.replaceAll(/\b\w/g, (ch) => ch.toUpperCase());

  return [
    makeDesignFinding(
      'design-system-font',
      filePath,
      `${context}: ${display} is not declared in DESIGN.md typography`,
      line,
      {ignoreValue: display}
    ),
  ];
};

const extractRadiusTokens = (value) =>
  String(value || '')
    .replaceAll(/\s*\/\s*/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const checkRadiusValue = (value, filePath, line, designSystem, context) => {
  const findings = [];

  for (const token of extractRadiusTokens(value)) {
    if (isAllowedRadiusRaw(token, designSystem)) continue;
    findings.push(
      makeDesignFinding(
        'design-system-radius',
        filePath,
        `${context}: ${token} is outside the DESIGN.md rounded scale`,
        line,
        {ignoreValue: token}
      )
    );
  }

  return findings;
};

const checkSourceDesignSystem = (content, filePath, options = {}) => {
  const {designSystem} = options;
  if (!designSystem?.present) return [];

  const findings = [];
  const lines = String(content || '').split('\n');

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (lineLooksCommented(line)) continue;

    if (designSystem.hasFonts) {
      for (const match of line.matchAll(FONT_DECL_RE)) {
        findings.push(
          ...checkFontStack(
            match[1],
            filePath,
            lineNumber,
            designSystem,
            'font-family'
          )
        );
      }

      for (const match of line.matchAll(FONT_JS_RE)) {
        findings.push(
          ...checkFontStack(
            match[1],
            filePath,
            lineNumber,
            designSystem,
            'fontFamily'
          )
        );
      }

      for (const match of line.matchAll(GOOGLE_FONT_RE)) {
        const url = match[0];

        for (const familyMatch of url.matchAll(/[?&]family=([^&]+)/g)) {
          const font = normalizeFontName(decodeGoogleFamily(familyMatch[1]));
          if (!font || isAllowedFont(font, designSystem)) continue;
          const display = decodeGoogleFamily(familyMatch[1]);
          findings.push(
            makeDesignFinding(
              'design-system-font',
              filePath,
              `Google Fonts: ${display} is not declared in DESIGN.md typography`,
              lineNumber,
              {ignoreValue: display}
            )
          );
        }
      }
    }

    if (designSystem.hasColors) {
      for (const match of line.matchAll(CSS_COLOR_RE)) {
        if (!isProbablyColorLiteral(line, match)) continue;
        const raw = cssColorLabel(match[0]);
        if (isAllowedColorRaw(raw, designSystem)) continue;
        findings.push(
          makeDesignFinding(
            'design-system-color',
            filePath,
            `Undocumented color ${raw} is outside DESIGN.md colors`,
            lineNumber,
            {ignoreValue: raw}
          )
        );
      }
    }

    if (designSystem.hasRadii) {
      for (const match of line.matchAll(BORDER_RADIUS_RE)) {
        findings.push(
          ...checkRadiusValue(
            match[1],
            filePath,
            lineNumber,
            designSystem,
            'border-radius'
          )
        );
      }

      for (const match of line.matchAll(BORDER_RADIUS_JS_RE)) {
        findings.push(
          ...checkRadiusValue(
            match[1],
            filePath,
            lineNumber,
            designSystem,
            'borderRadius'
          )
        );
      }
    }
  }

  return dedupeDesignFindings(findings);
};

const hasDirectText = (element) =>
  [...(element.childNodes || [])].some(
    (node) => node.nodeType === 3 && node.textContent.trim().length > 0
  );

const sampleText = (element) => {
  const text = String(element.textContent || '')
    .replaceAll(/\s+/g, ' ')
    .trim();

  return text ? ` "${text.slice(0, 40)}"` : '';
};

const collectStaticDesignSystemFindings = (
  document,
  window,
  filePath,
  designSystem
) => {
  if (!designSystem?.present) return [];
  const findings = [];
  const seenFonts = new Set();
  const seenColors = new Set();
  const seenRadii = new Set();

  for (const element of document.querySelectorAll('*')) {
    if (shouldSkipStaticDesignElement(element, window)) continue;
    const tag = element.tagName?.toLowerCase?.() || 'unknown';
    const style = window.getComputedStyle(element);

    if (designSystem.hasFonts && hasDirectText(element)) {
      const font = primaryFont(style.fontFamily || '');

      if (font && !seenFonts.has(font) && !isAllowedFont(font, designSystem)) {
        seenFonts.add(font);
        findings.push(
          makeDesignFinding(
            'design-system-font',
            filePath,
            `${tag}${sampleText(element)} uses ${font}; not declared in DESIGN.md typography`,
            0,
            {ignoreValue: font}
          )
        );
      }
    }

    if (designSystem.hasColors) {
      const colorChecks = [];
      if (hasDirectText(element)) colorChecks.push(['text color', style.color]);
      if (!isTransparentCss(style.backgroundColor))
        colorChecks.push(['background', style.backgroundColor]);

      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if ((Number.parseFloat(style[`border${side}Width`]) || 0) > 0) {
          colorChecks.push([
            `border-${side.toLowerCase()}`,
            style[`border${side}Color`],
          ]);
        }
      }
      if ((Number.parseFloat(style.outlineWidth) || 0) > 0)
        colorChecks.push(['outline', style.outlineColor]);

      for (const [kind, raw] of colorChecks) {
        const label = cssColorLabel(raw);
        if (isAllowedColorRaw(label, designSystem)) continue;
        const key = `${kind}:${label}`;
        if (seenColors.has(key)) continue;
        seenColors.add(key);
        findings.push(
          makeDesignFinding(
            'design-system-color',
            filePath,
            `${kind} ${label} on ${tag}${sampleText(element)} is outside DESIGN.md colors`,
            0,
            {ignoreValue: label}
          )
        );
      }
    }

    if (designSystem.hasRadii) {
      const rawRadius = String(style.borderRadius || '').trim();
      if (!rawRadius) continue;

      for (const token of extractRadiusTokens(rawRadius)) {
        if (isAllowedRadiusRaw(token, designSystem)) continue;
        if (seenRadii.has(token)) continue;
        seenRadii.add(token);
        findings.push(
          makeDesignFinding(
            'design-system-radius',
            filePath,
            `border-radius ${token} on ${tag}${sampleText(element)} is outside the DESIGN.md rounded scale`,
            0,
            {ignoreValue: token}
          )
        );
      }
    }
  }

  return findings;
};

const shouldSkipStaticDesignElement = (element, window) => {
  const tag = element.tagName?.toLowerCase?.() || '';
  if (STATIC_DESIGN_SKIP_TAGS.has(tag)) return true;

  let current = element;

  while (current) {
    if (
      current.getAttribute?.('hidden') !== null ||
      current.getAttribute?.('aria-hidden') === 'true'
    )
      return true;
    const style = window.getComputedStyle(current);
    const display = String(style.display || '').toLowerCase();
    const visibility = String(style.visibility || '').toLowerCase();
    if (
      display === 'none' ||
      visibility === 'hidden' ||
      visibility === 'collapse'
    )
      return true;
    current = current.parentElement;
  }

  return false;
};

const isTransparentCss = (value) => {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text || text === 'transparent') return true;
  const parsed = parseDesignColor(text);

  return parsed ? (parsed.a ?? 1) <= 0.05 : false;
};

const canonicalDesignFindingKey = (item) => {
  if (!item?.antipattern?.startsWith?.('design-system-')) return null;
  const value = item.ignoreValue || item.value || '';

  if (item.antipattern === 'design-system-font') {
    const context =
      /google fonts/i.test(item.snippet || '') ? 'google-font' : 'font';
    const font = normalizeFontName(value);

    return font ? `${item.antipattern}:${context}:${font}` : null;
  }

  if (item.antipattern === 'design-system-color') {
    const parsed = parseDesignColor(value);
    if (parsed) return `${item.antipattern}:color:${colorKey(parsed)}`;
    const label = cssColorLabel(value).toLowerCase();

    return label ? `${item.antipattern}:color:${label}` : null;
  }

  if (item.antipattern === 'design-system-radius') {
    const px = resolveLengthPx(String(value || '').trim(), 16);
    if (px != null && Number.isFinite(px))
      return `${item.antipattern}:radius:${Math.round(px * 100) / 100}`;
    const label = String(value || '')
      .trim()
      .toLowerCase();

    return label ? `${item.antipattern}:radius:${label}` : null;
  }

  return null;
};

const mergeDesignSystemFindings = (...groups) => {
  const out = [];
  const seen = new Map();

  for (const group of groups) {
    for (const item of group || []) {
      const key = canonicalDesignFindingKey(item);

      if (key) {
        if (seen.has(key)) {
          const existing = out[seen.get(key)];
          if ((existing.line || 0) <= 0 && (item.line || 0) > 0)
            existing.line = item.line;
          continue;
        }
        seen.set(key, out.length);
      }
      out.push(item);
    }
  }

  return out;
};

const dedupeDesignFindings = (findings) => {
  const out = [];
  const seen = new Set();

  for (const item of findings) {
    const key = [
      item.antipattern,
      item.line || 0,
      normalizeFontName(item.ignoreValue || item.snippet || ''),
    ].join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
};

export {
  checkSourceDesignSystem,
  collectStaticDesignSystemFindings,
  isAllowedColorRaw,
  isAllowedFont,
  isAllowedRadiusRaw,
  loadDesignSystemForCwd,
  mergeDesignSystemFindings,
  normalizeDesignSystem,
  parseFrontmatter,
};
