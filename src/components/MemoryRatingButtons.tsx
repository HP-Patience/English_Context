'use client'

const ratings = [{ label: '记得', grade: 4 }, { label: '模糊', grade: 2 }, { label: '忘记', grade: 0 }]

export function memoryRatingButtonClass(selected = false) {
  return `min-h-12 rounded-lg border px-3 text-sm shadow-sm transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 disabled:opacity-50 ${selected ? 'border-stone-900 bg-stone-900 font-semibold text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900' : 'border-stone-200 bg-white text-stone-500 enabled:hover:border-stone-500 enabled:hover:bg-stone-200 enabled:hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:enabled:hover:border-stone-400 dark:enabled:hover:bg-stone-700 dark:enabled:hover:text-stone-100'}`
}

export function MemoryRatingButtons({ value, onChange, disabled = false }: {
  value: number | null
  onChange: (grade: number) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ratings.map(({ label, grade }) => (
        <button key={grade} type="button" disabled={disabled} aria-pressed={value === grade}
          onClick={() => onChange(grade)}
          className={memoryRatingButtonClass(value === grade)}>
          {label}
        </button>
      ))}
    </div>
  )
}
