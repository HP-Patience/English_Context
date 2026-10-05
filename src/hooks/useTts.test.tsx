/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTts } from './useTts'
import { voiceId, TTS_SETTINGS_CHANGED } from '@/lib/browser-tts'
const mark = { name: 'Mark', voiceURI: 'Mark', lang: 'en-US', default: true } as SpeechSynthesisVoice
const british = { name: 'British', voiceURI: 'British', lang: 'en-GB', default: false } as SpeechSynthesisVoice
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
function setup(voices = [mark, british]) {
  const synth = Object.assign(new EventTarget(), { getVoices: () => voices, speak: vi.fn(), cancel: vi.fn(), speaking: false })
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text } })
  return synth
}
describe('saved browser voice playback', () => {
  it('uses the saved voice and its language, including on HTTP', async () => {
    vi.useFakeTimers()
    const synth = setup()
    vi.stubGlobal('isSecureContext', false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ provider: 'browser', browserVoice: voiceId(british) }))))
    const { result } = renderHook(() => useTts('hello'))
    await act(async () => { await result.current.play() })
    expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello', voice: british, lang: 'en-GB' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  })
  it('reloads settings after saving and falls back when the saved voice is unavailable', async () => {
    vi.useFakeTimers()
    const synth = setup([mark])
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ provider: 'browser', browserVoice: voiceId(british) }))))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useTts('hello'))
    await act(async () => { await result.current.play() })
    expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: mark }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    act(() => { window.dispatchEvent(new Event(TTS_SETTINGS_CHANGED)) })
    await act(async () => { await result.current.play() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  })
})
