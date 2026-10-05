/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApiConfigPage from './page'
import { voiceId } from '@/lib/browser-tts'
const david = { name: 'David', voiceURI: 'David', lang: 'en-US', default: true } as SpeechSynthesisVoice
const mark = { name: 'Mark', voiceURI: 'Mark', lang: 'en-US', default: false } as SpeechSynthesisVoice
const chinese = { name: 'Huihui', voiceURI: 'Huihui', lang: 'zh-CN' } as SpeechSynthesisVoice
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function setup(saved = '') {
  let voices = [david, chinese]
  const synth = Object.assign(new EventTarget(), { getVoices: () => voices, cancel: vi.fn(), speak: vi.fn() })
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text } })
  const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => Promise.resolve(new Response(JSON.stringify(options?.method === 'PUT' ? { ok: true } : url === '/api/settings/tts' ? { provider: 'browser', browserVoice: saved, voice: 'alloy', hasKey: false } : {}))))
  vi.stubGlobal('fetch', fetchMock)
  return { synth, fetchMock, setVoices: (next: SpeechSynthesisVoice[]) => { voices = next } }
}
describe('browser voice settings UI', () => {
  it('lists English voices, previews the unsaved selection without writes, then saves it separately', async () => {
    const { synth, fetchMock } = setup()
    render(<ApiConfigPage />)
    const select = await screen.findByLabelText('英文音色')
    await screen.findByRole('option', { name: 'David · en-US' })
    expect(screen.queryByRole('option', { name: /Huihui/ })).not.toBeInTheDocument()
    fireEvent.change(select, { target: { value: voiceId(david) } })
    fireEvent.click(screen.getByRole('button', { name: '试听' }))
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: david })))
    expect(fetchMock.mock.calls.some(call => call[1]?.method === 'PUT')).toBe(false)
    const panel = screen.getByRole('heading', { name: '发音 (TTS)' }).closest('section')!
    fireEvent.click(within(panel).getByRole('button', { name: '保存设置' }))
    await within(panel).findByRole('button', { name: '✓ 已保存' })
    const body = JSON.parse(fetchMock.mock.calls.find(call => call[1]?.method === 'PUT')![1].body)
    expect(body).toMatchObject({ browserVoice: voiceId(david), voice: 'alloy', provider: 'browser' })
  })
  it('keeps API and browser voices separate when switching services', async () => {
    setup(voiceId(david))
    render(<ApiConfigPage />)
    await screen.findByRole('option', { name: 'David · en-US' })
    const service = screen.getByRole('option', { name: '浏览器 TTS (Web Speech)' }).parentElement!
    fireEvent.change(service, { target: { value: 'openai' } })
    expect(screen.queryByLabelText('英文音色')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('alloy (OpenAI: alloy/echo/fable/onyx/nova/shimmer)')).toHaveValue('alloy')
    fireEvent.change(service, { target: { value: 'browser' } })
    expect(screen.getByLabelText('英文音色')).toHaveValue(voiceId(david))
  })
  it('retains an unavailable saved choice and updates voices asynchronously', async () => {
    const { synth, setVoices } = setup(voiceId(mark))
    render(<ApiConfigPage />)
    await screen.findByRole('option', { name: /已保存音色/ })
    expect(screen.getByLabelText('英文音色')).toHaveValue(voiceId(mark))
    setVoices([david, mark])
    act(() => { synth.dispatchEvent(new Event('voiceschanged')) })
    await screen.findByRole('option', { name: 'Mark · en-US' })
    expect(screen.queryByRole('option', { name: /已保存音色/ })).not.toBeInTheDocument()
  })
})
