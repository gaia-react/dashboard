/**
 * Cross-section anchor id conventions (SPEC 6.3 / 6.6 jump-link contract).
 * SessionsList's attribution badge links to the matching CostTable row;
 * CostTable's expanded-row session detail links back to the matching
 * SessionsList row. Both sections render an element carrying the matching id
 * so the jump-links actually resolve once the two sections are composed
 * together on one page (fan-in integrator owned).
 */
export const costEntryAnchorId = (costEntryKey: string): string =>
  `cost-entry-${costEntryKey.replaceAll(/[^a-zA-Z0-9]+/gu, '-')}`;

export const sessionAnchorId = (sessionId: string): string =>
  `session-${sessionId}`;

/**
 * The deep link a "View in sessions" jump navigates to: the Sessions tab
 * targeting one session, with no attribution/model filter or page so the
 * target can never be filtered out of view (feedback). SessionsList reads
 * `?session=` to page to and scroll the row into view.
 */
export const sessionsTabHref = (sessionId: string): string =>
  `?tab=sessions&session=${encodeURIComponent(sessionId)}`;
