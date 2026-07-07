import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';

/** A line that could not be JSON-parsed, captured for the parse-health report. */
export type LineError = {
  /** 1-based line number within the file. */
  lineNumber: number;
  /** JSON.parse failure message. */
  message: string;
  /** The offending line, truncated so a giant blob cannot balloon the report. */
  raw: string;
};

export type StreamResult = {
  /** Lines that failed to parse; the stream continues past each. */
  errors: LineError[];
  /** Non-blank lines encountered (parsed + errors.length). */
  linesRead: number;
  /** Lines that JSON-parsed successfully and were handed to the callback. */
  parsed: number;
};

type ParseOutcome = {message: string; ok: false} | {ok: true; value: unknown};

const RAW_CAP = 200;

const tryParseJson = (line: string): ParseOutcome => {
  try {
    return {ok: true, value: JSON.parse(line)};
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
};

/**
 * Read a JSONL file line by line, JSON-parsing each non-blank line and handing
 * the raw value to `onRecord`. A malformed line is recorded in `errors` and
 * skipped; the stream never throws on bad content, so one broken line cannot
 * abort a scan (SPEC section 3: degrade and surface, do not crash).
 *
 * Streaming (not readFile) keeps memory flat over the ~660 MB of session logs
 * in the reference project (SPEC section 4.5).
 */
export const streamJsonl = async (
  path: string,
  onRecord: (record: unknown, lineNumber: number) => void
): Promise<StreamResult> => {
  const errors: LineError[] = [];
  let linesRead = 0;
  let parsed = 0;
  let lineNumber = 0;

  const rl = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(path, {encoding: 'utf8'}),
  });

  for await (const line of rl) {
    lineNumber += 1;
    const trimmed = line.trim();

    if (trimmed !== '') {
      linesRead += 1;
      const outcome = tryParseJson(trimmed);

      if (outcome.ok) {
        parsed += 1;
        onRecord(outcome.value, lineNumber);
      } else {
        errors.push({
          lineNumber,
          message: outcome.message,
          raw: trimmed.slice(0, RAW_CAP),
        });
      }
    }
  }

  return {errors, linesRead, parsed};
};
