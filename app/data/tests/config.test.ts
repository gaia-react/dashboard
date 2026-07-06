import {describe, expect, test} from 'vitest';
import path from 'node:path';
import {resolveConfig} from '~/data/config';

const baseDirectory = '/repo/dashboard';
const home = '/home/dev';

describe('resolveConfig', () => {
  test('defaults the project to ../gaia relative to the repo root', () => {
    const config = resolveConfig({}, {baseDirectory, home});

    expect(config.projectRoot).toBe(path.resolve(baseDirectory, '../gaia'));
    expect(config.projectName).toBe('gaia');
  });

  test('defaults the claude config dir to ~/.claude', () => {
    const config = resolveConfig({}, {baseDirectory, home});

    expect(config.claudeConfigDir).toBe('/home/dev/.claude');
  });

  test('resolves a relative GAIA_DASHBOARD_PROJECT against the base dir', () => {
    const config = resolveConfig(
      {GAIA_DASHBOARD_PROJECT: '../some/project'},
      {baseDirectory, home}
    );

    expect(config.projectRoot).toBe(
      path.resolve(baseDirectory, '../some/project')
    );
    expect(config.projectName).toBe('project');
  });

  test('keeps an absolute GAIA_DASHBOARD_PROJECT verbatim', () => {
    const config = resolveConfig(
      {GAIA_DASHBOARD_PROJECT: '/abs/target-app'},
      {baseDirectory, home}
    );

    expect(config.projectRoot).toBe('/abs/target-app');
    expect(config.projectName).toBe('target-app');
  });

  test('honors an absolute CLAUDE_CONFIG_DIR override', () => {
    const config = resolveConfig(
      {CLAUDE_CONFIG_DIR: '/custom/claude-home'},
      {baseDirectory, home}
    );

    expect(config.claudeConfigDir).toBe('/custom/claude-home');
  });
});
