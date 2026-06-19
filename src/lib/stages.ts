export const STAGE_PREFIXES = ['高频词', '中频词', '低频词', '偶考词', '基础词', '补充词'] as const
export const STAGE_ORDER = [...STAGE_PREFIXES]

export function getStage(name: string): string {
  for (const prefix of STAGE_PREFIXES) {
    if (name.startsWith(prefix)) return prefix
  }
  return '其他'
}
