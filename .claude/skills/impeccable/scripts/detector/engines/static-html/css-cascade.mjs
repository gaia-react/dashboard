import fs from 'node:fs';
import path from 'node:path';
import {profileStep, recordProfileEvent} from '../../profile/profiler.mjs';
import {
  parseAnyColor,
  resolveLengthPx,
  resolveVarRefs,
} from '../../rules/checks.mjs';

// ---------------------------------------------------------------------------
// jsdom CSS-variable border override map
// ---------------------------------------------------------------------------
//
// jsdom's CSSOM silently drops any border shorthand that contains a var()
// reference — the computed style for the element then shows empty width,
// empty style, and a default black color. That's enough to hide the most
// common real-world side-tab pattern in AI-generated pages:
//
//   :root { --brand: #87a8ff; }
//   .card { border-left: 5px solid var(--brand); border-radius: 4px; }
//
// Real browsers (and therefore the browser detector path) resolve var()
// natively, so this only affects the Node jsdom path.
//
// This pre-pass walks the stylesheets, finds any rule whose per-side or
// all-sides border property contains var(), resolves the var() against
// :root-level custom properties (read from the documentElement's computed
// style, which jsdom DOES handle correctly), and attaches the resolved
// width+color to every element that matches the rule's selector. The
// Node-side `checkElementBorders` adapter consumes that map as a fallback
// whenever jsdom's computed style came back empty.
//
// Limitations (intentional, to keep the pass simple):
//   * Only :root-level custom properties are resolved. Scoped overrides on
//     descendants are not tracked — uncommon in practice and would require
//     a per-element cascade walk.
//   * @media / @supports wrapped rules are ignored (jsdom often mishandles
//     these anyway).
//   * The fallback only fills sides that jsdom left empty, so any rule
//     whose border parses normally still wins via the computed style.

const BORDER_SHORTHAND_RE =
  /^(\d+(?:\.\d+)?)px\s+(solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(.+)$/i;

// isNeutralColor only understands rgba()/oklch()/lch()/lab()/hsl()/hwb().
// CSS variables typically hold hex or named colors, so normalize those to
// rgb() before handing the value off to the shared check. Anything we don't
// recognise is passed through unchanged — isNeutralColor then treats it as
// non-neutral, which is the safer default (matches the oklch-era bugfix).
const NAMED_COLORS = {
  black: [0, 0, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  green: [0, 128, 0],
  grey: [128, 128, 128],
  red: [255, 0, 0],
  silver: [192, 192, 192],
  white: [255, 255, 255],
  yellow: [255, 255, 0],
};

const normalizeColorForCheck = (value) => {
  if (!value) return value;
  const v = value.trim();
  const hex6 = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

  if (hex6) {
    const [r, g, b] = [
      Number.parseInt(hex6[1], 16),
      Number.parseInt(hex6[2], 16),
      Number.parseInt(hex6[3], 16),
    ];

    return `rgb(${r}, ${g}, ${b})`;
  }
  const hex3 = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);

  if (hex3) {
    const [r, g, b] = [
      Number.parseInt(hex3[1] + hex3[1], 16),
      Number.parseInt(hex3[2] + hex3[2], 16),
      Number.parseInt(hex3[3] + hex3[3], 16),
    ];

    return `rgb(${r}, ${g}, ${b})`;
  }
  const named = NAMED_COLORS[v.toLowerCase()];
  if (named) return `rgb(${named[0]}, ${named[1]}, ${named[2]})`;

  return v;
};

const buildBorderOverrideMap = (document, window) => {
  const map = new Map();
  const rootStyle = window.getComputedStyle(document.documentElement);

  const resolveVar = (value, depth = 0) => {
    if (!value || depth > 10 || !value.includes('var(')) return value;

    return value.replaceAll(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\s*\)/g,
      (_, name, fallback) => {
        const v = rootStyle.getPropertyValue(name).trim();
        if (v) return resolveVar(v, depth + 1);
        if (fallback) return resolveVar(fallback.trim(), depth + 1);

        return '';
      }
    );
  };

  const parseShorthand = (text) => {
    const m = text.trim().match(BORDER_SHORTHAND_RE);
    if (!m) return null;

    return {
      color: normalizeColorForCheck(m[3]),
      width: Number.parseFloat(m[1]),
    };
  };

  // Read from the per-property accessors on rule.style. jsdom preserves
  // each border-* shorthand it parsed, even when the overall cssText has
  // been truncated (e.g. a `border: 1px solid var(...)` followed by a
  // `border-left: ...` loses the first declaration but keeps the second).
  const SIDE_PROPS = [
    ['borderLeft', 'Left'],
    ['borderRight', 'Right'],
    ['borderTop', 'Top'],
    ['borderBottom', 'Bottom'],
    ['borderInlineStart', 'Left'],
    ['borderInlineEnd', 'Right'],
  ];

  for (const sheet of document.styleSheets) {
    let rules;

    try {
      rules = sheet.cssRules || [];
    } catch {
      continue;
    }

    for (const rule of rules) {
      // CSSStyleRule only; skip @media / @keyframes / @supports wrappers.
      if (rule.type !== 1 || !rule.style || !rule.selectorText) continue;

      const perSide = {};

      for (const [property, side] of SIDE_PROPS) {
        const value = rule.style[property];
        if (!value || !value.includes('var(')) continue;
        const parsed = parseShorthand(resolveVar(value));
        if (parsed && parsed.color) perSide[side] = parsed;
      }

      // Uniform `border: <w> <style> var(...)` applies to every side the
      // per-side map didn't already claim.
      const borderAll = rule.style.border;

      if (borderAll && borderAll.includes('var(')) {
        const parsed = parseShorthand(resolveVar(borderAll));

        if (parsed && parsed.color) {
          for (const s of ['Top', 'Right', 'Bottom', 'Left']) {
            if (!perSide[s]) perSide[s] = parsed;
          }
        }
      }

      // Longhand `border-*-color: var(...)` with width/style in separate
      // declarations. Rare in AI-generated pages, but cheap to cover.
      for (const [property, side] of [
        ['borderLeftColor', 'Left'],
        ['borderRightColor', 'Right'],
        ['borderTopColor', 'Top'],
        ['borderBottomColor', 'Bottom'],
      ]) {
        const value = rule.style[property];
        if (!value || !value.includes('var(')) continue;
        const resolved = resolveVar(value).trim();
        if (!resolved) continue;
        // Width may or may not come from this rule — that's fine; the
        // adapter only substitutes the color when jsdom left it as a
        // literal var() string.
        if (!perSide[side])
          perSide[side] = {color: normalizeColorForCheck(resolved), width: 0};
      }

      if (Object.keys(perSide).length === 0) continue;

      let matched;

      try {
        matched = document.querySelectorAll(rule.selectorText);
      } catch {
        continue;
      }

      for (const element of matched) {
        const existing = map.get(element);

        if (existing) {
          // Later rules overwrite earlier ones — approximates source-order
          // cascade for equal-specificity rules and is good enough for the
          // uncontested var()-dropped sides we're trying to recover.
          Object.assign(existing, perSide);
        } else {
          map.set(element, {...perSide});
        }
      }
    }
  }

  return map;
};

