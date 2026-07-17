/**
 * 音频调试页面 — 诊断 TTS / 本地音频播放问题
 *
 * 测试项目:
 *   1. 浏览器 TTS 支持检测 (speechSynthesis + voices)
 *   2. 本地音频 manifest 加载状态
 *   3. 本地音频文件 fetch 测试
 *   4. 浏览器 TTS 单独播放测试
 *   5. 本地音频单独播放测试
 *   6. 完整 TTS 流程测试 (speakWithBrowserTts)
 *   7. 音频解锁状态
 *   8. AudioContext 状态
 */

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  getTtsDebugInfo,
  getLocalAudioUrlForDebug,
  forceUnlockAudio,
  testFetchUrl,
  speakWithBrowserTtsOnly,
  speakWithLocalAudioOnly,
  speakWithBrowserTts,
  loadAudioManifest,
  type TtsDebugInfo,
} from '@/api/tts';

interface LogEntry {
  time: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export function AudioDebug() {
  const navigate = useNavigate();
  const [info, setInfo] = useState<TtsDebugInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [testText, setTestText] = useState('hello');
  const logRef = useRef<HTMLDivElement>(null);

  const log = useCallback((level: LogEntry['level'], message: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = { time, level, message };
    setLogs((prev) => [...prev, entry]);
    // 自动滚动到底部
    setTimeout(() => {
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    }, 0);
  }, []);

  const refreshInfo = useCallback(() => {
    const data = getTtsDebugInfo();
    setInfo(data);
    log('info', `刷新状态: manifest=${data.manifestLoaded ? '已加载' : '未加载'}(${data.manifestEntryCount}条), voices=${data.voicesCount}, unlocked=${data.audioUnlocked}`);
  }, [log]);

  // 测试1: 完整状态检测
  const runDiagnostics = useCallback(async () => {
    setLogs([]);
    log('info', '========== 开始诊断 ==========');

    // 1. 基本环境检测
    log('info', `[1] 当前页面 URL: ${window.location.href}`);
    log('info', `[1] 协议: ${window.location.protocol}`);
    if (window.location.protocol === 'file:') {
      log('error', '[1] ⚠️ 使用 file:// 协议！fetch 无法读取本地文件，音频和 manifest 都会失败。请使用 web 服务器 (如 npm run dev 或 npm run preview)。');
    }

    // 2. speechSynthesis 检测
    if ('speechSynthesis' in window) {
      log('success', `[2] speechSynthesis API: 可用`);
      const voices = window.speechSynthesis.getVoices();
      log('info', `[2] 当前可用 voices: ${voices.length} 个`);
      if (voices.length === 0) {
        log('warn', '[2] voices 为空，可能尚未加载。尝试触发 voiceschanged...');
        // 尝试触发语音加载
        try {
          const u = new SpeechSynthesisUtterance('');
          window.speechSynthesis.speak(u);
          window.speechSynthesis.cancel();
          await new Promise((r) => setTimeout(r, 500));
          const voices2 = window.speechSynthesis.getVoices();
          log('info', `[2] 触发后 voices: ${voices2.length} 个`);
          if (voices2.length > 0) {
            voices2.slice(0, 5).forEach((v) => {
              log('info', `    - ${v.name} (${v.lang})${v.default ? ' [默认]' : ''}`);
            });
          }
        } catch (e) {
          log('error', `[2] 触发 voices 加载失败: ${(e as Error).message}`);
        }
      } else {
        voices.slice(0, 10).forEach((v) => {
          log('info', `    - ${v.name} (${v.lang})${v.default ? ' [默认]' : ''}`);
        });
      }
    } else {
      log('error', '[2] speechSynthesis API: 不可用（浏览器不支持浏览器 TTS）');
    }

    // 3. AudioContext 检测
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      log('success', '[3] AudioContext: 可用');
    } else {
      log('warn', '[3] AudioContext: 不可用（Web Audio API 不支持）');
    }

    // 4. 音频解锁状态
    log('info', `[4] 音频解锁状态: ${getTtsDebugInfo().audioUnlocked ? '已解锁' : '未解锁'}`);
    if (!getTtsDebugInfo().audioUnlocked) {
      log('warn', '[4] 音频未解锁，移动端需要用户手势交互才能播放音频');
    }

    // 5. manifest 加载
    log('info', '[5] 开始加载 manifest...');
    try {
      await loadAudioManifest();
      const dbg = getTtsDebugInfo();
      if (dbg.manifestEntryCount > 0) {
        log('success', `[5] manifest 加载成功: ${dbg.manifestEntryCount} 条记录`);
      } else {
        log('warn', '[5] manifest 已加载但为空（0 条记录）');
      }
    } catch (e) {
      log('error', `[5] manifest 加载异常: ${(e as Error).message}`);
    }

    // 6. manifest URL 测试
    const baseUrl = getTtsDebugInfo().audioBaseUrl;
    const manifestUrl = `${baseUrl}/manifest.json`;
    log('info', `[6] 测试 fetch manifest URL: ${manifestUrl}`);
    const fetchResult = await testFetchUrl(manifestUrl);
    if (fetchResult.ok) {
      log('success', `[6] manifest fetch 成功: HTTP ${fetchResult.status}, ${fetchResult.bodySize} bytes, type=${fetchResult.contentType}`);
    } else if (fetchResult.error) {
      log('error', `[6] manifest fetch 异常: ${fetchResult.error}`);
    } else {
      log('error', `[6] manifest fetch 失败: HTTP ${fetchResult.status} ${fetchResult.statusText}`);
    }

    // 7. 测试单词查找
    const word = testText.trim() || 'hello';
    const audioUrl = getLocalAudioUrlForDebug(word);
    if (audioUrl) {
      log('success', `[7] "${word}" 在 manifest 中找到: ${audioUrl}`);
      log('info', `[7] 测试 fetch 音频文件...`);
      const audioFetch = await testFetchUrl(audioUrl);
      if (audioFetch.ok) {
        log('success', `[7] 音频文件 fetch 成功: HTTP ${audioFetch.status}, ${audioFetch.bodySize} bytes, type=${audioFetch.contentType}`);
      } else if (audioFetch.error) {
        log('error', `[7] 音频文件 fetch 异常: ${audioFetch.error}`);
      } else {
        log('error', `[7] 音频文件 fetch 失败: HTTP ${audioFetch.status} ${audioFetch.statusText}`);
      }
    } else {
      log('warn', `[7] "${word}" 不在 manifest 中（将使用浏览器 TTS 回退）`);
    }

    refreshInfo();
    log('info', '========== 诊断完成 ==========');
  }, [log, testText, refreshInfo]);

