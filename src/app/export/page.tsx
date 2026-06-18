'use client'

import ExportPanel from '@/components/ExportPanel'
import './export.css'

export default function ExportPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">导出词表</h1>
      <ExportPanel />
    </div>
  )
}
