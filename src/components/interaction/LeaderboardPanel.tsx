'use client'

export type LeaderboardData = {
  activeDays?: Array<{ rank: number; displayName: string; value: number }>
  learnedWords?: Array<{ rank: number; displayName: string; value: number }>
  reviewCount?: Array<{ rank: number; displayName: string; value: number }>
  streak?: Array<{ rank: number; displayName: string; value: number }>
  storyCompletion?: Array<{ rank: number; displayName: string; value: number }>
}

const boards: Array<[keyof LeaderboardData, string, string]> = [
  ['activeDays', '本周学习天数', '天'],
  ['learnedWords', '本周学习单词', '词'],
  ['reviewCount', '本周复习次数', '次'],
  ['streak', '连续学习天数', '天'],
  ['storyCompletion', '故事完成度', '%'],
]

export default function LeaderboardPanel({ data }: { data?: LeaderboardData }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <h2 className="text-lg font-semibold">排行榜</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {boards.map(([key, title, unit]) => (
          <div key={key} className="rounded-lg bg-stone-50 p-3 dark:bg-stone-950">
            <h3 className="text-sm font-semibold">{title}</h3>
            <ol className="mt-2 space-y-1 text-sm">
              {(data?.[key] ?? []).map((entry) => <li key={`${key}-${entry.rank}`} className="flex justify-between"><span>{entry.rank}. {entry.displayName}</span><span>{entry.value}{unit}</span></li>)}
              {!(data?.[key]?.length) ? <li className="text-stone-500">暂无可分享数据</li> : null}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}
