export function highlightWord(sentence: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped})`, 'gi')
  const clean = sentence.replace(/\*\*/g, '')
  const parts = clean.split(re)
  const result: Array<{ text: string; highlight: boolean }> = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    result.push({ text: part, highlight: i % 2 === 1 })
  }
  return result
}
