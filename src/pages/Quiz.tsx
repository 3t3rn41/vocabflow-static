/**
 * 选择题模式（多选一）— 2.1.2
 *
 * 显示一个单词，从 4 个中文释义中选择正确答案。
 * 干扰项从同词书随机选取。
 * 选择后立即反馈对错，2 秒后进入下一题。
 * SRS 评分映射：答对→Good，答错→Again
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '@/stores/settings';
import { useWordBookStore } from '@/stores/wordBook';
import { Grade } from '@/types';
import type { ReviewItem } from '@/types';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { generateReviewQueue, reviewAndPersist } from '@/srs/engine';
import { getWordsByBook } from '@/data/wordbooks';
import { speakWithBrowserTts } from '@/api/tts';
import { clsx } from 'clsx';

interface QuizOption {
  meaning: string;
  isCorrect: boolean;
}

/** 生成 4 个选项（1 正确 + 3 干扰项） */
function generateOptions(currentItem: ReviewItem, bookId: string): QuizOption[] {
  const allWords = getWordsByBook(bookId);
  const correct: QuizOption = { meaning: currentItem.meaning_cn, isCorrect: true };

  // 从同词书随机选 3 个不同的干扰项
  const distractors: QuizOption[] = [];
  const used = new Set([currentItem.meaning_cn]);
  const candidates = allWords.filter((w) => !used.has(w.meaning_cn));

  // Fisher-Yates 打乱
  for (let i = candidates.length - 1; i > 0 && distractors.length < 3; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    const meaning = candidates[i].meaning_cn;
    if (!used.has(meaning)) {
      used.add(meaning);
      distractors.push({ meaning, isCorrect: false });
    }
  }

  // 打乱选项顺序
  const options = [correct, ...distractors];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

export function Quiz() {
  const activeBookId = useWordBookStore((s) => s.activeBookId);
  const shuffleWords = useSettingsStore((s) => s.shuffleWords);
  const autoPlayAudio = useSettingsStore((s) => s.autoPlayAudio);
  const navigate = useNavigate();

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [options, setOptions] = useState<QuizOption[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 生成复习队列
  useEffect(() => {
    if (!activeBookId) {
      setLoading(false);
      return;
    }
    setIdx(0);
    setFinished(false);
    setCorrectCount(0);
    setStreak(0);
    setLoading(true);
    (async () => {
      try {
        const queue = await generateReviewQueue(activeBookId, 200, shuffleWords);
        setItems(queue);
      } catch (e) {
        console.error('[quiz] generate queue failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeBookId, shuffleWords]);

  const currentItem = items[idx] ?? null;

  // 每题生成选项
  useEffect(() => {
    if (!currentItem || !activeBookId) return;
    setSelected(null);
    setOptions(generateOptions(currentItem, activeBookId));
    if (autoPlayAudio) {
      speakWithBrowserTts(currentItem.word, 'en-US').catch(() => {});
    }
  }, [currentItem, activeBookId, autoPlayAudio]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const playAudio = useCallback((word: string) => {
    speakWithBrowserTts(word, 'en-US').catch(() => {});
  }, []);

  async function handleSelect(optionIdx: number) {
    if (selected !== null || grading || !currentItem) return;
    setSelected(optionIdx);
    const isCorrect = options[optionIdx]?.isCorrect ?? false;

    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }

    // SRS 评分：答对→Good，答错→Again
    const grade = isCorrect ? Grade.Good : Grade.Again;
    setGrading(true);
    try {
      await reviewAndPersist(currentItem.wordId, currentItem.bookId, grade);
    } catch (e) {
      console.error('[quiz] review failed', e);
    } finally {
      setGrading(false);
      // 2 秒后进入下一题
      timerRef.current = setTimeout(() => {
        if (idx < items.length - 1) {
          setIdx((i) => i + 1);
        } else {
          setFinished(true);
        }
      }, 2000);
    }
  }

  // 键盘快捷键 1-4 选择选项
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (selected !== null || grading) return;
      if (e.key >= '1' && e.key <= '4') {
        const optionIdx = parseInt(e.key, 10) - 1;
        if (optionIdx < options.length) {
          handleSelect(optionIdx);
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, grading, options]);

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
        <p className="text-slate-500">暂无需要练习的单词</p>
        <Button variant="primary" onClick={() => navigate('/today')}>
          返回今日
        </Button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="max-w-md mx-auto mt-12 space-y-4">
        <div className="card-container p-6 md:p-8 text-center space-y-4 animate-fadeInScale">
          <div className="text-5xl animate-emptyBounce">Done</div>
          <h2 className="text-xl font-bold">选择题练习完成</h2>
          <p className="text-slate-500">
            共练习 <span className="font-bold text-brand-600">{items.length}</span> 题
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-xl font-bold text-green-500">{correctCount}</p>
              <p className="text-xs text-slate-500">答对</p>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <p className="text-xl font-bold text-orange-500">{items.length - correctCount}</p>
              <p className="text-xs text-slate-500">答错</p>
            </div>
            <div className="p-3 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
              <p className="text-xl font-bold text-brand-600">
                {Math.round((correctCount / items.length) * 100)}%
              </p>
              <p className="text-xs text-slate-500">正确率</p>
            </div>
          </div>
          <Button variant="primary" size="lg" onClick={() => navigate('/today')} className="w-full">
            返回今日
          </Button>
        </div>
      </div>
    );
  }

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

      {/* 题目卡片 */}
      <div key={idx} className="card-container p-6 md:p-8 animate-fadeInUp">
        {/* 单词显示 */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <h3 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-slate-100">
              {currentItem?.word}
            </h3>
            <button
              onClick={() => currentItem && playAudio(currentItem.word)}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
              title="朗读"
            >
              <svg className="w-5 h-5 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 010 7.07" />
                <path d="M19.07 4.93a10 10 0 010 14.14" />
              </svg>
            </button>
          </div>
          {currentItem?.phonetic && (
            <p className="text-sm text-slate-500">{currentItem.phonetic}</p>
          )}
          <p className="text-sm text-slate-400">选择正确的中文释义</p>
        </div>

        {/* 选项 */}
        <div className="mt-6 space-y-2 md:space-y-3">
          {options.map((opt, i) => {
            const isSelected = selected === i;
            const showResult = selected !== null;
            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                disabled={showResult}
                className={clsx(
                  'w-full text-left rounded-xl p-3 md:p-4 transition border-2',
                  !showResult && 'border-slate-200 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20',
                  showResult && opt.isCorrect && 'border-green-500 bg-green-50 dark:bg-green-900/20',
                  showResult && isSelected && !opt.isCorrect && 'border-red-500 bg-red-50 dark:bg-red-900/20',
                  showResult && !isSelected && !opt.isCorrect && 'border-slate-200 dark:border-slate-600 opacity-50',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm md:text-base text-slate-700 dark:text-slate-200">
                    {opt.meaning}
                  </span>
                  {showResult && opt.isCorrect && (
                    <span className="text-green-500 font-bold text-sm">正确</span>
                  )}
                  {showResult && isSelected && !opt.isCorrect && (
                    <span className="text-red-500 font-bold text-sm">错误</span>
                  )}
                  <span className="text-xs text-slate-400">{i + 1}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
