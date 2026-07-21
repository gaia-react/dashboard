// ─── Section 1: Constants ───────────────────────────────────────────────────

const SAFE_TAGS = new Set([
  'a',
  'blockquote',
  'body',
  'br',
  'button',
  'circle',
  'code',
  'defs',
  'g',
  'head',
  'hr',
  'html',
  'img',
  'input',
  'label',
  'li',
  'line',
  'link',
  'meta',
  'nav',
  'path',
  'polygon',
  'polyline',
  'pre',
  'rect',
  'script',
  'select',
  'span',
  'style',
  'svg',
  'td',
  'textarea',
  'th',
  'title',
  'tr',
  'use',
]);

// Per-check safe-tags override for the border (side-tab / border-accent)
// rule. We intentionally re-allow <label> here because card-shaped clickable
// labels (e.g. .checklist-item wrapping a checkbox + content) are one of the
// canonical side-tab anti-pattern shapes and must be detected. The rule's
// other preconditions (non-neutral color, width >= 2px on a single side,
// radius > 0 or width >= 3, element size >= 20x20 in the browser path)
// already filter out plain inline form labels so this does not introduce
// false positives. See modern-color-borders.html for the test matrix.
const BORDER_SAFE_TAGS = new Set([...SAFE_TAGS].filter((t) => t !== 'label'));

const OVERUSED_FONTS = new Set([
  'arial', // Newer monoculture (the Anthropic-skill / Vercel / GitHub default wave):
  'fraunces',
  'geist',
  'geist mono',
  'geist sans',
  'helvetica',
  'instrument sans',
  'instrument serif', // Older monoculture (still ubiquitous):
  'inter',
  'lato',
  'mona sans',
  'montserrat',
  'open sans',
  'plus jakarta sans',
  'recoleta',
  'roboto',
  'space grotesk',
]);

// Brand-associated fonts: don't flag these as "overused" on the brand's own domains.
// Keys are font names, values are arrays of hostname suffixes where the font is allowed.
const GOOGLE_DOMAINS = [
  'google.com',
  'youtube.com',
  'android.com',
  'chromium.org',
  'chrome.com',
  'web.dev',
  'gstatic.com',
  'firebase.google.com',
];
const VERCEL_DOMAINS = ['vercel.com', 'nextjs.org', 'v0.app'];
const GITHUB_DOMAINS = ['github.com', 'githubnext.com'];
const BRAND_FONT_DOMAINS = {
  geist: VERCEL_DOMAINS,
  'geist mono': VERCEL_DOMAINS,
  'geist sans': VERCEL_DOMAINS,
  'google sans': GOOGLE_DOMAINS,
  'mona sans': GITHUB_DOMAINS,
  'product sans': GOOGLE_DOMAINS,
  roboto: GOOGLE_DOMAINS,
};

const isBrandFontOnOwnDomain = (font) => {
  if (typeof location === 'undefined') return false;
  const allowed = BRAND_FONT_DOMAINS[font];
  if (!allowed) return false;
  const host = location.hostname.toLowerCase();

  return allowed.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
};

const GENERIC_FONTS = new Set([
  '-apple-system',
  'blinkmacsystemfont',
  'cursive',
  'fantasy',
  'inherit',
  'initial',
  'monospace',
  'revert',
  'sans-serif',
  'segoe ui',
  'serif',
  'system-ui',
  'ui-monospace',
  'ui-rounded',
  'ui-sans-serif',
  'ui-serif',
  'unset',
]);

// WCAG large text thresholds are defined in points: 18pt normal text and
// 14pt bold text. Browsers expose font-size in CSS pixels at 96px per inch.
const WCAG_LARGE_TEXT_PX = 18 * (96 / 72);
const WCAG_LARGE_BOLD_TEXT_PX = 14 * (96 / 72);

// Serif faces that show up in italic-display heroes. The rule also fires when
// the primary face is unknown but the stack ends in the generic `serif` token,
// which catches custom/private faces with a serif fallback.
const KNOWN_SERIF_FONTS = new Set([
  'baskerville',
  'canela',
  'cormorant',
  'cormorant garamond',
  'dm serif display',
  'dm serif text',
  'eb garamond',
  'fraunces',
  'freight display',
  'freight text',
  'garamond',
  'georgia',
  'gt sectra',
  'ibm plex serif',
  'instrument serif',
  'libre baskerville',
  'libre caslon',
  'lora',
  'merriweather',
  'newsreader',
  'ogg',
  'playfair',
  'playfair display',
  'recoleta',
  'source serif',
  'source serif 4',
  'source serif pro',
  'spectral',
  'tiempos',
  'tiempos headline',
  'tiempos text',
  'times',
  'times new roman',
  'vollkorn',
]);

export {
  BORDER_SAFE_TAGS,
  BRAND_FONT_DOMAINS,
  GENERIC_FONTS,
  GITHUB_DOMAINS,
  GOOGLE_DOMAINS,
  isBrandFontOnOwnDomain,
  KNOWN_SERIF_FONTS,
  OVERUSED_FONTS,
  SAFE_TAGS,
  VERCEL_DOMAINS,
  WCAG_LARGE_BOLD_TEXT_PX,
  WCAG_LARGE_TEXT_PX,
};
