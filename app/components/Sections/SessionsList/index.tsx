import type {ChangeEventHandler, FC, MouseEvent, ReactNode} from 'react';
import {useEffect, useRef} from 'react';
import {twJoin, twMerge} from 'tailwind-merge';
import EmptyState from '~/components/EmptyState';
import {
  ALL_MODELS_FILTER_VALUE,
  costViewForEntryType,
  countSessionsByAttribution,
  filterSessions,
  formatSessionDateTime,
  formatSessionDollars,
  formatSessionDuration,
  formatSessionModels,
  formatSessionTokenCount,
  pageForSession,
  paginateSessions,
  resolveSessionTypeFilter,
  sessionAnchorId,
  sessionDisplayTitle,
  totalPageCount,
  uniqueModelNames,
  workTabHref,
} from '~/components/Sections/SessionsList/format';
import {shimmer} from '~/components/Skeleton';
import {formatModelName} from '~/data/format/model-name';
import type {SessionSummary} from '~/data/schemas/api';
import {useQueryParams} from '~/hooks/useQueryParams';

export type SessionsListProps = {
  /** Navigates to the Work tab, targeting one cost entry: the attribution
   * badge's jump-link, symmetric to CostTable's "View in sessions" (feedback). */
  onViewEntry?: (key: string, table: 'plans' | 'specs') => void;
  /** `ActivityResponse.sessions`, reverse-chronological (the API's order). */
  sessions: SessionSummary[];
};

export const sectionChromeClassName =
  'border-border bg-bg-elev flex flex-col gap-4 rounded-md border p-6';

export const eyebrowClassName =
  'text-accent-soft font-mono text-xs tracking-[0.2em] uppercase';

export const headingClassName = 'text-fg text-title font-medium';

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
  onViewEntry?: (key: string, table: 'plans' | 'specs') => void;
}> = ({attribution, onViewEntry}) => {
  if (!attribution) {
    return <span className={adHocBadgeClassName}>Ad hoc</span>;
  }

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onViewEntry) {
      event.preventDefault();
      onViewEntry(attribution.key, costViewForEntryType(attribution.entryType));
    }
  };

  return (
    <a
      className={attributedBadgeClassName}
      href={workTabHref(attribution.key, attribution.entryType)}
      onClick={handleClick}
    >
      {attribution.key}
    </a>
  );
};

