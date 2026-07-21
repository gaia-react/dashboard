import type {IconType} from 'react-icons';
import {
  LuActivity,
  LuArrowDownWideNarrow,
  LuBookOpen,
  LuBug,
  LuChevronRight,
  LuClipboardCheck,
  LuExternalLink,
  LuFileText,
  LuFilter,
  LuGithub,
  LuListChecks,
  LuRefreshCw,
  LuScanEye,
  LuShieldCheck,
  LuTerminal,
  LuWrench,
} from 'react-icons/lu';

/**
 * The single lookup table from a semantic icon name to its Lucide symbol
 * (DESIGN-SPEC.md section 2.5 and section 3, C-06). Event names cover the
 * Categorical Nine plus the `unknown` fallback; chrome names are semantic
 * (`refresh`, not `LuRefreshCw`) so the underlying icon family can be
 * swapped in this one file later.
 */
export const iconMap = {
  audit: LuClipboardCheck,
  chevronRight: LuChevronRight,
  debt: LuWrench,
  externalLink: LuExternalLink,
  filter: LuFilter,
  fitness: LuActivity,
  forensics: LuBug,
  github: LuGithub,
  harden: LuShieldCheck,
  plan: LuListChecks,
  refresh: LuRefreshCw,
  review: LuScanEye,
  sort: LuArrowDownWideNarrow,
  spec: LuFileText,
  unknown: LuTerminal,
  wiki: LuBookOpen,
} as const satisfies Record<string, IconType>;

export type IconName = keyof typeof iconMap;

/**
 * Resolves a name to its icon symbol, falling back to the unknown/terminal
 * icon. `name` is a plain string, not `IconName`: the union type protects
 * typed callers, but the event pipeline resolves names from runtime data (a
 * future gaia-* command nobody has typed yet), so this guard is real.
 *
 * Uses `Object.hasOwn` rather than a plain `lookup[name]` index: `iconMap` is
 * a plain object literal, so an unguarded index walks the prototype chain.
 * Runtime names that collide with `Object.prototype` members
 * (`constructor`, `hasOwnProperty`, `valueOf`, `__proto__`, ...) would
 * resolve to an inherited, non-icon value instead of falling through to the
 * `unknown` fallback, and rendering that value crashes instead of degrading.
 */
export const resolveIcon = (name: string): IconType =>
  Object.hasOwn(iconMap, name) ? iconMap[name as IconName] : iconMap.unknown;
