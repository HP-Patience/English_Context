import { describe, expect, it, vi } from 'vitest'
import { englishVoices, voiceId, selectBrowserVoice, loadBrowserVoices } from './browser-tts'
const voice = (name: string, lang: string, isDefault = false) => ({ name, lang, voiceURI: name, default: isDefault, localService: true } as SpeechSynthesisVoice)
const mark = voice('Mark', 'en-US')
const david = voice('David', 'en-US', true)
const chinese = voice('Huihui', 'zh-CN', true)
describe('browser voice selection', () => {
  it('lists only English voices and honors the saved choice', () => {
    expect(englishVoices([chinese, mark, david])).toEqual([mark, david])
    expect(selectBrowserVoice([chinese, mark, david], voiceId(mark))).toBe(mark)
  })
  it('falls back to an available English voice on another device', () => {
    expect(selectBrowserVoice([chinese, david], voiceId(mark))).toBe(david)
    expect(selectBrowserVoice([chinese, mark], '')).toBe(mark)
    expect(selectBrowserVoice([chinese], voiceId(mark))).toBeUndefined()
  })
  it('waits for asynchronous voices without replacing other listeners', async () => {
    const target = new EventTarget()
    const getVoices = vi.fn().mockReturnValueOnce([]).mockReturnValue([mark])
    const synth = Object.assign(target, { getVoices }) as unknown as SpeechSynthesis
    const listener = vi.fn()
    synth.addEventListener('voiceschanged', listener)
    const result = loadBrowserVoices(synth)
    target.dispatchEvent(new Event('voiceschanged'))
    expect(await result).toEqual([mark])
    expect(listener).toHaveBeenCalledOnce()
  })
  it('times out and removes its listener when no voices load', async () => {
    vi.useFakeTimers()
    try {
      const target = new EventTarget()
      const remove = vi.spyOn(target, 'removeEventListener')
      const synth = Object.assign(target, { getVoices: () => [] }) as unknown as SpeechSynthesis
      const result = loadBrowserVoices(synth)
      await vi.advanceTimersByTimeAsync(1000)
      expect(await result).toEqual([])
      expect(remove).toHaveBeenCalledWith('voiceschanged', expect.any(Function))
    } finally { vi.useRealTimers() }
  })
})
