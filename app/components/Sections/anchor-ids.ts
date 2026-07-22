/**
 * Cross-tab jump-link conventions (DESIGN-SPEC 1.4 / 5.6, Phase 8 v2).
 * SessionsList's attribution badge links to the matching Work event, and a
 * Work event's "View in sessions" link (`Work/EventDetail/LinkedSessions`)
 * links back to the matching SessionsList row. The Work and Sessions tabs
 * are on separate panels, so both directions navigate cross-tab via the URL
 * rather than a same-page hash: `sessionsTabHref` / `workTabHref` build the
 * deep link, the target tab reads it back (`?id=` / `?entry=`) to select,
 * page to, and scroll the row.
 *
 * `costEntryAnchorId` scrolled the v1 CostTable row into view on a
 * same-page jump; that scroll target is gone with `CostTable` (retired in
 * Phase 8 v2), but the helper stays exported (and tested by
 * `SessionsList/tests/format.test.ts`, which SessionsList still
 * re-exports it through) since removing it crosses into that section's own
 * file ownership. Flagging it here as dead code rather than deleting it.
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

/**
 * The deep link a "View in cost table" jump navigates to: the Work tab with
 * the entry targeted via `?entry=`, no lingering session filter (symmetric
 * to `sessionsTabHref`). The v2 Work tab's own selection logic
 * (`Work/selection.ts`) reads `?entry=` only.
 *
 * P4 (W12) dropped the vestigial `?work=` value this used to carry: it was
 * the v1 CostTable's specs/plans toggle, nothing in v2 reads it, and the
 * entry type it was derived from (`costViewForEntryType`, formerly exported
 * here) had no other caller once it was gone.
 */
export const workTabHref = (costEntryKey: string): string =>
  `?tab=work&entry=${encodeURIComponent(costEntryKey)}`;
