import {describe, expect, test} from 'vitest';
import {resolveLensName} from '~/data/format/lenses';

describe('resolveLensName', () => {
  test('resolves every spec-only acronym for kind spec', () => {
    expect(resolveLensName('FG', 'spec')).toBe('Factual grounding');
    expect(resolveLensName('TST', 'spec')).toBe('UAT testability');
    expect(resolveLensName('RT', 'spec')).toBe('Red-team & feasibility');
    expect(resolveLensName('SEC', 'spec')).toBe('Security');
    expect(resolveLensName('MIG', 'spec')).toBe('Migration & data');
    expect(resolveLensName('A11Y', 'spec')).toBe('Accessibility');
    expect(resolveLensName('DOC', 'spec')).toBe('Documentation');
    expect(resolveLensName('PERF', 'spec')).toBe('Performance');
  });

  test('resolves the plan-only acronyms for kind plan', () => {
    expect(resolveLensName('DP', 'plan')).toBe(
      'Decomposition & dependency soundness'
    );
    expect(resolveLensName('CG', 'plan')).toBe('Contract grounding');
  });

  test('COV resolves differently for spec and plan (the whole reason resolveLensName takes a kind)', () => {
    expect(resolveLensName('COV', 'spec')).toBe('Coverage & consistency');
    expect(resolveLensName('COV', 'plan')).toBe('SPEC coverage');
  });

  test('an unknown acronym returns itself verbatim', () => {
    expect(resolveLensName('ZZZ', 'spec')).toBe('ZZZ');
    expect(resolveLensName('ZZZ', 'plan')).toBe('ZZZ');
  });

  test('an acronym valid only for the other kind still returns the name it has, not the bare acronym', () => {
    // DP is plan-only in the source table; asked of a spec audit it still
    // resolves to the plan name rather than falling back to "DP" (documented
    // in lenses.ts: a cross-kind name is more informative than the acronym).
    expect(resolveLensName('DP', 'spec')).toBe(
      'Decomposition & dependency soundness'
    );
    // SEC is spec-only; asked of a plan audit it resolves the same way.
    expect(resolveLensName('SEC', 'plan')).toBe('Security');
  });

  test('an empty or unexpected kind degrades to a lookup rather than throwing', () => {
    expect(resolveLensName('FG', '')).toBe('Factual grounding');
    expect(resolveLensName('COV', 'execute')).toBe('Coverage & consistency');
    expect(resolveLensName('ZZZ', 'nonsense')).toBe('ZZZ');
  });

  test('an acronym that collides with an Object.prototype member falls back to the acronym verbatim, not the inherited member', () => {
    // audit.lenses is an unconstrained z.array(z.string()), so any of these
    // are reachable from upstream data. A plain `table[acronym]` index would
    // return the inherited function/object instead of falling through.
    expect(resolveLensName('constructor', 'spec')).toBe('constructor');
    expect(resolveLensName('toString', 'spec')).toBe('toString');
    expect(resolveLensName('hasOwnProperty', 'plan')).toBe('hasOwnProperty');
    expect(resolveLensName('__proto__', 'spec')).toBe('__proto__');
  });
});
