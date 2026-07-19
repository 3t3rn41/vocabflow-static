/**
 * 英汉互译模式 — 2.1.3
 *
 * 系统随机显示英文或中文，用户输入对应翻译。
 * 50% 概率显示英文（输入中文），50% 显示中文（输入英文）。
 * 中文输入接受部分匹配（包含关键词即可）。
 * 英文输入大小写不敏感。
 * 支持 SRS 评分。
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradeButtons } from '@/components/review/GradeButtons';
import { ReviewComplete } from '@/components/review/ReviewComplete';
import { useSettingsStore } from '@/stores/settings';
import { useWordBookStore } from '@/stores/wordBook';
import { Grade } from '@/types';
import type { ReviewItem } from '@/types';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { generateReviewQueue, reviewAndPersist } from '@/srs/engine';
import { speakWithBrowserTts } from '@/api/tts';
import { clsx } from 'clsx';

type Direction = 'en2cn' | 'cn2en';
type Phase = 'typing' | 'revealed' | 'correct' | 'wrong';

/** 从中文释义中提取关键词（取第一个词或整个短语） */
function extractKeywords(meaning: string): string[] {
  // 按常见分隔符分词
  const parts = meaning.split(/[，,；;、（(]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 0) return parts;
  return [meaning.trim()];
}

/** 检查中文翻译是否部分匹配 */
function checkChineseAnswer(typed: string, meaning: string): boolean {
  const typedTrimmed = typed.trim();
  if (!typedTrimmed) return false;
  // 完全匹配
  if (typedTrimmed === meaning) return true;
  // 包含任一关键词
  const keywords = extractKeywords(meaning);
  return keywords.some((kw) => typedTrimmed.includes(kw) || kw.includes(typedTrimmed));
}

export function Translate() {
  const activeBookId = useWordBookStore((s) => s.activeBookId);
  const keyboardLayout = useSettingsStore((s) => s.keyboardLayout);
  const shuffleWords = useSettingsStore((s) => s.shuffleWords);
  const autoPlayAudio = useSettingsStore((s) => s.autoPlayAudio);
  const navigate = useNavigate();

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [direction, setDirection] = useState<Direction>('en2cn');
  const [phase, setPhase] = useState<Phase>('typing');
  const [typed, setTyped] = useState('');
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [shake, setShake] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // 生成复习队列
  useEffect(() => {
    if (!activeBookId) {
      setLoading(false);
      return;
    }
    setIdx(0);
    setPhase('typing');
    setTyped('');
    setFinished(false);
    setCorrectCount(0);
    setStreak(0);
    setLoading(true);
    (async () => {
      try {
        const queue = await generateReviewQueue(activeBookId, 200, shuffleWords);
        setItems(queue);
      } catch (e) {
        console.error('[translate] generate queue failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeBookId, shuffleWords]);

  const currentItem = items[idx] ?? null;

  // 新词加载时随机方向
  useEffect(() => {
    if (!currentItem || finished) return;
    setDirection(Math.random() < 0.5 ? 'en2cn' : 'cn2en');
    setPhase('typing');
    setTyped('');
    setTimeout(() => inputRef.current?.focus(), 100);
    if (direction === 'en2cn' && autoPlayAudio) {
      speakWithBrowserTts(currentItem.word, 'en-US').catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem, finished]);

  const playAudio = useCallback((word: string) => {
    speakWithBrowserTts(word, 'en-US').catch(() => {});
  }, []);

  // 键盘快捷键
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (phase === 'revealed' || phase === 'correct' || phase === 'wrong') {
        if (grading) return;
        if (e.key === '1') handleGrade(Grade.Again);
        else if (e.key === '2') handleGrade(Grade.Hard);
        else if (e.key === '3') handleGrade(Grade.Good);
        else if (keyboardLayout === '4key' && e.key === '4') handleGrade(Grade.Easy);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, grading, keyboardLayout, currentItem]);

  function handleSubmit() {
    if (!currentItem || phase !== 'typing') return;
    const userInput = typed.trim();

    let isCorrect = false;
    if (direction === 'en2cn') {
      // 英→中：中文部分匹配
      isCorrect = checkChineseAnswer(userInput, currentItem.meaning_cn);
    } else {
      // 中→英：英文大小写不敏感
      isCorrect = userInput.toLowerCase() === currentItem.word.toLowerCase();
    }

    if (isCorrect) {
      setPhase('correct');
      setCorrectCount((c) => c + 1);
      setStreak((s) => s + 1);
      if (autoPlayAudio) playAudio(currentItem.word);
    } else {
      setPhase('wrong');
      setStreak(0);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  function handleReveal() {
    if (!currentItem) return;
    setPhase('revealed');
    setStreak(0);
  }

  async function handleGrade(g: Grade) {
    if (grading) return;
    if (idx >= items.length) return;
    if (phase === 'typing') return;

    setGrading(true);
    try {
      await reviewAndPersist(currentItem!.wordId, currentItem!.bookId, g);
    } catch (e) {
      console.error('[translate] review failed', e);
    } finally {
      setGrading(false);
      if (idx < items.length - 1) {
        setIdx((i) => i + 1);
      } else {
        setFinished(true);
      }
    }
  }

  function handleRetry() {
    if (!currentItem) return;
    setPhase('typing');
    setTyped('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center gap-3">
        <Spinner size="lg" />
        <span className="text-slate-500">加载中...</span>
      </div>
    );
  }

  if (!activeBookId) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <p className="text-slate-500">请先选择一本词书</p>
        <Button variant="primary" onClick={() => navigate('/select-book')}>
          选择词书
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4 animate-fadeInUp">
        <div className="text-5xl animate-scaleBounce">Done</div>
        <p className="text-slate-500">暂无需要翻译的单词</p>
        <Button variant="primary" onClick={() => navigate('/today')}>
          返回今日
        </Button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <ReviewComplete total={items.length} onBack={() => navigate('/today')} />
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="card-container p-3">
            <p className="text-xl font-bold text-green-500">{correctCount}</p>
            <p className="text-xs text-slate-500">正确</p>
          </div>
          <div className="card-container p-3">
            <p className="text-xl font-bold text-orange-500">{items.length - correctCount}</p>
            <p className="text-xs text-slate-500">错误</p>
          </div>
          <div className="card-container p-3">
            <p className="text-xl font-bold text-brand-600">
              {Math.round((correctCount / items.length) * 100)}%
            </p>
            <p className="text-xs text-slate-500">正确率</p>
          </div>
        </div>
      </div>
    );
  }

  const showGradeButtons = phase === 'revealed' || phase === 'correct' || phase === 'wrong';
  const promptText = direction === 'en2cn' ? currentItem?.word : currentItem?.meaning_cn;
  const promptLabel = direction === 'en2cn' ? '英文' : '中文';
  const answerLabel = direction === 'en2cn' ? '中文' : '英文';
  const placeholder = direction === 'en2cn' ? '输入中文翻译...' : '输入英文单词...';

  return (
    <div className="max-w-2xl mx-auto space-y-4 md:space-y-5">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/today')}
          className="text-sm text-slate-500 hover:text-slate-700 transition"
        >
          ← 返回
        </button>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <span className="text-sm text-orange-500 font-bold animate-scaleBounce">
              Streak {streak}
            </span>
          )}
          <span className="text-sm text-slate-500">
            {idx + 1} / {items.length}
          </span>
        </div>
      </div>

      {/* 进度条 */}
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full sentence-progress-bar"
          style={{ width: `${(idx / items.length) * 100}%` }}
        />
      </div>

      {/* 翻译卡片 */}
      <div
        key={idx}
        className={clsx(
          'card-container p-6 md:p-8 relative overflow-hidden animate-fadeInUp',
          phase === 'correct' && 'ring-2 ring-emerald-500/40',
          phase === 'wrong' && 'ring-2 ring-red-500/40',
          phase === 'revealed' && 'ring-2 ring-amber-500/40',
          shake && 'animate-shake',
        )}
      >
        {/* 题目区 */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 text-xs font-medium">
              {promptLabel}
            </span>
            {direction === 'en2cn' && currentItem && (
              <button
                onClick={() => playAudio(currentItem.word)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                title="朗读"
              >
                <svg className="w-5 h-5 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.54 8.46a5 5 0 010 7.07" />
                  <path d="M19.07 4.93a10 10 0 010 14.14" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">
            {promptText}
          </p>
          {currentItem?.phonetic && direction === 'en2cn' && (
            <p className="text-sm text-slate-500">{currentItem.phonetic}</p>
          )}
          <p className="text-sm text-slate-400">
            {phase === 'typing'
              ? `输入${answerLabel}翻译`
              : phase === 'correct'
                ? '翻译正确'
                : phase === 'wrong'
                  ? '翻译错误'
                  : '答案已显示'}
          </p>
        </div>

        {/* 输入区 / 结果区 */}
        {phase === 'typing' ? (
          <div className="mt-6 space-y-4">
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="input-base text-center text-xl font-bold"
              placeholder={placeholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={100}
            />
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!typed.trim()}>
                确认
              </Button>
              <button
                onClick={handleReveal}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition active:scale-95"
              >
                看答案
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4 animate-slideUpFade">
            {/* 答案显示 */}
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-400 font-medium">{answerLabel}</p>
              <p className={clsx(
                'text-2xl md:text-3xl font-bold',
                phase === 'correct' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100',
              )}>
                {direction === 'en2cn' ? currentItem?.meaning_cn : currentItem?.word}
              </p>
              {phase === 'wrong' && typed && (
                <p className="text-sm text-red-400">
                  你的答案: <span className="font-mono font-bold">{typed}</span>
                </p>
              )}
            </div>

            {/* 例句 */}
            {currentItem?.example && (
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <p className="text-sm text-slate-700 dark:text-slate-200">{currentItem.example}</p>
                {currentItem.example_cn && (
                  <p className="text-xs text-slate-500 mt-1">{currentItem.example_cn}</p>
                )}
              </div>
            )}

            {/* 重试按钮 */}
            {phase === 'wrong' && (
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={handleRetry}>
                  重新翻译
                </Button>
              </div>
            )}

            {/* 评分按钮 */}
            {showGradeButtons && (
              <div className="pt-2">
                <GradeButtons
                  layout={keyboardLayout}
                  onGrade={handleGrade}
                  disabled={grading}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="card-container p-3 text-center">
          <p className="text-lg font-bold text-green-500">{correctCount}</p>
          <p className="text-xs text-slate-500">正确</p>
        </div>
        <div className="card-container p-3 text-center">
          <p className="text-lg font-bold text-orange-500">{streak}</p>
          <p className="text-xs text-slate-500">连击</p>
        </div>
        <div className="card-container p-3 text-center">
          <p className="text-lg font-bold text-brand-600">
            {Math.round((correctCount / Math.max(idx + 1, 1)) * 100)}%
          </p>
          <p className="text-xs text-slate-500">正确率</p>
        </div>
      </div>
    </div>
  );
}
