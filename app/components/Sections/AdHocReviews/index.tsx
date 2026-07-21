import type {FC, MouseEvent} from 'react';
import {twJoin} from 'tailwind-merge';
import {sessionsTabHref} from '~/components/Sections/anchor-ids';
import {
  formatDateTime,
  formatDollars,
  formatDollarsCell,
  formatDuration,
  formatTokens,
} from '~/data/format/units';
import type {AdHocReview} from '~/data/schemas/api';

/**
 * SPEC-032 ad-hoc code reviews: `code-review-audit` runs with no spec or plan
 * association, so they never land in the specs/plans cost table. Surfacing them
 * here keeps their net-new recorded spend visible instead of silently inflating
 * the "Recorded spend" KPI (which is spec & plan work). Presentational: the App
 * hands it the already-fetched `costs.adHocReviews` slice and hides the whole
 * section when there are none.
 */
export type AdHocReviewsProps = {
  /** Navigates to the Sessions tab, targeting one session (feedback parity). */
  onViewSession?: (sessionId: string) => void;
  reviews: AdHocReview[];
};

const sectionChromeClass =
  'border-border bg-bg-elev flex flex-col gap-4 rounded-md border p-6';
const eyebrowClass =
  'text-accent-soft font-mono text-xs tracking-[0.2em] uppercase';
const headingClass = 'text-fg text-title font-medium';
const captionClass = 'text-fg-mute text-sm';

const headerCellClass =
  'text-fg-mute px-3 py-2 text-left font-mono text-[0.65rem] tracking-[0.15em] uppercase';
const cellClass = 'text-fg-dim border-border-soft border-t px-3 py-2 text-sm';
const numericCellClass = 'text-right font-mono tabular-nums whitespace-nowrap';
const jumpLinkClass =
  'text-secondary-soft hover:text-secondary focus-visible:outline-accent ml-2 rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2';

/** Sum the present recorded dollars; null only when none carry a figure. */
const sumReviewDollars = (reviews: AdHocReview[]): null | number => {
  const known = reviews
    .map((review) => review.recordedDollars)
    .filter((value): value is number => value !== null);

  return known.length === 0 ?
      null
    : known.reduce((total, value) => total + value, 0);
};

const ReviewRow: FC<{
  onViewSession?: (sessionId: string) => void;
  review: AdHocReview;
}> = ({onViewSession, review}) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onViewSession) {
      event.preventDefault();
      onViewSession(review.sessionId);
    }
  };

  return (
    <tr>
      <td className={twJoin(cellClass, 'font-mono')}>
        {review.reviewId ?? 'Code review'}
        <a
          className={jumpLinkClass}
          href={sessionsTabHref(review.sessionId)}
          onClick={handleClick}
        >
          View in sessions
        </a>
      </td>
      <td className={twJoin(cellClass, 'whitespace-nowrap tabular-nums')}>
        {formatDateTime(review.at)}
      </td>
      <td className={twJoin(cellClass, numericCellClass)}>
        {formatTokens(review.totalTokens)}
      </td>
      <td className={twJoin(cellClass, numericCellClass)}>
        {formatDollarsCell(review.recordedDollars)}
      </td>
      <td className={twJoin(cellClass, numericCellClass)}>
        {formatDuration(review.durationSeconds)}
      </td>
    </tr>
  );
};

const AdHocReviews: FC<AdHocReviewsProps> = ({onViewSession, reviews}) => {
  if (reviews.length === 0) {
    return undefined;
  }

  const total = sumReviewDollars(reviews);

  return (
    <section aria-label="Ad hoc reviews" className={sectionChromeClass}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={eyebrowClass}>Ad hoc reviews</p>
          <h2 className={headingClass}>Reviews outside a spec or plan</h2>
          <p className={captionClass}>
            Recorded code-review spend not tied to a spec or plan, counted on
            its own rather than in spec &amp; plan recorded spend.
          </p>
        </div>
        <p className="text-fg text-metric-sm font-mono tabular-nums">
          {total === null ? formatDollarsCell(total) : formatDollars(total)}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-bg-elev-2">
              <th className={headerCellClass}>Review</th>
              <th className={headerCellClass}>When</th>
              <th className={twJoin(headerCellClass, 'text-right')}>Tokens</th>
              <th className={twJoin(headerCellClass, 'text-right')}>Cost</th>
              <th className={twJoin(headerCellClass, 'text-right')}>Time</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <ReviewRow
                key={`${review.sessionId}-${review.reviewId ?? review.at}`}
                onViewSession={onViewSession}
                review={review}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AdHocReviews;
