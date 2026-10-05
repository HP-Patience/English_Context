export const TTS_SETTINGS_CHANGED = 'contextvocab-tts-settings-changed'

export function voiceId(voice: SpeechSynthesisVoice): string {
  return JSON.stringify([voice.voiceURI || voice.name, voice.lang])
}

export function englishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter(voice => /^en(?:[-_]|$)/i.test(voice.lang))
}

export function selectBrowserVoice(voices: SpeechSynthesisVoice[], saved: string): SpeechSynthesisVoice | undefined {
  const english = englishVoices(voices)
  return english.find(voice => voiceId(voice) === saved)
    ?? english.find(voice => voice.default)
    ?? english[0]
}

export async function loadBrowserVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const available = synth.getVoices()
  if (available.length) return available
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer)
      synth.removeEventListener('voiceschanged', changed)
      resolve(synth.getVoices())
    }
    const changed = () => { if (synth.getVoices().length) finish() }
    const timer = setTimeout(finish, 1000)
    synth.addEventListener('voiceschanged', changed)
    changed()
  })
}
