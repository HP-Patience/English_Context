'use client'

import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [tab, setTab] = useState<'llm' | 'interests' | 'goal'>('llm')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [changed, setChanged] = useState(false)

  // model list
  const [models, setModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)

  // test connection
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; reply?: string; error?: string } | null>(null)
  const [dailyTarget, setDailyTarget] = useState(30)
  const [savingGoal, setSavingGoal] = useState(false)
  const [goalSaved, setGoalSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings/llm')
      .then((r) => r.json())
      .then((data) => {
        setBaseURL(data.baseURL || '')
        setModel(data.model || '')
        setHasKey(data.hasKey)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/daily-goal')
      .then((r) => r.json())
      .then((data) => {
        if (data.target) setDailyTarget(data.target)
      })
      .catch(() => {})
  }, [])

  function markChanged() {
    if (!changed) setChanged(true)
  }

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
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">设置</h1>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-stone-100 p-1">
        <button
          onClick={() => setTab('llm')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            tab === 'llm' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          模型配置
        </button>
        <button
          onClick={() => setTab('interests')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            tab === 'interests' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          兴趣领域
        </button>
        <button
          onClick={() => setTab('goal')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            tab === 'goal' ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-100' : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
          }`}
        >
          每日目标
        </button>
      </div>

      {tab === 'llm' ? (
        <div className="space-y-5">
          <p className="text-sm text-stone-500">
            配置大模型 API，用于生成例句和学习内容。留空则使用环境变量默认值。
          </p>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              API Base URL
            </label>
            <input
              type="text"
              value={baseURL}
              onChange={(e) => { setBaseURL(e.target.value); markChanged() }}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); markChanged() }}
              placeholder={hasKey ? '•••••••• (已设置，留空不变)' : '输入 API Key'}
              className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              模型名称
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={model}
                onChange={(e) => { setModel(e.target.value); markChanged() }}
                placeholder="gpt-4o-mini"
                className="flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none"
              />
              <button
                onClick={fetchModels}
                disabled={fetchingModels}
                className="shrink-0 rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50"
              >
                {fetchingModels ? '获取中...' : '获取列表'}
              </button>
            </div>
            {modelsError && (
              <p className="mt-1 text-xs text-red-500">{modelsError}</p>
            )}
            {showModelPicker && models.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-stone-200 bg-white">
                {models.map((m) => (
                  <button
                    key={m}
                    onClick={() => { setModel(m); markChanged(); setShowModelPicker(false) }}
                    className={`block w-full px-4 py-2 text-left text-sm hover:bg-stone-100 ${
                      m === model ? 'bg-stone-100 font-medium text-stone-900' : 'text-stone-600'
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
            className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? '保存中...' : saved ? '✓ 已保存' : '保存设置'}
          </button>

          {changed && !saved && (
            <p className="text-center text-xs text-amber-600">有未保存的修改</p>
          )}

          <hr className="border-stone-200" />

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-stone-700">测试连接</h2>
            <button
              onClick={testConnection}
              disabled={testing}
              className="w-full rounded-lg border border-stone-300 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            {testResult && (
              <div className={`rounded-lg border p-3 text-sm ${
                testResult.ok
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-red-200 bg-red-50 text-red-600'
              }`}>
                {testResult.ok
                  ? `✓ 连接成功 — ${testResult.reply || '主人我在'}`
                  : `✗ ${testResult.error || '连接失败'}`}
              </div>
            )}
          </div>
        </div>
      ) : tab === 'interests' ? (
        <div className="text-center">
          <p className="mb-4 text-sm text-stone-500">
            选择兴趣领域，AI 将生成贴合这些领域的例句
          </p>
          <a
            href="/settings/interests"
            className="inline-block rounded-lg bg-stone-900 px-6 py-3 font-medium text-white hover:bg-stone-800"
          >
            前往兴趣设置
          </a>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            设定每日学习目标，完成打卡记录连续天数。
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
              每日目标词数
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={dailyTarget}
              onChange={(e) => setDailyTarget(parseInt(e.target.value) || 1)}
              className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm focus:border-stone-900 focus:outline-none dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-stone-400"
            />
          </div>
          <button
            onClick={async () => {
              setSavingGoal(true)
              try {
                await fetch('/api/daily-goal', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ target: dailyTarget }),
                })
                setGoalSaved(true)
                setTimeout(() => setGoalSaved(false), 2000)
              } finally {
                setSavingGoal(false)
              }
            }}
            disabled={savingGoal}
            className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            {savingGoal ? '保存中...' : goalSaved ? '✓ 已保存' : '保存目标'}
          </button>
        </div>
      )}
    </div>
  )
}
