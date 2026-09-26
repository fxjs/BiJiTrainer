import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // 蒙特卡洛与 2000 手策略对拍较慢
    testTimeout: 60_000,
  },
})
