'use client'

import { useState, useEffect } from 'react'
import { englishVoices, loadBrowserVoices, selectBrowserVoice, voiceId, TTS_SETTINGS_CHANGED } from '@/lib/browser-tts'

export default function ApiConfigPage() {
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold text-stone-900 dark:text-stone-100">API 配置</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">配置大模型和发音服务的 API。</p>
      </div>
      <LlmConfigPanel />
      <TtsConfigPanel />
    </div>
  )
}

function LlmConfigPanel() {
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [changed, setChanged] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; reply?: string; error?: string } | null>(null)

  useEffect(() => {
    fetch('/api/settings/llm')
      .then(r => r.json())
      .then(data => {
        setBaseURL(data.baseURL || '')
        setModel(data.model || '')
        setHasKey(data.hasKey)
      })
      .catch(() => {})
  }, [])

  function markChanged() { if (!changed) setChanged(true) }

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, string> = { baseURL, model }
      if (apiKey) body.apiKey = apiKey
      const res = await fetch('/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSaved(true)
        setChanged(false)
        if (apiKey) setHasKey(true)
        setApiKey('')
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function fetchModels() {
    setFetchingModels(true)
    setModelsError('')
    setModels([])
    try {
      const res = await fetch('/api/models')
      const data = await res.json()
      if (data.error) {
        setModelsError(data.error)
      } else if (data.models?.length) {
        setModels(data.models)
        setShowModelPicker(true)
      } else {
        setModelsError('未获取到模型列表')
      }
    } catch {
      setModelsError('请求失败')
    } finally {
      setFetchingModels(false)
    }
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/llm/test', { method: 'POST' })
      const data = await res.json()
      setTestResult(data)
    } catch {
      setTestResult({ ok: false, error: '请求失败' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <h2 className="mb-1 text-sm font-semibold text-stone-700 dark:text-stone-300">大模型</h2>
      <p className="mb-4 text-xs text-stone-400 dark:text-stone-500">用于生成例句和学习内容。留空则使用环境变量默认值。</p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">API Base URL</label>
          <input
            type="text"
            value={baseURL}
            onChange={e => { setBaseURL(e.target.value); markChanged() }}
            placeholder="https://api.openai.com/v1"
            className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); markChanged() }}
            placeholder={hasKey ? '•••••••• (已设置，留空不变)' : '输入 API Key'}
            className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">模型名称</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={model}
              onChange={e => { setModel(e.target.value); markChanged() }}
              placeholder="gpt-4o-mini"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
            />
            <button
              onClick={fetchModels}
              disabled={fetchingModels}
              className="shrink-0 rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800"
            >
              {fetchingModels ? '获取中...' : '获取列表'}
            </button>
          </div>
          {modelsError && <p className="mt-1 text-xs text-red-500">{modelsError}</p>}
          {showModelPicker && models.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
              {models.map(m => (
                <button
                  key={m}
                  onClick={() => { setModel(m); markChanged(); setShowModelPicker(false) }}
                  className={`block w-full px-4 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-700 ${
                    m === model ? 'bg-stone-100 font-medium text-stone-900 dark:bg-stone-700 dark:text-stone-100' : 'text-stone-600 dark:text-stone-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          {saving ? '保存中...' : saved ? '✓ 已保存' : '保存设置'}
        </button>

        {changed && !saved && (
          <p className="text-center text-xs text-amber-600">有未保存的修改</p>
        )}

        <hr className="border-stone-200 dark:border-stone-700" />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">测试连接</h3>
          <button
            onClick={testConnection}
            disabled={testing}
            className="w-full rounded-lg border border-stone-300 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult && (
            <div className={`rounded-lg border p-3 text-sm ${
              testResult.ok
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {testResult.ok
                ? `✓ 连接成功 — ${testResult.reply || '主人我在'}`
                : `✗ ${testResult.error || '连接失败'}`}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function TtsConfigPanel() {
  const [provider, setProvider] = useState('browser')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [voice, setVoice] = useState('')
  const [browserVoice, setBrowserVoice] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [speechSupported, setSpeechSupported] = useState(true)
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [changed, setChanged] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testWord, setTestWord] = useState('pronunciation')

  useEffect(() => {
    fetch('/api/settings/tts')
      .then(r => r.json())
      .then(data => {
        setProvider(data.provider || 'browser')
        setBaseURL(data.baseURL || '')
        setVoice(data.voice || '')
        setBrowserVoice(data.browserVoice || '')
        setHasKey(data.hasKey)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const synth = window.speechSynthesis
    let active = true
    const update = () => {
      if (!active) return
      setSpeechSupported(!!synth)
      setVoices(synth ? englishVoices(synth.getVoices()) : [])
    }
    queueMicrotask(update)
    synth?.addEventListener('voiceschanged', update)
    return () => {
      active = false
      synth?.removeEventListener('voiceschanged', update)
    }
  }, [])

  function markChanged() { if (!changed) setChanged(true) }

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, string> = { provider, baseURL, voice, browserVoice }
      if (apiKey) body.apiKey = apiKey
      const res = await fetch('/api/settings/tts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        window.dispatchEvent(new Event(TTS_SETTINGS_CHANGED))
        setSaved(true)
        setChanged(false)
        setHasKey(!!apiKey || hasKey)
        setApiKey('')
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      if (provider === 'browser') {
        const synth = window.speechSynthesis
        if (!synth || !testWord.trim()) return
        synth.cancel()
        const selected = selectBrowserVoice(await loadBrowserVoices(synth), browserVoice)
        const u = new SpeechSynthesisUtterance(testWord)
        u.lang = selected?.lang || 'en-US'
        u.rate = 0.9
        if (selected) u.voice = selected
        synth.speak(u)
      } else if (hasKey || apiKey) {
        const body: Record<string, string> = { provider, baseURL, voice, browserVoice }
        if (apiKey) body.apiKey = apiKey
        const savedResponse = await fetch('/api/settings/tts', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        if (!savedResponse.ok) return
        window.dispatchEvent(new Event(TTS_SETTINGS_CHANGED))
        setHasKey(!!apiKey || hasKey)
        setApiKey('')
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: testWord, voice: voice || undefined }),
        })
        if (res.ok) {
          const blob = await res.blob()
          const audio = new Audio(URL.createObjectURL(blob))
          audio.play()
        }
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <h2 className="mb-1 text-sm font-semibold text-stone-700 dark:text-stone-300">发音 (TTS)</h2>
      <p className="mb-4 text-xs text-stone-400 dark:text-stone-500">选择浏览器 TTS 可离线使用，配置 API 可获得更自然的语音。</p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">TTS 服务</label>
          <select
            value={provider}
            onChange={e => { setProvider(e.target.value); markChanged() }}
            className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
          >
            <option value="browser">浏览器 TTS (Web Speech)</option>
            <option value="openai">OpenAI TTS</option>
            <option value="custom">自定义 API (OpenAI 兼容)</option>
          </select>
        </div>

        {provider === 'browser' && (
          <div>
            <label htmlFor="browser-tts-voice" className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">英文音色</label>
            <select
              id="browser-tts-voice"
              value={browserVoice}
              disabled={!speechSupported}
              onChange={e => { setBrowserVoice(e.target.value); markChanged() }}
              className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
            >
              <option value="">自动选择英文音色</option>
              {browserVoice && !voices.some(v => voiceId(v) === browserVoice) && <option value={browserVoice}>已保存音色（此设备不可用，自动回退）</option>}
              {voices.map(v => <option key={voiceId(v)} value={voiceId(v)}>{v.name} · {v.lang}</option>)}
            </select>
            {!speechSupported ? <p className="mt-2 text-xs text-stone-500">当前浏览器不支持系统朗读，请使用 API 发音服务。</p> : voices.length === 0 ? <p className="mt-2 text-xs text-stone-500">暂未检测到英文音色；朗读时将尝试使用系统默认声音。</p> : null}
          </div>
        )}

        {provider !== 'browser' && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">API Base URL</label>
              <input
                type="text"
                value={baseURL}
                onChange={e => { setBaseURL(e.target.value); markChanged() }}
                placeholder={provider === 'openai' ? 'https://api.openai.com/v1' : '输入 API 地址'}
                className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); markChanged() }}
                placeholder={hasKey ? '•••••••• (已设置, 留空不变)' : '输入 API Key'}
                className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">语音 (Voice)</label>
              <input
                type="text"
                value={voice}
                onChange={e => { setVoice(e.target.value); markChanged() }}
                placeholder="alloy (OpenAI: alloy/echo/fable/onyx/nova/shimmer)"
                className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              />
            </div>
          </>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          {saving ? '保存中...' : saved ? '✓ 已保存' : '保存设置'}
        </button>

        {changed && !saved && (
          <p className="text-center text-xs text-amber-600">有未保存的修改</p>
        )}

        <hr className="border-stone-200 dark:border-stone-700" />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">测试发音</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={testWord}
              onChange={e => setTestWord(e.target.value)}
              className="flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
            />
            <button
              onClick={handleTest}
              disabled={testing || !testWord.trim() || (provider === 'browser' && !speechSupported)}
              className="shrink-0 rounded-lg border border-stone-300 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800"
            >
              {testing ? '...' : '试听'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
