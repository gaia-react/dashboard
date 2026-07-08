import {afterAll, describe, expect, test} from 'vitest';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {createFileCache} from '~/data/cache';
import {discoverProjectDirectories, encode} from '~/data/parse/discover';
import {streamJsonl} from '~/data/parse/jsonl-stream';
import {costRecordSchema} from '~/data/schemas/cost-record';
import {planLedgerSchema, specLedgerSchema} from '~/data/schemas/ledgers';
import {rateTableSchema} from '~/data/schemas/rate-table';
import {materializeFixtureProject} from '../fixture-project';

/**
 * Proves the composite fixtures are internally consistent and ready for the
 * W5/W6/W7 handler tests: after materialization, session-directory discovery,
 * `session_cwd` forward-encoding, and every `.gaia/**` file line up against
 * the P1 parsers and schemas.
 */

const readJson = (filePath: string): unknown =>
  JSON.parse(readFileSync(filePath, 'utf8'));

describe('mini-project composite fixture', () => {
  const project = materializeFixtureProject('mini-project');

  afterAll(() => {
    project.cleanup();
  });

  test('discovery confirms the root and worktree directories and rejects the sibling', async () => {
    const discovered = await discoverProjectDirectories(
      path.join(project.claudeConfigDir, 'projects'),
      project.projectRoot,
      createFileCache()
    );

    const names = discovered.map((directory) => path.basename(directory));

    expect(names).toEqual([
      encode(project.projectRoot),
      encode(`${project.projectRoot}/.claude/worktrees/spec-100-fixture`),
    ]);
  });

  test('cost.jsonl rows parse against the cost-record schema, one malformed line captured', async () => {
    const rows: unknown[] = [];
    const result = await streamJsonl(
      path.join(project.projectRoot, '.gaia/local/telemetry/cost.jsonl'),
      (record) => {
        rows.push(record);
      }
    );

    expect(result.errors).toHaveLength(1);
    expect(result.parsed).toBe(11);

    const parsed = rows.map((row) => costRecordSchema.parse(row));
    const kinds = new Set(parsed.map((row) => row.kind));

    expect(kinds).toEqual(new Set(['execute', 'plan', 'review', 'spec']));
  });

  test('session_cwd forward-encodes to the committed worktree directory', async () => {
    const sessionCwds: string[] = [];

    await streamJsonl(
      path.join(project.projectRoot, '.gaia/local/telemetry/cost.jsonl'),
      (record) => {
        const {session_cwd: sessionCwd} = costRecordSchema.parse(record);

        if (typeof sessionCwd === 'string') {
          sessionCwds.push(sessionCwd);
        }
      }
    );

    const projectsDirectory = path.join(project.claudeConfigDir, 'projects');

    for (const sessionCwd of sessionCwds) {
      expect(existsSync(path.join(projectsDirectory, encode(sessionCwd)))).toBe(
        true
      );
    }
  });

  test('ledgers and rate table parse against the P1 schemas', () => {
    const specs = specLedgerSchema.parse(
      readJson(path.join(project.projectRoot, '.gaia/local/specs/ledger.json'))
    );
    const plans = planLedgerSchema.parse(
      readJson(path.join(project.projectRoot, '.gaia/local/plans/ledger.json'))
    );
    const rates = rateTableSchema.parse(
      readJson(path.join(project.projectRoot, '.gaia/scripts/token-rates.json'))
    );

    expect(specs.specs.map((entry) => entry.id)).toEqual([
      'SPEC-100',
      'SPEC-102',
      'SPEC-103',
    ]);
    expect(plans.plans.map((entry) => entry.id)).toEqual(['PLAN-001']);
    expect(Object.keys(rates.models)).toEqual([
      'claude-opus-4-8',
      'claude-sonnet-4-6',
    ]);
  });
});

describe('empty-project composite fixture', () => {
  const project = materializeFixtureProject('empty-project');

  afterAll(() => {
    project.cleanup();
  });

  test('has sessions but no .gaia/local cost data', async () => {
    expect(existsSync(path.join(project.projectRoot, '.gaia/local'))).toBe(
      false
    );
    expect(
      existsSync(
        path.join(project.projectRoot, '.gaia/scripts/token-rates.json')
      )
    ).toBe(true);

    const discovered = await discoverProjectDirectories(
      path.join(project.claudeConfigDir, 'projects'),
      project.projectRoot,
      createFileCache()
    );

    expect(discovered).toEqual([
      path.join(
        project.claudeConfigDir,
        'projects',
        encode(project.projectRoot)
      ),
    ]);
  });
});
