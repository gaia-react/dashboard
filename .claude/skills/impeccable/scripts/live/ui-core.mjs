/**
 * Framework-neutral Impeccable live chrome contract.
 *
 * The production browser bundle is intentionally plain DOM so Svelte, React,
 * Vue, and static adapters can all mount the same chrome. This module is the
 * testable contract/inventory for that bundle; live-browser.js mirrors these
 * values at runtime because it is served as a standalone script.
 */

export const LIVE_CHROME_MOUNT_CONTRACT = Object.freeze([
  'root',
  'transport',
  'state',
  'actions',
]);

export const LIVE_UI_SURFACES = Object.freeze([
  {
    ids: [
      'impeccable-live-global-bar',
      'impeccable-live-global-bar-brand',
      'impeccable-live-pick-toggle',
      'impeccable-live-insert-toggle',
      'impeccable-live-detect-toggle',
      'impeccable-live-detect-badge',
      'impeccable-live-design-toggle',
      'impeccable-live-page-chat',
      'impeccable-live-page-chat-input',
      'impeccable-live-page-chat-voice',
    ],
    key: 'global-bottom-bar',
    states: ['rest', 'hover', 'focus-visible', 'pressed', 'active', 'tooltip'],
  },
  {
    ids: ['impeccable-live-pending-dock'],
    key: 'pending-copy-edit-dock',
    states: [
      'closed',
      'open',
      'hover',
      'pressed',
      'loading',
      'rollback',
      'keep-fixing',
    ],
  },
  {
    ids: [
      'impeccable-live-highlight',
      'impeccable-live-tooltip',
      'impeccable-live-bar',
      'impeccable-live-selection-pill',
      'impeccable-live-input',
      'impeccable-live-configure-voice',
      'impeccable-live-configure-bar-tooltip',
    ],
    key: 'element-selection-chrome',
    states: ['rest', 'hover', 'focus-visible', 'pressed', 'disabled'],
  },
  {
    ids: ['impeccable-live-picker'],
    key: 'action-picker',
    states: ['closed', 'open', 'option-hover', 'option-focus'],
  },
  {
    ids: ['impeccable-live-edit-badge'],
    key: 'edit-chrome',
    states: [
      'enabled',
      'disabled',
      'editing',
      'cancel',
      'save',
      'edited-content',
    ],
  },
  {
    ids: ['impeccable-live-bar', 'impeccable-live-shader'],
    key: 'generating-row',
    states: ['action-label', 'animated-dots', 'generating', 'done'],
  },
  {
    ids: ['impeccable-live-bar', 'impeccable-live-params-panel'],
    key: 'variant-cycling-row',
    states: [
      'variant-1',
      'variant-2',
      'variant-3',
      'left-disabled',
      'right-disabled',
      'dot-click',
      'accept',
      'discard',
    ],
  },
  {
    ids: ['impeccable-live-params-panel'],
    key: 'variant-params-panel',
    states: ['closed', 'open-above', 'open-below', 'range', 'steps', 'toggle'],
  },
  {
    ids: ['impeccable-live-bar'],
    key: 'saving-confirmed-rows',
    states: ['saving', 'applying-variant', 'confirmed'],
  },
  {
    ids: [
      'impeccable-live-insert-line',
      'impeccable-live-insert-placeholder',
      'impeccable-live-placeholder-resize',
      'impeccable-live-insert-input',
      'impeccable-live-insert-voice',
      'impeccable-live-insert-create',
      'impeccable-live-insert-create-tooltip',
    ],
    key: 'insert-mode-chrome',
    states: [
      'toggle-active',
      'line',
      'placeholder',
      'resize',
      'enabled',
      'disabled',
      'tooltip',
    ],
  },
  {
    ids: [
      'impeccable-live-annot',
      'impeccable-live-annot-svg',
      'impeccable-live-annot-pins',
      'impeccable-live-annot-clear',
    ],
    key: 'annotation-chrome',
    states: ['overlay', 'drawing', 'pin', 'pin-edit', 'clear'],
  },
  {
    ids: ['impeccable-live-design-host'],
    key: 'design-system-panel',
    states: ['closed', 'open', 'tabs', 'token-tiles', 'copy'],
  },
  {
    ids: ['impeccable-live-toast'],
    key: 'toasts-and-errors',
    states: ['normal', 'error', 'no-variants-mounted'],
  },
  {
    ids: ['impeccable-live-root'],
    key: 'css-isolation-boundary',
    states: ['shadow-root', 'style-tags', 'hostile-css'],
  },
]);

export const LIVE_UI_COMPONENT_IDS = Object.freeze([
  ...new Set(LIVE_UI_SURFACES.flatMap((surface) => surface.ids)),
]);

export const activeElementDeep = (document_ = globalThis.document) => {
  let active = document_?.activeElement || null;

  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  return active;
};

export const appendStyleToLiveUiRoot = (styleElement, env = globalThis) => {
  const document_ = env?.document;
  const root = resolveLiveUiRoot(env);

  if (root && root !== document_?.body) {
    root.append(styleElement);
  } else {
    (document_?.head || document_?.body || root).append(styleElement);
  }

  return styleElement;
};

export const appendToLiveUiRoot = (element, env = globalThis) => {
  const root = resolveLiveUiRoot(env);
  if (!root) throw new Error('Impeccable live UI root is not available');
  root.append(element);

  return element;
};

export const getLiveUiElementById = (id, env = globalThis) => {
  const document_ = env?.document;
  const root = resolveLiveUiRoot(env);
  if (!id) return null;

  if (root?.getElementById) {
    const found = root.getElementById(id);
    if (found) return found;
  }

  if (root?.querySelector) {
    const found = root.querySelector(`#${escapeCssIdent(id)}`);
    if (found) return found;
  }

  return document_?.getElementById?.(id) || null;
};

export const resolveLiveUiRoot = (env = globalThis) => {
  const document_ = env?.document;
  const explicit =
    env?.__IMPECCABLE_LIVE_UI_ROOT__ ||
    env?.window?.__IMPECCABLE_LIVE_UI_ROOT__;
  if (explicit && typeof explicit.appendChild === 'function') return explicit;

  return document_?.body || null;
};

const escapeCssIdent = (value) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(String(value));
  }

  return String(value).replaceAll(
    /([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g,
    String.raw`\$1`
  );
};
