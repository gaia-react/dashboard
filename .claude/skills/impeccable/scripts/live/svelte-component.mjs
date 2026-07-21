/**
 * Svelte live-mode component injection helpers.
 *
 * Variants are real .svelte components under node_modules/.impeccable-live/<session-id>/.
 * The browser mounts them via Svelte 5 mount(); accept inlines the chosen
 * variant back into the route source with props mapped to original bindings.
 */

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SVELTE_COMPONENT_ROOT = 'node_modules/.impeccable-live';

export const SVELTE_RUNTIME_FILE = `${SVELTE_COMPONENT_ROOT}/__runtime.js`;

export const DEFERRED_ACCEPTS_FILE =
  '.impeccable/live/deferred-svelte-component-accepts.json';

const MUSTACHE_RE = /\{([^{}]+)\}/g;

export const applyDeferredSvelteComponentAccepts = (cwd = process.cwd()) => {
  const file = deferredAcceptsPath(cwd);
  const data = readDeferredAccepts(cwd);
  const pending = Array.isArray(data.accepts) ? data.accepts : [];
  const results = [];
  const remaining = [];

  for (const entry of pending) {
    try {
      const manifest = findSvelteComponentManifest(entry.id, cwd);

      if (!manifest) {
        results.push({error: 'manifest not found', id: entry.id, ok: false});
        remaining.push(entry);
        continue;
      }
      const result = inlineSvelteComponentAccept(
        manifest,
        entry.variantNum,
        entry.paramValues || null,
        cwd
      );
      results.push({id: entry.id, ok: result.handled !== false, result});
      if (result.handled === false) remaining.push(entry);
    } catch (error) {
      results.push({error: error.message, id: entry.id, ok: false});
      remaining.push(entry);
    }
  }

  if (remaining.length > 0) {
    fs.writeFileSync(
      file,
      `${JSON.stringify({accepts: remaining}, null, 2)}\n`,
      'utf-8'
    );
  } else {
    try {
      fs.rmSync(file, {force: true});
    } catch {}
  }

  return {
    applied: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
};

export const buildPropContract = (expressions) =>
  expressions.map((expr, index) => {
    const derived = derivePropertyName(expr, index);

    return {
      expr,
      placeholder: `{${expr}}`,
      prop: derived,
    };
  });

export const buildSvelteComponentCssAuthoring = (count) => {
  const variantNumbers = Array.from({length: count}, (_, index) => index + 1);

  return {
    forbidden: [
      'Do not use @scope blocks in Svelte component variants.',
      'Do not copy live DOM snapshot text into markup when propContract provides bindings.',
      'Do not add data-impeccable-* attributes inside component files. Svelte parses { in attribute values as an expression, so data-impeccable-params with JSON breaks the build; use componentDir/params.json instead.',
    ],
    mode: 'svelte-component',
    paramsFile: 'params.json',
    requirements: [
      'Write each variant as a real Svelte component file (v1.svelte, v2.svelte, ...).',
      'Keep the prop names from propContract; bind dynamic text with {propName}, not literal snapshot text.',
      'Put variant CSS in the component <style> block using semantic class selectors.',
      'Author param-driven CSS against var(--p-<id>, default) and [data-p-<id>] using :global(...) so the runtime knob values reach the mounted root.',
      'Declare params in componentDir/params.json keyed by variant number (e.g. {"1": [...], "2": [...]}), NOT as a data-impeccable-params attribute.',
      'Do not use @scope or data-impeccable-variant selectors in component files.',
      'Do not edit the route source file during generation; only edit files under componentDir.',
    ],
    rulePattern: '.semantic-class { ... }',
    selectorExamples: variantNumbers.map(
      () => '.expense-row { padding: 22px; }'
    ),
    strategy: 'component-style-block',
    styleTag: null,
  };
};

export const componentSessionDir = (id, cwd = process.cwd()) =>
  path.join(cwd, SVELTE_COMPONENT_ROOT, id);

export const deferredAcceptsPath = (cwd = process.cwd()) => {
  const key = createHash('sha1')
    .update(path.resolve(cwd))
    .digest('hex')
    .slice(0, 16);

  return path.join(
    os.tmpdir(),
    'impeccable-live',
    key,
    'deferred-svelte-component-accepts.json'
  );
};

export const ensureRuntimeHelper = (cwd = process.cwd()) => {
  const file = path.join(cwd, SVELTE_RUNTIME_FILE);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `export { mount, unmount } from 'svelte';\n`, 'utf-8');

  return file;
};

