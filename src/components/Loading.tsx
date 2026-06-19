export default function Loading({ text = '加载中...', className = '' }: { text?: string; className?: string }) {
  return (
    <div className={`py-16 text-center text-sm text-stone-400 dark:text-stone-500 ${className}`}>{text}</div>
  )
}
