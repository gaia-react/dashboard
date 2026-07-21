import fs from 'node:fs';
import path from 'node:path';
import {resolveProjectRoot} from '../context.mjs';

export const IMPECCABLE_DIR = '.impeccable';

export const LIVE_DIR = 'live';

export const CRITIQUE_DIR = 'critique';

export const getCritiqueDir = (cwd = process.cwd(), options = {}) =>
  path.join(getImpeccableDir(cwd, options), CRITIQUE_DIR);

export const getDesignSidecarCandidates = (
  cwd = process.cwd(),
  contextDir = cwd,
  options = {}
) => {
  const projectRoot = resolveProjectRoot(cwd, options);
  const candidates = [
    getDesignSidecarPath(cwd, options),
    path.join(projectRoot, 'DESIGN.json'),
  ];
  const contextLegacy = path.join(contextDir, 'DESIGN.json');
  if (!candidates.includes(contextLegacy)) candidates.push(contextLegacy);

  return candidates;
};

export const getDesignSidecarPath = (cwd = process.cwd(), options = {}) =>
  path.join(getImpeccableDir(cwd, options), 'design.json');

export const getImpeccableDir = (cwd = process.cwd(), options = {}) =>
  path.join(resolveProjectRoot(cwd, options), IMPECCABLE_DIR);

export const getLegacyLiveAnnotationsDir = (
  cwd = process.cwd(),
  options = {}
) =>
  path.join(
    resolveProjectRoot(cwd, options),
    '.impeccable-live',
    'annotations'
  );

export const getLegacyLiveConfigPath = (scriptsDir) =>
  path.join(scriptsDir, 'config.json');

export const getLegacyLiveServerPath = (cwd = process.cwd(), options = {}) =>
  path.join(resolveProjectRoot(cwd, options), '.impeccable-live.json');

export const getLegacyLiveSessionsDir = (cwd = process.cwd(), options = {}) =>
  path.join(resolveProjectRoot(cwd, options), '.impeccable-live', 'sessions');

export const getLiveAnnotationsDir = (cwd = process.cwd(), options = {}) =>
  path.join(getLiveDir(cwd, options), 'annotations');

export const getLiveConfigPath = (cwd = process.cwd(), options = {}) =>
  path.join(getLiveDir(cwd, options), 'config.json');

export const getLiveDir = (cwd = process.cwd(), options = {}) =>
  path.join(getImpeccableDir(cwd, options), LIVE_DIR);

export const getLiveServerPath = (cwd = process.cwd(), options = {}) =>
  path.join(getLiveDir(cwd, options), 'server.json');

export const getLiveSessionsDir = (cwd = process.cwd(), options = {}) =>
  path.join(getLiveDir(cwd, options), 'sessions');

export const isLiveServerPidReachable = (pid) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    // ESRCH means "no such process". EPERM means the process exists but this
    // user cannot signal it, so the live server info is still valid.
    return error?.code !== 'ESRCH';
  }
};

export const readLiveServerInfo = (cwd = process.cwd(), options = {}) => {
  for (const filePath of [
    getLiveServerPath(cwd, options),
    getLegacyLiveServerPath(cwd, options),
  ]) {
    try {
      const info = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      if (
        info &&
        typeof info.pid === 'number' &&
        !isLiveServerPidReachable(info.pid)
      ) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
        continue;
      }

      return {info, path: filePath};
    } catch {
      /* try next */
    }
  }

  return null;
};

export const removeLiveServerInfo = (cwd = process.cwd(), options = {}) => {
  for (const filePath of [
    getLiveServerPath(cwd, options),
    getLegacyLiveServerPath(cwd, options),
  ]) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
};

export const resolveDesignSidecarPath = (
  cwd = process.cwd(),
  contextDir = cwd,
  options = {}
) => firstExisting(getDesignSidecarCandidates(cwd, contextDir, options));

export const resolveLiveConfigPath = ({
  cwd = process.cwd(),
  env = process.env,
  scriptsDir,
  targetPath,
} = {}) => {
  if (env.IMPECCABLE_LIVE_CONFIG && env.IMPECCABLE_LIVE_CONFIG.trim()) {
    const configured = env.IMPECCABLE_LIVE_CONFIG.trim();

    return path.isAbsolute(configured) ? configured : (
        path.resolve(cwd, configured)
      );
  }
  const primary = getLiveConfigPath(cwd, {targetPath});
  if (fs.existsSync(primary)) return primary;

  if (scriptsDir) {
    const legacy = getLegacyLiveConfigPath(scriptsDir);
    if (fs.existsSync(legacy)) return legacy;
  }

  return primary;
};

export const writeLiveServerInfo = (
  cwd = process.cwd(),
  info,
  options = {}
) => {
  const filePath = getLiveServerPath(cwd, options);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, JSON.stringify(info));

  return filePath;
};

const firstExisting = (paths) =>
  paths.find((filePath) => fs.existsSync(filePath)) || null;
