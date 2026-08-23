import type { Metadata } from 'next'
import { Suspense } from 'react'

import LoginForm from '@/components/LoginForm'

export const metadata: Metadata = {
  title: '登录 — ContextVocab',
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-md items-center">
      <section className="w-full rounded-3xl border border-stone-200 bg-white p-7 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-9">
        <div className="mb-7">
          <p className="mb-2 text-sm font-medium text-amber-700 dark:text-amber-400">私人学习空间</p>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">登录 ContextVocab</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">
            请输入服务器上配置的单用户账号。
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-stone-500">正在加载登录表单…</p>}>
          <LoginForm />
        </Suspense>
      </section>
    </div>
  )
}
