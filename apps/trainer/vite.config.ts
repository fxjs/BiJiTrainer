import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // 使用相对路径引用构建产物，使 dist 可部署到任意二级目录（如 /biji/）而无需重新构建。
  // 应用无前端路由，Worker 通过 new URL(..., import.meta.url) 解析，均兼容相对 base。
  base: './',
  plugins: [vue(), UnoCSS()],
  worker: {
    // 求解 Worker 使用 ES 模块格式（new Worker(url, { type: 'module' })）
    format: 'es',
  },
})
