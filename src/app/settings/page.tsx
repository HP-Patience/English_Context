'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import LogoutButton from '@/components/LogoutButton'

const cards = [
  {
    href: '/settings/api',
    title: 'API 配置',
    desc: '大模型 API、TTS 发音服务配置',
  },
  {
    href: '/settings/preferences',
    title: '学习偏好',
    desc: '每日目标、兴趣领域设置',
  },
  {
    href: '/settings/export',
    title: '导出词表',
    desc: '按频率分类导出或打印词表',
  },
]

export default function SettingsPage() {
  const [canManageUsers, setCanManageUsers] = useState(false)
  useEffect(() => {
    fetch('/api/admin/users', { cache: 'no-store' }).then(response => setCanManageUsers(response.ok)).catch(() => setCanManageUsers(false))
  }, [])
  const entries = [...cards, { href: '/stats', title: '学习统计', desc: '查看学习进度和掌握情况' }, ...(canManageUsers ? [{ href: '/admin', title: '用户管理', desc: '管理员：创建和管理账号' }] : [])]

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-stone-900 dark:text-stone-100">设置</h1>
      <div className="space-y-3">
        {entries.map(card => (
          <Link
            key={card.href}
            href={card.href}
            className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-400 hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500"
          >
            <div>
              <div className="text-sm font-semibold text-stone-800 dark:text-stone-200">{card.title}</div>
              <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{card.desc}</div>
            </div>
            <svg className="h-4 w-4 shrink-0 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        ))}
      </div>
      <div className="mt-8 border-t border-stone-200 pt-5 dark:border-stone-700">
        <LogoutButton className="min-h-11 rounded-lg px-3 text-sm text-stone-500 hover:bg-stone-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-red-400" />
      </div>
    </div>
  )
}