const SessionDollars: FC<{dollars: SessionSummary['dollars']}> = ({
  dollars,
}) => {
  if (!dollars) {
    return <span className="text-fg-mute text-xs">-</span>;
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

const SessionRow: FC<{
  isTarget: boolean;
  onViewEntry?: (key: string, table: 'plans' | 'specs') => void;
  session: SessionSummary;
}> = ({isTarget, onViewEntry, session}) => (
  <li
    className={twJoin(
      'border-border-soft flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
      isTarget && 'bg-accent/5 ring-accent/40 -mx-2 rounded-sm px-2 ring-1'
    )}
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
        <span>{formatSessionModels(session.models) || 'no model data'}</span>
        <span aria-hidden={true}>·</span>
        <span>{formatSessionTokenCount(session.totalTokens)} tokens</span>
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
      <SessionDollars dollars={session.dollars} />
      <SessionAttributionBadge
        attribution={session.attribution}
        onViewEntry={onViewEntry}
      />
    </div>
  </li>
);

const EmptyChrome: FC<{children: ReactNode}> = ({children}) => (
  <div className={sectionChromeClassName}>
    <header>
      <p className={eyebrowClassName}>Sessions</p>
      <h2 className={headingClassName}>Every session</h2>
    </header>
    {children}
  </div>
);

/**
 * SPEC 6.6: reverse-chronological sessions list. The type and model filters
 * and the page live in the URL (`?type=&model=&page=`, feedback) so the view
 * is shareable and a cross-tab jump-link (`?id=`) lands on a clean,
 * unfiltered page with the target scrolled into view. Client-side pagination
 * at 50/page (PLAN D5); filters narrow the list BEFORE paging. "GAIA" is a
 * session attributed to a spec/plan; recorded and estimated dollars never sum,
 * and an estimated lower-bound figure carries an explicit marker.
 */
const SessionsList: FC<SessionsListProps> = ({onViewEntry, sessions}) => {
  const [params, setQueryParams] = useQueryParams();
  const typeFilter = resolveSessionTypeFilter(params.get('type'));
  const modelFilter = params.get('model') ?? ALL_MODELS_FILTER_VALUE;
  const pageParam = params.get('page');
  const targetSessionId = params.get('id');
  const scrolledForRef = useRef<null | string>(null);

  const {adHoc, attributed} = countSessionsByAttribution(sessions);
  const modelOptions = uniqueModelNames(sessions);
  const filteredSessions = filterSessions(sessions, typeFilter, modelFilter);
  const pageCount = totalPageCount(filteredSessions.length);

  // An explicit `?page=` wins; otherwise an `?id=` jump derives the page
  // that holds its target so the row is on-screen to scroll to.
  const targetPage =
    targetSessionId === null ? null : (
      pageForSession(filteredSessions, targetSessionId)
    );
  const requestedPage =
    pageParam === null ? (targetPage ?? 1) : Number.parseInt(pageParam, 10);
  const currentPage = Math.min(Math.max(1, requestedPage || 1), pageCount);
  const pageSessions = paginateSessions(filteredSessions, currentPage);

  useEffect(() => {
    if (
      targetSessionId === null ||
      scrolledForRef.current === targetSessionId
    ) {
      return;
    }

    const element = document.querySelector(
      `[id="${CSS.escape(sessionAnchorId(targetSessionId))}"]`
    );

    if (element) {
      scrolledForRef.current = targetSessionId;
      element.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
  }, [pageSessions, targetSessionId]);

  const handleChangeType: ChangeEventHandler<HTMLSelectElement> = (event) => {
    setQueryParams({
      id: null,
      page: null,
      type: event.target.value === 'all' ? null : event.target.value,
    });
  };

  const handleChangeModel: ChangeEventHandler<HTMLSelectElement> = (event) => {
    setQueryParams({
      id: null,
      model:
        event.target.value === ALL_MODELS_FILTER_VALUE ?
          null
        : event.target.value,
      page: null,
    });
  };

  const goToPage = (page: number): void => {
    setQueryParams({id: null, page: page <= 1 ? null : String(page)});
  };

  if (sessions.length === 0) {
    return (
      <EmptyChrome>
        <EmptyState
          description="Claude Code activity will appear here once a session runs in this project."
          title="No sessions yet"
        />
      </EmptyChrome>
    );
  }

  return (
    <div className={sectionChromeClassName}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrowClassName}>Sessions</p>
          <h2 className={headingClassName}>Every session</h2>
          <p className={captionClassName}>
            {sessions.length} sessions · {attributed} GAIA · {adHoc} ad hoc
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label
            className="text-fg-mute flex items-center gap-2 text-xs"
            htmlFor="sessions-list-type-filter"
          >
            Type
            <select
              className={selectClassName}
              id="sessions-list-type-filter"
              onChange={handleChangeType}
              value={typeFilter}
            >
              <option value="all">All sessions</option>
              <option value="gaia">GAIA</option>
              <option value="ad-hoc">Ad hoc</option>
            </select>
          </label>
          <label
            className="text-fg-mute flex items-center gap-2 text-xs"
            htmlFor="sessions-list-model-filter"
          >
            Model
            <select
              className={selectClassName}
              id="sessions-list-model-filter"
              onChange={handleChangeModel}
              value={modelFilter}
            >
              <option value={ALL_MODELS_FILTER_VALUE}>All models</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {formatModelName(model)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {pageSessions.length === 0 ?
        <EmptyState
          description="Try a different type or model filter."
          title="No sessions match these filters"
        />
      : <ul>
          {pageSessions.map((session) => (
            <SessionRow
              key={session.sessionId}
              isTarget={session.sessionId === targetSessionId}
              onViewEntry={onViewEntry}
              session={session}
            />
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
            onClick={() => goToPage(currentPage - 1)}
            type="button"
          >
            Previous page
          </button>
          <button
            className={pageButtonClassName}
            disabled={currentPage >= pageCount}
            onClick={() => goToPage(currentPage + 1)}
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
          000 sessions · 00 GAIA · 00 ad hoc
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
              Claude Opus 4.8 · 54.2K tokens
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
