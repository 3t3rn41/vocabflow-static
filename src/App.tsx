import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSettingsStore, applyCardTheme } from '@/stores/settings';
import { useWordBookStore } from '@/stores/wordBook';
import { AppLayout } from '@/components/layout/AppLayout';
import { WordBookSelection } from '@/pages/WordBookSelection';
import { Today } from '@/pages/Today';
import { Review } from '@/pages/Review';
import { Words } from '@/pages/Words';
import { WordDetail } from '@/pages/WordDetail';
import { Sentences } from '@/pages/Sentences';
import { Settings } from '@/pages/Settings';
import { Dictation } from '@/pages/Dictation';
import { Spelling } from '@/pages/Spelling';
import { Quiz } from '@/pages/Quiz';
import { Translate } from '@/pages/Translate';
import { MatchGame } from '@/pages/MatchGame';
import { Favorites } from '@/pages/Favorites';
import { AudioDebug } from '@/pages/AudioDebug';
import { ToastContainer } from '@/components/ui/Toast';
import { Spinner } from '@/components/ui/Spinner';
import { useStudyReminder } from '@/hooks/useStudyReminder';

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const cardTheme = useSettingsStore((s) => s.cardTheme);
  const settingsLoading = useSettingsStore((s) => s.loading);
  const bookLoading = useWordBookStore((s) => s.loading);
  const hasSelectedBook = useWordBookStore((s) => s.hasSelectedBook);
  const initSettings = useSettingsStore((s) => s.init);
  const initBook = useWordBookStore((s) => s.init);

  // 学习提醒（浏览器通知）
  useStudyReminder();

  // 启动时初始化
  useEffect(() => {
    initSettings();
    initBook();
  }, [initSettings, initBook]);

  // 应用主题
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mq.matches);
      root.classList.toggle('dark', isDark);
    };
    apply();
    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  // 应用卡片皮肤
  useEffect(() => {
    applyCardTheme(cardTheme);
  }, [cardTheme]);

  // 等待设置和词书数据加载完成
  if (settingsLoading || bookLoading) {
    return (
      <div className="h-screen flex items-center justify-center gap-3 px-4">
        <Spinner size="lg" />
        <span className="text-slate-500 text-sm md:text-base">加载中...</span>
      </div>
    );
  }

  if (!hasSelectedBook) {
    return (
      <>
        <WordBookSelection />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/today" element={<Today />} />
          <Route path="/review" element={<Review />} />
          <Route path="/words" element={<Words />} />
          <Route path="/words/:id" element={<WordDetail />} />
          <Route path="/sentences" element={<Sentences />} />
          <Route path="/dictation" element={<Dictation />} />
          <Route path="/spelling" element={<Spelling />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/translate" element={<Translate />} />
          <Route path="/match" element={<MatchGame />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audio-debug" element={<AudioDebug />} />
          <Route path="/select-book" element={<WordBookSelection />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
      <ToastContainer />
    </>
  );
}
