import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  worker: {
    // 求解 Worker 使用 ES 模块格式（new Worker(url, { type: 'module' })）
    format: 'es',
  },
})
