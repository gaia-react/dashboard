/**
 * Shared event validation for the live helper server.
 * Extracted for unit testing (insert mode rules).
 */

import {canCreateInsert} from './insert-ui.mjs';
// The accepted visual action values come from the canonical vocabulary so the
// validator, the picker UI, and the marketing demo never drift. Imported (not
// just re-exported) so it is also in scope for the validators below.
import {VISUAL_ACTIONS} from './vocabulary.mjs';

export {VISUAL_ACTIONS};

const ID_PATTERN = /^[0-9a-f]{8}$/;
const VARIANT_ID_PATTERN = /^[0-9]{1,3}$/;
const INSERT_POSITIONS = new Set(['after', 'before']);
const FORBIDDEN_MANUAL_EDIT_TEXT_CHARS = ['<', '{', '}', '`'];

const isValidId = (v) => typeof v === 'string' && ID_PATTERN.test(v);
const isValidVariantId = (v) =>
  typeof v === 'string' && VARIANT_ID_PATTERN.test(v);

const validateManualEditText = (newText) => {
  if (typeof newText !== 'string') return null;
  const hits = FORBIDDEN_MANUAL_EDIT_TEXT_CHARS.filter((char) =>
    newText.includes(char)
  );

  return hits.length > 0 ? hits : null;
};

const validateAnnotationFields = (message) => {
  if (
    message.screenshotPath !== undefined &&
    typeof message.screenshotPath !== 'string'
  ) {
    return 'generate: screenshotPath must be string';
  }

  if (message.comments !== undefined && !Array.isArray(message.comments)) {
    return 'generate: comments must be array';
  }

  if (message.strokes !== undefined && !Array.isArray(message.strokes)) {
    return 'generate: strokes must be array';
  }

  return null;
};

const validateInsertGenerate = (message) => {
  if (!message.insert || typeof message.insert !== 'object')
    return 'generate: insert mode requires insert object';
  if (!INSERT_POSITIONS.has(message.insert.position))
    return 'generate: insert.position must be before or after';
  const {anchor} = message.insert;
  if (!anchor || typeof anchor !== 'object')
    return 'generate: insert.anchor required';

  if (
    !anchor.tagName &&
    !anchor.outerHTML &&
    !(Array.isArray(anchor.classes) && anchor.classes.length > 0)
  ) {
    return 'generate: insert.anchor needs tagName, classes, or outerHTML';
  }
  if (!message.placeholder || typeof message.placeholder !== 'object')
    return 'generate: insert mode requires placeholder dimensions';

  if (
    !Number.isFinite(message.placeholder.width) ||
    !Number.isFinite(message.placeholder.height)
  ) {
    return 'generate: placeholder width and height must be numbers';
  }

  if (
    !canCreateInsert({
      comments: message.comments,
      prompt: message.freeformPrompt,
      strokes: message.strokes,
    })
  ) {
    return 'generate: insert requires freeformPrompt or annotations';
  }

  return validateAnnotationFields(message);
};

const validateReplaceGenerate = (message) => {
  if (!message.action || !VISUAL_ACTIONS.includes(message.action))
    return 'generate: invalid action';
  if (!message.element || !message.element.outerHTML)
    return 'generate: missing element context';

  return validateAnnotationFields(message);
};

const validateManualEditEvent = (message, label) => {
  if (!isValidId(message.id)) return `${label}: missing or malformed id`;
  if (!message.pageUrl || typeof message.pageUrl !== 'string')
    return `${label}: missing pageUrl`;
  if (!message.element || typeof message.element !== 'object')
    return `${label}: missing element`;
  if (!Array.isArray(message.ops) || message.ops.length === 0)
    return `${label}: ops must be non-empty array`;
  if (message.ops.length > 100) return `${label}: too many ops (max 100)`;

  for (const op of message.ops) {
    if (typeof op.ref !== 'string') return `${label}: op.ref required`;
    if (typeof op.tag !== 'string') return `${label}: op.tag required`;
    if (typeof op.originalText !== 'string')
      return `${label}: op.originalText required`;

    if (op.deleted !== true && typeof op.newText !== 'string') {
      return `${label}: text op requires newText`;
    }

    if (typeof op.newText === 'string') {
      if (op.deleted !== true && op.newText.trim().length === 0) {
        return `${label}: newText cannot be empty`;
      }
      const forbidden = validateManualEditText(op.newText);

      if (forbidden) {
        return `${label}: newText cannot contain ${forbidden.join(
          ' '
        )} (plain text only; ask the AI to insert markup)`;
      }
    }
  }

  return null;
};

export const validateEvent = (message) => {
  if (!message || typeof message !== 'object' || !message.type)
    return 'Missing or invalid message';

  switch (message.type) {
    case 'accept': {
      if (!isValidId(message.id)) return 'accept: missing or malformed id';
      if (!isValidVariantId(message.variantId))
        return 'accept: missing or malformed variantId';

      if (
        message.paramValues !== undefined &&
        (typeof message.paramValues !== 'object' ||
          message.paramValues === null ||
          Array.isArray(message.paramValues))
      ) {
        return 'accept: paramValues must be an object';
      }

      return null;
    }

    case 'checkpoint': {
      if (!isValidId(message.id)) return 'checkpoint: missing or malformed id';
      if (!Number.isInteger(message.revision) || message.revision < 0)
        return 'checkpoint: revision must be a non-negative integer';

      if (
        message.paramValues !== undefined &&
        (typeof message.paramValues !== 'object' ||
          message.paramValues === null ||
          Array.isArray(message.paramValues))
      ) {
        return 'checkpoint: paramValues must be an object';
      }

      return null;
    }

    case 'discard': {
      return isValidId(message.id) ? null : 'discard: missing or malformed id';
    }

    case 'exit': {
      return null;
    }

    case 'generate': {
      if (!isValidId(message.id)) return 'generate: missing or malformed id';
      if (
        !Number.isInteger(message.count) ||
        message.count < 1 ||
        message.count > 8
      )
        return 'generate: count must be 1-8';
      if (message.mode === 'insert') return validateInsertGenerate(message);

      return validateReplaceGenerate(message);
    }

    case 'manual_edits': {
      return validateManualEditEvent(message, 'manual_edits');
    }

    case 'prefetch': {
      if (!message.pageUrl || typeof message.pageUrl !== 'string')
        return 'prefetch: missing pageUrl';

      return null;
    }

    case 'steer': {
      if (!isValidId(message.id)) return 'steer: missing or malformed id';
      if (typeof message.message !== 'string' || !message.message.trim())
        return 'steer: message required';
      if (message.message.length > 4000) return 'steer: message too long';
      if (message.pageUrl !== undefined && typeof message.pageUrl !== 'string')
        return 'steer: pageUrl must be string';

      return null;
    }

    default: {
      return `Unknown event type: ${message.type}`;
    }
  }
};