// Strip `@layer NAME { … }` wrappers from a CSS / HTML source, leaving
// the inner rules as flat CSS. jsdom doesn't implement CSS @layer, so
// any rule inside a layer block becomes invisible to getComputedStyle.
// Tailwind v4 makes this ubiquitous: every utility class lives in
// `@layer utilities`, and Preflight lives in `@layer base`. Without
// unwrapping, every Tailwind-styled element returns empty computed
// styles. We walk the source character-by-character, balancing braces
// so we correctly handle nested style rules inside the layer block.
const unwrapCssAtLayer = (source) => {
  if (!source || !source.includes('@layer')) return source;
  // Find `@layer <name>? {` openers. The match starts at the @, and
  // we then balance braces from the opening { onward.
  const re = /@layer\b[^{;]*\{/g;
  let out = '';
  let lastIndex = 0;
  let m;

  while ((m = re.exec(source)) !== null) {
    const openStart = m.index;
    const openEnd = m.index + m[0].length; // position right after `{`
    let depth = 1;
    let index = openEnd;

    while (index < source.length && depth > 0) {
      const c = source.charCodeAt(index);
      if (c === 0x7b /* { */) depth++;
      else if (c === 0x7d /* } */) depth--;
      index++;
    }

    if (depth !== 0) {
      // Unbalanced — bail and return source unchanged.
      return source;
    }
    // Emit everything before the @layer, then the inner contents
    // (between the opening { and the matched closing }), then advance.
    out += source.slice(lastIndex, openStart);
    out += source.slice(openEnd, index - 1); // i-1 = position of the closing }
    lastIndex = index;
    re.lastIndex = index;
  }
  out += source.slice(lastIndex);

  return out;
};

// ---------------------------------------------------------------------------
// Static HTML/CSS detection (default for local HTML files)
// ---------------------------------------------------------------------------

const STATIC_INHERITED_PROPS = new Set([
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'hyphens',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textTransform',
  'webkitHyphens',
]);

const STATIC_DEFAULT_STYLE = {
  animationName: '',
  animationTimingFunction: '',
  backgroundClip: '',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  backgroundImage: 'none',
  borderBottomColor: 'rgb(0, 0, 0)',
  borderBottomWidth: '0px',
  borderLeftColor: 'rgb(0, 0, 0)',
  borderLeftWidth: '0px',
  borderRadius: '0px',
  borderRightColor: 'rgb(0, 0, 0)',
  borderRightWidth: '0px',
  borderTopColor: 'rgb(0, 0, 0)',
  borderTopWidth: '0px',
  bottom: 'auto',
  boxShadow: 'none',
  color: 'rgb(0, 0, 0)',
  display: '',
  fontFamily: '',
  fontSize: '16px',
  fontStyle: 'normal',
  fontWeight: '400',
  height: '',
  hyphens: 'manual',
  inset: '',
  left: 'auto',
  letterSpacing: 'normal',
  lineHeight: 'normal',
  marginBottom: '0px',
  marginLeft: '0px',
  marginRight: '0px',
  marginTop: '0px',
  outlineColor: 'rgb(0, 0, 0)',
  outlineStyle: 'none',
  outlineWidth: '0px',
  overflow: 'visible',
  overflowX: 'visible',
  overflowY: 'visible',
  paddingBottom: '0px',
  paddingLeft: '0px',
  paddingRight: '0px',
  paddingTop: '0px',
  position: 'static',
  right: 'auto',
  textAlign: 'start',
  textTransform: 'none',
  top: 'auto',
  transitionProperty: '',
  transitionTimingFunction: '',
  visibility: 'visible',
  webkitBackgroundClip: '',
  webkitHyphens: 'manual',
  width: '',
};

const STATIC_PROP_MAP = {
  '-webkit-background-clip': 'webkitBackgroundClip',
  '-webkit-hyphens': 'webkitHyphens',
  'animation-name': 'animationName',
  'animation-timing-function': 'animationTimingFunction',
  'background-clip': 'backgroundClip',
  'background-color': 'backgroundColor',
  'background-image': 'backgroundImage',
  'border-bottom-color': 'borderBottomColor',
  'border-bottom-width': 'borderBottomWidth',
  'border-left-color': 'borderLeftColor',
  'border-left-width': 'borderLeftWidth',
  'border-radius': 'borderRadius',
  'border-right-color': 'borderRightColor',
  'border-right-width': 'borderRightWidth',
  'border-top-color': 'borderTopColor',
  'border-top-width': 'borderTopWidth',
  bottom: 'bottom',
  'box-shadow': 'boxShadow',
  display: 'display',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-style': 'fontStyle',
  'font-weight': 'fontWeight',
  height: 'height',
  hyphens: 'hyphens',
  inset: 'inset',
  left: 'left',
  'letter-spacing': 'letterSpacing',
  'line-height': 'lineHeight',
  'margin-bottom': 'marginBottom',
  'margin-left': 'marginLeft',
  'margin-right': 'marginRight',
  'margin-top': 'marginTop',
  'outline-color': 'outlineColor',
  'outline-style': 'outlineStyle',
  'outline-width': 'outlineWidth',
  overflow: 'overflow',
  'overflow-x': 'overflowX',
  'overflow-y': 'overflowY',
  'padding-bottom': 'paddingBottom',
  'padding-left': 'paddingLeft',
  'padding-right': 'paddingRight',
  'padding-top': 'paddingTop',
  position: 'position',
  right: 'right',
  'text-align': 'textAlign',
  'text-transform': 'textTransform',
  top: 'top',
  'transition-property': 'transitionProperty',
  'transition-timing-function': 'transitionTimingFunction',
  visibility: 'visibility',
  width: 'width',
};

const STATIC_NAMED_COLORS = {
  black: {a: 1, b: 0, g: 0, r: 0},
  blue: {a: 1, b: 255, g: 0, r: 0},
  gray: {a: 1, b: 128, g: 128, r: 128},
  green: {a: 1, b: 0, g: 128, r: 0},
  grey: {a: 1, b: 128, g: 128, r: 128},
  red: {a: 1, b: 0, g: 0, r: 255},
  silver: {a: 1, b: 192, g: 192, r: 192},
  transparent: {a: 0, b: 0, g: 0, r: 0},
  white: {a: 1, b: 255, g: 255, r: 255},
};

const splitCssList = (value) => {
  const parts = [];
  let depth = 0;
  let quote = '';
  let start = 0;

  for (let index = 0; index < value.length; index++) {
    const ch = value[index];

    if (quote) {
      if (ch === quote && value[index - 1] !== '\\') quote = '';
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);

  return parts;
};

const splitCssTokens = (value) => {
  const tokens = [];
  let current = '';
  let depth = 0;
  let quote = '';

  for (let index = 0; index < value.length; index++) {
    const ch = value[index];

    if (quote) {
      current += ch;
      if (ch === quote && value[index - 1] !== '\\') quote = '';
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === '(') {
      depth++;
      current += ch;
      continue;
    }

    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }

    if (/\s/.test(ch) && depth === 0) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);

  return tokens;
};

const cssPropertyToCamel = (property) => {
  if (!property) return property;
  const mapped = STATIC_PROP_MAP[property];
  if (mapped) return mapped;

  return property.replaceAll(/-([a-z])/g, (_m, ch) => ch.toUpperCase());
};

const staticColorToCss = (c) => {
  if (!c) return '';
  if (c.a != null && c.a < 1)
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${Number(c.a.toFixed(3))})`;

  return `rgb(${c.r}, ${c.g}, ${c.b})`;
};

const parseStaticColor = (value) => {
  const parsed = parseAnyColor(value);
  if (parsed) return parsed;
  const named =
    STATIC_NAMED_COLORS[
      String(value || '')
        .trim()
        .toLowerCase()
    ];

  return named ? {...named} : null;
};

const extractStaticColor = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^var\(/i.test(raw)) return raw;
  const colorLike = raw.match(
    /(?:rgba?\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)|lch\([^)]+\)|lab\([^)]+\)|hsla?\([^)]+\)|hwb\([^)]+\)|#[0-9a-f]{3,8}\b|\b(?:black|white|gray|grey|silver|red|green|blue|transparent)\b)/i
  );
  if (!colorLike) return '';

  return colorLike[0];
};

const normalizeStaticCssValue = (
  property,
  value,
  customProps,
  parentStyle,
  currentStyle = null
) => {
  let resolved = resolveVarRefs(String(value || '').trim(), customProps);
  if (resolved === 'inherit')
    return parentStyle?.[property] || STATIC_DEFAULT_STYLE[property] || '';
  const isModernBorderColor =
    /^border[A-Z][a-z]+Color$/.test(property) &&
    /^(?:oklch|oklab|lch|lab|hsl|hwb)\(/i.test(resolved);

  if (
    !isModernBorderColor &&
    (/color$/i.test(property) ||
      property === 'color' ||
      property === 'backgroundColor')
  ) {
    const parsed = parseStaticColor(resolved);
    if (parsed) resolved = staticColorToCss(parsed);
  }

  if (property === 'fontSize') {
    const base = Number.parseFloat(parentStyle?.fontSize) || 16;
    const px = resolveLengthPx(resolved, base);
    if (px != null) resolved = `${px}px`;
  }

  if (property === 'letterSpacing') {
    const base =
      Number.parseFloat(currentStyle?.fontSize || parentStyle?.fontSize) || 16;
    const px = resolveLengthPx(resolved, base);
    if (px != null) resolved = `${px}px`;
  }

  if (property === 'lineHeight' && resolved !== 'normal') {
    const base =
      Number.parseFloat(currentStyle?.fontSize || parentStyle?.fontSize) || 16;
    const px = resolveLengthPx(resolved, base);
    if (px != null) resolved = `${px}px`;
  }

  return resolved;
};

const expandStaticBoxValues = (tokens) => {
  if (tokens.length === 0) return ['0px', '0px', '0px', '0px'];
  if (tokens.length === 1) return [tokens[0], tokens[0], tokens[0], tokens[0]];
  if (tokens.length === 2) return [tokens[0], tokens[1], tokens[0], tokens[1]];
  if (tokens.length === 3) return [tokens[0], tokens[1], tokens[2], tokens[1]];

  return [tokens[0], tokens[1], tokens[2], tokens[3]];
};

const parseStaticBorder = (value) => {
  const tokens = splitCssTokens(value);
  let color = '';
  let width = '';

  for (const token of tokens) {
    if (!width && /^-?[\d.]+(?:px|rem|em|%)$/.test(token)) width = token;
    if (!color) color = extractStaticColor(token);
  }

  return {color, width};
};

const parseStaticFont = (value) => {
  const out = [];
  const slashParts = value.match(
    /(?:^|\s)([\d.]+(?:px|rem|em|%))(?:\/([^\s]+))?/
  );
  if (/\bitalic\b/i.test(value)) out.push(['fontStyle', 'italic']);
  const weight = value.match(/\b([1-9]00|bold|normal|lighter|bolder)\b/i);
  if (weight) out.push(['fontWeight', weight[1]]);

  if (slashParts) {
    out.push(['fontSize', slashParts[1]]);
    if (slashParts[2]) out.push(['lineHeight', slashParts[2]]);
    const familyStart = value.indexOf(slashParts[0]) + slashParts[0].length;
    const family = value.slice(familyStart).trim();
    if (family) out.push(['fontFamily', family]);
  }

  return out;
};

const parseStaticTransition = (value) => {
  const props = [];
  const timings = [];

  for (const item of splitCssList(value)) {
    const tokens = splitCssTokens(item);
    const timing = tokens.find((token) =>
      /^(?:ease|linear|step-|cubic-bezier\()/i.test(token)
    );
    if (timing) timings.push(timing);
    const property = tokens.find(
      (token) =>
        /^[a-z-]+$/i.test(token) &&
        !/^(?:ease|linear|infinite|alternate|forwards|backwards|both|normal|none)$/.test(
          token
        ) &&
        !token.endsWith('s')
    );
    if (property) props.push(property);
  }

  return {
    property: props.join(', '),
    timing: timings.join(', '),
  };
};

const parseStaticAnimation = (value) => {
  const names = [];
  const timings = [];

  for (const item of splitCssList(value)) {
    const tokens = splitCssTokens(item);
    const timing = tokens.find((token) =>
      /^(?:ease|linear|step-|cubic-bezier\()/i.test(token)
    );
    if (timing) timings.push(timing);
    const name = tokens.find(
      (token) =>
        /^[a-z_-][\w-]*$/i.test(token) &&
        !/^(?:ease|linear|infinite|alternate|forwards|backwards|both|normal|none|running|paused)$/.test(
          token
        )
    );
    if (name) names.push(name);
  }

  return {
    name: names.join(', '),
    timing: timings.join(', '),
  };
};

const expandStaticDeclaration = (property, value) => {
  const p = property.toLowerCase();
  const v = String(value || '').trim();
  if (!v) return [];
  if (p.startsWith('--')) return [[p, v]];

  if (p === 'background') {
    const out = [];
    const hasImage = /gradient|url\(/i.test(v);
    if (hasImage) out.push(['backgroundImage', v]);
    const beforeImage =
      hasImage ?
        v.split(
          /(?:repeating-)?(?:linear|radial|conic)-gradient\(|url\(/i,
          1
        )[0]
      : v;
    const color = extractStaticColor(hasImage ? beforeImage : v);
    if (color) out.push(['backgroundColor', color]);

    return out;
  }

  if (p === 'border') {
    const parsed = parseStaticBorder(v);
    const out = [];

    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parsed.width) out.push([`border${side}Width`, parsed.width]);
      if (parsed.color) out.push([`border${side}Color`, parsed.color]);
    }

    return out;
  }

  if (p === 'outline') {
    // `outline` shorthand: width | style | color, in any order. Reuse the
    // border parser for width + color, then sniff a style keyword from the
    // tokens (solid|dashed|...). `outline: 0` (single-token zero) zeros
    // the width and effectively hides the outline.
    const tokens = splitCssTokens(v);
    const parsed = parseStaticBorder(v);
    const styleToken = tokens.find((t) =>
      /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/i.test(
        t
      )
    );
    const out = [];
    if (parsed.width) out.push(['outlineWidth', parsed.width]);
    if (parsed.color) out.push(['outlineColor', parsed.color]);
    if (styleToken) out.push(['outlineStyle', styleToken.toLowerCase()]);

    // `outline: 0` with no other tokens: explicit zero width.
    if (!parsed.width && /^0(?:px|rem|em|%)?$/.test(v.trim())) {
      out.push(['outlineWidth', '0px']);
    }

    return out;
  }
  const sideMatch = p.match(/^border-(top|right|bottom|left)$/);

  if (sideMatch) {
    const parsed = parseStaticBorder(v);
    const side = sideMatch[1][0].toUpperCase() + sideMatch[1].slice(1);

    return [
      ...(parsed.width ? [[`border${side}Width`, parsed.width]] : []),
      ...(parsed.color ? [[`border${side}Color`, parsed.color]] : []),
    ];
  }

  if (p === 'border-width') {
    const vals = expandStaticBoxValues(splitCssTokens(v));

    return [
      ['borderTopWidth', vals[0]],
      ['borderRightWidth', vals[1]],
      ['borderBottomWidth', vals[2]],
      ['borderLeftWidth', vals[3]],
    ];
  }

  if (p === 'border-color') {
    const vals = expandStaticBoxValues(splitCssTokens(v));

    return [
      ['borderTopColor', vals[0]],
      ['borderRightColor', vals[1]],
      ['borderBottomColor', vals[2]],
      ['borderLeftColor', vals[3]],
    ];
  }

  if (p === 'padding') {
    const vals = expandStaticBoxValues(splitCssTokens(v));

    return [
      ['paddingTop', vals[0]],
      ['paddingRight', vals[1]],
      ['paddingBottom', vals[2]],
      ['paddingLeft', vals[3]],
    ];
  }

  if (p === 'margin') {
    const vals = expandStaticBoxValues(splitCssTokens(v));

    return [
      ['marginTop', vals[0]],
      ['marginRight', vals[1]],
      ['marginBottom', vals[2]],
      ['marginLeft', vals[3]],
    ];
  }
  if (p === 'font') return parseStaticFont(v);

  if (p === 'transition') {
    const parsed = parseStaticTransition(v);

    return [
      ...(parsed.property ? [['transitionProperty', parsed.property]] : []),
      ...(parsed.timing ? [['transitionTimingFunction', parsed.timing]] : []),
    ];
  }

  if (p === 'animation') {
    const parsed = parseStaticAnimation(v);

    return [
      ...(parsed.name ? [['animationName', parsed.name]] : []),
      ...(parsed.timing ? [['animationTimingFunction', parsed.timing]] : []),
    ];
  }
  const mapped = cssPropertyToCamel(p);

  if (
    STATIC_DEFAULT_STYLE[mapped] != null ||
    STATIC_INHERITED_PROPS.has(mapped)
  ) {
    return [[mapped, v]];
  }

  return [];
};

const compareStaticPriority = (a, b) => {
  if (!a) return true;
  if (!!b.important !== !!a.important) return !!b.important;
  if (!!b.inline !== !!a.inline) return !!b.inline;

  for (let index = 0; index < 3; index++) {
    if ((b.specificity[index] || 0) !== (a.specificity[index] || 0)) {
      return (b.specificity[index] || 0) > (a.specificity[index] || 0);
    }
  }

  return b.order >= a.order;
};

const staticSpecificity = (selector) => {
  const noWhere = selector.replaceAll(/:where\([^)]*\)/g, '');
  const ids = (noWhere.match(/#[\w-]+/g) || []).length;
  const classes = (
    noWhere.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) || []
  ).length;
  const stripped = noWhere
    .replaceAll(/#[\w-]+/g, ' ')
    .replaceAll(/\.[\w-]+|\[[^\]]+\]|:{1,2}[\w-]+(?:\([^)]*\))?/g, ' ')
    .replaceAll(/[*>+~(),]/g, ' ');
  const types = (stripped.match(/\b[a-zA-Z][\w-]*\b/g) || []).length;

  return [ids, classes, types];
};

const applyStaticDeclaration = (specified, node, property, value, meta) => {
  let map = specified.get(node);

  if (!map) {
    map = new Map();
    specified.set(node, map);
  }

  for (const [expandedProperty, expandedValue] of expandStaticDeclaration(
    property,
    value
  )) {
    const existing = map.get(expandedProperty);
    const next = {...meta, prop: expandedProperty, value: expandedValue};
    if (compareStaticPriority(existing, next)) map.set(expandedProperty, next);
  }
};

const parseStaticStyleAttribute = (styleText, orderBase = 0) => {
  const decls = [];

  for (const part of String(styleText || '').split(';')) {
    const index = part.indexOf(':');
    if (index <= 0) continue;
    const property = part.slice(0, index).trim();
    let value = part.slice(index + 1).trim();
    const important = /!important\s*$/i.test(value);
    value = value.replace(/\s*!important\s*$/i, '').trim();
    decls.push({
      important,
      order: orderBase + decls.length,
      prop: property,
      value,
    });
  }

  return decls;
};

const collectStaticCssRules = (cssText, csstree) => {
  const rules = [];
  let ast;

  try {
    ast = csstree.parse(cssText, {
      parseCustomProperty: false,
      parseValue: true,
      positions: false,
    });
  } catch {
    return rules;
  }
  let order = 0;

  const walkList = (list, atRuleStack = []) => {
    list?.forEach?.((node) => {
      if (node.type === 'Rule' && node.block) {
        if (atRuleStack.some((name) => /keyframes$/i.test(name))) return;
        const selectorText = csstree.generate(node.prelude).trim();
        const declarations = [];
        node.block.children?.forEach?.((child) => {
          if (child.type !== 'Declaration') return;
          declarations.push({
            important: !!child.important,
            prop: child.property,
            value: csstree.generate(child.value).trim(),
          });
        });

        for (const selector of splitCssList(selectorText)) {
          if (selector)
            rules.push({
              declarations,
              order: order++,
              selector,
              specificity: staticSpecificity(selector),
            });
        }

        return;
      }

      if (node.type === 'Atrule' && node.block) {
        const name = String(node.name || '').toLowerCase();

        if (name === 'media' || name === 'supports' || name === 'layer') {
          walkList(node.block.children, [...atRuleStack, name]);
        }
      }
    });
  };
  walkList(ast.children);

  return rules;
};

class StaticDocument {
  get body() {
    return this.querySelector('body');
  }

  get documentElement() {
    return this.querySelector('html');
  }

  constructor(root, modules) {
    this.root = root;
    this.selectAll = modules.selectAll;
    this.selectOne = modules.selectOne;
    this.is = modules.is;
    this.domutils = modules.domutils;
    this._wrappers = new WeakMap();
    this._styleMap = new WeakMap();
  }

  getStyle(element) {
    return this._styleMap.get(element.node) || makeStaticStyle();
  }

  querySelector(selector) {
    try {
      const found = this.selectOne(selector, this.root.children || []);

      return found ? this.wrap(found) : null;
    } catch {
      return null;
    }
  }

  querySelectorAll(selector) {
    try {
      return this.selectAll(selector, this.root.children || []).map((node) =>
        this.wrap(node)
      );
    } catch {
      return [];
    }
  }

  setStyle(node, style) {
    this._styleMap.set(node, style);
  }

  wrap(node) {
    let wrapped = this._wrappers.get(node);

    if (!wrapped) {
      wrapped = new StaticElement(node, this);
      this._wrappers.set(node, wrapped);
    }

    return wrapped;
  }
}

class StaticElement {
  get childNodes() {
    return (this.node.children || []).map((child) => {
      if (child.type === 'text')
        return {nodeType: 3, textContent: child.data || ''};
      if (child.type === 'tag') return this._doc.wrap(child);

      return {nodeType: 8, textContent: child.data || ''};
    });
  }

  get children() {
    return (this.node.children || [])
      .filter((child) => child.type === 'tag')
      .map((child) => this._doc.wrap(child));
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  get parentElement() {
    let current = this.node.parent;
    while (current && current.type !== 'tag') current = current.parent;

    return current ? this._doc.wrap(current) : null;
  }

  get previousElementSibling() {
    let current = this.node.prev;
    while (current && current.type !== 'tag') current = current.prev;

    return current ? this._doc.wrap(current) : null;
  }

  get textContent() {
    return this._doc.domutils.textContent(this.node);
  }

  constructor(node, document_) {
    this.node = node;
    this._doc = document_;
    this.nodeType = 1;
    this.tagName = String(node.name || '').toUpperCase();
    this.nodeName = this.tagName;
  }

  closest(selector) {
    let current = this.node;

    while (current && current.type === 'tag') {
      try {
        if (this._doc.is(current, selector)) return this._doc.wrap(current);
      } catch {
        return null;
      }
      current = current.parent;
      while (current && current.type !== 'tag') current = current.parent;
    }

    return null;
  }

  contains(other) {
    let current = other?.node || null;

    while (current) {
      if (current === this.node) return true;
      current = current.parent;
    }

    return false;
  }

  getAttribute(name) {
    return this.node.attribs?.[name] ?? null;
  }

  querySelector(selector) {
    try {
      const found = this._doc.selectOne(selector, this.node.children || []);

      return found ? this._doc.wrap(found) : null;
    } catch {
      return null;
    }
  }

  querySelectorAll(selector) {
    try {
      return this._doc
        .selectAll(selector, this.node.children || [])
        .map((node) => this._doc.wrap(node));
    } catch {
      return [];
    }
  }
}

const makeStaticStyle = (values = {}) => {
  const style = {...STATIC_DEFAULT_STYLE, ...values};

  style.getPropertyValue = (property) => {
    const key = cssPropertyToCamel(property);

    return style[key] || style[property] || '';
  };

  return style;
};

const buildStaticWindow = (staticDocument) => ({
  document: staticDocument,
  getComputedStyle: (element) => staticDocument.getStyle(element),
});

const collectStaticCssText = (root, fileDir, profile, filePath, modules) => {
  const styleTexts = [];

  for (const styleElement of modules.selectAll('style', root.children || [])) {
    styleTexts.push(modules.domutils.textContent(styleElement));
  }
  const links = modules.selectAll('link', root.children || []);

  for (const link of links) {
    const rel = link.attribs?.rel || '';
    const href = link.attribs?.href || '';
    if (!/\bstylesheet\b/i.test(rel) || !href || /^(https?:)?\/\//i.test(href))
      continue;
    const cssPath = path.resolve(fileDir, href);

    try {
      const css = profileStep(
        profile,
        {
          detail: href,
          engine: 'static-html',
          phase: 'preprocess',
          ruleId: 'inline-linked-stylesheet',
          target: filePath,
        },
        () => fs.readFileSync(cssPath, 'utf-8')
      );
      styleTexts.push(css);
    } catch {
      /* skip unreadable */
    }
  }

  return styleTexts.join('\n');
};

const buildStaticStyleMap = (
  root,
  staticDocument,
  cssText,
  modules,
  profile,
  filePath
) => {
  const specified = new Map();
  const allNodes = modules.selectAll('*', root.children || []);
  const rules = profileStep(
    profile,
    {
      engine: 'static-html',
      phase: 'parse-css',
      ruleId: 'css-rules',
      target: filePath,
    },
    () => collectStaticCssRules(cssText, modules.csstree)
  );

  profileStep(
    profile,
    {
      engine: 'static-html',
      phase: 'selector-match',
      ruleId: 'css-selectors',
      target: filePath,
    },
    () => {
      for (const rule of rules) {
        let matched;

        try {
          matched = modules.selectAll(rule.selector, root.children || []);
        } catch {
          recordProfileEvent(profile, {
            detail: rule.selector,
            engine: 'static-html',
            findings: 0,
            ms: 0,
            phase: 'selector-match',
            ruleId: 'unsupported-selector',
            target: filePath,
          });
          continue;
        }

        for (const node of matched) {
          for (const decl of rule.declarations) {
            applyStaticDeclaration(specified, node, decl.prop, decl.value, {
              important: decl.important,
              inline: false,
              order: rule.order,
              specificity: rule.specificity,
            });
          }
        }
      }

      let inlineOrder = rules.length + 1;

      for (const node of allNodes) {
        const styleText = node.attribs?.style;
        if (!styleText) continue;

        for (const decl of parseStaticStyleAttribute(styleText, inlineOrder)) {
          applyStaticDeclaration(specified, node, decl.prop, decl.value, {
            important: decl.important,
            inline: true,
            order: decl.order,
            specificity: [1, 0, 0],
          });
        }
        inlineOrder += 1000;
      }
    }
  );

  const computeNode = (node, parentStyle = null, parentCustom = new Map()) => {
    const specifiedMap = specified.get(node) || new Map();
    const customProps = new Map(parentCustom);

    for (const [property, decl] of specifiedMap) {
      if (property.startsWith('--'))
        customProps.set(property, resolveVarRefs(decl.value, customProps));
    }
    const values = {};

    for (const property of Object.keys(STATIC_DEFAULT_STYLE)) {
      if (
        STATIC_INHERITED_PROPS.has(property) &&
        parentStyle?.[property] != null
      )
        values[property] = parentStyle[property];
      else values[property] = STATIC_DEFAULT_STYLE[property];
    }

    for (const [property, decl] of specifiedMap) {
      if (property.startsWith('--')) continue;
      values[property] = normalizeStaticCssValue(
        property,
        decl.value,
        customProps,
        parentStyle,
        values
      );
    }
    const style = makeStaticStyle(values);
    staticDocument.setStyle(node, style);

    for (const child of node.children || []) {
      if (child.type === 'tag') computeNode(child, style, customProps);
    }
  };

  profileStep(
    profile,
    {
      engine: 'static-html',
      phase: 'cascade',
      ruleId: 'compute-styles',
      target: filePath,
    },
    () => {
      for (const child of root.children || []) {
        if (child.type === 'tag') computeNode(child);
      }
    }
  );
};

export {
  applyStaticDeclaration,
  BORDER_SHORTHAND_RE,
  buildBorderOverrideMap,
  buildStaticStyleMap,
  buildStaticWindow,
  collectStaticCssRules,
  collectStaticCssText,
  compareStaticPriority,
  cssPropertyToCamel as cssPropToCamel,
  expandStaticBoxValues,
  expandStaticDeclaration,
  extractStaticColor,
  makeStaticStyle,
  NAMED_COLORS,
  normalizeColorForCheck,
  normalizeStaticCssValue,
  parseStaticAnimation,
  parseStaticBorder,
  parseStaticColor,
  parseStaticFont,
  parseStaticStyleAttribute,
  parseStaticTransition,
  splitCssList,
  splitCssTokens,
  STATIC_DEFAULT_STYLE,
  STATIC_INHERITED_PROPS,
  STATIC_NAMED_COLORS,
  STATIC_PROP_MAP,
  staticColorToCss,
  StaticDocument,
  StaticElement,
  staticSpecificity,
  unwrapCssAtLayer,
};
