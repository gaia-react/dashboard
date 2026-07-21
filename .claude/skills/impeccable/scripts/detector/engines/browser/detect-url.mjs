import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {finding} from '../../findings.mjs';
import {
  profileFindingsAsync,
  profileStep,
  profileStepAsync,
} from '../../profile/profiler.mjs';
import {filterByProviders} from '../../registry/antipatterns.mjs';
import {captureVisualContrastCandidate} from '../visual/screenshot-contrast.mjs';

const serializeDesignSystemForBrowser = (designSystem) => {
  if (!designSystem?.present) return null;

  return {
    allowedColors: [...(designSystem.allowedColorKeys?.values?.() || [])]
      .map((entry) => entry?.color)
      .filter(
        (color) =>
          color &&
          Number.isFinite(color.r) &&
          Number.isFinite(color.g) &&
          Number.isFinite(color.b)
      )
      .map((color) => ({b: color.b, g: color.g, r: color.r})),
    allowedFonts: [...(designSystem.allowedFonts || [])],
    allowedRadii: (designSystem.allowedRadii || [])
      .map((entry) => Number(entry?.px))
      .filter((px) => Number.isFinite(px)),
    hasColors: designSystem.hasColors === true,
    hasFonts: designSystem.hasFonts === true,
    hasPillRadius: designSystem.hasPillRadius === true,
    hasRadii: designSystem.hasRadii === true,
    present: true,
  };
};

const runVisualContrastFallback = async (
  page,
  serializedGroups,
  options,
  profile,
  target
) => {
  if (options?.visualContrast === false) return [];
  const maxCandidates =
    Number.isFinite(options?.visualContrastMaxCandidates) ?
      options.visualContrastMaxCandidates
    : 12;
  const scrollOffscreen = options?.visualContrastScrollOffscreen !== false;
  const existingLowContrastSelectors = new Set(
    serializedGroups
      .filter((group) => group.findings?.some((f) => f.type === 'low-contrast'))
      .map((group) => group.selector)
      .filter(Boolean)
  );

  let browserAnalyses = [];
  const findings = [];

  if (options?.visualContrastBrowser !== false) {
    const browserFindings = await profileFindingsAsync(
      profile,
      {
        engine: 'browser',
        phase: 'visual-contrast',
        ruleId: 'browser-fallback',
        target,
      },
      async () => {
        browserAnalyses = await page.evaluate(
          async ({maxCandidates, scrollOffscreen}) => {
            if (typeof window.impeccableAnalyzeVisualContrast !== 'function')
              return [];

            return window.impeccableAnalyzeVisualContrast({
              maxCandidates,
              scrollOffscreen,
            });
          },
          {maxCandidates, scrollOffscreen}
        );

        return browserAnalyses
          .filter(
            (result) =>
              result.finding &&
              !existingLowContrastSelectors.has(result.selector)
          )
          .map((result) => result.finding);
      }
    );
    findings.push(...browserFindings);
  }

  let candidates = browserAnalyses.length > 0 ? browserAnalyses : [];

  if (candidates.length === 0) {
    candidates = await profileStepAsync(
      profile,
      {
        engine: 'browser',
        phase: 'visual-contrast',
        ruleId: 'collect-candidates',
        target,
      },
      () =>
        page.evaluate(
          ({maxCandidates}) => {
            if (
              typeof window.impeccableCollectVisualContrastCandidates !==
              'function'
            )
              return [];

            return window.impeccableCollectVisualContrastCandidates({
              maxCandidates,
            });
          },
          {maxCandidates}
        )
    );
  }

  const viewport = options?.viewport || {height: 800, width: 1280};
  const browserResolvedSelectors = new Set(
    browserAnalyses
      .filter((result) => result.status === 'fail' || result.status === 'pass')
      .map((result) => result.selector)
      .filter(Boolean)
  );
  const filtered = candidates.filter(
    (candidate) =>
      !existingLowContrastSelectors.has(candidate.selector) &&
      !browserResolvedSelectors.has(candidate.selector)
  );
  if (options?.visualContrastPixel === false) return findings;

  for (const candidate of filtered) {
    const result = await profileFindingsAsync(
      profile,
      {
        engine: 'browser',
        phase: 'visual-contrast',
        ruleId: 'pixel-diff',
        target,
      },
      async () => {
        const finding = await captureVisualContrastCandidate(
          page,
          candidate,
          viewport
        );

        return finding ? [finding] : [];
      }
    );
    findings.push(...result);
  }

  return findings;
};

// ---------------------------------------------------------------------------
// Puppeteer detection (for URLs)
// ---------------------------------------------------------------------------

