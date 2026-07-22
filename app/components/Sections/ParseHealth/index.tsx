import type {FC} from 'react';
import {mergeParseHealth} from '~/components/Sections/ParseHealth/merge-parse-health';
import type {ParseHealthSlice} from '~/data/schemas/api';

type Props = {
  activityParseHealth: ParseHealthSlice;
  costsParseHealth: ParseHealthSlice;
};

const sectionChromeClassName =
  'border-warn-2 bg-bg-elev flex flex-col gap-4 rounded-md border p-6';
const eyebrowClassName = 'text-label text-fg-dim';
const headingClassName = 'text-fg text-title font-medium';
const groupLabelClassName = 'text-label text-fg-dim';
const badgeClassName =
  'border-warn-2 text-warn-soft rounded-sm border px-2 py-0.5 text-xs';

/**
 * Parse-health footer (SPEC section 6.8). Only rendered when a data problem
 * actually exists (feedback): a clean parse is silent, no "everything is fine"
 * card. When something did not parse, it surfaces exactly what: per-source skip
 * and unparseable counts, unknown kind/status values, and any upstream notes.
 * Keys are namespaced by array position so identical values from the two
 * merged slices never collide (W16).
 */
const ParseHealth: FC<Props> = ({activityParseHealth, costsParseHealth}) => {
  const merged = mergeParseHealth(costsParseHealth, activityParseHealth);

  if (merged.isClean) {
    return undefined;
  }

  const problemCounters = merged.counters.filter(
    (counter) => counter.linesSkipped > 0 || counter.filesUnparseable > 0
  );
  // Dedupe notes so an identical note from both merged slices renders once,
  // giving every list a stable value key (W16: no positional-index keys).
  const notes = [...new Set(merged.notes)];

  return (
    <section
      aria-label="Parse health"
      className={sectionChromeClassName}
      data-testid="parse-health"
    >
      <header>
        <p className={eyebrowClassName}>Parse health</p>
        <h2 className={headingClassName}>
          Some data didn&apos;t parse cleanly
        </h2>
      </header>

      {problemCounters.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {problemCounters.map((counter) => (
            <div
              key={counter.source}
              className="border-border-soft rounded-sm border p-3"
            >
              <dt className={groupLabelClassName}>{counter.source}</dt>
              <dd className="text-fg-dim mt-1 text-sm">
                {counter.linesSkipped} / {counter.linesRead} lines skipped ·{' '}
                {counter.filesUnparseable} / {counter.filesScanned} files
                unparseable
              </dd>
            </div>
          ))}
        </dl>
      )}

      {merged.unknownKinds.length > 0 && (
        <div>
          <p className={groupLabelClassName}>Unknown kind values</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {merged.unknownKinds.map((kind) => (
              <li key={kind} className={badgeClassName}>
                {kind}
              </li>
            ))}
          </ul>
        </div>
      )}

      {merged.unknownStatuses.length > 0 && (
        <div>
          <p className={groupLabelClassName}>Unknown status values</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {merged.unknownStatuses.map((status) => (
              <li key={status} className={badgeClassName}>
                {status}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div>
          <p className={groupLabelClassName}>Notes</p>
          <ul className="text-fg-dim mt-1 flex list-disc flex-col gap-1 pl-4 text-sm">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default ParseHealth;
