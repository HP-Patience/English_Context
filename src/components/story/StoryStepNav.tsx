'use client'

type FirstPassStep = 1 | 2 | 3

type StoryStepNavProps = {
  currentStep: FirstPassStep
  completedStep: 0 | FirstPassStep
  onSelect: (step: FirstPassStep) => void
}

const steps: Array<{ step: FirstPassStep; title: string; caption: string }> = [
  { step: 1, title: '第一步', caption: '入境识词' },
  { step: 2, title: '第二步', caption: '遮义回想' },
  { step: 3, title: '第三步', caption: '归卷复习' },
]

export function StoryStepNav({ currentStep, completedStep, onSelect }: StoryStepNavProps) {
  return (
    <nav aria-label="首次学习步骤" className="story-step-nav rounded-2xl border p-2">
      <ol className="grid grid-cols-3 gap-1">
        {steps.map(({ step, title, caption }) => {
          const active = currentStep === step
          const complete = completedStep >= step
          return (
            <li key={step}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(step)}
                className={`min-h-14 w-full rounded-xl px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:px-4 ${
                   active ? 'story-step-active' : 'story-step-inactive'
                }`}
              >
                <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] sm:text-xs">
                  {complete ? `${title} · 已成` : title}
                </span>
                <span className="mt-0.5 block truncate font-serif text-xs font-semibold sm:text-sm">{caption}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
