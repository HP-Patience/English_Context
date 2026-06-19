'use client'

import AnalysisPanel from '@/components/AnalysisPanel'
import InfoButton from '@/components/InfoButton'

export default function AnalysisPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">错词分析</h1>
        <InfoButton>
          <h3 className="mb-2 text-sm font-semibold text-stone-900 dark:text-stone-100">错词分析</h3>
          <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            分析复习过程中答错的单词，按错词频率排序展示。可以查看每个错词的上下文例句、词义解析和答错次数，帮助针对性巩固薄弱词汇。
          </p>
        </InfoButton>
      </div>
      <AnalysisPanel />
    </div>
  )
}
