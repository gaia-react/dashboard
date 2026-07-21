import path from 'node:path';
import {resolveProjectRoot} from './context.mjs';
import {parseTargetPath} from './lib/target-args.mjs';

export const resolveLiveTarget = (cwd = process.cwd(), args = []) => {
  const originalCwd = path.resolve(cwd);
  let targetPath = null;

  try {
    targetPath = parseTargetPath(args, {strict: true});
  } catch (error) {
    if (error?.name === 'TargetArgError') {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }

    throw error;
  }
  const absoluteTargetPath =
    targetPath ?
      path.isAbsolute(targetPath) ?
        targetPath
      : path.resolve(originalCwd, targetPath)
    : null;
  const projectRoot =
    targetPath ?
      resolveProjectRoot(originalCwd, {targetPath: absoluteTargetPath})
    : originalCwd;

  return {
    absoluteTargetPath,
    originalCwd,
    projectRoot,
    targetOptions: absoluteTargetPath ? {targetPath: absoluteTargetPath} : {},
    targetPath,
  };
};
