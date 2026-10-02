'use client'

import { FormEvent, useEffect, useState } from 'react'

type User = {
  id: string
  username: string
  name: string | null
  status: string
  statsSharingEnabled: boolean
  createdAt: string
}

export default function UserManagementPanel() {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ username: '', name: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadUsers() {
    const response = await fetch('/api/admin/users', { cache: 'no-store' })
    if (!response.ok) throw new Error('账号列表读取失败')
    const data = await response.json() as { users: User[] }
    setUsers(data.users)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers().catch((caught) => setError(caught instanceof Error ? caught.message : '读取失败'))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function createUser(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(data?.error ?? '创建失败')
      setForm({ username: '', name: '', password: '' })
      await loadUsers()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  async function updateUser(id: string, payload: Record<string, unknown>, message: string) {
    setError('')
    const response = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(message)
    await loadUsers()
  }

  async function deleteUser(user: User) {
    if (!window.confirm(`确定永久删除账号“${user.name || user.username}”及其全部学习数据吗？`)) return
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('删除失败')
      await loadUsers()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败')
    }
  }

  async function resetPassword(user: User) {
    const password = window.prompt(`为 ${user.username} 设置新密码（至少 12 个字符）`)
    if (password === null) return
    try {
      const response = await fetch(`/api/admin/users/${user.id}/password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      })
      if (!response.ok) throw new Error('重置密码失败')
      window.alert('密码已重置')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '重置密码失败')
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">账号管理</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">创建、停用和维护朋友账号。</p>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p> : null}
      <form onSubmit={createUser} className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:grid-cols-4">
        <input aria-label="用户名" required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="用户名" className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950" />
        <input aria-label="昵称" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="昵称" className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950" />
        <input aria-label="初始密码" required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="初始密码" className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950" />
        <button type="submit" disabled={busy} className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-amber-500 dark:text-stone-950">创建账号</button>
      </form>
      <div className="space-y-3">
        {users.map((user) => (
          <article key={user.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{user.name || user.username}</h2>
                <p className="text-xs text-stone-500">@{user.username} · {user.status === 'active' ? '启用' : '停用'}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => updateUser(user.id, { status: user.status === 'active' ? 'disabled' : 'active' }, '状态更新失败').catch((caught) => setError(caught instanceof Error ? caught.message : '状态更新失败'))} className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700">{user.status === 'active' ? '停用' : '启用'}</button>
                <button type="button" onClick={() => resetPassword(user)} className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700">重置密码</button>
                <button type="button" onClick={() => updateUser(user.id, { statsSharingEnabled: !user.statsSharingEnabled }, '分享设置更新失败').catch((caught) => setError(caught instanceof Error ? caught.message : '分享设置更新失败'))} className="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700">{user.statsSharingEnabled ? '关闭统计分享' : '开启统计分享'}</button>
                <button type="button" onClick={() => deleteUser(user)} className="rounded-lg border border-red-300 px-3 py-2 text-red-700 dark:border-red-800 dark:text-red-300">永久删除</button>
              </div>
            </div>
          </article>
        ))}
        {users.length === 0 ? <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">还没有普通用户账号。</p> : null}
      </div>
    </section>
  )
}

