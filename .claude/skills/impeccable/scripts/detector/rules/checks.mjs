import {
  colorToHex,
  contrastRatio,
  getHue,
  hasChroma,
  isNeutralColor,
  parseGradientColors,
  parseRgb,
  relativeLuminance,
} from '../shared/color.mjs';
import {
  BORDER_SAFE_TAGS,
  GENERIC_FONTS,
  isBrandFontOnOwnDomain,
  KNOWN_SERIF_FONTS,
  OVERUSED_FONTS,
  SAFE_TAGS,
  WCAG_LARGE_BOLD_TEXT_PX,
  WCAG_LARGE_TEXT_PX,
} from '../shared/constants.mjs';

const DETECTOR_IS_BROWSER = typeof window !== 'undefined';

// ─── Section 3: Pure Detection ──────────────────────────────────────────────

const checkBorders = (tag, widths, colors, radius) => {
  if (BORDER_SAFE_TAGS.has(tag)) return [];
  const findings = [];
  const sides = ['Top', 'Right', 'Bottom', 'Left'];

  for (const side of sides) {
    const w = widths[side];
    if (w < 1 || isNeutralColor(colors[side])) continue;

    const otherSides = sides.filter((s) => s !== side);
    const maxOther = Math.max(...otherSides.map((s) => widths[s]));
    if (!(w >= 2 && (maxOther <= 1 || w >= maxOther * 2))) continue;

    const sn = side.toLowerCase();
    const isSide = side === 'Left' || side === 'Right';

    if (isSide) {
      if (radius > 0)
        findings.push({
          id: 'side-tab',
          snippet: `border-${sn}: ${w}px + border-radius: ${radius}px`,
        });
      else if (w >= 3)
        findings.push({id: 'side-tab', snippet: `border-${sn}: ${w}px`});
    } else if (radius > 0 && w >= 2)
      findings.push({
        id: 'border-accent-on-rounded',
        snippet: `border-${sn}: ${w}px + border-radius: ${radius}px`,
      });
  }

  return findings;
};

// Returns true if the given text is composed entirely of emoji characters
// (plus whitespace / variation selectors). Emojis render as multicolor glyphs
// regardless of CSS `color`, so contrast checks against the element's text
// color are meaningless for these nodes.
const EMOJI_CHAR_RE =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/u;
const EMOJI_CHARS_GLOBAL =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu;

const isEmojiOnlyText = (text) => {
  if (!text) return false;
  if (!EMOJI_CHAR_RE.test(text)) return false;

  return text.replaceAll(EMOJI_CHARS_GLOBAL, '').trim() === '';
};

const checkColors = (options) => {
  const {
    bgClip,
    bgColor,
    bgImage,
    classList,
    effectiveBg,
    effectiveBgStops,
    fontSize,
    fontWeight,
    hasDirectText,
    isEmojiOnly,
    tag,
    textColor,
  } = options;

  if (SAFE_TAGS.has(tag)) {
    // Exception for <a> and <button> elements styled as buttons. SAFE_TAGS
    // exists to suppress contrast noise on inline links and unstyled controls,
    // where the element has no own background and the contrast against the
    // ancestor surface is already the intended visual. When the element has
    // its own opaque background and direct text, it is a styled button — and
    // contrast on its own surface is a real, frequent bug worth flagging.
    const isStyledButton =
      (tag === 'a' || tag === 'button') &&
      hasDirectText &&
      bgColor &&
      bgColor.a > 0.5;
    if (!isStyledButton) return [];
  }
  const findings = [];

  if (hasDirectText && textColor && !isEmojiOnly) {
    // Run background-dependent checks against either a solid bg or, if the
    // ancestor is a gradient, against every gradient stop (use the worst case).
    const bgs =
      effectiveBg ? [effectiveBg]
      : effectiveBgStops && effectiveBgStops.length > 0 ? effectiveBgStops
      : null;

    if (bgs) {
      // Gray on colored background — flag if every stop is chromatic
      const textLum = relativeLuminance(textColor);
      const isGray =
        !hasChroma(textColor, 20) && textLum > 0.05 && textLum < 0.85;

      if (isGray && bgs.every((b) => hasChroma(b, 40))) {
        const bgLabel =
          effectiveBg ?
            colorToHex(effectiveBg)
          : `gradient(${bgs.map(colorToHex).join(', ')})`;
        findings.push({
          id: 'gray-on-color',
          snippet: `text ${colorToHex(textColor)} on bg ${bgLabel}`,
        });
      }

      // Low contrast (WCAG AA) — worst case across all bg stops
      const ratios = bgs.map((b) => contrastRatio(textColor, b));
      let worstIndex = 0;
      for (let index = 1; index < ratios.length; index++)
        if (ratios[index] < ratios[worstIndex]) worstIndex = index;
      const ratio = ratios[worstIndex];
      const isLargeText =
        fontSize >= WCAG_LARGE_TEXT_PX ||
        (fontSize >= WCAG_LARGE_BOLD_TEXT_PX && fontWeight >= 700);
      const threshold = isLargeText ? 3 : 4.5;

      if (ratio < threshold) {
        // Skip the false-positive class where text has alpha < 1 AND we
        // couldn't find an opaque ancestor (effectiveBg is null, we're
        // comparing against gradient-stop fallback). In jsdom mode the
        // detector can't resolve `var(--X)` color tokens, so a dark
        // section sitting between the text and the body's decorative
        // gradient is invisible to us — we end up measuring contrast
        // against the body's paper-grain noise instead of the real
        // local bg. Real low-contrast bugs use alpha=1 and have a
        // resolvable opaque ancestor; semi-transparent Tailwind tokens
        // like `text-paper/60` on `bg-ink` sections are the FP pattern.
        const isAlphaFallbackFP =
          !DETECTOR_IS_BROWSER &&
          !effectiveBg &&
          textColor.a != null &&
          textColor.a < 1;

        if (!isAlphaFallbackFP) {
          findings.push({
            id: 'low-contrast',
            snippet: `${ratio.toFixed(1)}:1 (need ${threshold}:1) — text ${colorToHex(textColor)} on ${colorToHex(bgs[worstIndex])}`,
          });
        }
      }
    }

    // AI palette: purple/violet on headings
    if (hasChroma(textColor, 50)) {
      const hue = getHue(textColor);

      if (
        hue >= 260 &&
        hue <= 310 &&
        (['h1', 'h2', 'h3'].includes(tag) || fontSize >= 20)
      ) {
        findings.push({
          id: 'ai-color-palette',
          snippet: `Purple/violet text (${colorToHex(textColor)}) on heading`,
        });
      }
    }
  }

  // Gradient text
  if (bgClip === 'text' && bgImage && bgImage.includes('gradient')) {
    findings.push({
      id: 'gradient-text',
      snippet: 'background-clip: text + gradient',
    });
  }

  // Tailwind class checks
  if (classList) {
    const classString =
      typeof classList === 'string' ? classList : [...classList].join(' ');

    const grayMatch = classString.match(
      /\btext-(?:gray|slate|zinc|neutral|stone)-\d+\b/
    );
    const colorBgMatch = classString.match(
      /\bbg-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/
    );

    if (grayMatch && colorBgMatch) {
      findings.push({
        id: 'gray-on-color',
        snippet: `${grayMatch[0]} on ${colorBgMatch[0]}`,
      });
    }

    if (
      /\bbg-clip-text\b/.test(classString) &&
      /\bbg-gradient-to-/.test(classString)
    ) {
      findings.push({
        id: 'gradient-text',
        snippet: 'bg-clip-text + bg-gradient (Tailwind)',
      });
    }

    const purpleText = classString.match(
      /\btext-(?:purple|violet|indigo)-\d+\b/
    );

    if (
      purpleText &&
      (['h1', 'h2', 'h3'].includes(tag) ||
        /\btext-(?:[2-9]xl)\b/.test(classString))
    ) {
      findings.push({
        id: 'ai-color-palette',
        snippet: `${purpleText[0]} on heading`,
      });
    }

    if (
      /\bfrom-(?:purple|violet|indigo)-\d+\b/.test(classString) &&
      /\bto-(?:purple|violet|indigo|blue|cyan|pink|fuchsia)-\d+\b/.test(
        classString
      )
    ) {
      findings.push({
        id: 'ai-color-palette',
        snippet: 'Purple/violet gradient (Tailwind)',
      });
    }
  }

  return findings;
};

const isCardLikeFromProps = (hasShadow, hasBorder, hasRadius, hasBg) => {
  if (!hasShadow && !hasBorder) return false;

  return hasRadius || hasBg;
};

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// Pure check: given a heading and metrics about its previousElementSibling,
// decide if the sibling is the canonical "icon-tile-stacked-above-heading" shape.
//
// Triggers when ALL of the following hold for the sibling:
//   • size 32–128px on both axes (not too small, not a hero image)
//   • aspect ratio 0.7–1.4 (squarish — excludes wide thumbnails / pill badges)
//   • has a non-transparent background-color, background-image, OR a visible border
//     (covers solid colors, white-with-border, gradients — anything that visually
//      defines a tile)
//   • border-radius < width/2 (excludes round avatars; rounded squares pass)
//   • contains an <svg> or icon-class <i> element that's smaller than the tile
//   • the tile sits above the heading (its bottom is above the heading's top)
const checkIconTile = (options) => {
  const {
    hasIconChild,
    headingTag,
    headingText,
    headingTop,
    iconChildWidth,
    siblingBgColor,
    siblingBgImage,
    siblingBorderRadius,
    siblingBorderWidth,
    siblingBottom,
    siblingHeight,
    siblingTag,
    siblingWidth,
  } = options;
  if (!HEADING_TAGS.has(headingTag)) return [];
  if (!siblingTag) return [];
  // Don't recurse into nested headings (e.g. h2 above h3 in a section header)
  if (HEADING_TAGS.has(siblingTag)) return [];

  // Size window: 32–128px on each axis
  if (!(siblingWidth >= 32 && siblingWidth <= 128)) return [];
  if (!(siblingHeight >= 32 && siblingHeight <= 128)) return [];

  // Squarish aspect ratio
  const ratio = siblingWidth / siblingHeight;
  if (ratio < 0.7 || ratio > 1.4) return [];

  // Must have something that visually defines the tile
  const bgVisible =
    (siblingBgColor && siblingBgColor.a > 0.1) ||
    (siblingBgImage && siblingBgImage !== 'none' && siblingBgImage !== '');
  const borderVisible = siblingBorderWidth > 0;
  if (!bgVisible && !borderVisible) return [];

  // Exclude circles (avatars). Rounded squares pass.
  if (siblingBorderRadius >= siblingWidth / 2) return [];

  // Must contain an icon element smaller than the tile
  if (!hasIconChild) return [];
  if (iconChildWidth && iconChildWidth >= siblingWidth * 0.95) return [];

  // Vertical stacking: tile must end above where the heading starts.
  // (Allow the check to skip when both top/bottom are 0 — jsdom layout case.)
  if (headingTop && siblingBottom && siblingBottom > headingTop + 4) return [];

  const text = (headingText || '').trim().slice(0, 60);

  return [
    {
      id: 'icon-tile-stack',
      snippet: `${Math.round(siblingWidth)}x${Math.round(siblingHeight)}px icon tile above ${headingTag} "${text}"`,
    },
  ];
};

