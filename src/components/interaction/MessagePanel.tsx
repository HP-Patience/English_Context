'use client'

import { FormEvent, useState } from 'react'

type Message = { id: string; senderId: string; body: string; kind: string; readAt: string | null; createdAt: string }

export default function MessagePanel({ messages, recipientId, onRefresh }: { messages: Message[]; recipientId: string; onRefresh: () => void }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  async function send(event: FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/interaction/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, body, kind: 'text' }) })
    if (!response.ok) { setError('消息发送失败'); return }
    setBody(''); setError(''); onRefresh()
  }
  return <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
    <h2 className="text-lg font-semibold">消息</h2>
    <div className="mt-3 max-h-64 space-y-2 overflow-auto">{messages.map((message) => <p key={message.id} className="rounded-lg bg-stone-50 p-2 text-sm dark:bg-stone-950">{message.body}<span className="ml-2 text-xs text-stone-400">{new Date(message.createdAt).toLocaleString('zh-CN')}</span></p>)}{messages.length === 0 ? <p className="text-sm text-stone-500">还没有消息。</p> : null}</div>
    <form onSubmit={send} className="mt-3 flex gap-2"><input aria-label="消息内容" required value={body} onChange={(event) => setBody(event.target.value)} placeholder="发送一句鼓励" className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950" /><button type="submit" className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white dark:bg-amber-500 dark:text-stone-950">发送</button></form>
    {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
    <div className="mt-2 flex gap-2"><button type="button" onClick={async () => { await fetch('/api/interaction/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, body: '加油！', kind: 'encouragement' }) }); onRefresh() }} className="text-xs text-amber-700">加油！</button><button type="button" onClick={async () => { await fetch('/api/interaction/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, body: '做得好！', kind: 'encouragement' }) }); onRefresh() }} className="text-xs text-amber-700">做得好！</button></div>
  </section>
}