/**
 * Extract ordered unique mustache expressions from markup (not inside <!-- -->).
 */
export const extractMustacheExpressions = (text) => {
  const expressions = [];
  const seen = new Set();
  const lines = String(text || '').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('<!--')) continue;
    let match;
    MUSTACHE_RE.lastIndex = 0;

    while ((match = MUSTACHE_RE.exec(line)) !== null) {
      const expr = match[1].trim();
      if (!expr || seen.has(expr)) continue;
      seen.add(expr);
      expressions.push(expr);
    }
  }

  return expressions;
};

export const findSvelteComponentManifest = (id, cwd = process.cwd()) => {
  const direct = manifestPathForSession(id, cwd);

  if (fs.existsSync(direct)) {
    return readManifest(direct);
  }
  const root = path.join(cwd, SVELTE_COMPONENT_ROOT);
  if (!fs.existsSync(root)) return null;

  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name, 'manifest.json');
    if (!fs.existsSync(candidate)) continue;

    try {
      const manifest = readManifest(candidate);
      if (manifest?.id === id) return {...manifest, manifestPath: candidate};
    } catch {
      /* skip */
    }
  }

  return null;
};

export const inlineSvelteComponentAccept = (
  manifest,
  variantNumber,
  paramValues = null,
  cwd = process.cwd()
) => {
  const sourceFile = resolveSourceFile(manifest.sourceFile, cwd);
  const variantPath = path.join(
    cwd,
    manifest.componentDir,
    `v${variantNumber}.svelte`
  );
  const resultBase = {
    carbonize: false,
    componentDir: manifest.componentDir,
    file: manifest.sourceFile,
    previewMode: 'svelte-component',
    sourceFile: manifest.sourceFile,
  };

  if (!fs.existsSync(variantPath)) {
    return {
      error: `Variant ${variantNumber} not found`,
      handled: false,
      ...resultBase,
    };
  }

  const {cssLines, markup} = parseSvelteComponentFile(
    fs.readFileSync(variantPath, 'utf-8')
  );

  if (manifest.mode === 'insert') {
    return inlineSvelteComponentInsertAccept({
      cssLines,
      cwd,
      manifest,
      markup,
      paramValues,
      resultBase,
      sourceFile,
      variantNum: variantNumber,
    });
  }

  const rootTag = matchOpeningTag(markup)?.tag || 'div';
  const contract = manifest.propContract || [];
  const mergedMarkup = mergeOriginalTopLevelAttributes(
    markup,
    manifest.originalMarkup || ''
  );
  const restoredMarkup = substitutePropsWithExprs(mergedMarkup, contract)
    .split('\n')
    .map((line) => line.trimEnd());

  const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
  const sourceLines = sourceContent.split('\n');
  const start = Number(manifest.sourceStartLine) - 1;
  const end = Number(manifest.sourceEndLine) - 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end >= sourceLines.length
  ) {
    return {
      error: `Invalid source line range for ${manifest.sourceFile}`,
      handled: false,
      ...resultBase,
    };
  }

  const indent = sourceLines[start].match(/^(\s*)/)?.[1] || '';
  const indentedMarkup = restoredMarkup.map((line) => {
    if (line.trim() === '') return '';

    return indent + line.trimStart();
  });

  let newLines = [
    ...sourceLines.slice(0, start),
    ...indentedMarkup,
    ...sourceLines.slice(end + 1),
  ];

  const sanitizedCss = sanitizeAcceptedSvelteCss(
    cssLines,
    variantNumber,
    paramValues,
    rootTag
  );
  const bakedCss = bakeParamValuesInCss(sanitizedCss, paramValues);

  if (bakedCss.length > 0) {
    newLines = appendCssToSvelteStyle(newLines, bakedCss);
  }

  try {
    fs.writeFileSync(sourceFile, newLines.join('\n'), 'utf-8');
  } catch (error) {
    return {
      error: `Failed to write Svelte source: ${error.message}`,
      handled: false,
      ...resultBase,
    };
  }
  removeSvelteComponentSession(manifest.id, cwd);

  return {
    handled: true,
    ...resultBase,
  };
};

