import fs from 'node:fs';
import path from 'node:path';
import {
  checkSourceDesignSystem,
  collectStaticDesignSystemFindings,
  mergeDesignSystemFindings,
} from '../../design-system.mjs';
import {finding} from '../../findings.mjs';
import {
  profileFindings,
  profileStep,
  profileStepAsync,
} from '../../profile/profiler.mjs';
import {filterByProviders} from '../../registry/antipatterns.mjs';
import {
  checkCreamPalette,
  checkElementBorders,
  checkElementClippedOverflow,
  checkElementColors,
  checkElementGlow,
  checkElementGptBorderShadow,
  checkElementHeroEyebrow,
  checkElementIconTile,
  checkElementItalicSerif,
  checkElementMotion,
  checkElementOversizedH1,
  checkElementQuality,
  checkHtmlPatterns,
  checkPageLayout,
  checkPageQualityFromDoc as checkPageQualityFromDocument,
  checkRepeatedSectionKickersFromDoc as checkRepeatedSectionKickersFromDocument,
  resolveBackground,
  resolveBorderRadiusPx,
} from '../../rules/checks.mjs';
import {GENERIC_FONTS, OVERUSED_FONTS} from '../../shared/constants.mjs';
import {applyInlineIgnores} from '../../shared/inline-ignores.mjs';
import {isFullPage} from '../../shared/page.mjs';
import {detectText, runTextContentAnalyzers} from '../regex/detect-text.mjs';
import {
  buildStaticStyleMap,
  buildStaticWindow,
  collectStaticCssText,
  StaticDocument,
} from './css-cascade.mjs';

