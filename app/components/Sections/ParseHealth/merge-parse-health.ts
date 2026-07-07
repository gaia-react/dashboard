import type {ParseHealthCounter, ParseHealthSlice} from '~/data/schemas/api';

export type MergedParseHealth = {
  counters: ParseHealthCounter[];
  /** True only when neither side reports a skip, an unparseable file, an
   * unknown kind/status, or a note; drives the footer's quiet-vs-informative
   * tone. */
  isClean: boolean;
  notes: string[];
  unknownKinds: string[];
  unknownStatuses: string[];
};

const union = (first: string[], second: string[]): string[] => [
  ...new Set([...first, ...second]),
];

/**
 * Merges the ParseHealthSlice each API response carries (SPEC section 6.8,
 * schema comment on `parseHealthSliceSchema`): concatenate `counters` and
 * `notes`, union `unknownKinds` and `unknownStatuses`.
 */
export const mergeParseHealth = (
  costsParseHealth: ParseHealthSlice,
  activityParseHealth: ParseHealthSlice
): MergedParseHealth => {
  const counters = [
    ...costsParseHealth.counters,
    ...activityParseHealth.counters,
  ];
  const notes = [...costsParseHealth.notes, ...activityParseHealth.notes];
  const unknownKinds = union(
    costsParseHealth.unknownKinds,
    activityParseHealth.unknownKinds
  );
  const unknownStatuses = union(
    costsParseHealth.unknownStatuses,
    activityParseHealth.unknownStatuses
  );
  const isClean =
    notes.length === 0 &&
    unknownKinds.length === 0 &&
    unknownStatuses.length === 0 &&
    counters.every(
      (counter) => counter.filesUnparseable === 0 && counter.linesSkipped === 0
    );

  return {counters, isClean, notes, unknownKinds, unknownStatuses};
};
