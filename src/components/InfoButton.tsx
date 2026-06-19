'use client'

import { useState } from 'react'

export default function InfoButton({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-stone-300 text-xs text-stone-400 hover:border-stone-500 hover:text-stone-600 dark:border-stone-600 dark:text-stone-500 dark:hover:border-stone-400 dark:hover:text-stone-300"
        aria-label="页面说明"
      >
        ?
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
            <div
              className="max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-lg dark:border-stone-700 dark:bg-stone-900"
              onClick={(e) => e.stopPropagation()}
            >
              {children}
              <button
                onClick={() => setOpen(false)}
                className="mt-4 w-full rounded-lg bg-stone-100 py-2 text-sm text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                知道了
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