  // 测试2: 浏览器 TTS 单独播放
  const testBrowserTts = useCallback(async () => {
    const word = testText.trim() || 'hello';
    setLogs([]);
    log('info', `测试浏览器 TTS: "${word}"`);
    try {
      await speakWithBrowserTtsOnly(word, 'en-US');
      log('success', '浏览器 TTS 播放完成');
    } catch (e) {
      log('error', `浏览器 TTS 播放失败: ${(e as Error).message}`);
    }
  }, [testText, log]);

  // 测试3: 本地音频单独播放
  const testLocalAudio = useCallback(async () => {
    const word = testText.trim() || 'hello';
    setLogs([]);
    log('info', `测试本地音频: "${word}"`);
    const ok = await speakWithLocalAudioOnly(word);
    if (ok) {
      log('success', '本地音频播放成功');
    } else {
      log('error', '本地音频播放失败（未找到或播放错误）');
    }
  }, [testText, log]);

  // 测试4: 完整 TTS 流程
  const testFullTts = useCallback(async () => {
    const word = testText.trim() || 'hello';
    setLogs([]);
    log('info', `测试完整 TTS 流程: "${word}"`);
    try {
      await speakWithBrowserTts(word, 'en-US');
      log('success', '完整 TTS 流程完成');
    } catch (e) {
      log('error', `完整 TTS 流程失败: ${(e as Error).message}`);
    }
  }, [testText, log]);

