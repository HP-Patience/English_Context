import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptDir, '..', '..')
const vitestCli = join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs')
const targets = process.argv.slice(2)
const runtimeTargets = targets.length > 0 ? targets : ['src/lib', 'scripts/test/story-runtime-smoke.mjs']

const result = spawnSync(process.execPath, [vitestCli, 'run', ...runtimeTargets], {
  cwd: projectRoot,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
