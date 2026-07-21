/**
 * Full names for the SPEC-032 adversarial-audit lens acronyms carried on
 * `audit.adversarial.lenses` (`cost-record.ts` -> `mergeAudit` ->
 * `PhaseRollup.audit.lenses`), rendered as chips in the cost table's expanded
 * detail. Users do not know what "COV" means.
 *
 * `COV` is kind-dependent ("Coverage & consistency" on a spec audit, "SPEC
 * coverage" on a plan audit), which is why the lookup takes the phase kind
 * and not just the acronym.
 *
 * Sources: `../gaia/.claude/skills/gaia/references/spec.md:620-642` and
 * `plan.md:387-389`.
 */

const SPEC_LENS_NAMES: Partial<Record<string, string>> = {
  A11Y: 'Accessibility',
  COV: 'Coverage & consistency',
  DOC: 'Documentation',
  FG: 'Factual grounding',
  MIG: 'Migration & data',
  PERF: 'Performance',
  RT: 'Red-team & feasibility',
  SEC: 'Security',
  TST: 'UAT testability',
};

const PLAN_LENS_NAMES: Partial<Record<string, string>> = {
  CG: 'Contract grounding',
  COV: 'SPEC coverage',
  DP: 'Decomposition & dependency soundness',
};

/**
 * Looks up `acronym` in `table` via `Object.hasOwn` rather than a plain
 * `table[acronym]` index: the tables are plain object literals, and an
 * acronym value that collides with an inherited `Object.prototype` member
 * (`constructor`, `toString`, `hasOwnProperty`, `__proto__`, ...) would
 * otherwise resolve to that inherited function/object instead of falling
 * through, since `??` only catches `null`/`undefined`. `audit.lenses` is an
 * unconstrained `z.array(z.string())` (`schemas/api.ts`), so this is
 * reachable from upstream data, not theoretical. Mirrors
 * `app/components/Icon/icon-map.ts`'s `resolveIcon`.
 */
const lookup = (
  table: Partial<Record<string, string>>,
  acronym: string
): string | undefined =>
  Object.hasOwn(table, acronym) ? table[acronym] : undefined;

/**
 * Resolves a lens acronym to its full name for the phase `kind` it was
 * observed on ("spec" or "plan"). Any other `kind` value (unexpected or
 * empty) is treated as "spec": the spec table is the larger of the two and
 * a wrong guess still degrades to a real name or the acronym, never a throw.
 *
 * An acronym defined only for the OTHER kind (e.g. `DP` on a spec audit)
 * still resolves to the name it has there rather than the bare acronym: the
 * full name is more informative than "DP" even when it names a lens that
 * kind's checklist does not itself run, and the upstream data has never been
 * observed to carry a mismatched acronym for a given kind.
 *
 * An acronym in neither table (the upstream vocabulary will grow) falls back
 * to the acronym verbatim rather than "Unknown" or dropping the chip.
 */
export const resolveLensName = (acronym: string, kind: string): string => {
  const primaryTable = kind === 'plan' ? PLAN_LENS_NAMES : SPEC_LENS_NAMES;
  const secondaryTable = kind === 'plan' ? SPEC_LENS_NAMES : PLAN_LENS_NAMES;

  return (
    lookup(primaryTable, acronym) ?? lookup(secondaryTable, acronym) ?? acronym
  );
};