export const manifestPathForSession = (id, cwd = process.cwd()) =>
  path.join(componentSessionDir(id, cwd), 'manifest.json');

export const parseSvelteComponentFile = (content) => {
  const text = String(content || '');
  const scriptMatch = text.match(
    /^([\s\S]*?)<script\b[^>]*>[\s\S]*?<\/script>/i
  );
  const withoutScript = scriptMatch ? text.slice(scriptMatch[0].length) : text;
  const styleMatch = withoutScript.match(/<style\b[^>]*>[\s\S]*?<\/style\s*>/i);
  const styleBlock = styleMatch ? styleMatch[0] : '';
  const markup =
    styleMatch ?
      withoutScript.slice(0, styleMatch.index).trim()
    : withoutScript.trim();
  const cssLines =
    styleBlock ?
      styleBlock
        .replace(/^<style\b[^>]*>/i, '')
        .replace(/<\/style\s*>$/i, '')
        .split('\n')
        .map((line) => line.trimEnd())
    : [];
  while (cssLines.length > 0 && cssLines[0].trim() === '') cssLines.shift();
  while (cssLines.length > 0 && cssLines.at(-1).trim() === '') cssLines.pop();

  return {cssLines, markup, styleBlock};
};

export const readDeferredAccepts = (cwd = process.cwd()) => {
  const file = deferredAcceptsPath(cwd);

  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return {accepts: []};
  }
};

export const readManifest = (manifestPath) => {
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  return {
    ...data,
    manifestPath,
  };
};

export const removeAllSvelteComponentSessions = (cwd = process.cwd()) => {
  const root = path.join(cwd, SVELTE_COMPONENT_ROOT);
  if (!fs.existsSync(root)) return;

  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('__')) continue;

    try {
      fs.rmSync(path.join(root, entry.name), {force: true, recursive: true});
    } catch {
      /* non-fatal */
    }
  }
};

export const removeSvelteComponentSession = (id, cwd = process.cwd()) => {
  const dir = componentSessionDir(id, cwd);

  try {
    fs.rmSync(dir, {force: true, recursive: true});
  } catch {
    /* non-fatal */
  }
};

export const resolveSourceFile = (sourceFile, cwd = process.cwd()) => {
  if (!sourceFile || path.isAbsolute(sourceFile)) {
    throw new Error('Invalid svelte-component source file');
  }
  const full = path.resolve(cwd, sourceFile);
  const rel = path.relative(cwd, full);

  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Svelte-component source file escapes project root');
  }

  if (!fs.existsSync(full)) {
    throw new Error(`Svelte-component source file not found: ${sourceFile}`);
  }

  return full;
};

export const scaffoldSvelteComponentInsertSession = ({
  anchorEndLine,
  anchorLines,
  anchorStartLine,
  count,
  cwd = process.cwd(),
  id,
  insertLine,
  position,
  sourceFile,
}) => {
  ensureRuntimeHelper(cwd);
  const dir = componentSessionDir(id, cwd);
  fs.mkdirSync(dir, {recursive: true});

  const anchorMarkup = (anchorLines || []).join('\n');
  const manifest = {
    anchorEndLine,
    anchorMarkup,
    anchorStartLine,
    componentDir: path.relative(cwd, dir).split(path.sep).join('/'),
    count,
    id,
    insertLine,
    mode: 'insert',
    originalMarkup: anchorMarkup,
    position,
    previewMode: 'svelte-component',
    propContract: [],
    runtimeModule: `/${SVELTE_RUNTIME_FILE}`,
    sourceFile: sourceFile.split(path.sep).join('/'),
  };

  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf-8'
  );

  for (let n = 1; n <= count; n++) {
    const variantFile = path.join(dir, `v${n}.svelte`);

    if (!fs.existsSync(variantFile)) {
      fs.writeFileSync(variantFile, buildInsertVariantStub(n), 'utf-8');
    }
  }

  return {
    componentDir: manifest.componentDir,
    manifest,
    manifestFile: path
      .relative(cwd, path.join(dir, 'manifest.json'))
      .split(path.sep)
      .join('/'),
    propContract: [],
  };
};

