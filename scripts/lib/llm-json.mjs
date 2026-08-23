const JSON_INSTRUCTIONS = 'Return only valid JSON. Do not include markdown fences, comments, or explanations.'

/**
 * Create an injectable JSON-only LLM adapter.
 *
 * The adapter never reads process.env by itself. Commands pass explicit config after
 * loading their own environment, while tests can inject a fake `client`.
 *
 * @param {{ apiKey?: string, baseURL?: string, model?: string, client?: unknown, retryAttempts?: number, retryDelayMs?: number }} options
 * @returns {{ generateJson(prompt: string, schemaName?: string): Promise<unknown> }}
 */
export function createLlmJsonClient({ apiKey, baseURL, model, client, transport = 'auto', retryAttempts = 5, retryDelayMs = 1000 } = {}) {
  if (!['auto', 'chat-completions', 'responses'].includes(transport)) {
    throw new Error('LLM transport must be auto, chat-completions, or responses')
  }
  const configuredModel = model
  let resolvedClient = client

  return {
    async generateJson(prompt, schemaName = 'json') {
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        throw new TypeError('generateJson requires a non-empty prompt')
      }

      const activeClient = resolvedClient ?? await createOpenAiClient({ apiKey, baseURL })
      resolvedClient = activeClient

      if (typeof activeClient.generateJson === 'function') {
        return retryTransientLlmCall(() => activeClient.generateJson(prompt, schemaName), schemaName, retryAttempts, retryDelayMs)
      }

      if (!configuredModel) {
        throw new Error('LLM model is required')
      }

      const canUseChat = typeof activeClient.chat?.completions?.create === 'function'
      const canUseResponses = typeof activeClient.responses?.create === 'function'

      if ((transport === 'auto' || transport === 'chat-completions') && canUseChat) {
        return retryTransientLlmCall(async () => {
          const response = await activeClient.chat.completions.create({
            model: configuredModel,
            messages: [
              { role: 'system', content: JSON_INSTRUCTIONS },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
          })
          return parseJsonLike(response.choices?.[0]?.message?.content, schemaName)
        }, schemaName, retryAttempts, retryDelayMs)
      }

      if ((transport === 'auto' || transport === 'responses') && canUseResponses) {
        return retryTransientLlmCall(async () => {
          const response = await activeClient.responses.create({
            model: configuredModel,
            input: [
              { role: 'system', content: JSON_INSTRUCTIONS },
              { role: 'user', content: prompt },
            ],
            text: { format: { type: 'json_object' } },
          })
          return parseJsonLike(extractResponseText(response), schemaName)
        }, schemaName, retryAttempts, retryDelayMs)
      }

      throw new Error(`LLM client does not expose the requested ${transport} transport`)
    },
  }
}

async function createOpenAiClient({ apiKey, baseURL }) {
  if (!apiKey) {
    throw new Error('LLM API key is required')
  }

  const { default: OpenAI } = await import('openai')
  return new OpenAI({ apiKey, baseURL })
}

async function retryTransientLlmCall(operation, schemaName, attempts = 5, delayBaseMs = 1000) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isTransientLlmError(error) || attempt === attempts) {
        throw error
      }
      const delayMs = Math.min(30000, delayBaseMs * attempt * attempt)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError ?? new Error(`${schemaName} generation failed`)
}

function isTransientLlmError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.code)
  if (Number.isInteger(status) && (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500)) {
    return true
  }

  const message = error?.message ?? String(error)
  return /(?:408|409|425|429|5\d\d|524).*status code|timeout|timed out|rate limit|temporar(?:y|ily)|service unavailable|gateway/i.test(message)
}

function extractResponseText(response) {
  if (typeof response?.output_text === 'string') {
    return response.output_text
  }

  const textParts = []
  for (const output of response?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (typeof content?.text === 'string') {
        textParts.push(content.text)
      }
    }
  }

  return textParts.join('\n')
}

function parseJsonLike(value, schemaName) {
  if (value !== null && typeof value === 'object') {
    return value
  }

  if (typeof value !== 'string') {
    throw new Error(`${schemaName} LLM response was not JSON text`)
  }

  const text = stripJsonFences(value.trim())
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${schemaName} LLM response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function stripJsonFences(text) {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : text
}
