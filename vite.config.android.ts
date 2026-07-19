/**
 * Android 专用 Vite 构建配置
 *
 * 与 vite.config.ts 的区别：
 *   - base: '/' （Capacitor 本地服务器从根路径提供资源）
 *   - 移除 GitHub Pages 子路径前缀
 *
 * 此文件不影响原网页版的构建配置（vite.config.ts 保持不变）。
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  // Capacitor 本地服务器从 https://localhost/ 根路径提供资源
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    // 生成 source map 用于调试（不影响运行时性能）
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})