export const scaffoldSvelteComponentSession = ({
  count,
  cwd = process.cwd(),
  id,
  originalLines,
  sourceEndLine,
  sourceFile,
  sourceStartLine,
}) => {
  ensureRuntimeHelper(cwd);
  const dir = componentSessionDir(id, cwd);
  fs.mkdirSync(dir, {recursive: true});

  const originalMarkup = originalLines.join('\n');
  const contract = buildPropContract(
    extractMustacheExpressions(originalMarkup)
  );
  const originalWithProps = substituteExprsWithProps(originalMarkup, contract);

  const manifest = {
    componentDir: path.relative(cwd, dir).split(path.sep).join('/'),
    count,
    id,
    originalMarkup,
    previewMode: 'svelte-component',
    propContract: contract,
    runtimeModule: `/${SVELTE_RUNTIME_FILE}`,
    sourceEndLine,
    sourceFile: sourceFile.split(path.sep).join('/'),
    sourceStartLine,
  };

  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf-8'
  );

  for (let n = 1; n <= count; n++) {
    const variantFile = path.join(dir, `v${n}.svelte`);

    if (!fs.existsSync(variantFile)) {
      fs.writeFileSync(
        variantFile,
        buildVariantStub(n, originalWithProps, contract),
        'utf-8'
      );
    }
  }

  return {
    componentDir: manifest.componentDir,
    manifest,
    manifestFile: path
      .relative(cwd, path.join(dir, 'manifest.json'))
      .split(path.sep)
      .join('/'),
    propContract: contract,
  };
};

export const shouldUseSvelteComponentInjection = (filePath) => {
  if (
    /^(0|false|no)$/i.test(process.env.IMPECCABLE_LIVE_SVELTE_COMPONENT || '')
  )
    return false;

  return path.extname(filePath).toLowerCase() === '.svelte';
};

export const substituteExprsWithProps = (markup, contract) => {
  let out = String(markup || '');

  for (const entry of contract) {
    out = out.split(entry.placeholder).join(`{${entry.prop}}`);
  }

  return out;
};

export const substitutePropsWithExprs = (markup, contract) => {
  let out = String(markup || '');

  for (const entry of contract) {
    out = out.split(`{${entry.prop}}`).join(`{${entry.expr}}`);
  }

  return out;
};

export const writeDeferredAccept = (entry, cwd = process.cwd()) => {
  const file = deferredAcceptsPath(cwd);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const data = readDeferredAccepts(cwd);
  data.accepts = (data.accepts || []).filter((item) => item.id !== entry.id);
  data.accepts.push({...entry, createdAt: new Date().toISOString()});
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
};

const appendCssToSvelteStyle = (lines, cssLines) => {
  const closeIndex = findLastStyleCloseLine(lines);
  const prepared = [
    '',
    ...cssLines.map((line) =>
      line.trim() === '' ? '' : `  ${line.trimStart()}`
    ),
  ];

  if (closeIndex === -1) {
    return [...lines, '', '<style>', ...prepared.slice(1), '</style>'];
  }

  return [
    ...lines.slice(0, closeIndex),
    ...prepared,
    ...lines.slice(closeIndex),
  ];
};

const appendSanitizedCssRule = (
  output,
  rule,
  variantNumber,
  paramValues,
  rootTag
) => {
  const prelude = rule.prelude.trim();
  const body = rule.body.trim();
  if (!prelude || !body || /--impeccable-variant-ready\s*:/.test(body)) return;

  if (/^@scope\b/i.test(prelude)) {
    if (
      /data-impeccable-variant/.test(prelude) &&
      !selectorHasVariant(prelude, variantNumber)
    )
      return;
    const inner = parseCssRules(body);

    for (const innerRule of inner) {
      const rewrittenPrelude = rewriteAcceptedSvelteSelector(
        innerRule.prelude,
        variantNumber,
        paramValues,
        rootTag,
        true
      );
      if (
        !rewrittenPrelude ||
        /--impeccable-variant-ready\s*:/.test(innerRule.body)
      )
        continue;
      output.push(formatCssRule(rewrittenPrelude, innerRule.body.trim()));
    }

    return;
  }

  const rewrittenPrelude = rewriteAcceptedSvelteSelector(
    prelude,
    variantNumber,
    paramValues,
    rootTag,
    false
  );
  if (!rewrittenPrelude) return;
  output.push(formatCssRule(rewrittenPrelude, body));
};

