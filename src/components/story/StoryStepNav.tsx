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
    <nav aria-label="首次学习步骤" className="story-step-nav border-b border-[var(--story-line)] pb-2">
      <ol className="story-step-list grid grid-cols-3 gap-1" data-current-step={currentStep}>
        {steps.map(({ step, title, caption }) => {
          const active = currentStep === step
          const complete = completedStep >= step
          return (
            <li key={step} className="min-w-0">
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                aria-label={`${title}：${caption}${complete ? '，已完成' : ''}`}
                data-completed={complete}
                onClick={() => onSelect(step)}
                className={`relative flex min-h-14 w-full flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:px-4 ${
                   active ? 'story-step-active' : 'story-step-inactive'
                }`}
              >
                <span aria-hidden="true" className="story-step-marker relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold">
                  {complete ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : step}
                </span>
                <span className="relative z-10 block max-w-full truncate text-xs font-semibold sm:text-sm">{caption}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
