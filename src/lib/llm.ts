import OpenAI from 'openai'
import { prisma, getLocalUserId } from './prisma'

interface LlmConfig {
  baseURL?: string
  apiKey?: string
  model?: string
}

async function getLlmConfig(): Promise<LlmConfig> {
  try {
    const userId = await getLocalUserId()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (user?.llmConfig) return JSON.parse(user.llmConfig)
  } catch { /* fallback to env */ }
  return {}
}

const TIMEOUT_MS = 15_000
const MAX_RETRIES = 1

async function callLLM(prompt: string): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const cfg = await getLlmConfig()
      const openai = new OpenAI({
        apiKey: cfg.apiKey || process.env.OPENAI_API_KEY,
        baseURL: cfg.baseURL || process.env.OPENAI_BASE_URL || undefined,
      })
      const res = await openai.chat.completions.create(
        {
          model: cfg.model || process.env.LLM_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          thinking: { type: 'disabled' },
          reasoning_effort: 'high',
          response_format: { type: 'json_object' },
          temperature: 0.8,
        } as any,
        { signal: controller.signal }
      )
      clearTimeout(timeout)
      return res.choices[0]?.message?.content ?? null
    } catch {
      clearTimeout(timeout)
      if (attempt < MAX_RETRIES) continue
      return null
    }
  }
  return null
}

export async function getWordData(word: string) {
  const prompt = `Return the word "${word}" with its REAL dictionary meanings as a JSON array.
Each entry: {"partOfSpeech": "noun|verb|adjective|etc", "definition": "English short definition", "definitionCn": "中文释义"}

Rules:
- Only include REAL meanings that exist in dictionaries. DO NOT make up meanings.
- The English definition and Chinese translation must be different languages, not the same text.
- "definition" MUST be English only. NEVER write Chinese in the definition field.
- "definitionCn" MUST be Chinese only.
- Max 4 most common meanings.
- If unsure about a meaning, omit it.

Example for "run":
[{"partOfSpeech": "verb", "definition": "move quickly on foot", "definitionCn": "跑"},
 {"partOfSpeech": "noun", "definition": "a jog or trip", "definitionCn": "跑步"}]

Return only JSON array, no extra text.`

  const raw = await callLLM(prompt)
  if (!raw) return [{ partOfSpeech: 'unknown', definition: word, definitionCn: word }]

  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    // Post-validate: reject entries where definition is Chinese (CJK characters)
    return data.filter((m: any) => !/[一-鿿]/.test(m.definition))
  } catch {
    return [{ partOfSpeech: 'unknown', definition: word, definitionCn: word }]
  }
}

interface SentenceResult {
  meaningId: string
  general: string
  interestTuned: string
  synonymSentence: string
}

function sentenceContainsWord(sentence: string, word: string): boolean {
  const clean = sentence.replace(/\*\*(.*?)\*\*/g, '$1')
  return clean.toLowerCase().includes(word.toLowerCase())
}

export async function generateSentences(
  word: string,
  meanings: Array<{ id: string; partOfSpeech: string; definition: string }>,
  interests: Array<{ topic: string; weight: number }>,
  userWordMeaningIds: string[]
): Promise<SentenceResult[]> {
  const topicList = interests.map((i) => i.topic).join(', ')
  const meaningsBlock = meanings
    .map((m, i) => `${i + 1}. [${m.partOfSpeech}] ${m.definition}`)
    .join('\n')

  const prompt = `Generate learning sentences for the word "${word}".

Meanings:
${meaningsBlock}

User interests: ${topicList || 'general'}

For EACH meaning, return JSON with:
- "index": number (1-based, matching the meanings above)
- "general": an English example sentence in general context (MUST contain the word "${word}" itself)
- "generalCn": 上面句子的中文翻译
- "interestTuned": an English sentence relevant to user's interests (MUST contain the word "${word}" itself)
- "interestTunedCn": 上面句子的中文翻译
- "synonym": a common synonym word
- "synonymSentence": an English sentence using the synonym
- "synonymSentenceCn": 上面句子的中文翻译

CRITICAL: The "general" and "interestTuned" sentences MUST literally include the word "${word}". If the sentence does not contain "${word}", it is wrong. Use the exact word "${word}", not a synonym or paraphrase.

Return a JSON object with key "sentences" containing an array. Only JSON.`

  const raw = await callLLM(prompt)
  const results: SentenceResult[] = []

  if (!raw) {
    return meanings.map((m, i) => ({
      meaningId: m.id,
      general: `"${word}" means: ${m.definition}`,
      interestTuned: `"${word}" in ${topicList || 'daily'} context.`,
      synonymSentence: '',
    }))
  }

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return meanings.map((m) => ({
      meaningId: m.id,
      general: `"${word}" means: ${m.definition}`,
      interestTuned: `"${word}" in ${topicList || 'daily'} context.`,
      synonymSentence: '',
    }))
  }

  const items = Array.isArray(parsed) ? parsed : parsed.sentences ?? []

  for (const item of items) {
    const idx = item.index - 1
    if (idx < 0 || idx >= meanings.length) continue
    const m = meanings[idx]
    const uwmId = userWordMeaningIds[idx]

    const general = (item.general && sentenceContainsWord(item.general, word))
      ? item.general
      : `"${word}" means: ${m.definition}`
    const interestTuned = (item.interestTuned && sentenceContainsWord(item.interestTuned, word))
      ? item.interestTuned
      : `"${word}" in ${topicList || 'daily'} context.`

    if (general && uwmId) {
      await prisma.generatedSentence.create({
        data: {
          userWordMeaningId: uwmId, meaningId: m.id,
          sentenceText: general, sentenceCn: item.generalCn ?? null,
          contextTopic: 'general', interestTuned: false, source: 'learning',
        },
      })
    }
    if (interestTuned && uwmId) {
      await prisma.generatedSentence.create({
        data: {
          userWordMeaningId: uwmId, meaningId: m.id,
          sentenceText: interestTuned, sentenceCn: item.interestTunedCn ?? null,
          contextTopic: 'interest_tuned', interestTuned: true, source: 'learning',
        },
      })
    }
    if (item.synonymSentence && item.synonym && uwmId) {
      await prisma.generatedSentence.create({
        data: {
          userWordMeaningId: uwmId, meaningId: m.id,
          sentenceText: `Synonym (${item.synonym}): ${item.synonymSentence}`,
          sentenceCn: item.synonymSentenceCn ? `同义词 (${item.synonym}): ${item.synonymSentenceCn}` : null,
          contextTopic: 'synonym_test', interestTuned: false, source: 'synonym_test',
        },
      })
    }

    results.push({
      meaningId: m.id,
      general: general ?? '',
      interestTuned: interestTuned ?? '',
      synonymSentence: item.synonymSentence ?? '',
    })
  }

  return results
}
