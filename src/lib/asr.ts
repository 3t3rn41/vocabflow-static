/**
 * 统一 ASR（自动语音识别）模块 — 静态网页版
 *
 * 静态版仅使用浏览器内置 Web Speech API 进行语音识别：
 *
 * Tier 1 — Web Speech API（浏览器内置）
 *   ✓ Chrome / Edge / Safari / Chrome Android
 *   ✗ Firefox / 部分移动端浏览器
 *   优点：零配置、实时中间结果、无需后端服务
 *
 * （已移除服务端 Whisper 推理，因为需要 Node.js 后端运行）
 *
 * 不支持 Web Speech API 的浏览器将无法使用语音识别功能，
 * 但不影响句子拼写练习等核心功能。
 */

/* ================================================================
   类型定义
   ================================================================ */

export type ASRProvider = 'web-speech' | 'none';

export interface ASRResult {
  text: string;
  confidence: number;
}

export interface ASRStatus {
  provider: ASRProvider;
  available: boolean;
  message: string;
}

export interface ASRHandlers {
  onResult?: (result: ASRResult) => void;
  onInterim?: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

/* ================================================================
   Web Speech API
   ================================================================ */

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => ISpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition ??
    null
  );
}

export function isWebSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

class WebSpeechASR {
  private recognition: ISpeechRecognition | null = null;
  private listening = false;

  start(lang: string, handlers: ASRHandlers): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      handlers.onError?.('浏览器不支持 Web Speech API');
      return;
    }
    if (this.recognition && this.listening) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => { this.listening = true; };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = '';
      let interimText = '';
      let maxConf = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (result.isFinal) {
          finalText += alt.transcript;
          if (alt.confidence > maxConf) maxConf = alt.confidence;
        } else {
          interimText += alt.transcript;
        }
      }

      if (finalText) {
        handlers.onResult?.({ text: finalText.trim(), confidence: maxConf || 0.9 });
      }
      if (interimText) {
        handlers.onInterim?.(interimText);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        handlers.onError?.('未检测到语音，请再试一次');
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        handlers.onError?.('麦克风权限被拒绝');
      } else if (event.error === 'network') {
        handlers.onError?.('网络错误，语音识别需要联网');
      } else if (event.error !== 'aborted') {
        handlers.onError?.(`识别错误: ${event.error}`);
      }
    };

    rec.onend = () => {
      this.listening = false;
      handlers.onEnd?.();
    };

    this.recognition = rec;
    try { rec.start(); } catch { /* ignore InvalidStateError */ }
  }

  stop(): void {
    if (this.recognition && this.listening) {
      try { this.recognition.stop(); } catch { /* ignore */ }
    }
    this.listening = false;
  }

  abort(): void {
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ignore */ }
    }
    this.listening = false;
  }
}

/* ================================================================
   统一 ASR 管理器（静态版 — 仅 Web Speech API）
   ================================================================ */

export class UnifiedASR {
  private webSpeech = new WebSpeechASR();
  private currentProvider: ASRProvider = 'none';
  private active = false;

  get provider(): ASRProvider {
    return this.currentProvider;
  }

  get isListening(): boolean {
    return this.active;
  }

  static async detectProvider(): Promise<ASRStatus> {
    // 仅支持 Web Speech API
    if (isWebSpeechSupported()) {
      return {
        provider: 'web-speech',
        available: true,
        message: '浏览器内置语音识别',
      };
    }

    return {
      provider: 'none',
      available: false,
      message: '当前浏览器不支持语音识别（仅 Chrome/Edge/Safari 支持）',
    };
  }

  async start(lang: string, handlers: ASRHandlers): Promise<void> {
    if (this.active) return;

    // Web Speech API
    if (isWebSpeechSupported()) {
      this.currentProvider = 'web-speech';
      this.active = true;
      this.webSpeech.start(lang, {
        ...handlers,
        onEnd: () => {
          this.active = false;
          handlers.onEnd?.();
        },
      });
      return;
    }

    handlers.onError?.('当前浏览器不支持语音识别（静态版仅支持 Web Speech API）');
  }

  stop(): void {
    if (this.currentProvider === 'web-speech') {
      this.webSpeech.stop();
    }
    this.active = false;
  }

  destroy(): void {
    this.webSpeech.abort();
    this.active = false;
  }
}
