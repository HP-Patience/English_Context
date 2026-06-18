'use client'

import AnalysisPanel from '@/components/AnalysisPanel'

export default function AnalysisPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">错词分析</h1>
      <AnalysisPanel />
    </div>
  )
}