// Resolve the primary (non-generic) face from a font-family string and return
// whether the resolved primary is serif. Two paths:
//   1. Primary face is in KNOWN_SERIF_FONTS → serif.
//   2. Primary face is unknown but the stack ends in the generic `serif`
//      token → treat as serif. Authors who declare `font-family: 'X', serif`
//      almost always have a serif primary; a sans declared with a serif
//      fallback is a code smell, not the common case.
// Returns { primary, isSerif } so the snippet can name the face.
const resolveSerif = (fontFamily) => {
  if (!fontFamily) return {isSerif: false, primary: null};
  const tokens = fontFamily.split(',').map((f) =>
    f
      .trim()
      .replaceAll(/^['"]|['"]$/g, '')
      .toLowerCase()
  );
  const primary = tokens.find((f) => f && !GENERIC_FONTS.has(f)) || null;
  if (!primary) return {isSerif: false, primary: null};
  if (KNOWN_SERIF_FONTS.has(primary)) return {isSerif: true, primary};
  if (tokens.includes('serif')) return {isSerif: true, primary};

  return {isSerif: false, primary};
};

const checkItalicSerif = (options) => {
  const {fontFamily, fontSize, fontStyle, headingText, tag} = options;
  if (fontStyle !== 'italic') return [];
  // Anchor the rule on hero-scale text. h1 is the canonical hero element;
  // h2 ≥ 48px catches the cases where the design demotes the visual hero
  // to an h2 but keeps the size.
  if (tag !== 'h1' && !(tag === 'h2' && fontSize >= 48)) return [];
  if (fontSize < 48) return [];
  const {isSerif, primary} = resolveSerif(fontFamily);
  if (!isSerif) return [];

  const text = (headingText || '').trim().slice(0, 60);

  return [
    {
      id: 'italic-serif-display',
      snippet: `italic serif ${tag} (${primary || 'serif'}) at ${Math.round(fontSize)}px "${text}"`,
    },
  ];
};

// Color saturation check. Returns true when the color has visible
// chroma — i.e., it's an "accent color" rather than near-neutral.
// Handles rgb()/rgba(), #hex, oklch(), and hsl(). var() refs are
// expected to be pre-resolved by the caller.
const isAccentColor = (cssColor) => {
  if (!cssColor) return false;
  const s = String(cssColor).trim();
  // rgb / rgba — direct channel-distance check.
  const rgbM = /rgba?\(\s*(\d+)\s*,?\s+|\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(
    s.replace(/rgba?\(\s*/, 'rgb(').replaceAll(',', ', ')
  );
  const rgbStrict = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);

  if (rgbStrict) {
    const b = +rgbStrict[3];
    const g = +rgbStrict[2];
    const r = +rgbStrict[1];

    return Math.max(r, g, b) - Math.min(r, g, b) >= 40;
  }
  // #hex — 3, 4, 6, or 8 digit.
  const hexM = /^#([0-9a-f]{3,8})\b/i.exec(s);

  if (hexM) {
    let h = hexM[1];
    if (h.length === 3 || h.length === 4)
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
        .slice(0, 6);
    else h = h.slice(0, 6);

    if (h.length === 6) {
      const r = Number.parseInt(h.slice(0, 2), 16);
      const g = Number.parseInt(h.slice(2, 4), 16);
      const b = Number.parseInt(h.slice(4, 6), 16);

      return Math.max(r, g, b) - Math.min(r, g, b) >= 40;
    }
  }

  // oklch(L C H) — chroma C is what matters. Typical neutral grays
  // have C < 0.02; visible accents are 0.05+. CSS minification can
  // collapse spaces between L% and C ("oklch(43%.15 34)"), so we
  // extract all numbers and take the second rather than matching a
  // strict L-then-whitespace-then-C pattern.
  if (/^oklch\(/i.test(s)) {
    const nums = s.match(/\d*\.\d+|\d+/g);

    if (nums && nums.length >= 2) {
      const c = Number.parseFloat(nums[1]);

      return !Number.isNaN(c) && c >= 0.05;
    }
  }
  // hsl(H, S%, L%) — saturation > 20% reads as accent.
  const hslM = /hsla?\(\s*[\d.]+\s*,\s*([\d.]+)%/i.exec(s);

  if (hslM) {
    const sat = Number.parseFloat(hslM[1]);

    return !Number.isNaN(sat) && sat >= 20;
  }

  return false;
};

// Sibling-relationship rule. Anchor on a hero-scale h1, look at the
// previousElementSibling, and gate on EITHER the classic tracked-
// uppercase eyebrow OR the modern accent-colored bold eyebrow.
const checkHeroEyebrow = (options) => {
  const {
    headingFontSize,
    headingTag,
    headingText,
    siblingColor,
    siblingFontSize,
    siblingFontWeight,
    siblingLetterSpacing,
    siblingTag,
    siblingText,
    siblingTextTransform,
  } = options;
  if (headingTag !== 'h1') return [];
  // We previously gated on headingFontSize >= 48 to anchor "hero scale".
  // But modern hero h1s use clamp() / vw / var(--text-*), none of which
  // jsdom can resolve — the computed value comes back as "2em" or
  // "var(--text-9xl)" and parseFloat returns 2 or NaN. The gate fails
  // on virtually every Tailwind v4 / framework build. The other gates
  // (sibling text 2-60 chars, font-size ≤ 14px, accent-bold OR
  // tracked-caps) are tight enough to avoid false positives on non-
  // hero h1s — a tiny tan label directly above any h1 is the
  // antipattern regardless of how big the h1 ends up.
  if (!siblingTag) return [];
  // An h2 above an h1 is a different anti-pattern (heading hierarchy / dual
  // headings) — never an eyebrow.
  if (HEADING_TAGS.has(siblingTag)) return [];

  const text = (siblingText || '').trim();
  if (text.length < 2 || text.length > 60) return [];
  if (!(siblingFontSize > 0 && siblingFontSize <= 14)) return [];

  // Branch A: classic tracked-uppercase eyebrow.
  const isUppercased =
    siblingTextTransform === 'uppercase' ||
    (/[A-Z]/.test(text) && !/[a-z]/.test(text));
  const isClassicTracked = isUppercased && siblingLetterSpacing >= 1.6;

  // Branch B: modern accent-bold eyebrow — sentence case, low
  // tracking, but bold + accent-colored. The style choices changed;
  // the pattern is the same kicker-above-headline anti-pattern.
  const weight = Number(siblingFontWeight) || 400;
  const isAccentBold = weight >= 700 && isAccentColor(siblingColor || '');

  if (!isClassicTracked && !isAccentBold) return [];

  const headingTextSnippet = (headingText || '').trim().slice(0, 60);
  const eyebrowSnippet = text.slice(0, 40);
  const style = isClassicTracked ? 'tracked-caps' : 'accent-bold';

  return [
    {
      id: 'hero-eyebrow-chip',
      snippet: `eyebrow chip (${style}) "${eyebrowSnippet}" above ${headingTag} "${headingTextSnippet}"`,
    },
  ];
};

const checkRepeatedSectionKickers = (options) => {
  const {candidates, minCount = 3} = options;
  if (!Array.isArray(candidates) || candidates.length < minCount) return [];

  return candidates.map((candidate) => ({
    id: 'repeated-section-kickers',
    snippet: `repeated section kicker "${candidate.kickerText}" before ${candidate.headingTag} "${candidate.headingText}" (${candidates.length} on page)`,
  }));
};

const LAYOUT_TRANSITION_PROPS = new Set([
  'height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'width',
]);

const checkMotion = (options) => {
  const {animationName, classList, tag, timingFunctions, transitionProperty} =
    options;
  if (SAFE_TAGS.has(tag)) return [];
  const findings = [];

  // --- Bounce/elastic easing ---
  if (
    animationName &&
    animationName !== 'none' &&
    /bounce|elastic|wobble|jiggle|spring/i.test(animationName)
  ) {
    findings.push({
      id: 'bounce-easing',
      snippet: `animation: ${animationName}`,
    });
  }

  if (classList && /\banimate-bounce\b/.test(classList)) {
    findings.push({id: 'bounce-easing', snippet: 'animate-bounce (Tailwind)'});
  }

  // Check timing functions for overshoot cubic-bezier (y values outside [0, 1])
  if (timingFunctions) {
    const bezierRe =
      /cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/g;
    let m;

    while ((m = bezierRe.exec(timingFunctions)) !== null) {
      const y1 = Number.parseFloat(m[2]);
      const y2 = Number.parseFloat(m[4]);

      if (y1 < -0.1 || y1 > 1.1 || y2 < -0.1 || y2 > 1.1) {
        findings.push({
          id: 'bounce-easing',
          snippet: `cubic-bezier(${m[1]}, ${m[2]}, ${m[3]}, ${m[4]})`,
        });
        break;
      }
    }
  }

  // --- Layout property transition ---
  if (
    transitionProperty &&
    transitionProperty !== 'all' &&
    transitionProperty !== 'none'
  ) {
    const props = transitionProperty
      .split(',')
      .map((p) => p.trim().toLowerCase());
    const layoutFound = props.filter((p) => LAYOUT_TRANSITION_PROPS.has(p));

    if (layoutFound.length > 0) {
      findings.push({
        id: 'layout-transition',
        snippet: `transition: ${layoutFound.join(', ')}`,
      });
    }
  }

  return findings;
};

const checkGlow = (options) => {
  const {boxShadow, effectiveBg} = options;
  if (!boxShadow || boxShadow === 'none') return [];
  if (!effectiveBg) return [];

  // Only flag on dark backgrounds (luminance < 0.1)
  const bgLum = relativeLuminance(effectiveBg);
  if (bgLum >= 0.1) return [];

  // Split multiple shadows (commas not inside parentheses)
  const parts = boxShadow.split(/,(?![^(]*\))/);

  for (const shadow of parts) {
    const colorMatch = shadow.match(/rgba?\([^)]+\)/);
    if (!colorMatch) continue;
    const color = parseRgb(colorMatch[0]);
    if (!color || !hasChroma(color, 30)) continue;

    // Extract px values — in computed style: "color Xpx Ypx BLURpx [SPREADpx]"
    const afterColor = shadow.slice(
      Math.max(0, shadow.indexOf(colorMatch[0]) + colorMatch[0].length)
    );
    const beforeColor = shadow.slice(
      0,
      Math.max(0, shadow.indexOf(colorMatch[0]))
    );
    const pxVals = [
      ...beforeColor.matchAll(/([\d.]+)px/g),
      ...afterColor.matchAll(/([\d.]+)px/g),
    ].map((m) => Number.parseFloat(m[1]));

    // Third value is blur (offset-x, offset-y, blur, [spread])
    if (pxVals.length >= 3 && pxVals[2] > 4) {
      return [
        {
          id: 'dark-glow',
          snippet: `Colored glow (${colorToHex(color)}) on dark background`,
        },
      ];
    }
  }

  return [];
};

/**
 * Regex-on-HTML checks shared between browser and Node page-level detection.
 * These don't need DOM access, just the raw HTML string.
 */
const checkHtmlPatterns = (html) => {
  const findings = [];

  // --- Color ---

  // AI color palette: purple/violet
  const purpleHexRe =
    /#(?:7c3aed|8b5cf6|a855f7|9333ea|7e22ce|6d28d9|6366f1|764ba2|667eea)\b/gi;

  if (purpleHexRe.test(html)) {
    const purpleTextRe =
      /(?:(?:^|;)\s*color\s*:\s*(?:.*?)(?:#(?:7c3aed|8b5cf6|a855f7|9333ea|7e22ce|6d28d9))|gradient.*?#(?:7c3aed|8b5cf6|a855f7|764ba2|667eea))/gi;

    if (purpleTextRe.test(html)) {
      findings.push({
        id: 'ai-color-palette',
        snippet: 'Purple/violet accent colors detected',
      });
    }
  }

  // Gradient text (background-clip: text + gradient)
  const gradientRe = /(?:-webkit-)?background-clip\s*:\s*text/gi;
  let gm;

  while ((gm = gradientRe.exec(html)) !== null) {
    const start = Math.max(0, gm.index - 200);
    const context = html.substring(start, gm.index + gm[0].length + 200);

    if (/gradient/i.test(context)) {
      findings.push({
        id: 'gradient-text',
        snippet: 'background-clip: text + gradient',
      });
      break;
    }
  }

  if (/\bbg-clip-text\b/.test(html) && /\bbg-gradient-to-/.test(html)) {
    findings.push({
      id: 'gradient-text',
      snippet: 'bg-clip-text + bg-gradient (Tailwind)',
    });
  }

  // --- Layout ---

  // Monotonous spacing
  const spacingValues = [];
  const spacingRe =
    /(?:padding|margin)(?:-(?:top|right|bottom|left))?\s*:\s*(\d+)px/gi;
  let sm;

  while ((sm = spacingRe.exec(html)) !== null) {
    const v = Number.parseInt(sm[1], 10);
    if (v > 0 && v < 200) spacingValues.push(v);
  }
  const gapRe = /gap\s*:\s*(\d+)px/gi;

  while ((sm = gapRe.exec(html)) !== null) {
    spacingValues.push(Number.parseInt(sm[1], 10));
  }
  const twSpaceRe =
    /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap)-(\d+)\b/g;

  while ((sm = twSpaceRe.exec(html)) !== null) {
    spacingValues.push(Number.parseInt(sm[1], 10) * 4);
  }
  const remSpacingRe =
    /(?:padding|margin)(?:-(?:top|right|bottom|left))?\s*:\s*([\d.]+)rem/gi;

  while ((sm = remSpacingRe.exec(html)) !== null) {
    const v = Math.round(Number.parseFloat(sm[1]) * 16);
    if (v > 0 && v < 200) spacingValues.push(v);
  }
  const roundedSpacing = spacingValues.map((v) => Math.round(v / 4) * 4);

  if (roundedSpacing.length >= 10) {
    const counts = {};
    for (const v of roundedSpacing) counts[v] = (counts[v] || 0) + 1;
    const maxCount = Math.max(...Object.values(counts));
    const dominantPct = maxCount / roundedSpacing.length;
    const unique = [...new Set(roundedSpacing)].filter((v) => v > 0);

    if (dominantPct > 0.6 && unique.length <= 3) {
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      findings.push({
        id: 'monotonous-spacing',
        snippet: `~${dominant}px used ${maxCount}/${roundedSpacing.length} times (${Math.round(dominantPct * 100)}%)`,
      });
    }
  }

  // --- Motion ---

  // Bounce/elastic animation names
  const bounceRe =
    /animation(?:-name)?\s*:\s*([^;{}]*(?:bounce|elastic|wobble|jiggle|spring)[^;{}]*)/gi;
  const bounceMatch = bounceRe.exec(html);

  if (bounceMatch) {
    const animationToken = bounceMatch[1]
      .split(/[,\s]+/)
      .find((part) => /bounce|elastic|wobble|jiggle|spring/i.test(part));
    findings.push({
      id: 'bounce-easing',
      snippet: `animation: ${animationToken || bounceMatch[1].trim()}`,
    });
  }

  // Overshoot cubic-bezier
  const bezierRe =
    /cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/g;
  let bm;

  while ((bm = bezierRe.exec(html)) !== null) {
    const y1 = Number.parseFloat(bm[2]);
    const y2 = Number.parseFloat(bm[4]);

    if (y1 < -0.1 || y1 > 1.1 || y2 < -0.1 || y2 > 1.1) {
      findings.push({
        id: 'bounce-easing',
        snippet: `cubic-bezier(${bm[1]}, ${bm[2]}, ${bm[3]}, ${bm[4]})`,
      });
      break;
    }
  }

  // Layout property transitions
  const transRe = /transition(?:-property)?\s*:\s*([^;{}]+)/gi;
  let tm;

  while ((tm = transRe.exec(html)) !== null) {
    const value = tm[1].toLowerCase();
    if (/\ball\b/.test(value)) continue;
    const found = value.match(
      /\b(?:(?:max|min)-)?(?:width|height)\b|\bpadding(?:-(?:top|right|bottom|left))?\b|\bmargin(?:-(?:top|right|bottom|left))?\b/gi
    );

    if (found) {
      findings.push({
        id: 'layout-transition',
        snippet: `transition: ${found.join(', ')}`,
      });
      break;
    }
  }

  // --- Dark glow ---

  const darkBgRe =
    /background(?:-color)?\s*:\s*(?:#(?:0[0-9a-f]|1[0-9a-f]|2[0-3])[0-9a-f]{4}\b|#(?:0|1)[0-9a-f]{2}\b|rgb\(\s*(\d{1,2})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\))/gi;
  const twDarkBg = /\bbg-(?:gray|slate|zinc|neutral|stone)-(?:9\d{2}|800)\b/;

  if (darkBgRe.test(html) || twDarkBg.test(html)) {
    const shadowRe = /box-shadow\s*:\s*([^;{}]+)/gi;
    let shm;

    while ((shm = shadowRe.exec(html)) !== null) {
      const value = shm[1];
      const colorMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!colorMatch) continue;
      const [r, g, b] = [+colorMatch[1], +colorMatch[2], +colorMatch[3]];
      if (Math.max(r, g, b) - Math.min(r, g, b) < 30) continue;
      const pxVals = [
        ...value.matchAll(/(\d+)px|(?<![.\d])\b(0)\b(?![.\d])/g),
      ].map((p) => +(p[1] || p[2]));

      if (pxVals.length >= 3 && pxVals[2] > 4) {
        findings.push({
          id: 'dark-glow',
          snippet: `Colored glow (rgb(${r},${g},${b})) on dark page`,
        });
        break;
      }
    }
  }

  // --- Provider tells (gated): repeating-gradient stripes (GPT) ---
  if (/repeating-(?:linear|radial|conic)-gradient\s*\(/i.test(html)) {
    findings.push({
      id: 'repeating-stripes-gradient',
      snippet: 'repeating-gradient decorative stripes',
    });
  }

  // --- Provider tells (gated): two-axis grid-line background (Codex/GPT) ---
  // The Codex grid tell is two hairline `linear-gradient(... <color> 1px,
  // transparent 1px)` layers (one per axis) tiled by a repeating
  // `background-size` cell. Both signals must co-occur in the SAME style block
  // (a CSS rule body or one inline `style="..."`): two hairline stops WITHOUT a
  // tiling background-size is a fixed crosshair, not a grid, and a single
  // hairline is a legitimate ruled line. Scoping to one block also stops
  // unrelated single-axis rules on separate elements from adding up across the
  // page. Count hairlines only inside `background`/`background-image` values so
  // a hairline in an unrelated property (mask-image, border-image) can't stand
  // in for the second axis. Colors like `oklch(96% 0.012 82 / 0.055)` carry
  // nested parens, so match the hairline stop directly rather than parsing
  // whole gradient layers.
  {
    const hairlineRe = /\b\d{1,3}px\s*,\s*transparent\s+\d{1,3}px/gi;
    const gridSizeRe = /background-size\s*:[^;{}"']*\b\d{1,3}px\b/i;
    const bgDeclRe = /\bbackground(?:-image)?\s*:\s*([^;{}"']*)/gi;
    const blockRe =
      /\{([^{}]*)\}|style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/gi;
    let blk;

    while ((blk = blockRe.exec(html)) !== null) {
      const block = blk[1] || blk[2] || blk[3] || '';
      if (!gridSizeRe.test(block)) continue;
      let hairlineCount = 0;
      let bm;
      bgDeclRe.lastIndex = 0;

      while ((bm = bgDeclRe.exec(block)) !== null) {
        const stops = bm[1].match(hairlineRe);
        if (stops) hairlineCount += stops.length;
      }

      if (hairlineCount >= 2) {
        findings.push({
          id: 'codex-grid-background',
          snippet: 'two-axis grid-line gradient background',
        });
        break;
      }
    }
  }

  // --- Provider tells (gated): "X theater" framing copy (GPT) ---
  // Lives here (regex-on-HTML) rather than in the text-content analyzers so it
  // runs in the bundled browser path too, not just the CLI/static path.
  {
    const bodyText = html
      .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replaceAll(/<[^>]+>/g, ' ');
    const tm = /\b(\w+)\s+theater\b/i.exec(bodyText);
    if (tm)
      findings.push({id: 'theater-slop-phrase', snippet: `"${tm[0].trim()}"`});
  }

  // --- Provider tells (gated): image hover transform (Gemini) ---
  // A CSS `img...:hover { transform: ... }` rule, or a Tailwind hover:scale /
  // hover:rotate / hover:translate utility on an <img>. Each distinct
  // mechanism is its own finding.
  const imgHoverCss =
    /\bimg\b[^,{}]*:hover\b[^{}]*\{[^}]*\btransform\s*:\s*(?:scale|rotate|translate|matrix|skew)/i;

  if (imgHoverCss.test(html)) {
    findings.push({
      id: 'image-hover-transform',
      snippet: 'img:hover { transform } rule',
    });
  }
  const imgTagRe = /<img\b[^>]*\bclass\s*=\s*"([^"]*)"/gi;
  let im;

  while ((im = imgTagRe.exec(html)) !== null) {
    if (/\bhover:(?:scale|rotate|translate|skew)-/.test(im[1])) {
      findings.push({
        id: 'image-hover-transform',
        snippet: 'Tailwind hover transform on <img>',
      });
    }
  }

  return findings;
};

// ─── Section 4: resolveBackground (unified) ─────────────────────────────────

// Read the element's own background color, computed-style first, with a
// jsdom-friendly fallback that parses the inline `background:` shorthand
// from the raw style attribute. jsdom (~v29) does not decompose the
// shorthand into `backgroundColor`, so without this fallback the CLI silently
// returns null for any element styled via `background: rgb(...)` or
// `background: #abc`. Real browsers always decompose, so the fallback is
// a no-op there.
const readOwnBackgroundColor = (element, computedStyle) => {
  const bg = parseRgb(computedStyle.backgroundColor);
  if (DETECTOR_IS_BROWSER || (bg && bg.a >= 0.1)) return bg;
  const rawStyle = element.getAttribute?.('style') || '';
  const bgMatch = rawStyle.match(/background(?:-color)?\s*:\s*([^;]+)/i);
  const inlineBg = bgMatch ? bgMatch[1].trim() : '';
  if (!inlineBg) return bg;
  if (/gradient/i.test(inlineBg) || /url\s*\(/i.test(inlineBg)) return bg;
  const fromRgb = parseRgb(inlineBg);
  if (fromRgb) return fromRgb;
  const hexMatch = inlineBg.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);

  if (hexMatch) {
    const h = hexMatch[1];

    if (h.length === 6) {
      return {
        a: 1,
        b: Number.parseInt(h.slice(4, 6), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        r: Number.parseInt(h.slice(0, 2), 16),
      };
    }

    return {
      a: 1,
      b: Number.parseInt(h[2] + h[2], 16),
      g: Number.parseInt(h[1] + h[1], 16),
      r: Number.parseInt(h[0] + h[0], 16),
    };
  }

  return bg;
};

const resolveBackground = (element, win, customPropertyMap) => {
  let current = element;

  while (current && current.nodeType === 1) {
    const style =
      DETECTOR_IS_BROWSER ?
        getComputedStyle(current)
      : win.getComputedStyle(current);
    const bgImage = style.backgroundImage || '';
    const hasGradientOrUrl =
      bgImage &&
      bgImage !== 'none' &&
      (/gradient/i.test(bgImage) || /url\s*\(/i.test(bgImage));

    // Try the solid bg-color FIRST. If the element has both a solid color
    // and a gradient/url overlay (a common pattern: `background: var(--paper)
    // radial-gradient(...)` for paper-grain texture), the solid color is the
    // dominant visible surface for contrast purposes; the overlay is
    // decorative. The old behavior bailed on any gradient ancestor, which
    // caused massive false-positive contrast findings on grain-textured
    // body backgrounds.
    let bg = parseRgb(style.backgroundColor);

    if (!DETECTOR_IS_BROWSER && (!bg || bg.a < 0.1)) {
      // jsdom returns literal "var(--X)" / "oklch(...)" strings. Resolve
      // through customPropMap so Tailwind v4 color tokens become RGB.
      if (customPropertyMap) {
        bg = parseColorResolved(style.backgroundColor, customPropertyMap);
      }

      if (!bg || bg.a < 0.1) {
        // Inline-style fallback. jsdom doesn't decompose background
        // shorthand, so colors set via inline style are otherwise invisible.
        const rawStyle = current.getAttribute?.('style') || '';
        const bgMatch = rawStyle.match(/background(?:-color)?\s*:\s*([^;]+)/i);
        const inlineBg = bgMatch ? bgMatch[1].trim() : '';

        if (
          inlineBg &&
          !/gradient/i.test(inlineBg) &&
          !/url\s*\(/i.test(inlineBg)
        ) {
          bg =
            parseColorResolved(inlineBg, customPropertyMap) ||
            parseAnyColor(inlineBg);
        }
      }
    }

    if (bg && bg.a > 0.1 && (DETECTOR_IS_BROWSER || bg.a >= 0.5)) return bg;

    // No solid bg-color at this level. If THIS level has a gradient/url
    // with no underlying solid color we can read:
    //   • on body/html: assume white. Body-level gradients are almost
    //     always decorative texture (paper grain, noise) on top of a
    //     solid bg-color the page set via `background: var(--paper)`
    //     shorthand — which jsdom can't decompose into bg-color. The
    //     downstream gradient-stops fallback path produces catastrophic
    //     false positives in this case (gradient noise stops have
    //     accidental browns/blacks that look like card backgrounds).
    //   • on other elements: bail to null and let the caller fall back
    //     to gradient stops (gradient buttons / hero sections are real
    //     bgs worth checking against).
    if (hasGradientOrUrl) {
      if (current.tagName === 'BODY' || current.tagName === 'HTML') {
        return {a: 1, b: 255, g: 255, r: 255};
      }

      return null;
    }
    current = current.parentElement;
  }

  return {b: 255, g: 255, r: 255};
};

// Walk parents looking for a gradient background and return its color stops.
// Used as a fallback when resolveBackground() returns null because the
// effective background is a gradient (no single solid color to compare against).
const resolveGradientStops = (element, win) => {
  let current = element;

  while (current && current.nodeType === 1) {
    const style =
      DETECTOR_IS_BROWSER ?
        getComputedStyle(current)
      : win.getComputedStyle(current);
    const bgImage = style.backgroundImage || '';

    if (bgImage && bgImage !== 'none' && /gradient/i.test(bgImage)) {
      const stops = parseGradientColors(bgImage);
      if (stops.length > 0) return stops;
    }

    if (!DETECTOR_IS_BROWSER) {
      // jsdom doesn't decompose `background:` shorthand — peek at the raw inline style
      const rawStyle = current.getAttribute?.('style') || '';
      const bgMatch = rawStyle.match(/background(?:-image)?\s*:\s*([^;]+)/i);

      if (bgMatch && /gradient/i.test(bgMatch[1])) {
        const stops = parseGradientColors(bgMatch[1]);
        if (stops.length > 0) return stops;
      }
    }
    current = current.parentElement;
  }

  return null;
};

// Parse a single CSS length token to pixels. Accepts "12px", "50%", a
// shorthand like "12px 4px" (uses the first value), or empty / null.
// Returns the pixel value, or null when the input is unparseable.
// Percentages convert against `widthPx` when one is supplied. Without a
// usable width (jsdom returns "auto" for many real-world elements,
// which parseFloat collapses to 0), fall back to the raw percentage
// number so callers gating on `> 0` (border-accent-on-rounded,
// isCardLike's hasRadius) still see a positive value, matching the
// original parseFloat("50%") === 50 behavior.
const parseRadiusToPx = (value, widthPx) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/, 1)[0];
  const number_ = Number.parseFloat(first);
  if (Number.isNaN(number_)) return null;

  if (first.endsWith('%')) {
    if (widthPx && widthPx > 0) return (number_ / 100) * widthPx;

    return number_;
  }

  return number_;
};

const resolveBorderRadiusPx = (element, style, widthPx, win) => {
  const fromComputed = parseRadiusToPx(style.borderRadius, widthPx);
  if (fromComputed !== null) return fromComputed;

  return 0;
};

// ─── Section 5: Element Adapters ────────────────────────────────────────────

// Browser adapters — call getComputedStyle/getBoundingClientRect on live DOM

const checkElementBordersDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  if (BORDER_SAFE_TAGS.has(tag)) return [];
  const rect = element.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) return [];
  const style = getComputedStyle(element);
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  const colors = {};
  const widths = {};

  for (const s of sides) {
    widths[s] = Number.parseFloat(style[`border${s}Width`]) || 0;
    colors[s] = style[`border${s}Color`] || '';
  }

  return checkBorders(
    tag,
    widths,
    colors,
    Number.parseFloat(style.borderRadius) || 0
  );
};

const checkElementColorsDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  // No early SAFE_TAGS bail here — checkColors() does its own gating that
  // includes the styled-button exception for <a> / <button> with their own
  // opaque background. Bailing here would prevent that exception from firing.
  const rect = element.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return [];
  const style = getComputedStyle(element);
  const directText = [...element.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join('');
  const hasDirectText = directText.trim().length > 0;
  const effectiveBg = resolveBackground(element);

  return checkColors({
    bgClip: style.webkitBackgroundClip || style.backgroundClip || '',
    bgColor: readOwnBackgroundColor(element, style),
    bgImage: style.backgroundImage || '',
    classList: element.getAttribute('class') || '',
    effectiveBg,
    effectiveBgStops: effectiveBg ? null : resolveGradientStops(element),
    fontSize: Number.parseFloat(style.fontSize) || 16,
    fontWeight: Number.parseInt(style.fontWeight) || 400,
    hasDirectText,
    isEmojiOnly: isEmojiOnlyText(directText),
    tag,
    textColor: parseRgb(style.color),
  });
};

const checkElementIconTileDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  if (!HEADING_TAGS.has(tag)) return [];
  const sibling = element.previousElementSibling;
  if (!sibling) return [];

  const sibRect = sibling.getBoundingClientRect();
  const headRect = element.getBoundingClientRect();
  const sibStyle = getComputedStyle(sibling);

  // The tile may either contain an <svg>/<i> icon child, OR the tile itself
  // may contain an emoji/symbol character directly as its only text content
  // (the "card-icon" pattern from many AI-generated demos).
  const iconChild = sibling.querySelector(
    'svg, i[data-lucide], i[class*="fa-"], i[class*="icon"]'
  );
  const iconRect = iconChild?.getBoundingClientRect();
  const sibDirectText = [...sibling.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join('');
  const hasInlineEmojiIcon =
    sibling.children.length === 0 && isEmojiOnlyText(sibDirectText);

  return checkIconTile({
    hasIconChild: !!iconChild || hasInlineEmojiIcon,
    headingTag: tag,
    headingText: element.textContent || '',
    headingTop: headRect.top,
    iconChildWidth: iconRect?.width || 0,
    siblingBgColor: parseRgb(sibStyle.backgroundColor),
    siblingBgImage: sibStyle.backgroundImage || '',
    siblingBorderRadius: Number.parseFloat(sibStyle.borderRadius) || 0,
    siblingBorderWidth: Number.parseFloat(sibStyle.borderTopWidth) || 0,
    siblingBottom: sibRect.bottom,
    siblingHeight: sibRect.height,
    siblingTag: sibling.tagName.toLowerCase(),
    siblingWidth: sibRect.width,
  });
};

const checkElementItalicSerifDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  if (tag !== 'h1' && tag !== 'h2') return [];
  const style = getComputedStyle(element);

  return checkItalicSerif({
    fontFamily: style.fontFamily || '',
    fontSize: Number.parseFloat(style.fontSize) || 0,
    fontStyle: style.fontStyle || '',
    headingText: element.textContent || '',
    tag,
  });
};

const checkElementHeroEyebrowDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  if (tag !== 'h1') return [];
  const sibling = element.previousElementSibling;
  if (!sibling) return [];
  const headStyle = getComputedStyle(element);
  const sibStyle = getComputedStyle(sibling);

  return checkHeroEyebrow({
    headingFontSize: Number.parseFloat(headStyle.fontSize) || 0,
    headingTag: tag,
    headingText: element.textContent || '',
    siblingColor: sibStyle.color || '',
    siblingFontSize: Number.parseFloat(sibStyle.fontSize) || 0,
    siblingFontWeight: sibStyle.fontWeight || '',
    siblingLetterSpacing: Number.parseFloat(sibStyle.letterSpacing) || 0,
    siblingTag: sibling.tagName.toLowerCase(),
    siblingText: sibling.textContent || '',
    siblingTextTransform: sibStyle.textTransform || '',
  });
};

// Build a map of CSS custom properties declared on :root / :host / html.
// Used to resolve var(--X) refs that jsdom returns verbatim in
// getComputedStyle. Tailwind v4 routes every utility class through
// CSS vars (font-weight: var(--font-weight-bold), font-size:
// var(--text-xs), letter-spacing: var(--tracking-widest)), so without
// resolution every style-based check silently fails on Tailwind v4
// builds — the values come back as literal "var(--font-weight-bold)"
// strings and parseFloat returns NaN.
const buildCustomPropertyMap = (document) => {
  const map = new Map();
  let sheets;

  try {
    sheets = [...(document.styleSheets || [])];
  } catch {
    return map;
  }

  for (const sheet of sheets) {
    let rules;

    try {
      rules = [...(sheet.cssRules || [])];
    } catch {
      continue;
    }

    for (const rule of rules) {
      // Style rules only (type 1). Walk @media / @supports if present.
      if (
        rule.type === 4 /* MEDIA_RULE */ ||
        rule.type === 12 /* SUPPORTS_RULE */
      ) {
        try {
          rules.push(...(rule.cssRules || []));
        } catch {
          /* ignore */
        }
        continue;
      }
      if (rule.type !== 1 /* STYLE_RULE */) continue;
      const sel = rule.selectorText || '';
      if (!/(^|,\s*)(:root|html|:host)\b/i.test(sel)) continue;
      const {style} = rule;
      if (!style) continue;

      for (let index = 0; index < style.length; index++) {
        const property = style[index];
        if (!property || !property.startsWith('--')) continue;
        const value = style.getPropertyValue(property).trim();
        if (value) map.set(property, value);
      }
    }
  }

  return map;
};

// Resolve var(--X[, fallback]) refs in a computed-style value string.
// Recurses up to 8 levels for chained refs (--a: var(--b)). Returns
// the original string when no refs are present or the chain doesn't
// resolve. Safe to call on already-resolved values.
const resolveVarRefs = (raw, customPropertyMap, depth = 0) => {
  if (typeof raw !== 'string' || !raw.includes('var(')) return raw;
  if (depth > 8) return raw;

  return raw.replaceAll(
    /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)/g,
    (_m, name, fallback) => {
      const v = customPropertyMap.get(name);
      if (v != null) return resolveVarRefs(v, customPropertyMap, depth + 1);

      return fallback ?
          resolveVarRefs(fallback.trim(), customPropertyMap, depth + 1)
        : _m;
    }
  );
};

// OKLCH → sRGB conversion (Björn Ottosson's matrices). L in 0..1 (or %),
// C in 0..~0.4 typical, H in degrees. Returns clamped {r,g,b,a:1} in 0..255.
// Needed because jsdom doesn't compute oklch() values — getComputedStyle
// returns the literal "oklch(...)" string. Without this, the entire
// Tailwind v4 color palette (which is OKLCH-based) is invisible to the
// detector's contrast / color checks.
const oklchToRgb = (L, C, H) => {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const lc = l_ * l_ * l_;
  const mc = m_ * m_ * m_;
  const sc = s_ * s_ * s_;
  const rLin = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const gLin = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bLin = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;

  const enc = (x) => {
    const c = Math.max(0, Math.min(1, x));

    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };

  return {
    a: 1,
    b: Math.round(enc(bLin) * 255),
    g: Math.round(enc(gLin) * 255),
    r: Math.round(enc(rLin) * 255),
  };
};

// Extended color parser: rgb/rgba/hex/oklch. Returns null on no match.
// Use this when the input might be any CSS color form; use plain parseRgb
// when you only expect computed rgb() values from real browsers.
const parseAnyColor = (s) => {
  if (!s || typeof s !== 'string') return null;
  const string_ = s.trim();
  if (
    string_ === 'transparent' ||
    string_ === 'currentcolor' ||
    string_ === 'inherit'
  )
    return null;
  let m;
  m = string_.match(
    /rgba?\(\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*([\d.]+))?\s*\)/
  );
  if (m)
    return {
      a: m[4] === undefined ? 1 : +m[4],
      b: Math.round(+m[3]),
      g: Math.round(+m[2]),
      r: Math.round(+m[1]),
    };
  m = string_.match(/^#([0-9a-f]{3,8})$/i);

  if (m) {
    const h = m[1];

    if (h.length === 3 || h.length === 4) {
      return {
        a: h.length === 4 ? Number.parseInt(h[3] + h[3], 16) / 255 : 1,
        b: Number.parseInt(h[2] + h[2], 16),
        g: Number.parseInt(h[1] + h[1], 16),
        r: Number.parseInt(h[0] + h[0], 16),
      };
    }

    if (h.length === 6 || h.length === 8) {
      return {
        a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
        b: Number.parseInt(h.slice(4, 6), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        r: Number.parseInt(h.slice(0, 2), 16),
      };
    }
  }
  // OKLCH parser. Tailwind v4's CSS minifier squishes the space after
  // `%` ("21.5%.02 50"), so the separator between L and C may be absent.
  // Match L (with optional %), then C and H separated permissively.
  m = string_.match(
    /oklch\(\s*([\d.]+)(%?)\s*[\s,]*\s*([\d.]+)\s*[\s,]+\s*([-\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+)(%)?)?\s*\)/i
  );

  if (m) {
    const Lnum = Number.parseFloat(m[1]);
    const L = m[2] === '%' ? Lnum / 100 : Lnum;
    const rgb = oklchToRgb(L, Number.parseFloat(m[3]), Number.parseFloat(m[4]));

    if (m[5] !== undefined) {
      const alpha = Number.parseFloat(m[5]);
      rgb.a = m[6] === '%' ? alpha / 100 : alpha;
    }

    return rgb;
  }

  return null;
};

// Resolve var() refs in a color string (via customPropMap), then parse.
// Returns null on any failure. Used in jsdom-mode paths where
// getComputedStyle returns literal "var(--X)" or "oklch(...)" strings.
const parseColorResolved = (string_, customPropertyMap) => {
  if (!string_) return null;
  const resolved =
    customPropertyMap ? resolveVarRefs(string_, customPropertyMap) : string_;

  return parseAnyColor(resolved);
};

const REPEATED_KICKER_SKIP_SELECTOR = [
  'nav',
  'form',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'figure',
  'figcaption',
  'ol',
  'ul',
  'li',
  '[role="navigation"]',
  '[aria-label*="breadcrumb" i]',
  '[class*="breadcrumb" i]',
  '[aria-hidden="true"]',
  '[data-impeccable-allow-kickers]',
].join(',');

const REPEATED_KICKER_CARD_CONTEXT_SELECTOR = [
  'article',
  'button',
  'a',
  'li',
  '[role="listitem"]',
  '[role="option"]',
].join(',');

const cleanInlineText = (element) =>
  [...element.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join(' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

const isRepeatedKickerCardContext = (heading, kicker) => {
  const item = heading.closest?.(REPEATED_KICKER_CARD_CONTEXT_SELECTOR);

  return Boolean(item && (!item.contains || item.contains(kicker)));
};

const isRepeatedKickerCandidate = (options) => {
  const {
    headingFontSize,
    headingTag,
    headingText,
    kickerFontSize,
    kickerLetterSpacing,
    kickerTag,
    kickerText,
    kickerTextTransform,
  } = options;
  if (!['h2', 'h3', 'h4'].includes(headingTag)) return false;
  if (!headingText || headingText.length < 3) return false;
  if (/^\/[\w-]+/i.test(headingText.replaceAll(/^"|"$/g, '').trim()))
    return false;
  if (!(headingFontSize >= 20)) return false;
  if (!kickerTag || HEADING_TAGS.has(kickerTag)) return false;
  if (!['div', 'p', 'small', 'span'].includes(kickerTag)) return false;
  if (!kickerText || kickerText.length < 2 || kickerText.length > 34)
    return false;
  if (/^step\s*\d+/i.test(kickerText) || /^\d{1,2}$/.test(kickerText))
    return false;

  const isUppercased =
    kickerTextTransform === 'uppercase' ||
    (/[A-Z]/.test(kickerText) && !/[a-z]/.test(kickerText));
  if (!isUppercased) return false;
  if (!(kickerFontSize > 0 && kickerFontSize <= 14)) return false;
  const minTrackedSpacing = Math.max(1, kickerFontSize * 0.08);
  if (!(kickerLetterSpacing >= minTrackedSpacing)) return false;

  return true;
};

const collectRepeatedSectionKickerCandidates = (
  document_,
  getStyle,
  resolveLetterSpacing
) => {
  const candidates = [];

  for (const heading of document_.querySelectorAll('h2, h3, h4')) {
    if (heading.closest?.(REPEATED_KICKER_SKIP_SELECTOR)) continue;
    const kicker = heading.previousElementSibling;
    if (!kicker || kicker.closest?.(REPEATED_KICKER_SKIP_SELECTOR)) continue;
    if (isRepeatedKickerCardContext(heading, kicker)) continue;

    const headingStyle = getStyle(heading);
    const kickerStyle = getStyle(kicker);
    const headingText = (heading.textContent || '')
      .replaceAll(/\s+/g, ' ')
      .trim();
    const kickerText =
      cleanInlineText(kicker) ||
      (kicker.textContent || '').replaceAll(/\s+/g, ' ').trim();
    const headingFontSize =
      resolveLetterSpacing(headingStyle.fontSize || '', 16) ||
      Number.parseFloat(headingStyle.fontSize) ||
      0;
    const kickerFontSize =
      resolveLetterSpacing(kickerStyle.fontSize || '', 16) ||
      Number.parseFloat(kickerStyle.fontSize) ||
      0;
    const kickerLetterSpacing = resolveLetterSpacing(
      kickerStyle.letterSpacing || '',
      kickerFontSize
    );

    if (
      !isRepeatedKickerCandidate({
        headingFontSize,
        headingTag: heading.tagName.toLowerCase(),
        headingText,
        kickerFontSize,
        kickerLetterSpacing,
        kickerTag: kicker.tagName.toLowerCase(),
        kickerText,
        kickerTextTransform: kickerStyle.textTransform || '',
      })
    ) {
      continue;
    }

    candidates.push({
      headingTag: heading.tagName.toLowerCase(),
      headingText: headingText.replaceAll(/^"|"$/g, '').slice(0, 60),
      kickerText: kickerText.slice(0, 40),
    });
  }

  return candidates;
};

const checkRepeatedSectionKickersDOM = () => {
  const candidates = collectRepeatedSectionKickerCandidates(
    document,
    (element) => getComputedStyle(element),
    (value, fontSize) => resolveLengthPx(value, fontSize) || 0
  );

  return checkRepeatedSectionKickers({candidates});
};

const checkElementMotionDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  if (SAFE_TAGS.has(tag)) return [];
  const style = getComputedStyle(element);

  return checkMotion({
    animationName: style.animationName || '',
    classList: element.getAttribute('class') || '',
    tag,
    timingFunctions: [
      style.animationTimingFunction,
      style.transitionTimingFunction,
    ]
      .filter(Boolean)
      .join(' '),
    transitionProperty: style.transitionProperty || '',
  });
};

const checkElementGlowDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  const style = getComputedStyle(element);
  if (!style.boxShadow || style.boxShadow === 'none') return [];
  // Use parent's background — glow radiates outward, so the surrounding context matters
  // If resolveBackground returns null (gradient), try to infer from the gradient colors
  let parentBg =
    element.parentElement ?
      resolveBackground(element.parentElement)
    : resolveBackground(element);

  if (!parentBg) {
    // Gradient background — sample its colors to determine if it's dark
    let current = element.parentElement;

    while (current && current.nodeType === 1) {
      const bgImage = getComputedStyle(current).backgroundImage || '';
      const gradColors = parseGradientColors(bgImage);

      if (gradColors.length > 0) {
        // Average the gradient colors
        const avg = {b: 0, g: 0, r: 0};

        for (const c of gradColors) {
          avg.r += c.r;
          avg.g += c.g;
          avg.b += c.b;
        }
        avg.r = Math.round(avg.r / gradColors.length);
        avg.g = Math.round(avg.g / gradColors.length);
        avg.b = Math.round(avg.b / gradColors.length);
        parentBg = avg;
        break;
      }
      current = current.parentElement;
    }
  }

  return checkGlow({boxShadow: style.boxShadow, effectiveBg: parentBg, tag});
};

const checkElementAIPaletteDOM = (element) => {
  const style = getComputedStyle(element);
  const findings = [];

  // Check gradient backgrounds for purple/violet or cyan
  const bgImage = style.backgroundImage || '';
  const gradColors = parseGradientColors(bgImage);

  for (const c of gradColors) {
    if (hasChroma(c, 50)) {
      const hue = getHue(c);

      if (hue >= 260 && hue <= 310) {
        findings.push({
          id: 'ai-color-palette',
          snippet: 'Purple/violet gradient background',
        });
        break;
      }

      if (hue >= 160 && hue <= 200) {
        findings.push({
          id: 'ai-color-palette',
          snippet: 'Cyan gradient background',
        });
        break;
      }
    }
  }

  // Check for neon text (vivid cyan/purple color on dark background)
  const textColor = parseRgb(style.color);

  if (textColor && hasChroma(textColor, 80)) {
    const hue = getHue(textColor);
    const isAIPalette =
      (hue >= 160 && hue <= 200) || (hue >= 260 && hue <= 310);

    if (isAIPalette) {
      const parentBg =
        element.parentElement ? resolveBackground(element.parentElement) : null;
      // Also check gradient parents
      let effectiveBg = parentBg;

      if (!effectiveBg) {
        let current = element.parentElement;

        while (current && current.nodeType === 1) {
          const gi = getComputedStyle(current).backgroundImage || '';
          const gc = parseGradientColors(gi);

          if (gc.length > 0) {
            const avg = {b: 0, g: 0, r: 0};

            for (const c of gc) {
              avg.r += c.r;
              avg.g += c.g;
              avg.b += c.b;
            }
            avg.r = Math.round(avg.r / gc.length);
            avg.g = Math.round(avg.g / gc.length);
            avg.b = Math.round(avg.b / gc.length);
            effectiveBg = avg;
            break;
          }
          current = current.parentElement;
        }
      }

      if (effectiveBg && relativeLuminance(effectiveBg) < 0.1) {
        const label = hue >= 260 ? 'Purple/violet' : 'Cyan';
        findings.push({
          id: 'ai-color-palette',
          snippet: `${label} neon text on dark background`,
        });
      }
    }
  }

  return findings;
};

const QUALITY_TEXT_TAGS = new Set([
  'blockquote',
  'dd',
  'figcaption',
  'li',
  'p',
  'td',
  'th',
]);

// Resolve a CSS font-size value to pixels by walking up the parent chain.
// Browsers resolve em/rem/% to px in getComputedStyle, but jsdom returns the
// specified value verbatim — so for the Node path we walk parents ourselves.
const resolveFontSizePx = (element, win) => {
  const chain = []; // raw font-size strings, leaf → root
  let current = element;

  while (current && current.nodeType === 1) {
    const fs = (win ? win.getComputedStyle(current) : getComputedStyle(current))
      .fontSize;
    chain.push(fs || '');
    current = current.parentElement;
  }
  // Walk root → leaf, resolving each value relative to its parent context.
  let px = 16; // root default

  for (let index = chain.length - 1; index >= 0; index--) {
    const v = chain[index];
    if (!v || v === 'inherit') continue;
    const number_ = Number.parseFloat(v);
    if (isNaN(number_)) continue;
    if (v.endsWith('px')) px = number_;
    else if (v.endsWith('rem')) px = number_ * 16;
    else if (v.endsWith('em')) px = number_ * px;
    else if (v.endsWith('%')) px = (number_ / 100) * px;
    else px = number_; // unitless — already resolved
  }

  return px;
};

// Resolve a CSS length value (line-height, letter-spacing, etc.) given a
// known font-size context. Returns null for "normal" / unparseable values.
const resolveLengthPx = (value, fontSizePx) => {
  if (!value || value === 'normal' || value === 'auto' || value === 'inherit')
    return null;
  const number_ = Number.parseFloat(value);
  if (isNaN(number_)) return null;
  if (value.endsWith('px')) return number_;
  if (value.endsWith('rem')) return number_ * 16;
  if (value.endsWith('em')) return number_ * fontSizePx;
  if (value.endsWith('%')) return (number_ / 100) * fontSizePx;

  // Unitless line-height = multiplier, return px equivalent
  return number_ * fontSizePx;
};

const cssColorIsTransparent = (value) => {
  if (!value) return true;
  const string_ = String(value).trim().toLowerCase();
  if (!string_ || string_ === 'transparent' || string_ === 'rgba(0, 0, 0, 0)')
    return true;
  const parsed = parseAnyColor(string_);
  if (parsed) return (parsed.a ?? 1) <= 0.05;

  return /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)$/.test(
    string_
  );
};

const colorsNearlyMatch = (a, b) => {
  const ca = parseAnyColor(a);
  const callback = parseAnyColor(b);
  if (!ca || !callback) return false;
  const alphaDelta = Math.abs((ca.a ?? 1) - (callback.a ?? 1));
  const channelDelta = Math.max(
    Math.abs(ca.r - callback.r),
    Math.abs(ca.g - callback.g),
    Math.abs(ca.b - callback.b)
  );

  return alphaDelta <= 0.03 && channelDelta <= 3;
};

const getComputedStyleFor = (win, element) => {
  if (win && typeof win.getComputedStyle === 'function') {
    try {
      return win.getComputedStyle(element);
    } catch {}
  }

  if (typeof getComputedStyle === 'function') {
    try {
      return getComputedStyle(element);
    } catch {}
  }

  return null;
};

const hasVisibleBackgroundBoundary = (style, element, win) => {
  const bg = style?.backgroundColor || '';
  if (cssColorIsTransparent(bg)) return false;

  let parent = element?.parentElement || null;

  while (parent) {
    const parentStyle = getComputedStyleFor(win, parent);
    const parentBg = parentStyle?.backgroundColor || '';

    if (!cssColorIsTransparent(parentBg)) {
      return !colorsNearlyMatch(bg, parentBg);
    }
    parent = parent.parentElement;
  }

  return true;
};

const TEXT_EDGE_TAGS = new Set([
  'A',
  'BUTTON',
  'CODE',
  'DD',
  'DT',
  'FIGCAPTION',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'P',
  'PRE',
  'SPAN',
  'TD',
  'TH',
]);

const hasMeaningfulDirectText = (node) => {
  if (!node?.childNodes) return false;

  for (const child of node.childNodes) {
    if (child.nodeType === 3 && child.textContent.trim().length > 4)
      return true;
  }

  return false;
};

const textDescendantsFlushSides = (element, rect) => {
  const flush = {bottom: false, left: false, right: false, top: false};
  if (!rect || !element?.querySelectorAll) return flush;
  const TEXT_EDGE_THRESHOLD = 4;
  const candidates = element.querySelectorAll(
    'a, button, code, dd, dt, figcaption, h1, h2, h3, h4, h5, h6, li, p, pre, span, td, th'
  );

  for (const node of candidates) {
    if (!TEXT_EDGE_TAGS.has(node.tagName) || !hasMeaningfulDirectText(node))
      continue;
    let nodeRect = null;

    try {
      nodeRect = node.getBoundingClientRect();
    } catch {}
    if (!nodeRect || nodeRect.width <= 0 || nodeRect.height <= 0) continue;
    if (
      nodeRect.bottom < rect.top ||
      nodeRect.top > rect.bottom ||
      nodeRect.right < rect.left ||
      nodeRect.left > rect.right
    )
      continue;
    if (nodeRect.top - rect.top <= TEXT_EDGE_THRESHOLD) flush.top = true;
    if (rect.right - nodeRect.right <= TEXT_EDGE_THRESHOLD) flush.right = true;
    if (rect.bottom - nodeRect.bottom <= TEXT_EDGE_THRESHOLD)
      flush.bottom = true;
    if (nodeRect.left - rect.left <= TEXT_EDGE_THRESHOLD) flush.left = true;
  }

  return flush;
};

// Pure quality checks. Most run on computed CSS and DOM-only inputs (work in
// jsdom and the browser). Two checks (line-length, cramped-padding) gate on
// element rect dimensions, which jsdom can't compute — pass `rect: null` from
// the Node adapter to skip those.
//
// Both adapters resolve font-size, line-height and letter-spacing to pixels
// before calling this so the pure function only deals with numbers.
const checkQuality = (options) => {
  const {
    el,
    fontSize,
    hasDirectText,
    letterSpacingPx,
    lineHeightPx,
    lineMax = 80,
    rect,
    style,
    tag,
    textLen,
    viewportWidth = 0,
    win = null,
  } = options;
  const findings = [];
  // Skip browser extension injected elements
  const elementId = el.id || '';
  if (elementId.startsWith('claude-') || elementId.startsWith('cic-'))
    return findings;

  // --- Line length too long --- (browser-only: needs rect.width)
  if (
    rect &&
    hasDirectText &&
    QUALITY_TEXT_TAGS.has(tag) &&
    rect.width > 0 &&
    textLen > lineMax
  ) {
    const charsPerLine = rect.width / (fontSize * 0.5);

    if (charsPerLine > lineMax + 5) {
      findings.push({
        id: 'line-length',
        snippet: `~${Math.round(charsPerLine)} chars/line (aim for <${lineMax})`,
      });
    }
  }

  // --- Cramped padding --- (browser-only: needs rect to skip small badges/labels)
  // Vertical and horizontal thresholds are independent because line-height
  // already provides built-in vertical breathing room (the line box is taller
  // than the cap height), but horizontal has no equivalent. Both scale with
  // font-size — bigger text demands proportionally more padding.
  //   vertical:   max(4px, fontSize × 0.3)
  //   horizontal: max(8px, fontSize × 0.5)
  const isInlineCode = tag === 'code' && !(el.closest && el.closest('pre'));

  if (
    !isInlineCode &&
    rect &&
    hasDirectText &&
    textLen > 20 &&
    rect.width > 100 &&
    rect.height > 30
  ) {
    const borders = {
      bottom: Number.parseFloat(style.borderBottomWidth) || 0,
      left: Number.parseFloat(style.borderLeftWidth) || 0,
      right: Number.parseFloat(style.borderRightWidth) || 0,
      top: Number.parseFloat(style.borderTopWidth) || 0,
    };
    const borderCount = Object.values(borders).filter((w) => w > 0).length;
    const hasBg = hasVisibleBackgroundBoundary(style, el, win);

    if (borderCount >= 2 || hasBg) {
      const hPads = [];
      const vPads = [];
      if (hasBg || borders.top > 0)
        vPads.push(Number.parseFloat(style.paddingTop) || 0);
      if (hasBg || borders.bottom > 0)
        vPads.push(Number.parseFloat(style.paddingBottom) || 0);
      if (hasBg || borders.left > 0)
        hPads.push(Number.parseFloat(style.paddingLeft) || 0);
      if (hasBg || borders.right > 0)
        hPads.push(Number.parseFloat(style.paddingRight) || 0);

      const vMin = vPads.length > 0 ? Math.min(...vPads) : Infinity;
      const hMin = hPads.length > 0 ? Math.min(...hPads) : Infinity;
      const vThresh = Math.max(4, fontSize * 0.3);
      const hThresh = Math.max(8, fontSize * 0.5);

      // Emit at most one finding per element — pick whichever axis is worse.
      if (vMin < vThresh) {
        findings.push({
          id: 'cramped-padding',
          snippet: `${vMin}px vertical padding (need ≥${vThresh.toFixed(1)}px for ${fontSize}px text)`,
        });
      } else if (hMin < hThresh) {
        findings.push({
          id: 'cramped-padding',
          snippet: `${hMin}px horizontal padding (need ≥${hThresh.toFixed(1)}px for ${fontSize}px text)`,
        });
      }
    }
  }

  // --- Flush against a visible boundary ---
  // Fires when a container has a visible boundary (border, outline, OR a
  // non-transparent background) AND near-zero padding on the bounded
  // side(s) AND text-bearing children land flush against the boundary.
  //
  // Distinct from cramped-padding: that rule needs the element itself to
  // have direct text (hasDirectText). This rule targets the OPPOSITE
  // shape — a container with NO direct text, only children — which is
  // exactly what cramped-padding misses (a section wrapping a label +
  // list lands a free pass).
  //
  // The classic shape: agent writes `padding: 28px 0 0` shorthand on a
  // section that also has a border, zeroing horizontal padding so the
  // text-bearing children touch the side borders. Background and
  // outline count too: a colored card with zero padding has the same
  // visual failure mode.
  {
    const FLUSH_SKIP_TAGS = new Set([
      'A',
      'ARTICLE',
      'ASIDE',
      'BODY',
      'BUTTON',
      'CODE',
      'FIGURE',
      'FOOTER',
      'FORM',
      'HEADER',
      'HTML',
      'INPUT',
      'LABEL',
      'MAIN',
      'NAV',
      'PRE',
      'SELECT',
      'SUMMARY',
      'TABLE',
      'TBODY',
      'TD',
      'TEXTAREA',
      'TH',
      'THEAD',
      'TR',
    ]);
    const upperTag = tag ? tag.toUpperCase() : '';
    const elementPosition = style.position || '';

    if (
      !FLUSH_SKIP_TAGS.has(upperTag) &&
      !hasDirectText &&
      !['absolute', 'fixed'].includes(elementPosition) &&
      el.children &&
      el.children.length > 0
    ) {
      const borderW = {
        bottom: Number.parseFloat(style.borderBottomWidth) || 0,
        left: Number.parseFloat(style.borderLeftWidth) || 0,
        right: Number.parseFloat(style.borderRightWidth) || 0,
        top: Number.parseFloat(style.borderTopWidth) || 0,
      };
      const borderVisible = {
        bottom:
          borderW.bottom > 0 && !cssColorIsTransparent(style.borderBottomColor),
        left: borderW.left > 0 && !cssColorIsTransparent(style.borderLeftColor),
        right:
          borderW.right > 0 && !cssColorIsTransparent(style.borderRightColor),
        top: borderW.top > 0 && !cssColorIsTransparent(style.borderTopColor),
      };
      // Outline detection. jsdom decomposes `border` shorthand into
      // border{Top,…}Width/Color but does NOT decompose `outline` —
      // the longhands come back empty when the value was set via the
      // shorthand. Fall back to parsing `style.outline` ourselves.
      let outlineW = Number.parseFloat(style.outlineWidth) || 0;
      let outlineStyleValue = style.outlineStyle || '';
      let outlineColorValue = style.outlineColor || '';

      if (!outlineW && style.outline) {
        const wMatch = style.outline.match(/(\d+(?:\.\d+)?)\s*px/);
        if (wMatch) outlineW = Number.parseFloat(wMatch[1]) || 0;

        if (!outlineStyleValue) {
          outlineStyleValue =
            (
              /\b(solid|dashed|dotted|double|groove|ridge|inset|outset)\b/.test(
                style.outline
              )
            ) ?
              'solid'
            : '';
        }

        if (!outlineColorValue) {
          const cMatch = style.outline.match(
            /(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\s*$/
          );
          if (cMatch) outlineColorValue = cMatch[1];
        }
      }
      const outlineVisible =
        outlineW > 0 &&
        !cssColorIsTransparent(outlineColorValue) &&
        outlineStyleValue &&
        outlineStyleValue !== 'none';
      const bgVisible = hasVisibleBackgroundBoundary(style, el, win);

      const anyVisible =
        borderVisible.top ||
        borderVisible.right ||
        borderVisible.bottom ||
        borderVisible.left ||
        outlineVisible ||
        bgVisible;

      if (anyVisible) {
        // Resolve padding to px (jsdom returns raw "1.5rem" etc., not the
        // computed px value; parseFloat would strip the unit and treat
        // 1.5rem as 1.5px, false-flagging legitimate insets).
        const pad = {
          bottom: resolveLengthPx(style.paddingBottom, fontSize) ?? 0,
          left: resolveLengthPx(style.paddingLeft, fontSize) ?? 0,
          right: resolveLengthPx(style.paddingRight, fontSize) ?? 0,
          top: resolveLengthPx(style.paddingTop, fontSize) ?? 0,
        };
        const PAD_THRESHOLD = 2;
        // Children-insulate-this-side: a side is insulated if ANY direct
        // child has its own padding ≥ 4px on that side. Rationale: in
        // typical flow, only the first/last (or leftmost/rightmost)
        // children actually sit at the parent's edges. If even one of
        // them has its own padding, the visual flush is broken on that
        // side. Classic example: a column-flow card frame where the
        // top child (header) has padding-top:12 and the bottom child
        // (footer) has padding-bottom:8 — the parent's padding:0 doesn't
        // matter; nothing is actually flush. The `any-child-insulates`
        // heuristic accepts some false negatives (a card with one heavily
        // padded middle child won't flag) for far fewer false positives.
        const CHILD_INSULATE_THRESHOLD = 4;
        const childrenInsulate = {
          bottom: false,
          left: false,
          right: false,
          top: false,
        };

        for (const child of el.children) {
          const childStyle = getComputedStyleFor(win, child);
          if (!childStyle) continue;
          const childPad = {
            bottom: resolveLengthPx(childStyle.paddingBottom, fontSize) ?? 0,
            left: resolveLengthPx(childStyle.paddingLeft, fontSize) ?? 0,
            right: resolveLengthPx(childStyle.paddingRight, fontSize) ?? 0,
            top: resolveLengthPx(childStyle.paddingTop, fontSize) ?? 0,
          };
          const childMargin = {
            bottom: resolveLengthPx(childStyle.marginBottom, fontSize) ?? 0,
            left: resolveLengthPx(childStyle.marginLeft, fontSize) ?? 0,
            right: resolveLengthPx(childStyle.marginRight, fontSize) ?? 0,
            top: resolveLengthPx(childStyle.marginTop, fontSize) ?? 0,
          };

          if (rect && typeof child.getBoundingClientRect === 'function') {
            try {
              const childRect = child.getBoundingClientRect();

              if (childRect && childRect.width > 0 && childRect.height > 0) {
                if (childRect.top - rect.top >= CHILD_INSULATE_THRESHOLD)
                  childrenInsulate.top = true;
                if (rect.right - childRect.right >= CHILD_INSULATE_THRESHOLD)
                  childrenInsulate.right = true;
                if (rect.bottom - childRect.bottom >= CHILD_INSULATE_THRESHOLD)
                  childrenInsulate.bottom = true;
                if (childRect.left - rect.left >= CHILD_INSULATE_THRESHOLD)
                  childrenInsulate.left = true;
              }
            } catch {}
          }

          for (const s of ['top', 'right', 'bottom', 'left']) {
            if (
              childPad[s] >= CHILD_INSULATE_THRESHOLD ||
              childMargin[s] >= CHILD_INSULATE_THRESHOLD
            ) {
              childrenInsulate[s] = true;
            }
          }
        }

        const textFlush = rect ? textDescendantsFlushSides(el, rect) : null;
        const fullBleedBgBand =
          rect &&
          viewportWidth > 0 &&
          rect.width >= viewportWidth * 0.94 &&
          bgVisible &&
          !outlineVisible;
        const flushSides = [];

        for (const side of ['top', 'right', 'bottom', 'left']) {
          const bgBoundsSide =
            bgVisible &&
            !(fullBleedBgBand && (side === 'left' || side === 'right'));
          const sideBounded =
            borderVisible[side] || outlineVisible || bgBoundsSide;

          if (
            sideBounded &&
            pad[side] <= PAD_THRESHOLD &&
            !childrenInsulate[side] &&
            (!textFlush || textFlush[side])
          ) {
            flushSides.push(side);
          }
        }

        if (flushSides.length > 0) {
          // Confirm at least one direct child has substantial text content
          // (> 4 chars). Without this, the flush is harmless: e.g. an
          // image-only card.
          let hasTextChild = false;

          for (const child of el.children) {
            const childText = (child.textContent || '').trim();

            if (childText.length > 4) {
              hasTextChild = true;
              break;
            }
          }

          if (hasTextChild) {
            const cls =
              typeof el.className === 'string' && el.className.trim() ?
                el.className.trim().split(/\s+/, 1)[0]
              : '';
            const boundaryParts = [];
            const borderSidesVisible = [
              'top',
              'right',
              'bottom',
              'left',
            ].filter((s) => borderVisible[s]);
            if (borderSidesVisible.length === 4) boundaryParts.push('border');
            else if (borderSidesVisible.length > 0)
              boundaryParts.push(`border-${borderSidesVisible.join('/')}`);
            if (outlineVisible) boundaryParts.push('outline');
            if (bgVisible) boundaryParts.push('bg');
            const sidesLabel =
              flushSides.length === 4 ? 'all sides' : flushSides.join('/');
            const ident =
              cls ?
                `<${tag.toLowerCase()}> "${cls}"`
              : `<${tag.toLowerCase()}>`;
            findings.push({
              id: 'cramped-padding',
              snippet: `${ident}: children flush against ${boundaryParts.join('+')} on ${sidesLabel} (no inset)`,
            });
          }
        }
      }
    }
  }

  // --- Body text touching viewport edge --- (browser-only: needs rect)
  // Catches the failure mode where the agent ships body paragraphs
  // with NO container providing horizontal padding — text bleeds
  // directly to the viewport edge. Different from cramped-padding,
  // which requires a colored/bordered container. Here the failure
  // is the absence of the container entirely.
  //
  // Gate aggressively to avoid false positives:
  //   - <p> or <li> only (body content; not headings, not nav, not
  //     wrappers)
  //   - text > 40 chars (paragraph-like, not a label)
  //   - rect.width > 50% of viewport (real body, not a pull-quote)
  //   - rect.left < 16 OR rect.right > viewport - 16 (actually
  //     touching the edge)
  //   - not inside <nav> or <header> (those legitimately bleed)
  //   - element itself has no background-color (intentional full-bleed
  //     sections set a bg-color and provide their own internal padding)
  if (
    rect &&
    hasDirectText &&
    textLen > 40 &&
    ['LI', 'P'].includes(tag.toUpperCase()) &&
    viewportWidth > 0
  ) {
    const inNavHeader =
      el.closest && (el.closest('nav') || el.closest('header'));
    const hasOwnBg =
      style.backgroundColor &&
      style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
      style.backgroundColor !== 'transparent';
    const isPositioned = ['absolute', 'fixed'].includes(style.position || '');
    const widthRatio = rect.width / viewportWidth;
    const leftClose = rect.left < 16;
    const rightClose = rect.right > viewportWidth - 16;

    if (
      !inNavHeader &&
      !hasOwnBg &&
      !isPositioned &&
      widthRatio > 0.5 &&
      (leftClose || rightClose)
    ) {
      const which =
        leftClose && rightClose ?
          `left ${Math.round(rect.left)}px / right ${Math.round(viewportWidth - rect.right)}px`
        : leftClose ? `left ${Math.round(rect.left)}px`
        : `right ${Math.round(viewportWidth - rect.right)}px`;
      findings.push({
        id: 'body-text-viewport-edge',
        snippet: `<${tag.toLowerCase()}> with ${textLen}-char body bleeds to viewport edge (${which})`,
      });
    }
  }

  // --- Tight line height ---
  if (
    hasDirectText &&
    textLen > 50 &&
    !['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag) &&
    lineHeightPx != null &&
    fontSize > 0
  ) {
    const ratio = lineHeightPx / fontSize;

    if (ratio > 0 && ratio < 1.3) {
      findings.push({
        id: 'tight-leading',
        snippet: `line-height ${ratio.toFixed(2)}x (need >=1.3)`,
      });
    }
  }

  // --- Justified text (without hyphens) ---
  if (hasDirectText && style.textAlign === 'justify') {
    const hyphens = style.hyphens || style.webkitHyphens || '';

    if (hyphens !== 'auto') {
      findings.push({
        id: 'justified-text',
        snippet: 'text-align: justify without hyphens: auto',
      });
    }
  }

  // --- Tiny body text ---
  // Only flag actual body content, not UI labels (buttons, tabs, badges, captions, footer text, etc.)
  if (hasDirectText && textLen > 20 && fontSize < 12) {
    const skipTags = [
      'sub',
      'sup',
      'code',
      'kbd',
      'samp',
      'var',
      'caption',
      'figcaption',
    ];
    const inUIContext =
      el.closest &&
      el.closest(
        'button, a, label, summary, pre, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], nav, footer, [aria-hidden="true"], [class*="badge" i], [class*="caption" i], [class*="chip" i], [class*="code" i], [class*="console" i], [class*="diff" i], [class*="label" i], [class*="meta" i], [class*="mock" i], [class*="pill" i], [class*="preview" i], [class*="tag" i], [class*="terminal" i], [class*="writes" i]'
      );
    const isUppercase = style.textTransform === 'uppercase';

    if (!skipTags.includes(tag) && !inUIContext && !isUppercase) {
      findings.push({id: 'tiny-text', snippet: `${fontSize}px body text`});
    }
  }

  // --- All-caps body text ---
  if (
    hasDirectText &&
    textLen > 30 &&
    style.textTransform === 'uppercase' &&
    !['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
  ) {
    findings.push({
      id: 'all-caps-body',
      snippet: `text-transform: uppercase on ${textLen} chars of body text`,
    });
  }

  // --- Wide letter spacing on body text ---
  if (
    hasDirectText &&
    textLen > 20 &&
    style.textTransform !== 'uppercase' &&
    letterSpacingPx != null &&
    letterSpacingPx > 0 &&
    fontSize > 0
  ) {
    const trackingEm = letterSpacingPx / fontSize;

    if (trackingEm > 0.05) {
      findings.push({
        id: 'wide-tracking',
        snippet: `letter-spacing: ${trackingEm.toFixed(2)}em on body text`,
      });
    }
  }

  // --- Crushed letter spacing (mirror of wide-tracking) ---
  // Tracking pulled tighter than ~-0.05em crushes characters into each other.
  // Optical tightening that display type legitimately wants (around -0.02em)
  // stays well above this floor.
  if (
    hasDirectText &&
    textLen > 20 &&
    fontSize > 0 &&
    letterSpacingPx != null &&
    letterSpacingPx < 0
  ) {
    const trackingEm = letterSpacingPx / fontSize;

    if (trackingEm <= -0.05) {
      const excerpt = (el.textContent || '')
        .trim()
        .replaceAll(/\s+/g, ' ')
        .slice(0, 40);
      findings.push({
        id: 'extreme-negative-tracking',
        snippet: `letter-spacing: ${trackingEm.toFixed(2)}em — "${excerpt}"`,
      });
    }
  }

  return findings;
};

const checkElementQualityDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  const style = getComputedStyle(element);
  const hasDirectText = [...element.childNodes].some(
    (n) => n.nodeType === 3 && n.textContent.trim().length > 10
  );
  const textLength = element.textContent?.trim().length || 0;
  // Browser getComputedStyle resolves everything to px — direct parseFloat
  // works.
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const lineHeightPx = resolveLengthPx(style.lineHeight, fontSize);
  const letterSpacingPx = resolveLengthPx(style.letterSpacing, fontSize);
  const rect = element.getBoundingClientRect();
  const lineMax =
    (typeof window !== 'undefined' &&
      window.__IMPECCABLE_CONFIG__?.lineLengthMax) ||
    80;
  const viewportWidth =
    (typeof window === 'undefined' ? 0 : window.innerWidth) || 0;

  return checkQuality({
    el: element,
    fontSize,
    hasDirectText,
    letterSpacingPx,
    lineHeightPx,
    lineMax,
    rect,
    style,
    tag,
    textLen: textLength,
    viewportWidth,
    win: typeof window === 'undefined' ? null : window,
  });
};

// Pure page-level skipped-heading walk. Takes a Document so it works in both
// the browser and jsdom.
const checkPageQualityFromDocument = (document_) => {
  const findings = [];
  const headings = document_.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let prevLevel = 0;
  let prevText = '';

  for (const h of headings) {
    const level = Number.parseInt(h.tagName[1]);
    const text = (h.textContent || '')
      .trim()
      .replaceAll(/\s+/g, ' ')
      .slice(0, 60);

    if (prevLevel > 0 && level > prevLevel + 1) {
      findings.push({
        id: 'skipped-heading',
        snippet: `<h${prevLevel}> "${prevText}" followed by <h${level}> "${text}" (missing h${prevLevel + 1})`,
      });
    }
    prevLevel = level;
    prevText = text;
  }

  return findings;
};

// Browser adapter (returns the legacy { type, detail } shape used by the overlay loop)
const checkPageQualityDOM = () =>
  checkPageQualityFromDocument(document).map((f) => ({
    detail: f.snippet,
    type: f.id,
  }));

// Node adapters — take pre-extracted jsdom computed style

// jsdom doesn't lay out OR resolve em/rem/% to px — so we pre-resolve every
// CSS length the rule needs ourselves (walking the parent chain for
// font-size inheritance), and pass `rect: null` to skip the two rules that
// genuinely need element rects (line-length, cramped-padding).
const checkElementQuality = (element, style, tag, window) => {
  const hasDirectText = [...element.childNodes].some(
    (n) => n.nodeType === 3 && n.textContent.trim().length > 10
  );
  const textLength = element.textContent?.trim().length || 0;
  const fontSize = resolveFontSizePx(element, window);
  const lineHeightPx = resolveLengthPx(style.lineHeight, fontSize);
  const letterSpacingPx = resolveLengthPx(style.letterSpacing, fontSize);

  return checkQuality({
    el: element,
    fontSize,
    hasDirectText,
    letterSpacingPx,
    lineHeightPx,
    rect: null,
    style,
    tag,
    textLen: textLength,
    win: window,
  });
};

const checkElementBorders = (tag, style, overrides, resolvedRadius) => {
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  const colors = {};
  const widths = {};

  for (const s of sides) {
    widths[s] = Number.parseFloat(style[`border${s}Width`]) || 0;
    colors[s] = style[`border${s}Color`] || '';

    // jsdom silently drops any border shorthand containing var(), leaving
    // both width and color empty on the computed style. When the detectHtml
    // pre-pass pulled a resolved value off the rule, use it to fill in the
    // missing side so the side-tab check can run. Real browsers resolve
    // var() natively, so this fallback is a no-op in the browser path.
    if (widths[s] === 0 && overrides && overrides[s]) {
      widths[s] = overrides[s].width;
      colors[s] = overrides[s].color;
    } else if (
      colors[s] &&
      colors[s].startsWith('var(') &&
      overrides &&
      overrides[s]
    ) {
      // Longhand case: jsdom kept the width but left the color as the
      // literal `var(...)` string. Substitute the resolved color.
      colors[s] = overrides[s].color;
    }
  }
  // resolvedRadius lets the caller pre-resolve the radius via
  // resolveBorderRadiusPx so the value survives jsdom 29.1.0's broken
  // shorthand serialization. Falls back to the computed value for tests
  // and browser callers that don't pre-resolve.
  const radius =
    resolvedRadius == null ?
      Number.parseFloat(style.borderRadius) || 0
    : resolvedRadius;

  return checkBorders(tag, widths, colors, radius);
};

const checkElementColors = (
  element,
  style,
  tag,
  window,
  customPropertyMap,
  hasAnchorInheritRule
) => {
  const directText = [...element.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join('');
  const hasDirectText = directText.trim().length > 0;

  const effectiveBg = resolveBackground(element, window, customPropertyMap);
  // jsdom returns literal "var(--X)" / "oklch(...)" for color, so plain
  // parseRgb misses Tailwind-tokenized text colors. Resolve through the
  // customPropMap first; fall back to parseRgb for vanilla rgb() pages.
  let textColor =
    customPropertyMap ?
      parseColorResolved(style.color, customPropertyMap)
    : null;
  if (!textColor) textColor = parseRgb(style.color);

  // Anchor-inherit FP workaround: jsdom's UA stylesheet has `:link { color:
  // blue }` at high specificity. The page's `a { color: inherit }` rule
  // (Tailwind v4 preflight) loses to jsdom even though it WINS in real
  // browsers (Chrome's UA wraps :link in :where() — zero specificity).
  // When the page declares the inherit rule AND we see jsdom's default
  // link blue on an anchor, walk to the nearest non-anchor ancestor and
  // use its color instead.
  if (
    hasAnchorInheritRule &&
    textColor &&
    textColor.r === 0 &&
    textColor.g === 0 &&
    textColor.b === 238 &&
    (tag === 'a' || element.closest?.('a'))
  ) {
    let current = element.parentElement;

    while (current && current.tagName !== 'HTML') {
      if (current.tagName !== 'A') {
        const ps = window.getComputedStyle(current);
        const inh =
          (customPropertyMap ?
            parseColorResolved(ps.color, customPropertyMap)
          : null) || parseRgb(ps.color);

        if (inh && !(inh.r === 0 && inh.g === 0 && inh.b === 238)) {
          textColor = inh;
          break;
        }
      }
      current = current.parentElement;
    }
  }

  return checkColors({
    bgClip: style.webkitBackgroundClip || style.backgroundClip || '',
    bgColor: readOwnBackgroundColor(element, style),
    bgImage: style.backgroundImage || '',
    classList: element.getAttribute?.('class') || element.className || '',
    effectiveBg,
    effectiveBgStops:
      effectiveBg ? null : resolveGradientStops(element, window),
    fontSize: Number.parseFloat(style.fontSize) || 16,
    fontWeight: Number.parseInt(style.fontWeight) || 400,
    hasDirectText,
    isEmojiOnly: isEmojiOnlyText(directText),
    tag,
    textColor,
  });
};

const checkElementIconTile = (element, tag, window) => {
  if (!HEADING_TAGS.has(tag)) return [];
  const sibling = element.previousElementSibling;
  if (!sibling) return [];

  const sibStyle = window.getComputedStyle(sibling);
  // jsdom doesn't lay out — read explicit pixel dimensions from CSS instead.
  const sibWidth = Number.parseFloat(sibStyle.width) || 0;
  const sibHeight = Number.parseFloat(sibStyle.height) || 0;

  const iconChild = sibling.querySelector(
    'svg, i[data-lucide], i[class*="fa-"], i[class*="icon"]'
  );
  let iconWidth = 0;

  if (iconChild) {
    const iconStyle = window.getComputedStyle(iconChild);
    iconWidth =
      Number.parseFloat(iconStyle.width) ||
      Number.parseFloat(iconChild.getAttribute('width')) ||
      0;
  }
  // Or: tile contains an emoji/symbol character directly as its only content
  const sibDirectText = [...sibling.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join('');
  const hasInlineEmojiIcon =
    sibling.children.length === 0 && isEmojiOnlyText(sibDirectText);

  return checkIconTile({
    hasIconChild: !!iconChild || hasInlineEmojiIcon,
    headingTag: tag,
    headingText: element.textContent || '',
    headingTop: 0, // jsdom: no layout, skip vertical-stacking gate
    iconChildWidth: iconWidth,
    siblingBgColor: parseRgb(sibStyle.backgroundColor),
    siblingBgImage: sibStyle.backgroundImage || '',
    siblingBorderRadius: resolveBorderRadiusPx(
      sibling,
      sibStyle,
      sibWidth,
      window
    ),
    siblingBorderWidth: Number.parseFloat(sibStyle.borderTopWidth) || 0,
    siblingBottom: 0,
    siblingHeight: sibHeight,
    siblingTag: sibling.tagName.toLowerCase(),
    siblingWidth: sibWidth,
  });
};

const checkElementItalicSerif = (element, style, tag) => {
  if (tag !== 'h1' && tag !== 'h2') return [];

  return checkItalicSerif({
    fontFamily: style.fontFamily || '',
    fontSize: Number.parseFloat(style.fontSize) || 0,
    fontStyle: style.fontStyle || '',
    headingText: element.textContent || '',
    tag,
  });
};

const checkElementHeroEyebrow = (
  element,
  style,
  tag,
  window,
  customPropertyMap
) => {
  if (tag !== 'h1') return [];
  const sibling = element.previousElementSibling;
  if (!sibling) return [];
  const sibStyle = window.getComputedStyle(sibling);
  // Resolve Tailwind v4 CSS-variable wrappers (font-weight:var(--font-weight-bold)
  // etc.) before parsing. jsdom returns these verbatim from getComputedStyle;
  // without resolution every style-based gate fails silently on Tailwind v4 builds.
  const fontSizeRaw =
    customPropertyMap ?
      resolveVarRefs(sibStyle.fontSize, customPropertyMap)
    : sibStyle.fontSize;
  const fontWeightRaw =
    customPropertyMap ?
      resolveVarRefs(sibStyle.fontWeight, customPropertyMap)
    : sibStyle.fontWeight;
  const letterSpacingRaw =
    customPropertyMap ?
      resolveVarRefs(sibStyle.letterSpacing, customPropertyMap)
    : sibStyle.letterSpacing;
  const colorRaw =
    customPropertyMap ?
      resolveVarRefs(sibStyle.color, customPropertyMap)
    : sibStyle.color;
  const headingFontSizeRaw =
    customPropertyMap ?
      resolveVarRefs(style.fontSize, customPropertyMap)
    : style.fontSize;
  const siblingFontSize = Number.parseFloat(fontSizeRaw) || 0;

  // resolveLengthPx returns null for 'normal' / 'auto'; coerce to 0 so the
  // gate falls through cleanly. jsdom returns letter-spacing verbatim
  // (e.g. '0.15em'), unlike real browsers, so this conversion is required.
  return checkHeroEyebrow({
    headingFontSize: Number.parseFloat(headingFontSizeRaw) || 0,
    headingTag: tag,
    headingText: element.textContent || '',
    siblingColor: colorRaw || '',
    siblingFontSize,
    siblingFontWeight: fontWeightRaw || '',
    siblingLetterSpacing:
      resolveLengthPx(letterSpacingRaw, siblingFontSize) || 0,
    siblingTag: sibling.tagName.toLowerCase(),
    siblingText: sibling.textContent || '',
    siblingTextTransform: sibStyle.textTransform || '',
  });
};

const checkRepeatedSectionKickersFromDocument = (document_, win) => {
  const candidates = collectRepeatedSectionKickerCandidates(
    document_,
    (element) => win.getComputedStyle(element),
    (value, fontSize) => resolveLengthPx(value, fontSize) || 0
  );

  return checkRepeatedSectionKickers({candidates});
};

const checkElementMotion = (tag, style) =>
  checkMotion({
    animationName: style.animationName || '',
    classList: '',
    tag,
    timingFunctions: [
      style.animationTimingFunction,
      style.transitionTimingFunction,
    ]
      .filter(Boolean)
      .join(' '),
    transitionProperty: style.transitionProperty || '',
  });

const checkElementGlow = (tag, style, effectiveBg) => {
  if (!style.boxShadow || style.boxShadow === 'none') return [];

  return checkGlow({boxShadow: style.boxShadow, effectiveBg, tag});
};

// ─── Section 6: Page-Level Checks ───────────────────────────────────────────

// Browser page-level checks — use document/getComputedStyle globals

const checkTypography = () => {
  const findings = [];

  // Walk actual text-bearing elements and tally font usage by *computed style*.
  // This is much more accurate than scanning CSS rules — it ignores rules that
  // exist in the stylesheet but apply to nothing (e.g. demo classes showing
  // anti-patterns), and counts what the user actually sees.
  const fontUsage = new Map(); // primary font name → count of elements
  let totalTextElements = 0;

  for (const element of document.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, li, td, th, dd, blockquote, figcaption, a, button, label, span'
  )) {
    // Skip impeccable's own elements
    if (
      element.closest &&
      element.closest(
        '.impeccable-overlay, .impeccable-label, .impeccable-banner, .impeccable-tooltip'
      )
    )
      continue;
    // Only count elements that actually have visible direct text
    const hasText = [...element.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (!hasText) continue;
    const style = getComputedStyle(element);
    const ff = style.fontFamily;
    if (!ff) continue;
    const stack = ff.split(',').map((f) =>
      f
        .trim()
        .replaceAll(/^['"]|['"]$/g, '')
        .toLowerCase()
    );
    const primary = stack.find((f) => f && !GENERIC_FONTS.has(f));
    if (!primary) continue;
    fontUsage.set(primary, (fontUsage.get(primary) || 0) + 1);
    totalTextElements++;
  }

  if (totalTextElements >= 20) {
    // A font is "primary" if it's used by at least 15% of text elements
    const PRIMARY_THRESHOLD = 0.15;

    for (const [font, count] of fontUsage) {
      const share = count / totalTextElements;
      if (share < PRIMARY_THRESHOLD) continue;
      if (!OVERUSED_FONTS.has(font)) continue;
      if (isBrandFontOnOwnDomain(font)) continue;
      findings.push({
        detail: `Primary font: ${font} (${Math.round(share * 100)}% of text)`,
        type: 'overused-font',
      });
    }

    // Single-font check: only one distinct primary font across all text
    if (fontUsage.size === 1) {
      const only = [...fontUsage.keys()][0];
      findings.push({detail: `only font used is ${only}`, type: 'single-font'});
    }
  }

  const sizes = new Set();

  for (const element of document.querySelectorAll(
    'h1,h2,h3,h4,h5,h6,p,span,a,li,td,th,label,button,div'
  )) {
    const fs = Number.parseFloat(getComputedStyle(element).fontSize);
    if (fs > 0 && fs < 200) sizes.add(Math.round(fs * 10) / 10);
  }

  if (sizes.size >= 3) {
    const sorted = [...sizes].sort((a, b) => a - b);
    const ratio = sorted.at(-1) / sorted[0];

    if (ratio < 2) {
      findings.push({
        detail: `Sizes: ${sorted.map((s) => `${s}px`).join(', ')} (ratio ${ratio.toFixed(1)}:1)`,
        type: 'flat-type-hierarchy',
      });
    }
  }

  return findings;
};

const isCardLikeDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  if (
    SAFE_TAGS.has(tag) ||
    [
      'canvas',
      'img',
      'input',
      'picture',
      'select',
      'textarea',
      'video',
    ].includes(tag)
  )
    return false;
  const style = getComputedStyle(element);
  const cls = element.getAttribute('class') || '';
  const hasShadow =
    (style.boxShadow && style.boxShadow !== 'none') ||
    /\bshadow(?:-sm|-md|-lg|-xl|-2xl)?\b/.test(cls);
  const hasBorder = /\bborder\b/.test(cls);
  const hasRadius =
    Number.parseFloat(style.borderRadius) > 0 ||
    /\brounded(?:-sm|-md|-lg|-xl|-2xl|-full)?\b/.test(cls);
  const hasBg =
    (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
    /\bbg-(?:white|gray-\d+|slate-\d+)\b/.test(cls);

  return isCardLikeFromProps(hasShadow, hasBorder, hasRadius, hasBg);
};

const checkLayout = () => {
  const findings = [];
  const flaggedEls = new Set();

  for (const element of document.querySelectorAll('*')) {
    if (!isCardLikeDOM(element) || flaggedEls.has(element)) continue;
    const cls = element.getAttribute('class') || '';
    const style = getComputedStyle(element);
    if (style.position === 'absolute' || style.position === 'fixed') continue;
    if (/\b(?:dropdown|popover|tooltip|menu|modal|dialog)\b/i.test(cls))
      continue;
    if ((element.textContent?.trim().length || 0) < 10) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 30) continue;

    let parent = element.parentElement;

    while (parent) {
      if (isCardLikeDOM(parent)) {
        flaggedEls.add(element);
        break;
      }
      parent = parent.parentElement;
    }
  }

  for (const element of flaggedEls) {
    let isAncestor = false;

    for (const other of flaggedEls) {
      if (other !== element && element.contains(other)) {
        isAncestor = true;
        break;
      }
    }
    if (!isAncestor)
      findings.push({
        detail: 'Card inside card',
        el: element,
        type: 'nested-cards',
      });
  }

  return findings;
};

// Node page-level checks — take document/window as parameters

const checkPageTypography = (document_, win) => {
  const findings = [];

  const fonts = new Set();
  const overusedFound = new Set();

  for (const sheet of document_.styleSheets) {
    let rules;

    try {
      rules = sheet.cssRules || sheet.rules;
    } catch {
      continue;
    }
    if (!rules) continue;

    for (const rule of rules) {
      if (rule.type !== 1) continue;
      const ff = rule.style?.fontFamily;
      if (!ff) continue;
      const stack = ff.split(',').map((f) =>
        f
          .trim()
          .replaceAll(/^['"]|['"]$/g, '')
          .toLowerCase()
      );
      const primary = stack.find((f) => f && !GENERIC_FONTS.has(f));

      if (primary) {
        fonts.add(primary);
        if (OVERUSED_FONTS.has(primary)) overusedFound.add(primary);
      }
    }
  }

  // Check Google Fonts links in HTML
  const html = document_.documentElement?.outerHTML || '';
  const gfRe = /fonts\.googleapis\.com\/css2?\?family=([^&"'\s]+)/gi;
  let m;

  while ((m = gfRe.exec(html)) !== null) {
    const families = m[1]
      .split('|')
      .map((f) => f.split(':', 1)[0].replaceAll('+', ' ').toLowerCase());

    for (const f of families) {
      fonts.add(f);
      if (OVERUSED_FONTS.has(f)) overusedFound.add(f);
    }
  }

  // Also parse raw HTML/style content for font-family (jsdom may not expose all via CSSOM)
  const ffRe = /font-family\s*:\s*([^;}]+)/gi;
  let fm;

  while ((fm = ffRe.exec(html)) !== null) {
    for (const f of fm[1].split(',').map((f) =>
      f
        .trim()
        .replaceAll(/^['"]|['"]$/g, '')
        .toLowerCase()
    )) {
      if (f && !GENERIC_FONTS.has(f)) {
        fonts.add(f);
        if (OVERUSED_FONTS.has(f)) overusedFound.add(f);
      }
    }
  }

  for (const font of overusedFound) {
    findings.push({id: 'overused-font', snippet: `Primary font: ${font}`});
  }

  // Single font
  if (fonts.size === 1) {
    const els = document_.querySelectorAll('*');

    if (els.length >= 20) {
      findings.push({
        id: 'single-font',
        snippet: `only font used is ${[...fonts][0]}`,
      });
    }
  }

  // Flat type hierarchy
  const sizes = new Set();
  const textEls = document_.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, label, button, div'
  );

  for (const element of textEls) {
    const fontSize = Number.parseFloat(win.getComputedStyle(element).fontSize);
    // Filter out sub-8px values (jsdom doesn't resolve relative units properly)
    if (fontSize >= 8 && fontSize < 200)
      sizes.add(Math.round(fontSize * 10) / 10);
  }

  if (sizes.size >= 3) {
    const sorted = [...sizes].sort((a, b) => a - b);
    const ratio = sorted.at(-1) / sorted[0];

    if (ratio < 2) {
      findings.push({
        id: 'flat-type-hierarchy',
        snippet: `Sizes: ${sorted.map((s) => `${s}px`).join(', ')} (ratio ${ratio.toFixed(1)}:1)`,
      });
    }
  }

  return findings;
};

const isCardLike = (element, win) => {
  const tag = element.tagName.toLowerCase();
  if (
    SAFE_TAGS.has(tag) ||
    [
      'canvas',
      'img',
      'input',
      'picture',
      'select',
      'textarea',
      'video',
    ].includes(tag)
  )
    return false;

  const style = win.getComputedStyle(element);
  const rawStyle = element.getAttribute?.('style') || '';
  const cls = element.getAttribute?.('class') || '';

  const hasShadow =
    (style.boxShadow && style.boxShadow !== 'none') ||
    /\bshadow(?:-sm|-md|-lg|-xl|-2xl)?\b/.test(cls) ||
    /box-shadow/i.test(rawStyle);
  const hasBorder = /\bborder\b/.test(cls);
  const widthPx = Number.parseFloat(style.width) || 0;
  const hasRadius =
    resolveBorderRadiusPx(element, style, widthPx, win) > 0 ||
    /\brounded(?:-sm|-md|-lg|-xl|-2xl|-full)?\b/.test(cls) ||
    /border-radius/i.test(rawStyle);
  const hasBg =
    /\bbg-(?:white|gray-\d+|slate-\d+)\b/.test(cls) ||
    /background(?:-color)?\s*:\s*(?!transparent)/i.test(rawStyle);

  return isCardLikeFromProps(hasShadow, hasBorder, hasRadius, hasBg);
};

const checkPageLayout = (document_, win) => {
  const findings = [];

  // Nested cards
  const allEls = document_.querySelectorAll('*');
  const flaggedEls = new Set();

  for (const element of allEls) {
    if (!isCardLike(element, win)) continue;
    if (flaggedEls.has(element)) continue;

    const tag = element.tagName.toLowerCase();
    const cls = element.getAttribute?.('class') || '';
    const rawStyle = element.getAttribute?.('style') || '';

    if (['code', 'pre'].includes(tag)) continue;
    if (
      /\b(?:absolute|fixed)\b/.test(cls) ||
      /position\s*:\s*(?:absolute|fixed)/i.test(rawStyle)
    )
      continue;
    if ((element.textContent?.trim().length || 0) < 10) continue;
    if (/\b(?:dropdown|popover|tooltip|menu|modal|dialog)\b/i.test(cls))
      continue;

    // Walk up to find card-like ancestor
    let parent = element.parentElement;

    while (parent) {
      if (isCardLike(parent, win)) {
        flaggedEls.add(element);
        break;
      }
      parent = parent.parentElement;
    }
  }

  // Only report innermost nested cards
  for (const element of flaggedEls) {
    let isAncestorOfFlagged = false;

    for (const other of flaggedEls) {
      if (other !== element && element.contains(other)) {
        isAncestorOfFlagged = true;
        break;
      }
    }

    if (!isAncestorOfFlagged) {
      findings.push({
        id: 'nested-cards',
        snippet: `Card inside card (${element.tagName.toLowerCase()})`,
      });
    }
  }

  return findings;
};

// ─── Cream / beige palette (the default "tasteful" AI surface) ────────────────
// A warm, lightly-tinted off-white page background — light, with R≥G≥B and a
// small warm tint (not white, not a strong color). The current reflex surface.
const isCreamColor = (rgb) => {
  if (!rgb) return false;
  const {b, g, r} = rgb;
  if (Math.min(r, g, b) < 209) return false; // must be light
  if (!(r >= g && g >= b)) return false; // warm ordering
  const warmth = r - b;

  return warmth >= 6 && warmth <= 48; // tinted, not white, not strong
};

// Tailwind background utilities that render as a warm off-white surface. The
// static engine doesn't fetch Tailwind's CSS, so a `bg-amber-50` on <body>
// resolves to nothing in computed style — catch it from the class list
// instead. Candidate tokens map to their actual Tailwind hex and are still
// filtered through isCreamColor, so neutral grays (stone) and over-saturated
// shades drop out on their own.
const TAILWIND_BG_HEX = {
  'bg-amber-50': '#fffbeb',
  'bg-amber-100': '#fef3c7',
  'bg-orange-50': '#fff7ed',
  'bg-orange-100': '#ffedd5',
  'bg-stone-50': '#fafaf9',
  'bg-stone-100': '#f5f5f4',
  'bg-stone-200': '#e7e5e4',
  'bg-yellow-50': '#fefce8',
};

const creamFromClassList = (cls) => {
  if (!cls) return null;
  // Arbitrary value: bg-[#f5f0e6] / bg-[rgb(245_240_230)] (underscores = spaces).
  const arb = cls.match(/\bbg-\[([^\]]+)\]/);
  if (arb && isCreamColor(parseAnyColor(arb[1].replaceAll('_', ' '))))
    return `bg-[${arb[1]}]`;

  // Named warm-light utilities.
  for (const [tok, hex] of Object.entries(TAILWIND_BG_HEX)) {
    if (
      new RegExp(String.raw`(^|\s)${tok}($|\s)`).test(cls) &&
      isCreamColor(parseAnyColor(hex))
    )
      return tok;
  }

  return null;
};

const checkCreamPalette = (document_, win) => {
  const findings = [];
  const body =
    document_.body ||
    (document_.querySelector ? document_.querySelector('body') : null);
  if (!body) return findings;
  const html = document_.documentElement;
  const getCS = (element) =>
    win ? win.getComputedStyle(element) : getComputedStyle(element);

  // 1. Computed background — covers inline / <style> / linked CSS, and Tailwind
  //    once it's actually rendered (browser path).
  let bg = readOwnBackgroundColor(body, getCS(body));

  if ((!bg || bg.a === 0) && html)
    bg = readOwnBackgroundColor(html, getCS(html));

  if (isCreamColor(bg)) {
    findings.push({
      id: 'cream-palette',
      snippet: `cream/beige page background rgb(${bg.r}, ${bg.g}, ${bg.b})`,
    });

    return findings;
  }

  // 2. Tailwind class fallback — for the static path, where utility classes
  //    never resolve to computed CSS.
  for (const element of [body, html]) {
    const tok = creamFromClassList(
      element && element.getAttribute ? element.getAttribute('class') : ''
    );

    if (tok) {
      findings.push({
        id: 'cream-palette',
        snippet: `cream/beige page background (Tailwind ${tok})`,
      });
      break;
    }
  }

  return findings;
};

// ─── Oversized hero headline ────────────────────────────────────────────────
// Fires when a *long* headline is set at display size and actually dominates
// the viewport. A punchy one- or two-word headline at the same size is a
// legitimate stylistic choice, and a large-but-contained two-line hero should
// pass too — length and viewport share together are the tell.
const OVERSIZED_H1_FONT_PX = 72;
const OVERSIZED_H1_MIN_CHARS = 40;
const OVERSIZED_H1_MIN_VIEWPORT_HEIGHT_RATIO = 0.28;
const OVERSIZED_H1_MIN_VIEWPORT_AREA_RATIO = 0.25;

const checkOversizedH1 = ({
  fontSize,
  headingText,
  rect = null,
  tag,
  viewportHeight = 0,
  viewportWidth = 0,
}) => {
  if (tag !== 'h1') return [];
  const textLength = headingText.length;

  if (
    fontSize >= OVERSIZED_H1_FONT_PX &&
    textLength >= OVERSIZED_H1_MIN_CHARS
  ) {
    let viewportDetail = '';

    if (rect && viewportWidth > 0 && viewportHeight > 0) {
      const heightRatio = rect.height / viewportHeight;
      const areaRatio =
        (rect.width * rect.height) / (viewportWidth * viewportHeight);
      const dominatesViewport =
        heightRatio >= OVERSIZED_H1_MIN_VIEWPORT_HEIGHT_RATIO ||
        areaRatio >= OVERSIZED_H1_MIN_VIEWPORT_AREA_RATIO;
      if (!dominatesViewport) return [];
      viewportDetail = `, ${Math.round(heightRatio * 100)}vh`;
    }

    return [
      {
        id: 'oversized-h1',
        snippet: `${Math.round(fontSize)}px h1, ${textLength} chars${viewportDetail} "${headingText.slice(0, 60)}"`,
      },
    ];
  }

  return [];
};

const checkElementOversizedH1 = (element, style, tag, window) => {
  if (tag !== 'h1') return [];
  const fontSize = resolveFontSizePx(element, window);
  const headingText = (element.textContent || '')
    .trim()
    .replaceAll(/\s+/g, ' ');

  return checkOversizedH1({fontSize, headingText, tag});
};

const checkElementOversizedH1DOM = (element) => {
  const tag = element.tagName.toLowerCase();
  if (tag !== 'h1') return [];
  const style = getComputedStyle(element);
  const fontSize = Number.parseFloat(style.fontSize) || 0;
  const headingText = (element.textContent || '')
    .trim()
    .replaceAll(/\s+/g, ' ');
  const rect = element.getBoundingClientRect();
  const viewportWidth =
    (typeof window === 'undefined' ? 0 : window.innerWidth) || 0;
  const viewportHeight =
    (typeof window === 'undefined' ? 0 : window.innerHeight) || 0;

  return checkOversizedH1({
    fontSize,
    headingText,
    rect,
    tag,
    viewportHeight,
    viewportWidth,
  });
};

// ─── GPT tell: hairline border + wide diffuse shadow (gated --gpt) ────────────
const CSS_COLOR_TOKEN_RE =
  /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\b(?:black|white|transparent|currentcolor)\b/gi;

const shadowLayerAlpha = (layer) => {
  CSS_COLOR_TOKEN_RE.lastIndex = 0;
  const match = CSS_COLOR_TOKEN_RE.exec(layer);
  if (!match) return 1;
  if (match[0].toLowerCase() === 'transparent') return 0;
  const parsed = parseAnyColor(match[0]);

  return parsed ? (parsed.a ?? 1) : 1;
};

const shadowMaxBlurPx = (boxShadow, {minAlpha = 0} = {}) => {
  if (!boxShadow || boxShadow === 'none') return 0;
  let maxBlur = 0;

  // Split into layers on commas not inside parentheses (rgba(...) etc.).
  for (const layer of boxShadow.split(/,(?![^()]*\))/)) {
    if (shadowLayerAlpha(layer) < minAlpha) continue;
    // Strip colors and keywords (rgba()/hsl()/hex/named/inset/px), leaving the
    // ordered length tokens: offsetX offsetY blur [spread]. Static jsdom keeps
    // unitless zeros ("0 0 24px"); browsers normalize to px ("0px 0px 24px") —
    // both reduce to the same numbers here.
    const cleaned = layer
      .replace(CSS_COLOR_TOKEN_RE, ' ')
      .replaceAll(/\b[a-z]+\b/gi, ' ');
    const nums = [...cleaned.matchAll(/-?\d*\.?\d+/g)].map((m) =>
      Number.parseFloat(m[0])
    );
    if (nums.length >= 3) maxBlur = Math.max(maxBlur, nums[2]);
  }

  return maxBlur;
};

const cssColorAlpha = (value) => {
  if (cssColorIsTransparent(value)) return 0;
  const parsed = parseAnyColor(value);

  return parsed ? (parsed.a ?? 1) : 1;
};

const checkGptThinBorderWideShadow = ({
  borderColors,
  borderWidths,
  boxShadow,
}) => {
  const visibleThinBorders = borderWidths
    .map((width, index) => ({
      alpha: cssColorAlpha(borderColors?.[index] || ''),
      width,
    }))
    .filter(({alpha, width}) => width > 0 && width <= 1.5 && alpha >= 0.28);
  const maxBorder = Math.max(0, ...visibleThinBorders.map(({width}) => width));
  const blur = shadowMaxBlurPx(boxShadow, {minAlpha: 0.12});

  if (visibleThinBorders.length >= 2 && blur >= 16) {
    return [
      {
        id: 'gpt-thin-border-wide-shadow',
        snippet: `${maxBorder}px border + ${Math.round(blur)}px shadow blur`,
      },
    ];
  }

  return [];
};

const borderWidthsFromStyle = (style) => [
  Number.parseFloat(style.borderTopWidth) || 0,
  Number.parseFloat(style.borderRightWidth) || 0,
  Number.parseFloat(style.borderBottomWidth) || 0,
  Number.parseFloat(style.borderLeftWidth) || 0,
];

const borderColorsFromStyle = (style) => [
  style.borderTopColor || '',
  style.borderRightColor || '',
  style.borderBottomColor || '',
  style.borderLeftColor || '',
];

const checkElementGptBorderShadow = (element, style) =>
  checkGptThinBorderWideShadow({
    borderColors: borderColorsFromStyle(style),
    borderWidths: borderWidthsFromStyle(style),
    boxShadow: style.boxShadow || '',
  });

const checkElementGptBorderShadowDOM = (element) => {
  const style = getComputedStyle(element);

  return checkGptThinBorderWideShadow({
    borderColors: borderColorsFromStyle(style),
    borderWidths: borderWidthsFromStyle(style),
    boxShadow: style.boxShadow || '',
  });
};

// ─── Clipped overflow container ───────────────────────────────────────────────
// A clipping container (overflow hidden/clip, not a scroll region) wrapping an
// absolutely/fixed-positioned descendant clips popovers/menus that must escape.
const classSelector = (element) => {
  const cls =
    (element.getAttribute ?
      element.getAttribute('class')
    : element.className) || '';
  const tokens = String(cls).trim().split(/\s+/).filter(Boolean);
  const tag = element.tagName ? element.tagName.toLowerCase() : 'el';

  return tokens.length > 0 ? `${tag}.${tokens.join('.')}` : tag;
};

const positionedChildIsDecorative = (child) => {
  if (!child || typeof child.getAttribute !== 'function') return false;
  if (child.closest?.('[aria-hidden="true"]')) return true;
  const role = (child.getAttribute('role') || '').toLowerCase();
  if (role === 'none' || role === 'presentation') return true;
  const tag = child.tagName ? child.tagName.toLowerCase() : '';
  if (['canvas', 'img', 'svg', 'video'].includes(tag)) return true;
  const ident = `${child.getAttribute('class') || ''} ${child.getAttribute('id') || ''}`;

  if (
    /\b(art|bg|background|badge|blob|crop|decor|dot|glow|grain|image|mask|ornament|overlay|photo|scrim|shadow|shine|texture)\b/i.test(
      ident
    ) &&
    !positionedChildHasSubstantiveContent(child)
  ) {
    return true;
  }

  return false;
};

const POSITIONED_CHILD_INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'summary',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="dialog"]',
  '[role="link"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tooltip"]',
].join(',');

const positionedChildHasSubstantiveContent = (child) => {
  const text = (child.textContent || '').replaceAll(/\s+/g, ' ').trim();
  if (text.length > 0) return true;

  if (typeof child.matches === 'function') {
    try {
      if (child.matches(POSITIONED_CHILD_INTERACTIVE_SELECTOR)) return true;
    } catch {}
  }

  if (typeof child.querySelector === 'function') {
    try {
      if (child.querySelector(POSITIONED_CHILD_INTERACTIVE_SELECTOR))
        return true;
    } catch {}
  }

  return false;
};

const clippingContainerIsIntentionalViewport = (element) => {
  if (!element || typeof element.getAttribute !== 'function') return false;
  const roleDescription = (
    element.getAttribute('aria-roledescription') || ''
  ).toLowerCase();
  if (/\b(carousel|slider)\b/.test(roleDescription)) return true;
  const ident =
    `${element.getAttribute('class') || ''} ${element.getAttribute('id') || ''}`.toLowerCase();

  return (
    /\b(carousel|comparison|compare|fisheye|marquee|preview|scroller|slider|slideshow|split|viewport)\b/.test(
      ident
    ) || /\b(demo-area|demo-stage|demo-viewport)\b/.test(ident)
  );
};

const elementRect = (element) => {
  if (!element || typeof element.getBoundingClientRect !== 'function')
    return null;

  try {
    const rect = element.getBoundingClientRect();
    if (!rect) return null;
    const values = [
      rect.top,
      rect.right,
      rect.bottom,
      rect.left,
      rect.width,
      rect.height,
    ];
    if (!values.every(Number.isFinite)) return null;
    if (rect.width <= 0 && rect.height <= 0) return null;

    return rect;
  } catch {
    return null;
  }
};

const positionedStyleImpliesEscape = (style) => {
  const values = [
    style.top,
    style.right,
    style.bottom,
    style.left,
    style.inset,
    style.insetBlock,
    style.insetInline,
    style.insetBlockStart,
    style.insetBlockEnd,
    style.insetInlineStart,
    style.insetInlineEnd,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  for (const value of values) {
    if (/(^|[\s(])-+(?:\d|\.)/.test(value)) return true;
    if (/(^|[\s(])100(?:\.0+)?%/.test(value)) return true;
  }

  return false;
};

const positionedChildEscapesClip = (element, child, clipX, clipY) => {
  const parentRect = elementRect(element);
  const childRect = elementRect(child);
  if (!parentRect || !childRect) return null;
  const threshold = 2;

  return Boolean(
    (clipX &&
      (childRect.left < parentRect.left - threshold ||
        childRect.right > parentRect.right + threshold)) ||
    (clipY &&
      (childRect.top < parentRect.top - threshold ||
        childRect.bottom > parentRect.bottom + threshold))
  );
};

const checkClippedOverflow = (element, style, getStyle) => {
  const clips = (v) => v === 'hidden' || v === 'clip';
  const scrolls = (v) => v === 'auto' || v === 'scroll';
  const ov = style.overflow || '';
  const ox = style.overflowX || '';
  const oy = style.overflowY || '';
  const clipX = clips(ox) || clips(ov);
  const clipY = clips(oy) || clips(ov);
  const anyClip = clipX || clipY;
  const anyScroll = scrolls(ox) || scrolls(oy) || scrolls(ov);
  if (!anyClip || anyScroll) return [];
  if (clippingContainerIsIntentionalViewport(element)) return [];
  if (!element.querySelectorAll) return [];

  for (const child of element.querySelectorAll('*')) {
    const childStyle = getStyle(child);
    const pos = childStyle.position || '';

    if (pos === 'absolute' || pos === 'fixed') {
      if (positionedChildIsDecorative(child)) continue;
      const escapes = positionedChildEscapesClip(element, child, clipX, clipY);
      if (escapes === false) continue;
      if (escapes === null && !positionedStyleImpliesEscape(childStyle))
        continue;

      return [
        {
          id: 'clipped-overflow-container',
          snippet: `${classSelector(element)} clips a positioned child`,
        },
      ];
    }
  }

  return [];
};

const checkElementClippedOverflow = (element, style, tag, window) =>
  checkClippedOverflow(element, style, (n) => window.getComputedStyle(n));

const checkElementClippedOverflowDOM = (element) => {
  const style = getComputedStyle(element);

  return checkClippedOverflow(element, style, (n) => getComputedStyle(n));
};

// ─── Text overflow (browser-only: needs scrollWidth/clientWidth) ──────────────
const TEXT_OVERFLOW_SKIP_TAGS = new Set([
  'canvas',
  'code',
  'marquee',
  'option',
  'pre',
  'select',
  'svg',
  'textarea',
]);

const metricLengthPx = (value, fontSizePx = 16) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  return resolveLengthPx(value, fontSizePx);
};

const firstMetricLengthPx = (fontSizePx, ...values) => {
  for (const value of values) {
    const parsed = metricLengthPx(value, fontSizePx);
    if (parsed !== null) return parsed;
  }

  return null;
};

const expandBoxShorthand = (parts) => {
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];

  return [parts[0], parts[1], parts[2], parts[3]];
};

const clippedByInset = (clipPath) => {
  const match = String(clipPath || '')
    .trim()
    .toLowerCase()
    .match(/^inset\s*\(([^)]*)\)$/);
  if (!match) return false;
  const beforeRound = match[1].split(/\s+round\s+/, 1)[0].trim();
  if (!beforeRound) return false;
  const values = expandBoxShorthand(beforeRound.split(/\s+/).slice(0, 4));
  const percents = values.map((value) =>
    String(value)
      .trim()
      .match(/^(-?\d+(?:\.\d+)?)%$/)
  );
  if (percents.some((match) => !match)) return false;
  const [top, right, bottom, left] = percents.map((match) =>
    Number.parseFloat(match[1])
  );

  return top + bottom >= 100 || left + right >= 100;
};

const clippedByRect = (clip) => {
  const match = String(clip || '')
    .trim()
    .toLowerCase()
    .match(/^rect\s*\(([^)]*)\)$/);
  if (!match) return false;
  const values = match[1]
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length !== 4) return false;
  const [top, right, bottom, left] = values.map((value) =>
    metricLengthPx(value, 16)
  );
  if ([bottom, left, right, top].includes(null)) return false;

  return bottom <= top || right <= left;
};

const isScreenReaderOnlyTextStyle = (style, metrics = {}) => {
  if (!style) return false;
  const overflowValues = [style.overflow, style.overflowX, style.overflowY].map(
    (value) => String(value || '').toLowerCase()
  );
  const clipsOverflow = overflowValues.some(
    (value) => value === 'hidden' || value === 'clip'
  );

  const fontSize = metricLengthPx(style.fontSize, 16) || 16;
  const width = firstMetricLengthPx(
    fontSize,
    metrics.width,
    metrics.clientWidth,
    style.width,
    style.inlineSize
  );
  const height = firstMetricLengthPx(
    fontSize,
    metrics.height,
    metrics.clientHeight,
    style.height,
    style.blockSize
  );
  const isTiny = width !== null && height !== null && width <= 2 && height <= 2;
  const isAbsolutelyHidden =
    String(style.position || '').toLowerCase() === 'absolute' &&
    isTiny &&
    clipsOverflow;

  const clipPath = String(style.clipPath || style.webkitClipPath || '').trim();
  const clip = String(style.clip || '').trim();

  return isAbsolutelyHidden || clippedByInset(clipPath) || clippedByRect(clip);
};

const isRenderedForBrowserRule = (element) => {
  for (
    let current = element;
    current && current.nodeType === 1;
    current = current.parentElement
  ) {
    if (current.getAttribute?.('aria-hidden') === 'true') return false;
    const style = getComputedStyle(current);
    const visibility = String(style.visibility || '').toLowerCase();
    if (
      style.display === 'none' ||
      visibility === 'hidden' ||
      visibility === 'collapse'
    )
      return false;
    if ((Number.parseFloat(style.opacity) || 0) <= 0.01) return false;
    if (String(style.contentVisibility || '').toLowerCase() === 'hidden')
      return false;
  }

  return true;
};

const checkElementTextOverflowDOM = (element) => {
  const tag = element.tagName.toLowerCase();
  if (TEXT_OVERFLOW_SKIP_TAGS.has(tag)) return [];
  if (!isRenderedForBrowserRule(element)) return [];
  // Only the element that actually owns overflowing text — not its ancestors,
  // which inherit a wider scrollWidth from the spilling descendant.
  const hasDirectText = [...element.childNodes].some(
    (n) => n.nodeType === 3 && n.textContent.trim().length > 0
  );
  if (!hasDirectText) return [];
  const style = getComputedStyle(element);
  const rect =
    element.getBoundingClientRect ? element.getBoundingClientRect() : null;
  if (
    isScreenReaderOnlyTextStyle(style, {
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      height: rect?.height,
      width: rect?.width,
    })
  )
    return [];
  const isScrollRegion = (s) =>
    /(auto|scroll)/.test(s.overflowX || '') ||
    /(auto|scroll)/.test(s.overflow || '');
  if (isScrollRegion(style)) return [];

  // A scrollable ancestor means this overflow is intentional and scrollable.
  for (let p = element.parentElement; p; p = p.parentElement) {
    if (isScrollRegion(getComputedStyle(p))) return [];
  }
  const delta = element.scrollWidth - element.clientWidth;

  if (element.clientWidth > 0 && delta >= 16) {
    return [
      {
        id: 'text-overflow',
        snippet: `${classSelector(element)} overflows its box by ${Math.round(delta)}px`,
      },
    ];
  }

  return [];
};

export {
  buildCustomPropertyMap as buildCustomPropMap,
  checkBorders,
  checkClippedOverflow,
  checkColors,
  checkCreamPalette,
  checkElementAIPaletteDOM,
  checkElementBorders,
  checkElementBordersDOM,
  checkElementClippedOverflow,
  checkElementClippedOverflowDOM,
  checkElementColors,
  checkElementColorsDOM,
  checkElementGlow,
  checkElementGlowDOM,
  checkElementGptBorderShadow,
  checkElementGptBorderShadowDOM,
  checkElementHeroEyebrow,
  checkElementHeroEyebrowDOM,
  checkElementIconTile,
  checkElementIconTileDOM,
  checkElementItalicSerif,
  checkElementItalicSerifDOM,
  checkElementMotion,
  checkElementMotionDOM,
  checkElementOversizedH1,
  checkElementOversizedH1DOM,
  checkElementQuality,
  checkElementQualityDOM,
  checkElementTextOverflowDOM,
  checkGlow,
  checkGptThinBorderWideShadow,
  checkHeroEyebrow,
  checkHtmlPatterns,
  checkIconTile,
  checkItalicSerif,
  checkLayout,
  checkMotion,
  checkOversizedH1,
  checkPageLayout,
  checkPageQualityDOM,
  checkPageQualityFromDocument as checkPageQualityFromDoc,
  checkPageTypography,
  checkQuality,
  checkRepeatedSectionKickers,
  checkRepeatedSectionKickersDOM,
  checkRepeatedSectionKickersFromDocument as checkRepeatedSectionKickersFromDoc,
  checkTypography,
  cleanInlineText,
  collectRepeatedSectionKickerCandidates,
  isAccentColor,
  isCardLike,
  isCardLikeDOM,
  isCardLikeFromProps,
  isCreamColor,
  isEmojiOnlyText,
  isRepeatedKickerCandidate,
  isScreenReaderOnlyTextStyle,
  oklchToRgb,
  parseAnyColor,
  parseColorResolved,
  parseRadiusToPx,
  readOwnBackgroundColor,
  resolveBackground,
  resolveBorderRadiusPx,
  resolveFontSizePx,
  resolveGradientStops,
  resolveLengthPx,
  resolveSerif,
  resolveVarRefs,
  shadowMaxBlurPx,
};
