/**
 * Shared helpers for the pending-manual-edits buffer on disk.
 *
 * Location: .impeccable/live/pending-manual-edits.json (project-local).
 * Schema:   { version: 1, entries: [{ id, pageUrl, element, ops, stagedAt }] }
 *
 * Each entry corresponds to one Save action from the browser. Ops merge by
 * (pageUrl, ref): if the user re-edits the same element before committing, the
 * existing entry's `newText` is replaced and `originalText` is kept (it holds
 * the real source state).
 */

import fs from 'node:fs';
import path from 'node:path';
import {getLiveDir} from '../lib/impeccable-paths.mjs';

const BUFFER_VERSION = 1;
const BUFFER_FILENAME = 'pending-manual-edits.json';

/**
 * Count by page for the counter UI. Returns { totalCount, perPage: {[pageUrl]: count} }.
 */
export const countByPage = (cwd = process.cwd()) => {
  const buf = readBuffer(cwd);
  const perPage = {};
  let totalCount = 0;

  for (const entry of buf.entries) {
    const n = entry.ops.length;
    perPage[entry.pageUrl] = (perPage[entry.pageUrl] || 0) + n;
    totalCount += n;
  }

  return {perPage, totalCount};
};

export const getBufferPath = (cwd = process.cwd()) =>
  path.join(getLiveDir(cwd), BUFFER_FILENAME);

export const readBuffer = (cwd = process.cwd()) =>
  readBufferInternal(cwd, {strict: false});

export const readBufferStrict = (cwd = process.cwd()) =>
  readBufferInternal(cwd, {strict: true});

/**
 * Remove entries matching a predicate. Returns count of removed *ops* (not
 * entries) so callers report a unit consistent with truncateBuffer and the
 * pill's per-page op count. Empty entries (no ops left) are also pruned.
 */
export const removeEntries = (cwd, predicate) => {
  const buf = readBuffer(cwd);
  let removedOps = 0;
  const kept = [];

  for (const entry of buf.entries) {
    if (predicate(entry)) {
      removedOps += entry.ops?.length || 0;
    } else if (entry.ops && entry.ops.length > 0) {
      kept.push(entry);
    }
  }
  buf.entries = kept;
  writeBuffer(cwd, buf);

  return removedOps;
};

/**
 * Merge a new entry into the buffer. For each op in the new entry, if there's
 * already a buffered op for the same (pageUrl, ref), update that op's newText
 * and keep its original originalText (the true source state). Otherwise add
 * the op (creating an entry if needed).
 *
 * Multiple ops in one Save are allowed; each is keyed by (pageUrl, ref).
 */
export const stageEntry = (cwd, newEntry) => {
  const buf = readBufferStrict(cwd);
  const {pageUrl} = newEntry;

  for (const newOp of newEntry.ops) {
    let mergedIntoExisting = false;

    for (const existing of buf.entries) {
      if (existing.pageUrl !== pageUrl) continue;
      const existingOpIndex = existing.ops.findIndex(
        (op) => op.ref === newOp.ref
      );

      if (existingOpIndex !== -1) {
        // Keep the original source text but refresh the latest DOM/source evidence.
        existing.ops[existingOpIndex] = {
          ...newOp,
          deleted: newOp.deleted || false,
          newText: newOp.newText,
          originalText: existing.ops[existingOpIndex].originalText,
        };
        if (newEntry.element) existing.element = newEntry.element;
        existing.stagedAt = new Date().toISOString();
        mergedIntoExisting = true;
        break;
      }
    }
    if (mergedIntoExisting) continue;
    // No existing op for this (pageUrl, ref). Find or create an entry to hold it.
    let entry = buf.entries.find(
      (e) => e.pageUrl === pageUrl && e.id === newEntry.id
    );

    if (!entry) {
      entry = {
        element: newEntry.element,
        id: newEntry.id,
        ops: [],
        pageUrl,
        stagedAt: new Date().toISOString(),
      };
      buf.entries.push(entry);
    }
    entry.ops.push(newOp);
    entry.stagedAt = new Date().toISOString();
  }
  writeBuffer(cwd, buf);

  return buf;
};

/**
 * Truncate the buffer to empty (used by discard-all). Returns the count of
 * removed ops.
 */
export const truncateBuffer = (cwd) => {
  const buf = readBuffer(cwd);
  let removed = 0;
  for (const entry of buf.entries) removed += entry.ops.length;
  writeBuffer(cwd, {entries: [], version: BUFFER_VERSION});

  return removed;
};

export const writeBuffer = (cwd, buffer) => {
  const filePath = getBufferPath(cwd);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(
    filePath,
    JSON.stringify({entries: buffer.entries, version: BUFFER_VERSION}, null, 2)
  );
};

const readBufferInternal = (cwd, {strict}) => {
  const filePath = getBufferPath(cwd);

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.entries)
    ) {
      if (strict) throw new Error('manual_edit_buffer_invalid_schema');

      return {entries: [], version: BUFFER_VERSION};
    }

    return {entries: parsed.entries, version: BUFFER_VERSION};
  } catch (error) {
    if (strict && error?.code !== 'ENOENT') {
      throw new Error(
        `manual_edit_buffer_unreadable: ${error.message || String(error)}`
      );
    }

    return {entries: [], version: BUFFER_VERSION};
  }
};
