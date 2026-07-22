import type {
  AdHocReview,
  CommandEvent,
  CostEntry,
  CostsResponse,
} from '~/data/schemas/api';

export type GaiaEvent = {
  /** PR or issue reference; null whenever the record carried no `github`. */
  artifact: null | {number: number; repo: string; type: string};
  /** ISO start date, for display and the date sort. */
  at: string;
  durationSeconds: null | number;
  group: GaiaEventGroup;
  /** The stable `?entry=` selection key, unique across the list. */
  key: string;
  /** The handle: 'SPEC-032' | 'gaia-debt' | 'Code review 7b0a1c2d'. */
  label: string;
  recordedDollars: null | number;
  source: GaiaEventSource;
  status: null | string;
  /** The subject line, row 3 of the card. */
  title: string;
  totalTokens: number;
  type: GaiaEventType;
};

/** Warm hues are Work, cool hues are Maintenance (DESIGN-SPEC 2.5). */
export type GaiaEventGroup = 'maintenance' | 'work';

/**
 * The originating record, kept whole so the detail panel can read the
 * type-specific fields (phases, audit, lenses, run id) without a second
 * lookup by key.
 */
export type GaiaEventSource =
  | {kind: 'command'; value: CommandEvent}
  | {kind: 'entry'; value: CostEntry}
  | {kind: 'review'; value: AdHocReview};

/**
 * The Work tab's one list item type. Three source shapes reach the client
 * (`CostEntry`, `AdHocReview`, `CommandEvent`) and the v2 Work tab renders
 * them in a single list, so they collapse to one view model here rather than
 * in three parallel component branches.
 *
 * `'unknown'` is a full member of the union: DESIGN-SPEC 2.5 gives the
 * unrecognized event its own tone (`fg-mute`) and icon (`LuTerminal`), and a
 * closed union is what stops a component building a tone class out of an
 * arbitrary `../gaia` command string.
 */
export type GaiaEventType =
  | 'audit'
  | 'debt'
  | 'fitness'
  | 'forensics'
  | 'harden'
  | 'plan'
  | 'review'
  | 'spec'
  | 'unknown'
  | 'wiki';

/**
 * The event types whose subject line is authored rather than read from the
 * record: everything except a spec or plan entry, which carries its own
 * `title`.
 */
type SubjectlessEventType = Exclude<GaiaEventType, 'plan' | 'spec'>;

/**
 * `command` is `z.string()` off a record in `../gaia`, so it is an
 * unconstrained runtime string. This is a `Map`, not an object literal,
 * specifically so a command named `constructor` / `valueOf` / `toString` /
 * `__proto__` cannot resolve to an inherited `Object.prototype` member
 * instead of falling through to `'unknown'`. That bug class has shipped and
 * been caught twice already (`Icon/icon-map.ts`, `data/format/lenses.ts`); a
 * `Map` has no prototype chain to walk, so the guard is structural rather
 * than remembered.
 */
const COMMAND_EVENT_TYPES = new Map<string, SubjectlessEventType>([
  ['gaia-audit', 'audit'],
  ['gaia-debt', 'debt'],
  ['gaia-fitness', 'fitness'],
  ['gaia-forensics', 'forensics'],
  ['gaia-harden', 'harden'],
  ['gaia-wiki', 'wiki'],
]);

/** An unrecognized command degrades to `unknown`; it never throws and never
 * invents a tenth tone. The six GAIA commands share one telemetry shape and
 * the vocabulary will grow. */
export const resolveCommandType = (command: string): SubjectlessEventType =>
  COMMAND_EVENT_TYPES.get(command) ?? 'unknown';

/**
 * `gaia-debt` is the one command in the Work group (README event-tone table);
 * every other command, recognized or not, is Maintenance.
 */
const groupForCommandType = (type: GaiaEventType): GaiaEventGroup =>
  type === 'debt' ? 'work' : 'maintenance';

