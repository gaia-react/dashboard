import type {ChangeEventHandler, FC} from 'react';
import {useState} from 'react';
import {twJoin, twMerge} from 'tailwind-merge';
import EmptyState from '~/components/EmptyState';
import type {AttributionFilterValue} from '~/components/Sections/SessionsList/format';
import {
  ALL_MODELS_FILTER_VALUE,
  costEntryAnchorId,
  countSessionsByAttribution,
  filterSessions,
  formatSessionDateTime,
  formatSessionDollars,
  formatSessionDuration,
  formatSessionTokenCount,
  paginateSessions,
  sessionAnchorId,
  sessionDisplayTitle,
  totalPageCount,
  totalTokenCount,
  uniqueModelNames,
} from '~/components/Sections/SessionsList/format';
import {shimmer} from '~/components/Skeleton';
import type {SessionSummary} from '~/data/schemas/api';

export type SessionsListProps = {
  /** `ActivityResponse.sessions`, reverse-chronological (the API's order). */
  sessions: SessionSummary[];
};

export const sectionChromeClassName =
  'border-border bg-bg-elev flex flex-col gap-4 rounded-md border p-6';

export const eyebrowClassName =
  'text-accent-soft font-mono text-xs tracking-[0.2em] uppercase';

export const headingClassName = 'font-display text-fg text-2xl font-light';

export const captionClassName = 'text-fg-mute text-sm';

const selectClassName =
  'border-border bg-bg-elev-2 text-fg focus-visible:outline-accent rounded-sm border px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2';
const pageButtonClassName =
  'border-border text-fg-dim hover:border-accent-2 hover:text-fg focus-visible:outline-accent rounded-sm border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-fg-dim focus-visible:outline-2 focus-visible:outline-offset-2';
const badgeClassName =
  'rounded-full border px-2 py-0.5 font-mono text-[0.625rem] tracking-wide uppercase';
const attributedBadgeClassName = twJoin(
  badgeClassName,
  'border-secondary-2 text-secondary-soft hover:border-secondary hover:bg-secondary/10 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2'
);
const adHocBadgeClassName = twJoin(
  badgeClassName,
  'border-border text-fg-mute'
);
const dollarsCaptionClassName =
  'text-fg-mute font-mono text-[0.625rem] tracking-wide uppercase';

const SessionAttributionBadge: FC<{
  attribution: SessionSummary['attribution'];
}> = ({attribution}) =>
  attribution ?
    <a
      className={attributedBadgeClassName}
      href={`#${costEntryAnchorId(attribution.key)}`}
    >
      {attribution.key}
    </a>
  : <span className={adHocBadgeClassName}>Ad hoc</span>;

