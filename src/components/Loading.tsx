export default function Loading({ text = '加载中...', className = '', blocking = true }: { text?: string; className?: string; blocking?: boolean }) {
  return (
    <div data-page-loading={blocking ? '' : undefined} aria-busy="true" className={`py-16 text-center text-sm text-stone-400 dark:text-stone-500 ${className}`}>{text}</div>
  )
}
