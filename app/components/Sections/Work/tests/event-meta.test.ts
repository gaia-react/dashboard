import {describe, expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {iconMap} from '~/components/Icon/icon-map';
import {
  EVENT_GROUPS,
  EVENT_ICONS,
  EVENT_LABELS,
  EVENT_TONES,
  mergeScalarMaps,
} from '~/components/Sections/Work/event-meta';
import type {GaiaEventType} from '~/components/Sections/Work/events';
import type {CostsResponse, PhaseRollup} from '~/data/schemas/api';
import {costsResponseSchema} from '~/data/schemas/api';

const readFixture = (name: string): CostsResponse =>
  costsResponseSchema.parse(
    JSON.parse(
      readFileSync(path.join(process.cwd(), 'test/fixtures/work', name), 'utf8')
    )
  );

const costs = readFixture('costs-response.json');

const ALL_TYPES: GaiaEventType[] = [
  'audit',
  'debt',
  'fitness',
  'forensics',
  'harden',
  'plan',
  'review',
  'spec',
  'unknown',
  'wiki',
];

const alphabetical = (a: string, b: string): number => a.localeCompare(b);

const buildPhase = (overrides: Partial<PhaseRollup>): PhaseRollup => ({
  byAgentType: null,
  byModel: null,
  durationSeconds: null,
  kind: 'execute',
  recordedDollars: null,
  source: 'native',
  totalTokens: 0,
  ...overrides,
});

describe('EVENT_TONES', () => {
  // Copied cell for cell out of DESIGN-SPEC 2.5. If this table and the spec
  // ever disagree, the spec is right.
  test('matches DESIGN-SPEC 2.5 for all ten types', () => {
    expect(EVENT_TONES).toEqual({
      audit: {
        border: 'border-secondary',
        chipText: 'text-secondary-soft',
        fill: 'fill-secondary',
        icon: 'text-secondary',
        swatch: 'bg-secondary',
      },
      debt: {
        border: 'border-warn',
        chipText: 'text-warn-soft',
        fill: 'fill-warn',
        icon: 'text-warn',
        swatch: 'bg-warn',
      },
      fitness: {
        border: 'border-moss',
        chipText: 'text-moss-soft',
        fill: 'fill-moss',
        icon: 'text-moss',
        swatch: 'bg-moss',
      },
      forensics: {
        border: 'border-warn-soft',
        chipText: 'text-warn-soft',
        fill: 'fill-warn-soft',
        icon: 'text-warn-soft',
        swatch: 'bg-warn-soft',
      },
      harden: {
        border: 'border-info',
        chipText: 'text-info-soft',
        fill: 'fill-info',
        icon: 'text-info',
        swatch: 'bg-info',
      },
      plan: {
        border: 'border-accent-soft',
        chipText: 'text-accent-soft',
        fill: 'fill-accent-soft',
        icon: 'text-accent-soft',
        swatch: 'bg-accent-soft',
      },
      review: {
        border: 'border-fg-mute',
        chipText: 'text-fg-dim',
        fill: 'fill-fg-mute',
        icon: 'text-fg-mute',
        swatch: 'bg-fg-mute',
      },
      spec: {
        border: 'border-accent',
        chipText: 'text-accent-soft',
        fill: 'fill-accent',
        icon: 'text-accent',
        swatch: 'bg-accent',
      },
      unknown: {
        border: 'border-fg-mute',
        chipText: 'text-fg-dim',
        fill: 'fill-fg-mute',
        icon: 'text-fg-mute',
        swatch: 'bg-fg-mute',
      },
      wiki: {
        border: 'border-secondary-soft',
        chipText: 'text-secondary-soft',
        fill: 'fill-secondary-soft',
        icon: 'text-secondary-soft',
        swatch: 'bg-secondary-soft',
      },
    });
  });

  test("Review's chip text is fg-dim, since fg-mute fails AA on bg-elev-2", () => {
    expect(EVENT_TONES.review.chipText).toBe('text-fg-dim');
    expect(EVENT_TONES.review.icon).toBe('text-fg-mute');
    expect(EVENT_TONES.unknown.chipText).toBe('text-fg-dim');
  });

  test('every tone class is a complete literal utility, never a fragment', () => {
    const prefixes = {
      border: 'border-',
      chipText: 'text-',
      fill: 'fill-',
      icon: 'text-',
      swatch: 'bg-',
    };

    for (const type of ALL_TYPES) {
      const tone = EVENT_TONES[type];

      for (const [field, prefix] of Object.entries(prefixes)) {
        const value = tone[field as keyof typeof tone];

        expect(value.startsWith(prefix)).toBe(true);
        expect(value.length).toBeGreaterThan(prefix.length);
        expect(value).not.toContain('${');
        expect(value).not.toContain(' ');
      }
    }
  });

  test('no -2 variant is ever used as a text color', () => {
    for (const type of ALL_TYPES) {
      expect(EVENT_TONES[type].chipText).not.toMatch(/-2$/u);
    }
  });
});

describe('EVENT_LABELS and EVENT_ICONS', () => {
  test('names every type in sentence case', () => {
    expect(EVENT_LABELS).toEqual({
      audit: 'Audit',
      debt: 'Debt',
      fitness: 'Fitness',
      forensics: 'Forensics',
      harden: 'Harden',
      plan: 'Plan',
      review: 'Review',
      spec: 'Spec',
      unknown: 'Unknown',
      wiki: 'Wiki',
    });
  });

  test('maps every type to an icon the Icon component actually resolves', () => {
    for (const type of ALL_TYPES) {
      expect(Object.hasOwn(iconMap, EVENT_ICONS[type])).toBe(true);
    }
  });
});

describe('EVENT_GROUPS', () => {
  test('carries the filter optgroup order from DESIGN-SPEC C-10', () => {
    expect(EVENT_GROUPS.work).toEqual(['spec', 'plan', 'debt']);
    expect(EVENT_GROUPS.maintenance).toEqual([
      'audit',
      'fitness',
      'forensics',
      'harden',
      'wiki',
      'review',
    ]);
  });

  test('leaves unknown out of both groups, reachable only from All events', () => {
    expect([...EVENT_GROUPS.work, ...EVENT_GROUPS.maintenance]).not.toContain(
      'unknown'
    );
  });

  test('covers every other type exactly once', () => {
    const grouped = [...EVENT_GROUPS.work, ...EVENT_GROUPS.maintenance];

    expect(grouped).toHaveLength(9);
    expect(new Set(grouped).size).toBe(9);
    expect(grouped.toSorted(alphabetical)).toEqual(
      ALL_TYPES.filter((type) => type !== 'unknown').toSorted(alphabetical)
    );
  });
});

describe('mergeScalarMaps', () => {
  test('returns null when every phase is null', () => {
    const phases = [buildPhase({}), buildPhase({})];

    expect(mergeScalarMaps(phases, 'byModel')).toBeNull();
    expect(mergeScalarMaps(phases, 'byAgentType')).toBeNull();
  });

  test('returns null for an entry with no phases at all', () => {
    expect(mergeScalarMaps([], 'byModel')).toBeNull();
  });

  test('sums values across phases per key', () => {
    const phases = [
      buildPhase({byModel: {'claude-opus-4-8': 100, 'claude-sonnet-4-6': 20}}),
      buildPhase({byModel: {'claude-opus-4-8': 5}}),
    ];

    expect(mergeScalarMaps(phases, 'byModel')).toEqual({
      'claude-opus-4-8': 105,
      'claude-sonnet-4-6': 20,
    });
  });

  test('skips null phases in a mixed set rather than nulling the whole merge', () => {
    const phases = [
      buildPhase({}),
      buildPhase({byAgentType: {'general-purpose': 7}}),
      buildPhase({}),
    ];

    expect(mergeScalarMaps(phases, 'byAgentType')).toEqual({
      'general-purpose': 7,
    });
  });

  test('distinguishes a recorded-but-empty breakdown from no breakdown', () => {
    expect(mergeScalarMaps([buildPhase({byModel: {}})], 'byModel')).toEqual({});
  });

  // Model ids and agent-type names come straight from ../gaia, so a key
  // colliding with Object.prototype must accumulate as a plain key, never
  // read an inherited member as a running total. The maps are built with
  // JSON.parse, not an object literal: `{__proto__: 3}` sets the prototype
  // and creates no own property, so a literal here would quietly test
  // nothing. JSON.parse creates a real own `__proto__` key, which is also
  // exactly how these records reach the client (a parsed API response).
  test('accumulates a prototype-colliding key correctly', () => {
    const hostileMaps = JSON.parse(
      '[{"__proto__": 3, "constructor": 1, "toString": 2}, {"constructor": 4, "valueOf": 5}]'
    ) as Record<string, number>[];
    const phases = hostileMaps.map((byModel) => buildPhase({byModel}));

    expect(Object.hasOwn(hostileMaps[0], '__proto__')).toBe(true);

    const merged = mergeScalarMaps(phases, 'byModel');

    expect(merged).toEqual(
      JSON.parse(
        '{"__proto__": 3, "constructor": 5, "toString": 2, "valueOf": 5}'
      )
    );
    expect(Object.hasOwn(merged ?? {}, '__proto__')).toBe(true);
    expect(typeof merged?.constructor).toBe('number');
  });

  test('merges the fixture spec entry across its three phases', () => {
    const entry = costs.entries[0];

    expect(mergeScalarMaps(entry.phases, 'byModel')).toEqual({
      'claude-opus-4-8': 1_200_000,
      'claude-sonnet-4-6': 3_000_000,
    });
    expect(mergeScalarMaps(entry.phases, 'byAgentType')).toEqual({
      'general-purpose': 3_400_000,
      'task-docs-wiki': 300_000,
      'task-tests': 500_000,
    });
  });

  test('returns null for the fixture backfill entry, the common path', () => {
    const backfill = costs.entries[2];

    expect(backfill.key).toBe('PLAN-004');
    expect(mergeScalarMaps(backfill.phases, 'byModel')).toBeNull();
    expect(mergeScalarMaps(backfill.phases, 'byAgentType')).toBeNull();
  });
});
