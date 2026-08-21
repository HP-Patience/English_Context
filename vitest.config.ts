module.exports = async () => {
  const [{ defineConfig }, path] = await Promise.all([
    import('vitest/config'),
    import('node:path'),
  ])

  const rawNovelImportId = '\0story-runtime-raw-novel-tripwire'
  const rawNovelFileName = '蛊真人.txt'

  return defineConfig({
    plugins: [{
      name: 'story-runtime-raw-novel-tripwire',
      enforce: 'pre',
      resolveId(source) {
        let decoded = source
        try {
          decoded = decodeURIComponent(source)
        } catch {
          // Invalid URL escaping cannot identify the protected filename.
        }
        const basename = decoded
          .normalize('NFC')
          .replaceAll('\\', '/')
          .split(/[?#]/, 1)[0]
          .split('/')
          .at(-1)
        return basename === rawNovelFileName ? rawNovelImportId : null
      },
      load(id) {
        if (id !== rawNovelImportId) return null
        return `throw new Error(${JSON.stringify('Story runtime attempted to import the raw novel path')})`
      },
    }],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    test: {
      environment: 'node',
      include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', 'scripts/test/story-runtime-smoke.mjs'],
    },
  })
}