/**
 * Subject lines for the two shapes that carry no title of their own. Neither
 * `commandEventSchema` nor `adHocReviewSchema` has a title field, and row 3
 * of the event card is the subject, so this copy is authored rather than
 * derived. Recorded as an orchestrator judgment call (Phase 8 README,
 * "Deferred / open"). The `unknown` line carries the load for a command
 * nobody has written yet.
 *
 * Keyed by the resolved `GaiaEventType`, a closed union, so a direct index is
 * total and safe: unlike the command lookup above there is no fallback path
 * for a prototype key to bypass.
 */
const EVENT_SUBJECTS: Readonly<Record<SubjectlessEventType, string>> = {
  audit: 'Adversarial audit run',
  debt: 'Technical debt sweep',
  fitness: 'Fitness check',
  forensics: 'Forensics investigation',
  harden: 'Hardening pass',
  review: 'Ad-hoc code review, not attributed to a spec or plan',
  unknown: 'GAIA command run',
  wiki: 'Wiki maintenance run',
};

const SHORT_ID_LENGTH = 8;

const shortId = (value: string): string => value.slice(0, SHORT_ID_LENGTH);

/**
 * `entry.key` passes through verbatim. `SessionsList`'s attribution badge
 * deep-links with `?entry={entry.key}` (`Sections/anchor-ids.ts`), so
 * rewriting it here would silently break a shipped cross-tab jump.
 */
const entryEvent = (entry: CostEntry): GaiaEvent => ({
  artifact: entry.github,
  at: entry.sortAt,
  durationSeconds: entry.totals.durationSeconds,
  group: 'work',
  key: entry.key,
  label: entry.id ?? entry.key,
  recordedDollars: entry.totals.recordedDollars,
  source: {kind: 'entry', value: entry},
  status: entry.status,
  title: entry.title,
  totalTokens: entry.totals.totalTokens,
  type: entry.entryType === 'spec' ? 'spec' : 'plan',
});

const reviewEvent = (review: AdHocReview): GaiaEvent => {
  const handle = review.reviewId ?? review.sessionId;

  return {
    artifact: null,
    at: review.at,
    durationSeconds: review.durationSeconds,
    group: 'maintenance',
    key: `review:${handle}`,
    label: `Code review ${shortId(handle)}`,
    recordedDollars: review.recordedDollars,
    source: {kind: 'review', value: review},
    status: null,
    title: EVENT_SUBJECTS.review,
    totalTokens: review.totalTokens,
    type: 'review',
  };
};

const commandEvent = (command: CommandEvent): GaiaEvent => {
  const type = resolveCommandType(command.command);

  return {
    artifact: command.github,
    at: command.at,
    durationSeconds: command.durationSeconds,
    group: groupForCommandType(type),
    key: `command:${command.runId ?? command.sessionId}`,
    label: command.command,
    recordedDollars: command.recordedDollars,
    source: {kind: 'command', value: command},
    status: null,
    title: EVENT_SUBJECTS[type],
    totalTokens: command.totalTokens,
    type,
  };
};

/**
 * The base order: `at` descending, ties by `key` ascending. Display ordering
 * is `sort.ts`'s job; a deterministic base order is what makes every test and
 * every default render reproducible.
 */
const compareBaseOrder = (a: GaiaEvent, b: GaiaEvent): number => {
  const byDate = Date.parse(b.at) - Date.parse(a.at);

  return byDate === 0 ? a.key.localeCompare(b.key) : byDate;
};

/** Collapses the three source shapes into one list, newest first. */
export const buildEvents = (costs: CostsResponse): GaiaEvent[] => {
  const events: GaiaEvent[] = [
    ...costs.entries.map((entry) => entryEvent(entry)),
    ...costs.adHocReviews.map((review) => reviewEvent(review)),
    ...costs.commandEvents.map((command) => commandEvent(command)),
  ];

  return events.toSorted(compareBaseOrder);
};