const bakeParamValuesInCss = (cssLines, paramValues) => {
  if (!paramValues || Object.keys(paramValues).length === 0) return cssLines;

  return cssLines.map((line) => {
    let out = line;

    for (const [key, value] of Object.entries(paramValues)) {
      const variableName = `--p-${key}`;
      out = out.replaceAll(
        new RegExp(
          String.raw`var\(${escapeRegExp(variableName)}(?:,\s*[^)]+)?\)`,
          'g'
        ),
        String(value)
      );
    }

    return out;
  });
};

const buildInsertVariantStub = (variantNumber) =>
  `${buildPropsScript([])}<div class="impeccable-insert-preview">Insert variant ${variantNumber}</div>\n\n<style>\n  .impeccable-insert-preview { display: block; }\n</style>\n`;

const buildPropsScript = (contract) => {
  if (contract.length === 0) {
    return '<script>\n  /** @type {Record<string, never>} */\n  let {} = $props();\n</script>\n';
  }
  const names = contract.map((c) => c.prop).join(', ');
  const typeFields = contract.map((c) => `    ${c.prop}: string;`).join('\n');

  return `<script>\n  /** @type {{\n${typeFields}\n  }} */\n  let { ${names} } = $props();\n</script>\n`;
};

const buildVariantStub = (variantNumber, originalWithProps, contract) => {
  const propsComment =
    contract.length > 0 ?
      `\n<!-- Props: ${contract.map((c) => `${c.prop} <- {${c.expr}}`).join(', ')} -->\n`
    : '';

  return `${buildPropsScript(contract)}${propsComment}${originalWithProps.trim()}\n\n<style>\n  /* Variant ${variantNumber}: add scoped CSS here */\n</style>\n`;
};

const derivePropertyName = (expr, index) => {
  const tail = expr.match(/(?:\.|\[)(\w+)\s*\]?$/);

  if (tail && tail[1] && /^[A-Za-z_$][\w$]*$/.test(tail[1])) {
    return tail[1];
  }

  return `prop${index}`;
};

const escapeRegExp = (value) =>
  String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const findLastStyleCloseLine = (lines) => {
  for (let index = lines.length - 1; index >= 0; index--) {
    if (/<\/style\s*>/.test(lines[index])) return index;
  }

  return -1;
};

const formatCssRule = (selector, body) => `${selector} { ${body.trim()} }`;

const inlineSvelteComponentInsertAccept = ({
  cssLines,
  cwd,
  manifest,
  markup,
  paramValues,
  resultBase,
  sourceFile,
  variantNum,
}) => {
  if (!svelteMarkupHasVisibleContent(markup)) {
    return {
      error: 'Accepted Svelte insert variant is empty',
      handled: false,
      ...resultBase,
    };
  }

  if (/\bdata-impeccable-[\w-]*\s*=/.test(markup)) {
    return {
      error:
        'Accepted Svelte insert variant contains preview-only data-impeccable attributes',
      handled: false,
      ...resultBase,
    };
  }

  const rootTag = matchOpeningTag(markup)?.tag || 'div';
  const restoredMarkup = String(markup || '')
    .split('\n')
    .map((line) => line.trimEnd());
  const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
  const sourceLines = sourceContent.split('\n');
  const insertIndex = Number(manifest.insertLine) - 1;

  if (
    !Number.isInteger(insertIndex) ||
    insertIndex < 0 ||
    insertIndex > sourceLines.length
  ) {
    return {
      error: `Invalid insert line for ${manifest.sourceFile}`,
      handled: false,
      ...resultBase,
    };
  }

  const nearbyLine =
    sourceLines[insertIndex] ?? sourceLines[insertIndex - 1] ?? '';
  const indent = nearbyLine.match(/^(\s*)/)?.[1] || '';
  const indentedMarkup = restoredMarkup.map((line) => {
    if (line.trim() === '') return '';

    return indent + line.trimStart();
  });

  let newLines = [
    ...sourceLines.slice(0, insertIndex),
    ...indentedMarkup,
    ...sourceLines.slice(insertIndex),
  ];

  const sanitizedCss = sanitizeAcceptedSvelteCss(
    cssLines,
    variantNum,
    paramValues,
    rootTag
  );
  const bakedCss = bakeParamValuesInCss(sanitizedCss, paramValues);

  if (bakedCss.length > 0) {
    newLines = appendCssToSvelteStyle(newLines, bakedCss);
  }

  try {
    fs.writeFileSync(sourceFile, newLines.join('\n'), 'utf-8');
  } catch (error) {
    return {
      error: `Failed to write Svelte source: ${error.message}`,
      handled: false,
      ...resultBase,
    };
  }
  removeSvelteComponentSession(manifest.id, cwd);

  return {
    handled: true,
    ...resultBase,
  };
};

