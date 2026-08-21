module.exports = async () => {
  const { defineConfig } = await import('vitest/config')

  return defineConfig({
    test: {
      environment: 'node',
    },
  })
}
