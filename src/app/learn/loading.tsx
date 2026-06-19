export default function LearnLoading() {
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex animate-pulse flex-col items-center gap-3 pt-6">
        <div className="h-9 w-40 rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-5 w-24 rounded bg-stone-100 dark:bg-stone-800" />
      </div>
      <div className="mb-8 animate-pulse rounded-xl border border-stone-200 p-6 dark:border-stone-700">
        <div className="h-6 w-full rounded bg-stone-100 dark:bg-stone-800" />
        <div className="mt-2 h-6 w-3/4 rounded bg-stone-100 dark:bg-stone-800" />
      </div>
      <div className="grid animate-pulse grid-cols-3 gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-stone-100 dark:bg-stone-800" />
        ))}
      </div>
    </div>
  )
}