  // 手动解锁音频
  const handleUnlock = useCallback(() => {
    forceUnlockAudio();
    refreshInfo();
    log('success', '音频已手动解锁');
  }, [log, refreshInfo]);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-20 md:pb-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/settings')}
          className="text-sm text-slate-500 hover:text-slate-700 transition"
        >
          ← 返回设置
        </button>
        <h2 className="text-xl font-bold">音频调试</h2>
        <div className="w-20" />
      </div>

      {/* 状态概览 */}
      <section className="card-container p-4 md:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">状态概览</h3>
          <Button variant="ghost" size="sm" onClick={refreshInfo}>刷新</Button>
        </div>
        {info ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${info.manifestLoaded ? 'bg-green-500' : 'bg-red-500'}`} />
              <span>Manifest: {info.manifestLoaded ? `已加载(${info.manifestEntryCount})` : info.manifestLoading ? '加载中...' : '未加载'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${info.audioUnlocked ? 'bg-green-500' : 'bg-orange-500'}`} />
              <span>音频解锁: {info.audioUnlocked ? '是' : '否'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${info.speechSynthesisSupported ? 'bg-green-500' : 'bg-red-500'}`} />
              <span>SpeechSynthesis: {info.speechSynthesisSupported ? '支持' : '不支持'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${info.voicesCount > 0 ? 'bg-green-500' : 'bg-orange-500'}`} />
              <span>Voices: {info.voicesCount} 个</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${info.audioContextSupported ? 'bg-green-500' : 'bg-red-500'}`} />
              <span>AudioContext: {info.audioContextSupported ? `可用(${info.audioContextState})` : '不可用'}</span>
            </div>
            <div className="text-xs text-slate-400">
              Audio Base URL: {info.audioBaseUrl}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">点击"刷新"查看状态</p>
        )}
        {info && info.voices.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              查看可用 Voices ({info.voices.length})
            </summary>
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {info.voices.map((v, i) => (
                <div key={i} className="px-2 py-1 rounded bg-slate-50 dark:bg-slate-700/50">
                  {v.default ? '★ ' : ''}{v.name} ({v.lang})
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* 测试输入 */}
      <section className="card-container p-4 md:p-6 space-y-3">
        <h3 className="font-semibold">播放测试</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="输入要测试的单词或句子..."
            className="input-base flex-1"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={runDiagnostics}>
            🔍 运行完整诊断
          </Button>
          <Button variant="ghost" size="sm" onClick={testLocalAudio} className="ring-1 ring-slate-200 dark:ring-slate-600">
            🎵 仅测试本地音频
          </Button>
          <Button variant="ghost" size="sm" onClick={testBrowserTts} className="ring-1 ring-slate-200 dark:ring-slate-600">
            🔊 仅测试浏览器 TTS
          </Button>
          <Button variant="ghost" size="sm" onClick={testFullTts} className="ring-1 ring-slate-200 dark:ring-slate-600">
            📻 测试完整流程
          </Button>
          {!info?.audioUnlocked && (
            <Button variant="danger" size="sm" onClick={handleUnlock}>
              🔓 解锁音频
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {['hello', 'world', 'abandon', 'absolute', 'The quick brown fox jumps over the lazy dog'].map((w) => (
            <button
              key={w}
              onClick={() => setTestText(w)}
              className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
            >
              {w}
            </button>
          ))}
        </div>
      </section>

      {/* 日志输出 */}
      <section className="card-container p-4 md:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">调试日志</h3>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-xs text-slate-400 hover:text-slate-600 transition"
            >
              清除
            </button>
          )}
        </div>
        <div
          ref={logRef}
          className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-xs space-y-0.5 max-h-96 overflow-y-auto"
        >
          {logs.length === 0 ? (
            <p className="text-slate-500 italic">点击上方按钮运行测试...</p>
          ) : (
            logs.map((entry, i) => (
              <div
                key={i}
                className={
                  entry.level === 'success' ? 'text-green-400' :
                  entry.level === 'error' ? 'text-red-400' :
                  entry.level === 'warn' ? 'text-yellow-400' :
                  'text-slate-300'
                }
              >
                <span className="text-slate-500 mr-2">{entry.time}</span>
                {entry.message}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
