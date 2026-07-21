class TargetArgumentError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TargetArgError';
    this.code = code;
  }
}

export const parseTargetPath = (args = [], {strict = false} = {}) => {
  let targetPath = null;

  for (let index = 0; index < args.length; index++) {
    const argument = String(args[index]);

    if (argument === '--target' || argument === '-t') {
      const next = args[index + 1];

      if (next && !String(next).startsWith('-')) {
        targetPath = String(next);
        index++;
        continue;
      }

      if (strict) {
        throw new TargetArgumentError(
          '--target requires a path value.',
          'TARGET_VALUE_MISSING'
        );
      }
      continue;
    }

    if (argument.startsWith('--target=')) {
      const value = argument.slice('--target='.length);

      if (value) {
        targetPath = value;
        continue;
      }

      if (strict) {
        throw new TargetArgumentError(
          '--target requires a path value.',
          'TARGET_VALUE_MISSING'
        );
      }
    }
  }

  return targetPath;
};

export const parseTargetOptions = (args = [], options = {}) => {
  const targetPath = parseTargetPath(args, options);

  return targetPath ? {targetPath} : {};
};
