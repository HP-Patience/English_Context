export function highlightWord(sentence: string, word: string) {
  const markerRe = /\*\*(.+?)\*\*/
  if (markerRe.test(sentence)) {
    const parts = sentence.split(/(\*\*.+?\*\*)/)
    const result: Array<{ text: string; highlight: boolean }> = []
    for (const part of parts) {
      if (!part) continue
      if (part.startsWith('**') && part.endsWith('**')) {
        result.push({ text: part.slice(2, -2), highlight: true })
      } else {
        result.push({ text: part, highlight: false })
      }
    }
    return result
  }

  // Fallback: \bword\w*\b for data without ** markers
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\w*\\b`, 'gi')
  const parts = sentence.split(re)
  const matches = Array.from(sentence.matchAll(re))
  const result: Array<{ text: string; highlight: boolean }> = []
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) result.push({ text: parts[i], highlight: false })
    if (matches[i]) result.push({ text: matches[i][0], highlight: true })
  }
  return result
}