const matchOpeningTag = (markup) => {
  const match = String(markup || '').match(
    /^(\s*<)([A-Za-z][\w:-]*)([^>]*?)(\/?>)/
  );
  if (!match) return null;

  return {
    attrs: match[3] || '',
    close: match[4],
    index: match.index || 0,
    prefix: match[1],
    raw: match[0],
    tag: match[2],
  };
};

const mergeOriginalTopLevelAttributes = (markup, originalMarkup) => {
  const variantOpen = matchOpeningTag(markup);
  const originalOpen = matchOpeningTag(originalMarkup);
  if (!variantOpen || !originalOpen) return markup;
  if (variantOpen.tag.toLowerCase() !== originalOpen.tag.toLowerCase())
    return markup;

  const variantAttributes = parseAttributeSegments(variantOpen.attrs);
  const originalAttributes = parseAttributeSegments(originalOpen.attrs);
  const additions = [];
  let {attrs} = variantOpen;

  const originalClass = originalAttributes.get('class');
  const variantClass = variantAttributes.get('class');

  if (originalClass && variantClass) {
    const merged = mergeStaticClassAttribute(originalClass, variantClass);

    if (merged) {
      attrs =
        attrs.slice(0, variantClass.start) +
        merged +
        attrs.slice(variantClass.end);
      variantAttributes.set('class', {...variantClass, raw: merged});
    }
  } else if (originalClass && !variantClass) {
    additions.push(originalClass.raw);
  }

  for (const [name, attribute] of originalAttributes) {
    if (name === 'class') continue;
    if (!variantAttributes.has(name)) additions.push(attribute.raw);
  }

  if (additions.length === 0 && attrs === variantOpen.attrs) return markup;
  const nextOpen =
    variantOpen.prefix +
    variantOpen.tag +
    attrs +
    additions.map((attribute) => ` ${attribute.trim()}`).join('') +
    variantOpen.close;

  return (
    markup.slice(0, variantOpen.index) +
    nextOpen +
    markup.slice(variantOpen.index + variantOpen.raw.length)
  );
};

