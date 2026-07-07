import type {CostEntry} from '~/data/schemas/api';

/**
 * Cross-section anchor id conventions (SPEC 6.3 / 6.6 jump-link contract).
 * SessionsList's attribution badge links to the matching CostTable row;
 * CostTable's expanded-row session detail links back to the matching
 * SessionsList row. Both sections render an element carrying the matching id
 * so the jump-links actually resolve once the two sections are composed
 * together on one page (fan-in integrator owned). The tabs live on separate
 * panels now, so both directions navigate cross-tab via the URL rather than
 * a same-page hash: `sessionsTabHref` / `workTabHref` build the deep link,
 * the target tab reads it back to select, page to, and scroll the row.
 */
export const costEntryAnchorId = (costEntryKey: string): string =>
  `cost-entry-${costEntryKey.replaceAll(/[^a-zA-Z0-9]+/gu, '-')}`;

export const sessionAnchorId = (sessionId: string): string =>
  `session-${sessionId}`;

/**
 * The deep link a "View in sessions" jump navigates to: the Sessions tab
 * targeting one session, with no attribution/model filter or page so the
 * target can never be filtered out of view (feedback). SessionsList reads
 * `?id=` to page to and scroll the row into view.
 */
export const sessionsTabHref = (sessionId: string): string =>
  `?tab=sessions&id=${encodeURIComponent(sessionId)}`;

/** The CostTable view (specs vs plans) an entry's type belongs to: a
 * plan-slug is a pre-ledger plan, grouped with plans. */
export const costViewForEntryType = (
  entryType: CostEntry['entryType']
): 'plans' | 'specs' => (entryType === 'spec' ? 'specs' : 'plans');

/**
 * The deep link a "View in cost table" jump navigates to: the Work tab with
 * the specs/plans toggle set to the entry's table and the entry targeted, no
 * lingering session filter (symmetric to `sessionsTabHref`). CostTable reads
 * `?work=` and `?entry=` to select the table, expand, and scroll the row.
 */
export const workTabHref = (
  costEntryKey: string,
  entryType: CostEntry['entryType']
): string =>
  `?tab=work&work=${costViewForEntryType(entryType)}&entry=${encodeURIComponent(costEntryKey)}`;
