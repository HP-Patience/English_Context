function parseWordImport(raw) {
  if (typeof raw !== 'string') {
    throw new TypeError('Word import source must be a string')
  }

  const sections = []
  let currentSection = null
  const lines = raw.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const trimmedLine = rawLine.trim()
    if (!trimmedLine) continue

    if (trimmedLine.startsWith('#')) {
      const name = trimmedLine.slice(1).trim()
      if (!name) throw new Error(`Word import section on line ${index + 1} must have a name`)
      currentSection = { name, words: [] }
      sections.push(currentSection)
      continue
    }

    if (!currentSection) {
      throw new Error(`Word import row on line ${index + 1} appears before a section`)
    }

    const fields = rawLine.split('\t')
    if (fields.length > 2) {
      throw new Error(`Malformed word import row on line ${index + 1}: expected word or word<TAB>phonetic`)
    }

    const text = fields[0].trim()
    if (!text) throw new Error(`Malformed word import row on line ${index + 1}: word is empty`)
    const phonetic = fields.length === 2 && fields[1].trim() ? fields[1].trim() : null
    currentSection.words.push({ text, phonetic })
  }

  return sections
}

function collectUniqueWords(sections) {
  const wordsByText = new Map()

  for (const section of sections) {
    for (const word of section.words) {
      const existing = wordsByText.get(word.text)
      if (!existing) {
        wordsByText.set(word.text, { text: word.text, phonetic: word.phonetic })
        continue
      }

      if (existing.phonetic && word.phonetic && existing.phonetic !== word.phonetic) {
        throw new Error(`Conflicting phonetics for word "${word.text}"`)
      }
      if (!existing.phonetic && word.phonetic) existing.phonetic = word.phonetic
    }
  }

  return [...wordsByText.values()]
}

module.exports = { collectUniqueWords, parseWordImport }
