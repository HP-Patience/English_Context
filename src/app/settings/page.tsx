'use client'

import Link from 'next/link'

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
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-stone-900 dark:text-stone-100">设置</h1>
      <div className="space-y-3">
        {cards.map(card => (
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
    </div>
  )
}