const mergeStaticClassAttribute = (originalClass, variantClass) => {
  const originalValue = originalClass.raw.match(/class\s*=\s*(["'])(.*?)\1/);
  const variantValue = variantClass.raw.match(/class\s*=\s*(["'])(.*?)\1/);
  if (!originalValue || !variantValue) return null;
  const quote = variantValue[1];
  const classes = [
    ...variantValue[2].split(/\s+/),
    ...originalValue[2].split(/\s+/),
  ].filter(Boolean);

  return `class=${quote}${[...new Set(classes)].join(' ')}${quote}`;
};

const parseAttributeSegments = (attributes) => {
  const out = new Map();
  const re =
    /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s"'>=]+))?/g;
  let match;

  while ((match = re.exec(attributes))) {
    const raw = match[0];
    const name = match[1];
    out.set(name, {
      end: match.index + raw.length,
      name,
      raw,
      start: match.index,
    });
  }

  return out;
};

const parseCssRules = (css) => {
  const rules = [];
  const text = String(css || '');
  let index = 0;

  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index])) index++;
    const preludeStart = index;
    while (index < text.length && text[index] !== '{') index++;
    if (index >= text.length) break;
    const prelude = text.slice(preludeStart, index).trim();
    index++;
    const bodyStart = index;
    let depth = 1;
    let quote = null;
    let comment = false;

    while (index < text.length && depth > 0) {
      const ch = text[index];
      const next = text[index + 1];

      if (comment) {
        if (ch === '*' && next === '/') {
          comment = false;
          index += 2;
          continue;
        }
        index++;
        continue;
      }

      if (quote) {
        if (ch === '\\') {
          index += 2;
          continue;
        }
        if (ch === quote) quote = null;
        index++;
        continue;
      }

      if (ch === '/' && next === '*') {
        comment = true;
        index += 2;
        continue;
      }

      if (ch === '"' || ch === "'") {
        quote = ch;
        index++;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      index++;
    }
    const body = text.slice(bodyStart, Math.max(bodyStart, index - 1));
    if (prelude) rules.push({body, prelude});
  }

  return rules;
};

const rewriteAcceptedSvelteSelector = (
  prelude,
  variantNumber,
  paramValues,
  rootTag,
  fromScope
) => {
  const selectors = splitSelectorList(prelude);
  const rewritten = [];

  for (const selector of selectors) {
    const next = rewriteAcceptedSvelteSelectorPart(
      selector,
      variantNumber,
      paramValues,
      rootTag,
      fromScope
    );
    if (next) rewritten.push(next);
  }

  return rewritten.join(', ');
};

const rewriteAcceptedSvelteSelectorPart = (
  selector,
  variantNumber,
  paramValues,
  rootTag,
  fromScope
) => {
  let out = selector.trim();
  const hasVariant = /data-impeccable-variant/.test(out);
  if (hasVariant && !selectorHasVariant(out, variantNumber)) return '';

  if (hasVariant) {
    out = out.replace(variantSelectorRegex(variantNumber), '');
    out = out.replaceAll(/\[data-impeccable-variant=(["']).*?\1\]/g, '');
  }

  const paramResult = rewriteParamSelectors(out, paramValues);
  if (!paramResult.keep) return '';
  out = paramResult.selector;

  out = out
    .replaceAll(/:scope(?:\[[^\]]+\])?\s*>\s*/g, '')
    .replaceAll(/:scope(?:\[[^\]]+\])?/g, rootTag || '')
    .replaceAll(/\s+/g, ' ')
    .trim();

  out = out.replace(/^[>+~]\s*/, '').trim();
  if (!out && (hasVariant || fromScope)) return rootTag || ':global(*)';

  return out;
};

const rewriteParamSelectors = (selector, paramValues) => {
  let keep = true;
  const next = selector.replaceAll(
    /\[data-p-([A-Za-z0-9_-]+)(?:=(["'])(.*?)\2)?\]/g,
    (_match, key, _quote, expected) => {
      if (!paramValues || !Object.hasOwn(paramValues, key)) return '';
      const actual = paramValues[key];

      if (expected != null && String(actual) !== String(expected)) {
        keep = false;

        return '';
      }

      if (
        expected == null &&
        (actual === false ||
          actual == null ||
          actual === 'false' ||
          actual === 'off' ||
          actual === '0')
      ) {
        keep = false;

        return '';
      }

      return '';
    }
  );

  return {keep, selector: next};
};

const sanitizeAcceptedSvelteCss = (
  cssLines,
  variantNumber,
  paramValues = null,
  rootTag = 'div'
) => {
  const css = String((cssLines || []).join('\n'));
  if (!/data-impeccable-variant|impeccable-variant-ready/.test(css))
    return cssLines;

  const rules = parseCssRules(css);
  const output = [];

  for (const rule of rules) {
    appendSanitizedCssRule(output, rule, variantNumber, paramValues, rootTag);
  }

  return output
    .join('\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
};

const selectorHasVariant = (selector, variantNumber) =>
  variantSelectorRegex(variantNumber).test(selector);

const splitSelectorList = (prelude) => {
  const selectors = [];
  let start = 0;
  let bracket = 0;
  let paren = 0;
  let quote = null;

  for (let index = 0; index < prelude.length; index++) {
    const ch = prelude[index];

    if (quote) {
      if (ch === '\\') index++;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === '[') bracket++;
    else if (ch === ']') bracket = Math.max(0, bracket - 1);
    else if (ch === '(') paren++;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    else if (ch === ',' && bracket === 0 && paren === 0) {
      selectors.push(prelude.slice(start, index));
      start = index + 1;
    }
  }
  selectors.push(prelude.slice(start));

  return selectors;
};

const svelteMarkupHasVisibleContent = (markup) => {
  const text = String(markup || '')
    .replaceAll(/<script[\s\S]*?<\/script>/gi, '')
    .replaceAll(/<style[\s\S]*?<\/style>/gi, '')
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  if (text.length > 0) return true;

  return /<(img|svg|canvas|video|audio|picture|input|button|select|textarea)\b/i.test(
    markup || ''
  );
};

const variantSelectorRegex = (variantNumber) =>
  new RegExp(
    String.raw`\[data-impeccable-variant=(["'])${escapeRegExp(String(variantNumber))}\1\]`,
    'g'
  );
