module.exports = async () => {
  const [{ defineConfig }, path] = await Promise.all([
    import('vitest/config'),
    import('node:path'),
  ])

  return defineConfig({
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    test: {
      environment: 'node',
    },
  })
}
