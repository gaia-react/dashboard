/**
 * The dashboard's three top-level tabs (feedback: Work | Sessions | Activity).
 * Shared so the App shell, the contextual KPI row, and the cross-tab jump
 * links all agree on the ids that live in the `?tab=` query param.
 *
 * - Work: the specs & plans cost tables.
 * - Sessions: the full sessions list.
 * - Activity: heatmap, model mix, cost trend, insights, and parse health.
 */

export type DashboardTab = {
  id: DashboardTabId;
  label: string;
};

export type DashboardTabId = 'activity' | 'sessions' | 'work';

export const DASHBOARD_TABS: DashboardTab[] = [
  {id: 'work', label: 'Work'},
  {id: 'sessions', label: 'Sessions'},
  {id: 'activity', label: 'Activity'},
];

export const DEFAULT_TAB_ID: DashboardTabId = 'work';

export const isDashboardTabId = (
  value: null | string
): value is DashboardTabId =>
  value === 'work' || value === 'sessions' || value === 'activity';

/** The active tab from a `?tab=` value, falling back to the default. */
export const resolveTabId = (value: null | string): DashboardTabId =>
  isDashboardTabId(value) ? value : DEFAULT_TAB_ID;
