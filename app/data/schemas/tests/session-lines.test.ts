import {describe, expect, test} from 'vitest';
import {
  aiTitleLineSchema,
  assistantLineSchema,
  lastPromptLineSchema,
} from '~/data/schemas/session-lines';

const assistantLine = {
  cwd: '/Users/you/projects/my-app',
  gitBranch: 'main',
  inference_geo: 'not_available',
  isSidechain: false,
  message: {
    id: 'msg_a',
    model: 'claude-opus-4-8',
    role: 'assistant',
    stop_reason: 'end_turn',
    type: 'message',
    usage: {
      cache_creation: {
        ephemeral_1h_input_tokens: 0,
        ephemeral_5m_input_tokens: 50,
      },
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 200,
      input_tokens: 100,
      output_tokens: 10,
      service_tier: 'standard',
    },
  },
  parentUuid: null,
  requestId: 'req_1',
  sessionId: '11111111-1111-4111-8111-111111111111',
  timestamp: '2026-06-24T10:05:00.000Z',
  type: 'assistant',
  uuid: 'u1',
  version: '2.1.0',
};

describe('assistantLineSchema', () => {
  test('parses a real-shaped line and passes unknown fields through', () => {
    const parsed = assistantLineSchema.parse(assistantLine);

    expect(parsed.message.usage?.input_tokens).toBe(100);
    expect(
      parsed.message.usage?.cache_creation?.ephemeral_5m_input_tokens
    ).toBe(50);
    // Loose: unknown fields survive parsing (additive-evolution rule).
    expect(parsed).toMatchObject({inference_geo: 'not_available'});
  });

  test('tolerates a message without usage and without cache_creation split', () => {
    const parsed = assistantLineSchema.parse({
      message: {id: 'msg_x', model: 'claude-opus-4-8'},
      type: 'assistant',
    });

    expect(parsed.message.usage).toBeUndefined();
  });

  test('rejects a non-assistant line type', () => {
    const outcome = assistantLineSchema.safeParse({
      message: {},
      type: 'user',
    });

    expect(outcome.success).toBe(false);
  });
});

describe('aiTitleLineSchema', () => {
  test('parses an ai-title line', () => {
    const parsed = aiTitleLineSchema.parse({
      aiTitle: 'Fix the widget pipeline',
      sessionId: '11111111-1111-4111-8111-111111111111',
      type: 'ai-title',
    });

    expect(parsed.aiTitle).toBe('Fix the widget pipeline');
  });
});

describe('lastPromptLineSchema', () => {
  test('parses a last-prompt line', () => {
    const parsed = lastPromptLineSchema.parse({
      lastPrompt: 'Please fix the widget pipeline so it builds',
      leafUuid: 'lf1',
      type: 'last-prompt',
    });

    expect(parsed.lastPrompt).toBe(
      'Please fix the widget pipeline so it builds'
    );
  });
});