const detectUrl = async (url, options = {}) => {
  const profile = options?.profile;
  const waitUntil = options?.waitUntil || 'networkidle0';
  const settleMs = Number.isFinite(options?.settleMs) ? options.settleMs : 0;
  const viewport = options?.viewport || {height: 800, width: 1280};
  const externalBrowser = options?.browser || null;
  let puppeteer;

  if (!externalBrowser) {
    try {
      puppeteer = await profileStepAsync(
        profile,
        {
          engine: 'browser',
          phase: 'setup',
          ruleId: 'import-puppeteer',
          target: url,
        },
        () => import('puppeteer')
      );
    } catch {
      throw new Error(
        'puppeteer is required for URL scanning. Install: npm install puppeteer'
      );
    }
  }

  // Read the browser detection script — reuse it instead of reimplementing
  const browserScriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'detect-antipatterns-browser.js'
  );
  let browserScript;

  try {
    browserScript = profileStep(
      profile,
      {
        engine: 'browser',
        phase: 'setup',
        ruleId: 'read-browser-script',
        target: url,
      },
      () => fs.readFileSync(browserScriptPath, 'utf-8')
    );
  } catch {
    throw new Error(`Browser script not found at ${browserScriptPath}`);
  }

  // CI runners (GitHub Actions Ubuntu) block unprivileged user namespaces, so
  // Chrome can't initialize its sandbox there. Disable the sandbox only when
  // running in CI; local users keep the default hardened launch.
  const launchArgs =
    process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
  const browser =
    externalBrowser ||
    (await profileStepAsync(
      profile,
      {
        engine: 'browser',
        phase: 'load',
        ruleId: 'launch-browser',
        target: url,
      },
      () => puppeteer.default.launch({args: launchArgs, headless: true})
    ));
  const page = await profileStepAsync(
    profile,
    {
      engine: 'browser',
      phase: 'load',
      ruleId: 'new-page',
      target: url,
    },
    () => browser.newPage()
  );
  let results = [];

  try {
    await profileStepAsync(
      profile,
      {
        engine: 'browser',
        phase: 'load',
        ruleId: 'set-viewport',
        target: url,
      },
      () => page.setViewport(viewport)
    );
    await profileStepAsync(
      profile,
      {
        engine: 'browser',
        phase: 'load',
        ruleId: `goto:${waitUntil}`,
        target: url,
      },
      () => page.goto(url, {timeout: 30_000, waitUntil})
    );

    if (settleMs > 0) {
      await profileStepAsync(
        profile,
        {
          engine: 'browser',
          phase: 'load',
          ruleId: 'settle',
          target: url,
        },
        () => new Promise((resolve) => setTimeout(resolve, settleMs))
      );
    }

    // Inject the browser detection script and collect results
    const browserDesignSystem = serializeDesignSystemForBrowser(
      options?.designSystem
    );
    await profileStepAsync(
      profile,
      {
        engine: 'browser',
        phase: 'scan',
        ruleId: 'configure-pure-detect',
        target: url,
      },
      () =>
        page.evaluate((designSystem) => {
          window.__IMPECCABLE_CONFIG__ = {
            ...window.__IMPECCABLE_CONFIG__,
            autoScan: false,
            ...(designSystem ? {designSystem} : {}),
          };
        }, browserDesignSystem)
    );
    await profileStepAsync(
      profile,
      {
        engine: 'browser',
        phase: 'scan',
        ruleId: 'inject-browser-script',
        target: url,
      },
      () => page.evaluate(browserScript)
    );
    let serializedGroups = [];
    results = await profileFindingsAsync(
      profile,
      {
        engine: 'browser',
        phase: 'scan',
        ruleId: 'browser-scan',
        target: url,
      },
      async () => {
        serializedGroups = await page.evaluate(() => {
          if (!window.impeccableDetect) return [];

          return window.impeccableDetect({decorate: false, serialize: true});
        });

        return serializedGroups.flatMap(({findings}) =>
          findings.map((f) => ({
            id: f.type,
            ignoreValue: f.ignoreValue || '',
            snippet: f.detail,
          }))
        );
      }
    );
    const visualFindings = await runVisualContrastFallback(
      page,
      serializedGroups,
      options,
      profile,
      url
    );
    results.push(...visualFindings);
  } finally {
    await profileStepAsync(
      profile,
      {
        engine: 'browser',
        phase: 'load',
        ruleId: 'close-page',
        target: url,
      },
      () => page.close().catch(() => {})
    );

    if (!externalBrowser) {
      await profileStepAsync(
        profile,
        {
          engine: 'browser',
          phase: 'load',
          ruleId: 'close-browser',
          target: url,
        },
        () => browser.close()
      );
    }
  }

  return filterByProviders(
    results.map((f) => {
      const item = finding(f.id, url, f.snippet);
      if (f.ignoreValue) item.ignoreValue = f.ignoreValue;

      return item;
    }),
    options.providers
  );
};

const createBrowserDetector = async (options = {}) => {
  let puppeteer;

  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error(
      'puppeteer is required for URL scanning. Install: npm install puppeteer'
    );
  }
  const launchArgs =
    options.launchArgs ||
    (process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []);
  const browser =
    options.browser ||
    (await puppeteer.default.launch({
      args: launchArgs,
      headless: options.headless ?? true,
    }));
  const ownsBrowser = !options.browser;
  const defaults = {
    settleMs: Number.isFinite(options.settleMs) ? options.settleMs : 100,
    viewport: options.viewport || {height: 800, width: 1280},
    waitUntil: options.waitUntil || 'load',
  };

  return {
    browser,
    close: async () => {
      if (ownsBrowser) await browser.close().catch(() => {});
    },
    detectUrl: async (url, scanOptions = {}) =>
      detectUrl(url, {
        ...defaults,
        ...scanOptions,
        browser,
      }),
  };
};

export {createBrowserDetector, detectUrl, runVisualContrastFallback};
