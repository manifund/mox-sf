import Anthropic from '@anthropic-ai/sdk'
import { env } from './env'

/**
 * Small Claude API helper for the site's LLM-powered automations (role
 * extraction, job matching, event suggestions). All features using this must
 * degrade gracefully when ANTHROPIC_API_KEY is unset — check
 * isClaudeConfigured() first.
 */

export const CLAUDE_MODEL = 'claude-opus-4-8'

export function isClaudeConfigured(): boolean {
  return !!env.ANTHROPIC_API_KEY
}

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return client
}

/**
 * Run a prompt and get back schema-validated JSON via structured outputs.
 * Returns null on refusal or truncation (callers should treat null as
 * "no result", not retry).
 */
export async function extractJson<T>(options: {
  system?: string
  prompt: string
  /** JSON schema for the response (objects need additionalProperties: false). */
  schema: Record<string, unknown>
  maxTokens?: number
}): Promise<T | null> {
  const response = await getClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: options.maxTokens ?? 16000,
    thinking: { type: 'adaptive' },
    ...(options.system ? { system: options.system } : {}),
    output_config: {
      format: {
        type: 'json_schema',
        schema: options.schema,
      },
    },
    messages: [{ role: 'user', content: options.prompt }],
  })

  if (response.stop_reason === 'refusal') {
    console.error('[Claude] Request refused', response.stop_details)
    return null
  }
  if (response.stop_reason === 'max_tokens') {
    console.error('[Claude] Response truncated at max_tokens')
    return null
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (!text) {
    console.error('[Claude] Empty response')
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.error('[Claude] Failed to parse JSON response:', error)
    return null
  }
}