const checkStaticPageTypography = (document, window) => {
  const findings = [];
  const fonts = new Set();
  const overusedFound = new Set();

  for (const element of document.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, li, td, th, dd, blockquote, figcaption, a, button, label, span, div'
  )) {
    const hasText = element.childNodes.some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (!hasText) continue;
    const ff = window.getComputedStyle(element).fontFamily || '';
    const stack = ff.split(',').map((f) =>
      f
        .trim()
        .replaceAll(/^['"]|['"]$/g, '')
        .toLowerCase()
    );
    const primary = stack.find((f) => f && !GENERIC_FONTS.has(f));
    if (!primary) continue;
    fonts.add(primary);
    if (OVERUSED_FONTS.has(primary)) overusedFound.add(primary);
  }

  for (const font of overusedFound) {
    findings.push({id: 'overused-font', snippet: `Primary font: ${font}`});
  }

  if (fonts.size === 1 && document.querySelectorAll('*').length >= 20) {
    findings.push({
      id: 'single-font',
      snippet: `only font used is ${[...fonts][0]}`,
    });
  }
  const sizes = new Set();

  for (const element of document.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, label, button, div'
  )) {
    const fontSize = Number.parseFloat(
      window.getComputedStyle(element).fontSize
    );
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

const checkElementBrokenImage = (element) => {
  const src =
    (element.getAttribute && element.getAttribute('src')) ??
    element.attribs?.src;

  // Missing src attribute entirely
  if (src === undefined || src === null) {
    return [{id: 'broken-image', snippet: '<img> with no src attribute'}];
  }
  const trimmed = String(src).trim();

  // Empty or placeholder-only src values
  if (trimmed === '' || trimmed === '#') {
    return [{id: 'broken-image', snippet: `<img src="${src}">`}];
  }

  return [];
};

const STATIC_ELEMENT_RULES = [
  {
    id: 'border-rules',
    run: (element, tag, style, window, customPropertyMap) =>
      checkElementBorders(
        tag,
        style,
        null,
        resolveBorderRadiusPx(
          element,
          style,
          Number.parseFloat(style.width) || 0,
          window
        )
      ),
    selector: '*',
  },
  {
    id: 'color-rules',
    run: (element, tag, style, window, customPropertyMap) =>
      checkElementColors(element, style, tag, window, customPropertyMap, false),
    selector: '*',
  },
  {
    id: 'dark-glow',
    run: (element, tag, style, window, customPropertyMap) =>
      checkElementGlow(
        tag,
        style,
        resolveBackground(
          element.parentElement || element,
          window,
          customPropertyMap
        )
      ),
    selector: '*',
  },
  {
    id: 'motion-rules',
    run: (element, tag, style) => checkElementMotion(tag, style),
    selector: '*',
  },
  {
    id: 'icon-tile-stack',
    run: (element, tag, _style, window) =>
      checkElementIconTile(element, tag, window),
    selector: 'h1,h2,h3,h4,h5,h6',
  },
  {
    id: 'italic-serif-display',
    run: (element, tag, style) => checkElementItalicSerif(element, style, tag),
    selector: 'h1,h2',
  },
  {
    id: 'hero-eyebrow-chip',
    run: (element, tag, style, window, customPropertyMap) =>
      checkElementHeroEyebrow(element, style, tag, window, customPropertyMap),
    selector: 'h1',
  },
  {
    id: 'broken-image',
    run: (element) => checkElementBrokenImage(element),
    selector: 'img',
  },
  {
    id: 'quality-rules',
    run: (element, tag, style, window) =>
      checkElementQuality(element, style, tag, window),
    selector: '*',
  },
  {
    id: 'oversized-h1',
    run: (element, tag, style, window) =>
      checkElementOversizedH1(element, style, tag, window),
    selector: 'h1',
  },
  {
    id: 'clipped-overflow-container',
    run: (element, tag, style, window) =>
      checkElementClippedOverflow(element, style, tag, window),
    selector: '*',
  },
  {
    id: 'gpt-thin-border-wide-shadow',
    run: (element, tag, style) => checkElementGptBorderShadow(element, style),
    selector: '*',
  },
];

const detectHtml = async (filePath, options = {}) => {
  const profile = options?.profile;
  const html = profileStep(
    profile,
    {
      engine: 'static-html',
      phase: 'setup',
      ruleId: 'read-html',
      target: filePath,
    },
    () => fs.readFileSync(filePath, 'utf-8')
  );

  let modules;

  try {
    modules = await profileStepAsync(
      profile,
      {
        engine: 'static-html',
        phase: 'setup',
        ruleId: 'import-static-parser',
        target: filePath,
      },
      async () => {
        const [htmlparser2, cssSelect, csstree, domutils] = await Promise.all([
          import('htmlparser2'),
          import('css-select'),
          import('css-tree'),
          import('domutils'),
        ]);

        return {
          csstree,
          domutils,
          is: cssSelect.is,
          parseDocument: htmlparser2.parseDocument,
          selectAll: cssSelect.selectAll,
          selectOne: cssSelect.selectOne,
        };
      }
    );
  } catch {
    return detectText(html, filePath, options);
  }

  const resolvedPath = path.resolve(filePath);
  const fileDir = path.dirname(resolvedPath);
  const root = profileStep(
    profile,
    {
      engine: 'static-html',
      phase: 'parse-html',
      ruleId: 'parse-document',
      target: filePath,
    },
    () =>
      modules.parseDocument(html, {
        lowerCaseAttributeNames: false,
        lowerCaseTags: true,
      })
  );

  const cssText = collectStaticCssText(
    root,
    fileDir,
    profile,
    filePath,
    modules
  );
  const document = new StaticDocument(root, modules);
  buildStaticStyleMap(root, document, cssText, modules, profile, filePath);
  const window = buildStaticWindow(document);

  const customPropertyMap = null;

  const findings = [];
  const runElementCheck = (ruleId, callback) =>
    profile ?
      profileFindings(
        profile,
        {engine: 'static-html', phase: 'element', ruleId, target: filePath},
        callback
      )
    : callback();

  const visitedByRule = new Map();

  for (const rule of STATIC_ELEMENT_RULES) {
    const elements = document.querySelectorAll(rule.selector);
    visitedByRule.set(rule.id, elements.length);

    for (const element of elements) {
      const tag = element.tagName.toLowerCase();
      const style = window.getComputedStyle(element);

      for (const f of runElementCheck(rule.id, () =>
        rule.run(element, tag, style, window, customPropertyMap)
      )) {
        findings.push(finding(f.id, filePath, f.snippet));
      }
    }
  }

  if (options?.designSystem) {
    const sourceDesignFindings = profileFindings(
      profile,
      {
        engine: 'static-html',
        phase: 'source',
        ruleId: 'design-system',
        target: filePath,
      },
      () =>
        checkSourceDesignSystem(html, filePath, {
          designSystem: options.designSystem,
        })
    );
    const staticDesignFindings = profileFindings(
      profile,
      {
        engine: 'static-html',
        phase: 'page',
        ruleId: 'design-system',
        target: filePath,
      },
      () =>
        collectStaticDesignSystemFindings(
          document,
          window,
          filePath,
          options.designSystem
        )
    );
    findings.push(
      ...mergeDesignSystemFindings(staticDesignFindings, sourceDesignFindings)
    );
  }

  if (isFullPage(html)) {
    const runPageCheck = (ruleId, callback) =>
      profile ?
        profileFindings(
          profile,
          {engine: 'static-html', phase: 'page', ruleId, target: filePath},
          callback
        )
      : callback();

    for (const f of runPageCheck('typography-rules', () =>
      checkStaticPageTypography(document, window)
    )) {
      findings.push(finding(f.id, filePath, f.snippet));
    }

    for (const f of runPageCheck('repeated-section-kickers', () =>
      checkRepeatedSectionKickersFromDocument(document, window)
    )) {
      findings.push(finding(f.id, filePath, f.snippet));
    }

    for (const f of runPageCheck('layout-rules', () =>
      checkPageLayout(document, window)
    )) {
      findings.push(finding(f.id, filePath, f.snippet));
    }

    for (const f of runPageCheck('cream-palette', () =>
      checkCreamPalette(document, window)
    )) {
      findings.push(finding(f.id, filePath, f.snippet));
    }

    for (const f of runPageCheck('skipped-heading', () =>
      checkPageQualityFromDocument(document)
    )) {
      findings.push(finding(f.id, filePath, f.snippet));
    }

    for (const f of runPageCheck('html-patterns', () =>
      checkHtmlPatterns(html).filter(
        (item) => item.id !== 'bounce-easing' && item.id !== 'layout-transition'
      )
    )) {
      findings.push(finding(f.id, filePath, f.snippet));
    }

    // Text-content analyzers (em-dash overuse, marketing buzzwords,
    // numbered section markers, aphoristic cadence) live in the regex
    // engine. Call them from here so .html files get the same coverage
    // as .css/.tsx files. These are scoped to text content only and
    // don't overlap with static-html's element/page rules.
    for (const f of runPageCheck('text-content', () =>
      runTextContentAnalyzers(html, filePath, options)
    )) {
      findings.push(finding(f.antipattern, filePath, f.snippet));
    }
  }

  const byProvider = filterByProviders(findings, options.providers);

  // Static-HTML findings carry no line number, so only whole-file
  // `impeccable-disable` directives apply here — exactly the standalone-document
  // waiver this primitive targets. Bypassed by `--no-config` / `--no-inline-ignores`.
  return options?.inlineIgnores === false ?
      byProvider
    : applyInlineIgnores(byProvider, html);
};

export {checkStaticPageTypography, STATIC_ELEMENT_RULES, detectHtml};
