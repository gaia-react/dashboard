import {z} from 'zod';

/**
 * Session-log line schemas (SPEC section 4.4). The scan reads only three line
 * types (`assistant`, `ai-title`, `last-prompt`) and skips everything else.
 * All objects are loose: session logs evolve additively across Claude Code
 * versions, so unknown fields pass through and unknown line types are simply
 * never parsed with these schemas. Field names mirror the wire format
 * (snake_case where the log uses it), mapped to camelCase downstream.
 */

const cacheCreationSchema = z.looseObject({
  ephemeral_1h_input_tokens: z.number().optional(),
  ephemeral_5m_input_tokens: z.number().optional(),
});

export const usageSchema = z.looseObject({
  cache_creation: cacheCreationSchema.optional(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
});

export const assistantLineSchema = z.looseObject({
  cwd: z.string().optional(),
  gitBranch: z.string().nullable().optional(),
  isSidechain: z.boolean().optional(),
  message: z.looseObject({
    id: z.string().optional(),
    model: z.string().optional(),
    usage: usageSchema.optional(),
  }),
  sessionId: z.string().optional(),
  timestamp: z.string().optional(),
  type: z.literal('assistant'),
});

export const aiTitleLineSchema = z.looseObject({
  aiTitle: z.string(),
  type: z.literal('ai-title'),
});

export const lastPromptLineSchema = z.looseObject({
  lastPrompt: z.string(),
  type: z.literal('last-prompt'),
});

export type AiTitleLine = z.infer<typeof aiTitleLineSchema>;

export type AssistantLine = z.infer<typeof assistantLineSchema>;

export type AssistantUsage = z.infer<typeof usageSchema>;

export type LastPromptLine = z.infer<typeof lastPromptLineSchema>;