const SessionDollars: FC<{dollars: SessionSummary['dollars']}> = ({
  dollars,
}) => {
  if (!dollars) {
    return <span className="text-fg-mute text-xs">no data</span>;
  }

  if (dollars.basis === 'recorded') {
    return (
      <span className="flex flex-col items-end">
        <span className="text-fg text-sm font-semibold">
          {formatSessionDollars(dollars.value)}
        </span>
        <span className={dollarsCaptionClassName}>recorded</span>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end">
      <span className="text-fg-dim text-sm italic">
        ~{formatSessionDollars(dollars.value)}
        {dollars.lowerBound && '+'}
      </span>
      <span className={dollarsCaptionClassName}>
        estimated{dollars.lowerBound ? ', lower bound' : ''}
      </span>
    </span>
  );
};

const SessionRow: FC<{session: SessionSummary}> = ({session}) => (
  <li
    className="border-border-soft flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    data-testid={`session-row-${session.sessionId}`}
    id={sessionAnchorId(session.sessionId)}
  >
    <div className="min-w-0 flex-1">
      <p className="text-fg truncate text-sm font-medium">
        {sessionDisplayTitle(session)}
      </p>
      <p className="text-fg-mute mt-0.5 flex flex-wrap gap-x-1 text-xs">
        <span>{formatSessionDateTime(session.startedAt)}</span>
        <span aria-hidden={true}>·</span>
        <span>{formatSessionDuration(session.durationSeconds)}</span>
        <span aria-hidden={true}>·</span>
        <span>{session.gitBranch ?? 'no branch'}</span>
      </p>
      <p className="text-fg-dim mt-0.5 flex flex-wrap gap-x-1 text-xs">
        <span>{session.models.join(', ') || 'no model data'}</span>
        <span aria-hidden={true}>·</span>
        <span>{formatSessionTokenCount(session.buckets.output)} output</span>
        <span aria-hidden={true}>/</span>
        <span>
          {formatSessionTokenCount(totalTokenCount(session.buckets))} total
          tokens
        </span>
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
      <SessionDollars dollars={session.dollars} />
      <SessionAttributionBadge attribution={session.attribution} />
    </div>
  </li>
);

/**
 * SPEC 6.6: reverse-chronological sessions list. Client-side pagination at
 * 50/page (PLAN D5, no virtualization dependency); attribution and model
 * filters narrow the list BEFORE paging, never after. The attribution badge
 * links to the matching CostTable row (`cost-entry-<key>` anchor, SPEC
 * section 6.3's jump-link contract); recorded and estimated dollars are
 * never summed, and an estimated lower-bound figure carries an explicit
 * marker, not just a color cue (accessibility rule).
 */
const SessionsList: FC<SessionsListProps> = ({sessions}) => {
  const [attributionFilter, setAttributionFilter] =
    useState<AttributionFilterValue>('all');
  const [modelFilter, setModelFilter] = useState(ALL_MODELS_FILTER_VALUE);
  const [page, setPage] = useState(1);

  const handleChangeAttributionFilter: ChangeEventHandler<HTMLSelectElement> = (
    event
  ) => {
    setAttributionFilter(event.target.value as AttributionFilterValue);
    setPage(1);
  };

  const handleChangeModelFilter: ChangeEventHandler<HTMLSelectElement> = (
    event
  ) => {
    setModelFilter(event.target.value);
    setPage(1);
  };

  const handleClickPreviousPage = (): void => {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  };

  const handleClickNextPage = (): void => {
    setPage((currentPage) => currentPage + 1);
  };

  if (sessions.length === 0) {
    return (
      <div className={sectionChromeClassName}>
        <header>
          <p className={eyebrowClassName}>Sessions</p>
          <h2 className={headingClassName}>Every session</h2>
        </header>
        <EmptyState
          description="Claude Code activity will appear here once a session runs in this project."
          title="No sessions yet"
        />
      </div>
    );
  }

  const {adHoc, attributed} = countSessionsByAttribution(sessions);
  const modelOptions = uniqueModelNames(sessions);
  const filteredSessions = filterSessions(
    sessions,
    attributionFilter,
    modelFilter
  );
  const pageCount = totalPageCount(filteredSessions.length);
  const currentPage = Math.min(page, pageCount);
  const pageSessions = paginateSessions(filteredSessions, currentPage);

  return (
    <div className={sectionChromeClassName}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrowClassName}>Sessions</p>
          <h2 className={headingClassName}>Every session</h2>
          <p className={captionClassName}>
            {sessions.length} sessions · {attributed} attributed · {adHoc} ad
            hoc
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label
            className="text-fg-mute flex items-center gap-2 text-xs"
            htmlFor="sessions-list-attribution-filter"
          >
            Filter by attribution
            <select
              className={selectClassName}
              id="sessions-list-attribution-filter"
              onChange={handleChangeAttributionFilter}
              value={attributionFilter}
            >
              <option value="all">All sessions</option>
              <option value="attributed">Attributed</option>
              <option value="ad-hoc">Ad hoc</option>
            </select>
          </label>
          <label
            className="text-fg-mute flex items-center gap-2 text-xs"
            htmlFor="sessions-list-model-filter"
          >
            Filter by model
            <select
              className={selectClassName}
              id="sessions-list-model-filter"
              onChange={handleChangeModelFilter}
              value={modelFilter}
            >
              <option value={ALL_MODELS_FILTER_VALUE}>All models</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {pageSessions.length === 0 ?
        <EmptyState
          description="Try a different attribution or model filter."
          title="No sessions match these filters"
        />
      : <ul>
          {pageSessions.map((session) => (
            <SessionRow key={session.sessionId} session={session} />
          ))}
        </ul>
      }

      <div className="flex items-center justify-between gap-4">
        <p className={captionClassName}>
          Page {currentPage} of {pageCount}
        </p>
        <div className="flex gap-2">
          <button
            className={pageButtonClassName}
            disabled={currentPage <= 1}
            onClick={handleClickPreviousPage}
            type="button"
          >
            Previous page
          </button>
          <button
            className={pageButtonClassName}
            disabled={currentPage >= pageCount}
            onClick={handleClickNextPage}
            type="button"
          >
            Next page
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionsList;

/**
 * Pixel-matching loading placeholder for AsyncSection's `skeleton` prop
 * (skeleton-loaders skill): same chrome, header, and a handful of shimmering
 * row placeholders, so the swap to live data causes no layout shift.
 */
export const SessionsListSkeleton: FC = () => (
  <div
    aria-hidden={true}
    className={sectionChromeClassName}
    data-testid="sessions-list-skeleton"
  >
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className={twMerge(eyebrowClassName, shimmer)}>Sessions</p>
        <h2 className={twMerge(headingClassName, shimmer)}>Every session</h2>
        <p className={twMerge(captionClassName, shimmer)}>
          000 sessions · 00 attributed · 00 ad hoc
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={twJoin(selectClassName, shimmer, 'inline-block')}>
          All sessions
        </span>
        <span className={twJoin(selectClassName, shimmer, 'inline-block')}>
          All models
        </span>
      </div>
    </header>
    <ul>
      {Array.from({length: 5}, (unused, index) => (
        <li
          key={index}
          className="border-border-soft flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="min-w-0 flex-1">
            <p className={twJoin('text-sm font-medium', shimmer)}>
              Session title placeholder
            </p>
            <p className={twJoin('mt-0.5 text-xs', shimmer)}>
              Jul 7, 2026, 3:00 PM · 42m 00s · main
            </p>
            <p className={twJoin('mt-0.5 text-xs', shimmer)}>
              claude-opus-4-1 · 8.0K output / 54.2K total tokens
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
            <span className={twJoin('text-sm', shimmer)}>$14.35</span>
            <span className={twJoin(badgeClassName, shimmer)}>SPEC-001</span>
          </div>
        </li>
      ))}
    </ul>
  </div>
);
