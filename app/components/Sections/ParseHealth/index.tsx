import type {FC} from 'react';
import {twJoin, twMerge} from 'tailwind-merge';
import type {MergedParseHealth} from '~/components/Sections/ParseHealth/merge-parse-health';
import {mergeParseHealth} from '~/components/Sections/ParseHealth/merge-parse-health';
import {shimmer} from '~/components/Skeleton';
import type {ParseHealthSlice} from '~/data/schemas/api';

type Props = {
  activityParseHealth: ParseHealthSlice;
  costsParseHealth: ParseHealthSlice;
};

const eyebrowClass = 'font-mono text-xs tracking-[0.2em] uppercase';
const badgeClass =
  'border-warn-2 text-warn-soft rounded-sm border px-2 py-0.5 text-xs';
const footerContainerClass =
  'border-border-soft bg-bg-elev group rounded-md border';
const summaryClass = twJoin(
  'focus-visible:outline-accent flex list-none items-center justify-between gap-4 rounded-md px-4 py-3',
  'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2'
);

const describeCount = (
  count: number,
  singular: string,
  plural: string
): string => `${count} ${count === 1 ? singular : plural}`;

/**
 * One-line collapsed summary: quiet when clean, otherwise a comma-joined
 * count of the issue kinds present (SPEC section 6.8).
 */
const summarize = (merged: MergedParseHealth): string => {
  if (merged.isClean) {
    return 'Everything parsed cleanly';
  }

  const totalLinesSkipped = merged.counters.reduce(
    (total, counter) => total + counter.linesSkipped,
    0
  );
  const totalFilesUnparseable = merged.counters.reduce(
    (total, counter) => total + counter.filesUnparseable,
    0
  );

  const clauses = [
    totalLinesSkipped > 0 ?
      describeCount(totalLinesSkipped, 'line skipped', 'lines skipped')
    : undefined,
    totalFilesUnparseable > 0 ?
      describeCount(
        totalFilesUnparseable,
        'file unparseable',
        'files unparseable'
      )
    : undefined,
    merged.unknownKinds.length > 0 ?
      describeCount(merged.unknownKinds.length, 'unknown kind', 'unknown kinds')
    : undefined,
    merged.unknownStatuses.length > 0 ?
      describeCount(
        merged.unknownStatuses.length,
        'unknown status',
        'unknown statuses'
      )
    : undefined,
    merged.notes.length > 0 ?
      describeCount(merged.notes.length, 'note', 'notes')
    : undefined,
  ].filter((clause) => clause !== undefined);

  return clauses.join(', ');
};

/**
 * Parse-health footer (SPEC section 6.8). Merges the ParseHealthSlice from
 * both API responses and renders it as a native disclosure: collapsed by
 * default so data problems never crowd the dashboard proper, quiet when
 * clean, informative once expanded when not. `<details>`/`<summary>` carry
 * the correct expanded/collapsed semantics natively, no hand-rolled
 * aria-expanded/aria-controls needed (accessibility rule: prefer semantic
 * HTML over ARIA roles).
 */
const ParseHealth: FC<Props> = ({activityParseHealth, costsParseHealth}) => {
  const merged = mergeParseHealth(costsParseHealth, activityParseHealth);

  return (
    <details className={footerContainerClass} data-testid="parse-health-footer">
      <summary className={summaryClass} data-testid="parse-health-summary">
        <span className={twMerge(eyebrowClass, 'text-fg-mute')}>
          Parse health
        </span>
        <span className="flex items-center gap-3">
          <span
            className={twJoin(
              'text-sm',
              merged.isClean ? 'text-fg-dim' : 'text-warn-soft'
            )}
          >
            {summarize(merged)}
          </span>
          <svg
            aria-hidden={true}
            className="text-fg-mute size-3 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            fill="none"
            viewBox="0 0 12 12"
          >
            <path
              d="M2 4l4 4 4-4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </span>
      </summary>
      <div
        className="border-border-soft flex flex-col gap-4 border-t p-4"
        data-testid="parse-health-detail"
      >
        {merged.isClean ?
          <p className="text-fg-dim text-sm">
            No skipped lines, unparseable files, or unknown values across{' '}
            {describeCount(merged.counters.length, 'source', 'sources')}.
          </p>
        : <>
            <dl className="grid gap-3 sm:grid-cols-2">
              {merged.counters.map((counter) => (
                <div
                  key={counter.source}
                  className="border-border-soft rounded-sm border p-3"
                >
                  <dt className={twMerge(eyebrowClass, 'text-fg-mute')}>
                    {counter.source}
                  </dt>
                  <dd className="text-fg-dim mt-1 text-sm">
                    {counter.linesSkipped} / {counter.linesRead} lines skipped ·{' '}
                    {counter.filesUnparseable} / {counter.filesScanned} files
                    unparseable
                  </dd>
                </div>
              ))}
            </dl>
            {merged.unknownKinds.length > 0 && (
              <div>
                <p className={twMerge(eyebrowClass, 'text-fg-mute')}>
                  Unknown kind values
                </p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {merged.unknownKinds.map((kind) => (
                    <li key={kind} className={badgeClass}>
                      {kind}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {merged.unknownStatuses.length > 0 && (
              <div>
                <p className={twMerge(eyebrowClass, 'text-fg-mute')}>
                  Unknown status values
                </p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {merged.unknownStatuses.map((status) => (
                    <li key={status} className={badgeClass}>
                      {status}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {merged.notes.length > 0 && (
              <div>
                <p className={twMerge(eyebrowClass, 'text-fg-mute')}>Notes</p>
                <ul className="text-fg-dim mt-1 flex list-disc flex-col gap-1 pl-4 text-sm">
                  {merged.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        }
      </div>
    </details>
  );
};

export default ParseHealth;

/**
 * Pixel-matching skeleton for the collapsed footer (skeleton-loaders skill,
 * transparent-text technique): same container/summary classes as the real
 * closed `<details>`, so the swap to real content causes no layout shift.
 */
export const ParseHealthSkeleton: FC = () => (
  <div
    aria-hidden={true}
    className={twJoin(footerContainerClass, summaryClass)}
    data-testid="parse-health-skeleton"
  >
    <span className={twMerge(eyebrowClass, shimmer)}>Parse health</span>
    <span className={twMerge('text-sm', shimmer)}>
      Everything parsed cleanly
    </span>
  </div>
);
