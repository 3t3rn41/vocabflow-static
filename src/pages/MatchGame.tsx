/**
 * 配对游戏模式 — 2.1.4
 *
 * 屏幕展示 6-8 个单词和对应释义（打乱排列），
 * 用户通过点击将它们配对。
 * 配对正确消失，配对错误抖动反馈。
 * 限时模式：60 秒内配对尽可能多。
 * 统计正确率，正确率影响 SRS 评分。
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWordBookStore } from '@/stores/wordBook';
import { Grade } from '@/types';
import type { ReviewItem } from '@/types';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { generateReviewQueue, reviewAndPersist } from '@/srs/engine';
import { speakWithBrowserTts } from '@/api/tts';
import { clsx } from 'clsx';

const ROUND_SIZE = 6;
const TIME_LIMIT = 60;

interface Card {
  id: string;
  text: string;
  wordId: string;
  bookId: string;
  matched: boolean;
  wrong: boolean;
}

type GameState = 'loading' | 'playing' | 'finished';

export function MatchGame() {
  const activeBookId = useWordBookStore((s) => s.activeBookId);
  const navigate = useNavigate();

  const [state, setState] = useState<GameState>('loading');
  const [wordCards, setWordCards] = useState<Card[]>([]);
  const [meaningCards, setMeaningCards] = useState<Card[]>([]);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedMeaning, setSelectedMeaning] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [totalRounds, setTotalRounds] = useState(0);
  const [correctMatches, setCorrectMatches] = useState(0);
  const [wrongMatches, setWrongMatches] = useState(0);
  const [allItems, setAllItems] = useState<ReviewItem[]>([]);
  const [reviewedItems, setReviewedItems] = useState<Set<string>>(new Set());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载复习队列
  useEffect(() => {
    if (!activeBookId) {
      setState('loading');
      return;
    }
    (async () => {
      try {
        const queue = await generateReviewQueue(activeBookId, 200, true);
        setAllItems(queue);
        startRound(queue.slice(0, ROUND_SIZE));
      } catch (e) {
        console.error('[match] generate queue failed', e);
        setState('finished');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBookId]);

  // 开始一轮
  function startRound(items: ReviewItem[]) {
    const words: Card[] = items.map((item) => ({
      id: `word-${item.wordId}`,
      text: item.word,
      wordId: item.wordId,
      bookId: item.bookId,
      matched: false,
      wrong: false,
    }));

    const meanings: Card[] = items.map((item) => ({
      id: `meaning-${item.wordId}`,
      text: item.meaning_cn,
      wordId: item.wordId,
      bookId: item.bookId,
      matched: false,
      wrong: false,
    }));

    // 打乱释义顺序
    for (let i = meanings.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [meanings[i], meanings[j]] = [meanings[j], meanings[i]];
    }

    setWordCards(words);
    setMeaningCards(meanings);
    setSelectedWord(null);
    setSelectedMeaning(null);
    setState('playing');
    setTimeLeft(TIME_LIMIT);
    setTotalRounds((r) => r + 1);
  }

  // 倒计时
  useEffect(() => {
    if (state !== 'playing') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          setState('finished');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  // 处理配对
  useEffect(() => {
    if (selectedWord && selectedMeaning) {
      const wordCard = wordCards.find((c) => c.id === selectedWord);
      const meaningCard = meaningCards.find((c) => c.id === selectedMeaning);

      if (wordCard && meaningCard) {
        if (wordCard.wordId === meaningCard.wordId) {
          // 配对正确
          setCorrectMatches((c) => c + 1);
          setWordCards((cards) =>
            cards.map((c) => (c.id === selectedWord ? { ...c, matched: true } : c)),
          );
          setMeaningCards((cards) =>
            cards.map((c) => (c.id === selectedMeaning ? { ...c, matched: true } : c)),
          );
          setReviewedItems((prev) => new Set(prev).add(wordCard.wordId));
          // 播放音频
          speakWithBrowserTts(wordCard.text, 'en-US').catch(() => {});
        } else {
          // 配对错误
          setWrongMatches((w) => w + 1);
          setWordCards((cards) =>
            cards.map((c) => (c.id === selectedWord ? { ...c, wrong: true } : c)),
          );
          setMeaningCards((cards) =>
            cards.map((c) => (c.id === selectedMeaning ? { ...c, wrong: true } : c)),
          );
          setTimeout(() => {
            setWordCards((cards) =>
              cards.map((c) => (c.id === selectedWord ? { ...c, wrong: false } : c)),
            );
            setMeaningCards((cards) =>
              cards.map((c) => (c.id === selectedMeaning ? { ...c, wrong: false } : c)),
            );
          }, 500);
        }
      }
      setSelectedWord(null);
      setSelectedMeaning(null);
    }
  }, [selectedWord, selectedMeaning, wordCards, meaningCards]);

  // 检查是否全部配对完成
  useEffect(() => {
    if (state !== 'playing') return;
    const allMatched = wordCards.length > 0 && wordCards.every((c) => c.matched);
    if (allMatched) {
      // 延迟后开始下一轮
      setTimeout(() => {
        const nextItems = allItems.slice(
          totalRounds * ROUND_SIZE,
          (totalRounds + 1) * ROUND_SIZE,
        );
        if (nextItems.length >= 3) {
          startRound(nextItems);
        } else {
          setState('finished');
        }
      }, 1000);
    }
  }, [wordCards, state, allItems, totalRounds]);

  // 游戏结束后 SRS 评分
  useEffect(() => {
    if (state !== 'finished') return;
    const totalAttempts = correctMatches + wrongMatches;
    const accuracy = totalAttempts > 0 ? correctMatches / totalAttempts : 0;
    // 根据正确率评分
    const grade = accuracy >= 0.8 ? Grade.Good : accuracy >= 0.5 ? Grade.Hard : Grade.Again;
    // 对所有练习过的词进行 SRS 评分
    (async () => {
      for (const wordId of reviewedItems) {
        const item = allItems.find((i) => i.wordId === wordId);
        if (item) {
          try {
            await reviewAndPersist(item.wordId, item.bookId, grade);
          } catch (e) {
            console.error('[match] review failed', e);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === 'loading' || !activeBookId) {
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
    return (
      <div className="h-full flex items-center justify-center gap-3">
        <Spinner size="lg" />
        <span className="text-slate-500">加载中...</span>
      </div>
    );
  }

  if (state === 'finished') {
    const totalAttempts = correctMatches + wrongMatches;
    const accuracy = totalAttempts > 0 ? Math.round((correctMatches / totalAttempts) * 100) : 0;
    return (
      <div className="max-w-md mx-auto mt-12 space-y-4">
        <div className="card-container p-6 md:p-8 text-center space-y-4 animate-fadeInScale">
          <div className="text-5xl animate-emptyBounce">Done</div>
          <h2 className="text-xl font-bold">配对游戏结束</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-xl font-bold text-green-500">{correctMatches}</p>
              <p className="text-xs text-slate-500">配对正确</p>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <p className="text-xl font-bold text-orange-500">{wrongMatches}</p>
              <p className="text-xs text-slate-500">配对错误</p>
            </div>
            <div className="p-3 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
              <p className="text-xl font-bold text-brand-600">{accuracy}%</p>
              <p className="text-xs text-slate-500">正确率</p>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            共练习 {reviewedItems.size} 个单词，完成 {totalRounds} 轮
          </p>
          <div className="flex gap-3">
            <Button variant="primary" size="lg" onClick={() => window.location.reload()} className="flex-1">
              再玩一轮
            </Button>
            <Button variant="ghost" size="lg" onClick={() => navigate('/today')} className="flex-1">
              返回今日
            </Button>
          </div>
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
        <div className="flex items-center gap-4">
          <span className={clsx(
            'text-sm font-bold tabular-nums',
            timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-brand-600',
          )}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
          <span className="text-sm text-slate-500">
            轮次 {totalRounds}
          </span>
        </div>
      </div>

      {/* 统计栏 */}
      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <span className="text-lg font-bold text-green-500">{correctMatches}</span>
          <span className="text-xs text-slate-500 ml-1">正确</span>
        </div>
        <div className="text-center">
          <span className="text-lg font-bold text-orange-500">{wrongMatches}</span>
          <span className="text-xs text-slate-500 ml-1">错误</span>
        </div>
      </div>

      {/* 游戏区域 */}
      <div className="card-container p-4 md:p-6">
        <p className="text-center text-sm text-slate-400 mb-4">
          点击单词，再点击对应的中文释义进行配对
        </p>
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          {/* 单词列 */}
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs text-slate-400 font-medium text-center">English</p>
            {wordCards.map((card) => (
              <button
                key={card.id}
                onClick={() => !card.matched && setSelectedWord(card.id)}
                disabled={card.matched}
                className={clsx(
                  'w-full rounded-xl p-3 md:p-4 text-center transition border-2',
                  card.matched && 'opacity-20 border-transparent',
                  !card.matched && selectedWord === card.id && 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 scale-105',
                  !card.matched && selectedWord !== card.id && 'border-slate-200 dark:border-slate-600 hover:border-brand-300',
                  card.wrong && 'border-red-500 bg-red-50 dark:bg-red-900/20 animate-shake',
                )}
              >
                <span className="text-sm md:text-base font-medium text-slate-700 dark:text-slate-200">
                  {card.text}
                </span>
              </button>
            ))}
          </div>

          {/* 释义列 */}
          <div className="space-y-2 md:space-y-3">
            <p className="text-xs text-slate-400 font-medium text-center">中文</p>
            {meaningCards.map((card) => (
              <button
                key={card.id}
                onClick={() => !card.matched && setSelectedMeaning(card.id)}
                disabled={card.matched}
                className={clsx(
                  'w-full rounded-xl p-3 md:p-4 text-center transition border-2',
                  card.matched && 'opacity-20 border-transparent',
                  !card.matched && selectedMeaning === card.id && 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 scale-105',
                  !card.matched && selectedMeaning !== card.id && 'border-slate-200 dark:border-slate-600 hover:border-brand-300',
                  card.wrong && 'border-red-500 bg-red-50 dark:bg-red-900/20 animate-shake',
                )}
              >
                <span className="text-sm md:text-base text-slate-700 dark:text-slate-200">
                  {card.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
