/**
 * Capacitor 配置文件
 *
 * 将 VocabFlow 静态网页版打包为 Android 原生应用。
 * 使用相同的 Web 源码，通过 Capacitor WebView 容器运行。
 */

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.vocabflow.app',
  appName: '涓词 VocabFlow',
  webDir: 'dist',
  // Android 使用 https 协议提供更好的 Web API 兼容性
  // (AudioContext, SpeechSynthesis 等 API 需要 secure context)
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    // 允许 WebView 混合内容（本地资源 + 可能的网络请求）
    allowMixedContent: true,
    // 启用 WebView 调试（发布时可关闭）
    webContentsDebuggingEnabled: false,
  },
}

export default config
