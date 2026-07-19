/**
 * 生词本 / 收藏夹页面 — 2.2.2
 *
 * 展示所有收藏单词，支持移除和独立复习模式（仅复习收藏的词）。
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFavorites, removeFavorite, type FavoriteEntry } from '@/utils/favorites';
import { Button } from '@/components/ui/Button';
import { speakWithBrowserTts } from '@/api/tts';

export function Favorites() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    setFavorites(getFavorites());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRemove(wordId: string) {
    removeFavorite(wordId);
    load();
  }

  function handlePlay(word: string) {
    speakWithBrowserTts(word, 'en-US').catch(() => {});
  }

  const filtered = filter.trim()
    ? favorites.filter(
        (f) =>
          f.word.toLowerCase().includes(filter.trim().toLowerCase()) ||
          f.meaning_cn.includes(filter.trim()),
      )
    : favorites;

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
        <span className="text-sm text-slate-500">
          共 {favorites.length} 词
        </span>
      </div>

      {/* 标题 */}
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-bold">生词本</h2>
        <p className="text-sm text-slate-500 mt-1">收藏的难点词汇，集中攻克</p>
      </div>

      {/* 搜索框 */}
      {favorites.length > 0 && (
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input-base"
          placeholder="搜索单词或释义..."
          autoComplete="off"
        />
      )}

      {/* 操作按钮 */}
      {favorites.length > 0 && (
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/review?favorites=true')}
            className="flex-1"
          >
            复习生词本
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/quiz?favorites=true')}
            className="flex-1"
          >
            选择题练习
          </Button>
        </div>
      )}

      {/* 收藏列表 */}
      {favorites.length === 0 ? (
        <div className="card-container p-8 md:p-12 text-center space-y-4 animate-fadeInScale">
          <div className="text-4xl text-slate-300">Star</div>
          <p className="text-slate-500">还没有收藏的单词</p>
          <p className="text-xs text-slate-400">在词库浏览或复习时，点击星标按钮可添加到生词本</p>
          <Button variant="primary" size="sm" onClick={() => navigate('/words')}>
            去词库看看
          </Button>
        </div>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {filtered.map((fav, i) => (
            <div
              key={fav.wordId}
              className="card-container p-3 md:p-4 flex items-center gap-3 animate-stagger"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* 单词 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base md:text-lg text-slate-800 dark:text-slate-100">
                    {fav.word}
                  </span>
                  <button
                    onClick={() => handlePlay(fav.word)}
                    className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
                    title="朗读"
                  >
                    <svg className="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M15.54 8.46a5 5 0 010 7.07" />
                      <path d="M19.07 4.93a10 10 0 010 14.14" />
                    </svg>
                  </button>
                </div>
                <p className="text-sm text-slate-500 truncate mt-0.5">{fav.meaning_cn}</p>
              </div>

              {/* 来源词书标签 */}
              <span className="hidden sm:inline-block text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                {fav.bookId}
              </span>

              {/* 移除按钮 */}
              <button
                onClick={() => handleRemove(fav.wordId)}
                className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition shrink-0"
                title="移除"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
          ))}
          {filtered.length === 0 && filter.trim() && (
            <div className="text-center text-sm text-slate-400 py-8">
              没有找到匹配的单词
            </div>
          )}
        </div>
      )}
    </div>
  );
}
