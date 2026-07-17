/**
 * 本地数据层 — 替代后端 Express + MySQL
 *
 * 所有学习数据存储在 localStorage 中，包括：
 *   - SRS 卡片状态 (srs_cards)
 *   - 复习日志 (review_logs)
 *   - 句子完成进度 (sentence_progress)
 *   - 句子位置 (sentence_position)
 *   - 句子熟知标记 (sentence_mastery)
 *   - 句子练习记录 (sentence_practice_log)
 *   - 用户设置 (user_settings)
 *   - 活跃词书 (active_book)
 *
 * SRS 调度算法使用 ts-fsrs 在浏览器本地计算，
 * 与原服务端逻辑保持一致。
 */

import {
  type Card,
  type RecordLogItem,
  createEmptyCard,
  fsrs,
  Rating,
} from 'ts-fsrs';
import type { StoredCard, ReviewLog } from '@/types';

/* ------------------------------------------------------------------ */
/* localStorage 键名                                                   */
/* ------------------------------------------------------------------ */

const KEYS = {
  SRS_CARDS: 'vf_srs_cards',
  REVIEW_LOGS: 'vf_review_logs',
  SENTENCE_PROGRESS: 'vf_sentence_progress',
  SENTENCE_POSITION: 'vf_sentence_position',
  SENTENCE_MASTERY: 'vf_sentence_mastery',
  SENTENCE_PRACTICE_LOG: 'vf_sentence_practice_log',
  SETTINGS: 'vf_settings',
  ACTIVE_BOOK: 'vf_active_book',
} as const;

/* ------------------------------------------------------------------ */
/* localStorage 读写工具                                               */
/* ------------------------------------------------------------------ */

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[localDb] 保存失败: ${key}`, e);
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* FSRS 引擎 (浏览器本地版)                                            */
/* ------------------------------------------------------------------ */

let _f: ReturnType<typeof fsrs> | null = null;

function getFsrs() {
  if (!_f) {
    _f = fsrs({
      request_retention: 0.9,
      enable_short_term: true,
      enable_fuzz: true,
      maximum_interval: 36500,
    });
  }
  return _f;
}

function toStoredCard(
  wordId: string,
  bookId: string,
  card: Card,
  lastGrade: number | null,
): StoredCard {
  return {
    wordId,
    bookId,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    state: card.state,
    due: card.due.toISOString(),
    reps: card.reps,
    lapses: card.lapses,
    lastGrade: lastGrade ?? null,
    updatedAt: new Date().toISOString(),
  };
}

function fromStoredCard(sc: StoredCard): Card {
  return {
    ...createEmptyCard(new Date()),
    stability: sc.stability,
    difficulty: sc.difficulty,
    reps: sc.reps,
    lapses: sc.lapses,
    state: sc.state as Card['state'],
    due: new Date(sc.due),
    last_review: sc.updatedAt ? new Date(sc.updatedAt) : null,
  } as Card;
}

function gradeToRating(grade: number): Rating {
  return (grade + 1) as Rating;
}

/* ------------------------------------------------------------------ */
/* SRS 卡片操作                                                        */
/* ------------------------------------------------------------------ */

/** 获取全部卡片 */
export function loadAllCards(): Record<string, StoredCard> {
  return loadJSON<Record<string, StoredCard>>(KEYS.SRS_CARDS, {});
}

/** 保存全部卡片 */
function saveAllCards(cards: Record<string, StoredCard>): void {
  saveJSON(KEYS.SRS_CARDS, cards);
}

/** 获取单张卡片 */
export function loadCard(wordId: string): StoredCard | null {
  const all = loadAllCards();
  return all[wordId] ?? null;
}

/** 评分并持久化（本地 FSRS 计算） */
export function reviewAndPersist(
  wordId: string,
  bookId: string,
  grade: number,
): StoredCard {
  const allCards = loadAllCards();
  const existing = allCards[wordId] ?? null;

  const card: Card = existing
    ? fromStoredCard(existing)
    : createEmptyCard(new Date());

  const f = getFsrs();
  const preview = f.repeat(card, new Date());
  const rating = gradeToRating(grade);
  const log = (preview as unknown as Record<number, RecordLogItem>)[rating];
  const nextCard = log.card;

  const stored = toStoredCard(wordId, bookId, nextCard, grade);
  allCards[wordId] = stored;
  saveAllCards(allCards);

  // 记录日志
  const logs = loadReviewLogs();
  logs.push({
    wordId,
    bookId,
    reviewedAt: new Date().toISOString(),
    grade,
  });
  saveReviewLogs(logs);

  return stored;
}

/** 撤销复习 */
export function undoReview(wordId: string): void {
  const allCards = loadAllCards();
  const card = allCards[wordId];
  if (!card) return;

  if (card.reps > 0) card.reps -= 1;
  card.due = new Date().toISOString();
  card.updatedAt = new Date().toISOString();
  allCards[wordId] = card;
  saveAllCards(allCards);

  // 删除最后一条该词的日志
  const logs = loadReviewLogs();
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].wordId === wordId) {
      logs.splice(i, 1);
      break;
    }
  }
  saveReviewLogs(logs);
}

/** 清除所有 SRS 数据 */
export function clearAllSrs(): void {
  saveAllCards({});
  saveReviewLogs([]);
}

/* ------------------------------------------------------------------ */
/* 复习日志                                                            */
/* ------------------------------------------------------------------ */

export function loadReviewLogs(): ReviewLog[] {
  return loadJSON<ReviewLog[]>(KEYS.REVIEW_LOGS, []);
}

function saveReviewLogs(logs: ReviewLog[]): void {
  saveJSON(KEYS.REVIEW_LOGS, logs);
}

/* ------------------------------------------------------------------ */
/* 句子完成进度                                                         */
/* ------------------------------------------------------------------ */

export type SentenceProgress = Record<string, number[]>;

export function loadSentenceProgress(): SentenceProgress {
  return loadJSON<SentenceProgress>(KEYS.SENTENCE_PROGRESS, {});
}

export function markSentenceComplete(
  band: number,
  topicIdx: number,
  dialogueIdx: number,
): void {
  const progress = loadSentenceProgress();
  const key = `${band}:${topicIdx}`;
  if (!progress[key]) progress[key] = [];
  if (!progress[key].includes(dialogueIdx)) {
    progress[key].push(dialogueIdx);
  }
  saveJSON(KEYS.SENTENCE_PROGRESS, progress);
}

/* ------------------------------------------------------------------ */
/* 句子位置                                                            */
/* ------------------------------------------------------------------ */

export interface SentencePosition {
  band: number;
  topicIdx: number;
  dialogueIdx: number;
}

export function loadSentencePosition(): SentencePosition | null {
  return loadJSON<SentencePosition | null>(KEYS.SENTENCE_POSITION, null);
}

export function saveSentencePosition(pos: SentencePosition): void {
  saveJSON(KEYS.SENTENCE_POSITION, pos);
}

/* ------------------------------------------------------------------ */
/* 句子熟知标记                                                         */
/* ------------------------------------------------------------------ */

export interface SentenceMasteryDetail {
  band: number;
  topicIdx: number;
  dialogueIdx: number;
  source: string;
  proficiency: number;
  pauseMs: number;
  tabCount: number;
  typoCount: number;
}

export interface SentenceMasteryResult {
  mastery: Record<string, number[]>;
  details: SentenceMasteryDetail[];
}

export function loadSentenceMastery(): SentenceMasteryResult {
  return loadJSON<SentenceMasteryResult>(KEYS.SENTENCE_MASTERY, {
    mastery: {},
    details: [],
  });
}

export function markSentenceMastery(params: {
  band: number;
  topicIdx: number;
  dialogueIdx: number;
  source?: string;
  proficiency?: number;
  pauseMs?: number;
  tabCount?: number;
  typoCount?: number;
}): void {
  const result = loadSentenceMastery();
  const key = `${params.band}:${params.topicIdx}`;

  if (!result.mastery[key]) result.mastery[key] = [];
  if (!result.mastery[key].includes(params.dialogueIdx)) {
    result.mastery[key].push(params.dialogueIdx);
  }

  // 更新或添加详情
  const detailIdx = result.details.findIndex(
    (d) =>
      d.band === params.band &&
      d.topicIdx === params.topicIdx &&
      d.dialogueIdx === params.dialogueIdx,
  );
  const detail: SentenceMasteryDetail = {
    band: params.band,
    topicIdx: params.topicIdx,
    dialogueIdx: params.dialogueIdx,
    source: params.source ?? 'manual',
    proficiency: params.proficiency ?? 100,
    pauseMs: params.pauseMs ?? 0,
    tabCount: params.tabCount ?? 0,
    typoCount: params.typoCount ?? 0,
  };
  if (detailIdx >= 0) {
    result.details[detailIdx] = detail;
  } else {
    result.details.push(detail);
  }

  saveJSON(KEYS.SENTENCE_MASTERY, result);
}

export function unmarkSentenceMastery(
  band: number,
  topicIdx: number,
  dialogueIdx: number,
): void {
  const result = loadSentenceMastery();
  const key = `${band}:${topicIdx}`;

  if (result.mastery[key]) {
    result.mastery[key] = result.mastery[key].filter((i) => i !== dialogueIdx);
    if (result.mastery[key].length === 0) delete result.mastery[key];
  }

  result.details = result.details.filter(
    (d) =>
      !(d.band === band && d.topicIdx === topicIdx && d.dialogueIdx === dialogueIdx),
  );

  saveJSON(KEYS.SENTENCE_MASTERY, result);
}

export function clearBandMastery(band: number): void {
  const result = loadSentenceMastery();

  // 清除该 band 的所有 mastery 条目
  for (const key of Object.keys(result.mastery)) {
    const [b] = key.split(':').map(Number);
    if (b === band) delete result.mastery[key];
  }

  // 清除该 band 的所有详情
  result.details = result.details.filter((d) => d.band !== band);

  saveJSON(KEYS.SENTENCE_MASTERY, result);
}

/* ------------------------------------------------------------------ */
/* 句子练习记录                                                         */
/* ------------------------------------------------------------------ */

export interface SentencePracticeRecord {
  id: number;
  band: number;
  topicIdx: number;
  dialogueIdx: number;
  proficiency: number;
  pauseMs: number;
  tabCount: number;
  typoCount: number;
  practicedAt: string;
}

let _practiceIdSeq = 0;

function loadSentencePracticeLog(): SentencePracticeRecord[] {
  const log = loadJSON<SentencePracticeRecord[]>(KEYS.SENTENCE_PRACTICE_LOG, []);
  // 更新 ID 序列
  _practiceIdSeq = log.reduce((max, r) => Math.max(max, r.id), 0);
  return log;
}

function saveSentencePracticeLog(log: SentencePracticeRecord[]): void {
  saveJSON(KEYS.SENTENCE_PRACTICE_LOG, log);
}

export function logSentencePractice(params: {
  band: number;
  topicIdx: number;
  dialogueIdx: number;
  proficiency?: number;
  pauseMs?: number;
  tabCount?: number;
  typoCount?: number;
}): void {
  const log = loadSentencePracticeLog();
  _practiceIdSeq++;
  log.push({
    id: _practiceIdSeq,
    band: params.band,
    topicIdx: params.topicIdx,
    dialogueIdx: params.dialogueIdx,
    proficiency: params.proficiency ?? 0,
    pauseMs: params.pauseMs ?? 0,
    tabCount: params.tabCount ?? 0,
    typoCount: params.typoCount ?? 0,
    practicedAt: new Date().toISOString(),
  });
  saveSentencePracticeLog(log);
}

/* ------------------------------------------------------------------ */
/* 句子统计                                                            */
/* ------------------------------------------------------------------ */

export interface SentenceStats {
  learnedSentences: number;
  totalPractices: number;
  streakDays: number;
  practicedToday: number;
  avgProficiency: number;
}

export function getSentenceStats(): SentenceStats {
  const log = loadSentencePracticeLog();
  const progress = loadSentenceProgress();

  // 已学句子数 (distinct band:topic:dialogue from practice log + progress)
  const learnedSet = new Set<string>();
  for (const r of log) {
    learnedSet.add(`${r.band}:${r.topicIdx}:${r.dialogueIdx}`);
  }
  for (const [key, indices] of Object.entries(progress)) {
    const [band, topicIdx] = key.split(':').map(Number);
    for (const dialogueIdx of indices) {
      learnedSet.add(`${band}:${topicIdx}:${dialogueIdx}`);
    }
  }

  // 总练习次数
  const totalPractices = log.length;

  // 坚持天数
  const activityDates = new Set<string>();
  for (const r of log) {
    const d = new Date(r.practicedAt);
    if (!isNaN(d.getTime())) {
      activityDates.add(d.toISOString().slice(0, 10));
    }
  }

  const now = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    if (activityDates.has(dateStr)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  // 今日练习次数
  const todayStr = new Date().toISOString().slice(0, 10);
  const practicedToday = log.filter(
    (r) => r.practicedAt.slice(0, 10) === todayStr,
  ).length;

  // 平均熟练度
  const avgProficiency =
    log.length > 0
      ? Math.round(log.reduce((sum, r) => sum + r.proficiency, 0) / log.length)
      : 0;

  return {
    learnedSentences: learnedSet.size,
    totalPractices,
    streakDays: streak,
    practicedToday,
    avgProficiency,
  };
}

/* ------------------------------------------------------------------ */
/* 熟练度历史                                                           */
/* ------------------------------------------------------------------ */

export interface SentenceProficiencyDaily {
  date: string;
  avgProficiency: number;
  count: number;
}

export interface SentenceProficiencyHistory {
  daily: SentenceProficiencyDaily[];
  recent: SentencePracticeRecord[];
}

export function getProficiencyHistory(): SentenceProficiencyHistory {
  const log = loadSentencePracticeLog();

  // 近30天每日平均熟练度
  const dailyMap = new Map<string, { sum: number; count: number }>();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  for (const r of log) {
    const d = new Date(r.practicedAt);
    if (d < thirtyDaysAgo) continue;
    const dateStr = d.toISOString().slice(0, 10);
    const existing = dailyMap.get(dateStr) ?? { sum: 0, count: 0 };
    existing.sum += r.proficiency;
    existing.count++;
    dailyMap.set(dateStr, existing);
  }

  const daily: SentenceProficiencyDaily[] = [];
  for (const [date, { sum, count }] of dailyMap) {
    daily.push({
      date,
      avgProficiency: Math.round(sum / count),
      count,
    });
  }
  daily.sort((a, b) => a.date.localeCompare(b.date));

  // 近50条练习记录 (倒序)
  const recent = [...log]
    .sort((a, b) => new Date(b.practicedAt).getTime() - new Date(a.practicedAt).getTime())
    .slice(0, 50);

  return { daily, recent };
}

/* ------------------------------------------------------------------ */
/* 用户设置                                                            */
/* ------------------------------------------------------------------ */

export interface LocalSettings {
  theme?: string;
  autoPlayAudio?: boolean;
  srsRetention?: number;
  keyboardLayout?: string;
  shuffleWords?: boolean;
}

export function loadSettings(): LocalSettings {
  return loadJSON<LocalSettings>(KEYS.SETTINGS, {});
}

export function saveSettings(settings: LocalSettings): void {
  saveJSON(KEYS.SETTINGS, settings);
}

/* ------------------------------------------------------------------ */
/* 活跃词书                                                            */
/* ------------------------------------------------------------------ */

export function loadActiveBook(): string | null {
  return loadJSON<string | null>(KEYS.ACTIVE_BOOK, null);
}

export function saveActiveBook(bookId: string): void {
  saveJSON(KEYS.ACTIVE_BOOK, bookId);
}

export function clearActiveBook(): void {
  saveJSON(KEYS.ACTIVE_BOOK, null);
}

/* ------------------------------------------------------------------ */
/* 句子位置智能查找 (替代后端 position 查询)                            */
/* ------------------------------------------------------------------ */

/**
 * 获取下一个未完成句子位置。
 * 如果有结构信息，从已保存位置开始搜索第一个未完成的句子。
 */
export function findNextSentencePosition(
  structure?: Array<{ band: number; topics: number[] }>,
): SentencePosition | null {
  const savedPos = loadSentencePosition();
  const progress = loadSentenceProgress();

  // 构建已完成集合
  const completedSet = new Set<string>();
  for (const [key, indices] of Object.entries(progress)) {
    const [band, topicIdx] = key.split(':').map(Number);
    for (const dialogueIdx of indices) {
      completedSet.add(`${band}:${topicIdx}:${dialogueIdx}`);
    }
  }

  // 如果没有结构信息，返回原始位置或 null
  if (!structure || structure.length === 0) {
    return savedPos;
  }

  // 起始搜索位置
  let startBandIdx = 0;
  let startTopicIdx = 0;
  let startDialogueIdx = 0;

  if (savedPos) {
    startBandIdx = structure.findIndex((b) => b.band === savedPos.band);
    if (startBandIdx === -1) startBandIdx = 0;
    startTopicIdx = savedPos.topicIdx;
    startDialogueIdx = savedPos.dialogueIdx;
  }

  // 从起始位置向后搜索第一个未完成的句子
  for (let bi = startBandIdx; bi < structure.length; bi++) {
    const bandInfo = structure[bi];
    const topicStart = bi === startBandIdx ? startTopicIdx : 0;
    for (let ti = topicStart; ti < bandInfo.topics.length; ti++) {
      const dialogueCount = bandInfo.topics[ti];
      const dialogueStart =
        bi === startBandIdx && ti === startTopicIdx ? startDialogueIdx : 0;
      for (let di = dialogueStart; di < dialogueCount; di++) {
        const key = `${bandInfo.band}:${ti}:${di}`;
        if (!completedSet.has(key)) {
          return {
            band: bandInfo.band,
            topicIdx: ti,
            dialogueIdx: di,
          };
        }
      }
    }
  }

  // 所有句子都已完成，返回第一个
  if (structure.length > 0) {
    return {
      band: structure[0].band,
      topicIdx: 0,
      dialogueIdx: 0,
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* 导出 / 导入                                                         */
/* ------------------------------------------------------------------ */

/** 导出所有学习数据为单个对象 */
export function exportAllData(): Record<string, unknown> {
  return {
    version: 2,
    exportDate: new Date().toISOString(),
    srs_cards: loadAllCards(),
    review_logs: loadReviewLogs(),
    sentence_progress: loadSentenceProgress(),
    sentence_position: loadSentencePosition(),
    sentence_mastery: loadSentenceMastery(),
    sentence_practice_log: loadSentencePracticeLog(),
    settings: loadSettings(),
    active_book: loadActiveBook(),
    // 保留 v1 格式兼容的键
    vf_reminder_enabled: localStorage.getItem('vf_reminder_enabled'),
    vf_reminder_time: localStorage.getItem('vf_reminder_time'),
    vf_last_reminder_date: localStorage.getItem('vf_last_reminder_date'),
  };
}

/** 导出数据并触发下载 */
export function downloadExportData(): void {
  const data = exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vocabflow-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 从导入数据恢复所有学习记录 */
export function importAllData(data: Record<string, unknown>): void {
  if (!data || typeof data !== 'object') {
    throw new Error('无效的数据格式');
  }

  // 兼容 v1 和 v2 格式
  const srsCards = (data.srs_cards ?? data.vf_srs_cards) as Record<string, StoredCard> | undefined;
  const reviewLogs = (data.review_logs ?? data.vf_review_logs) as ReviewLog[] | undefined;
  const sentenceProgress = (data.sentence_progress ?? data.vf_sentence_progress) as SentenceProgress | undefined;
  const sentencePosition = (data.sentence_position ?? data.vf_sentence_position) as SentencePosition | undefined;
  const sentenceMastery = (data.sentence_mastery ?? data.vf_sentence_mastery) as SentenceMasteryResult | undefined;
  const sentencePracticeLog = (data.sentence_practice_log ?? data.vf_sentence_practice_log) as SentencePracticeRecord[] | undefined;
  const settings = (data.settings ?? data.vf_settings) as LocalSettings | undefined;
  const activeBook = (data.active_book ?? data.vf_active_book) as string | null | undefined;

  if (srsCards) saveAllCards(srsCards);
  if (reviewLogs) saveReviewLogs(reviewLogs);
  if (sentenceProgress) saveJSON(KEYS.SENTENCE_PROGRESS, sentenceProgress);
  if (sentencePosition !== undefined) saveJSON(KEYS.SENTENCE_POSITION, sentencePosition ?? null);
  if (sentenceMastery) saveJSON(KEYS.SENTENCE_MASTERY, sentenceMastery);
  if (sentencePracticeLog) saveSentencePracticeLog(sentencePracticeLog);
  if (settings) saveSettings(settings);
  if (activeBook !== undefined) saveJSON(KEYS.ACTIVE_BOOK, activeBook ?? null);

  // 导入提醒设置
  if (data.vf_reminder_enabled !== undefined && data.vf_reminder_enabled !== null) {
    localStorage.setItem('vf_reminder_enabled', String(data.vf_reminder_enabled));
  }
  if (data.vf_reminder_time !== undefined && data.vf_reminder_time !== null) {
    localStorage.setItem('vf_reminder_time', String(data.vf_reminder_time));
  }
  if (data.vf_last_reminder_date !== undefined && data.vf_last_reminder_date !== null) {
    localStorage.setItem('vf_last_reminder_date', String(data.vf_last_reminder_date));
  }
}

/** 清除所有学习数据 */
export function clearAllData(): void {
  localStorage.removeItem(KEYS.SRS_CARDS);
  localStorage.removeItem(KEYS.REVIEW_LOGS);
  localStorage.removeItem(KEYS.SENTENCE_PROGRESS);
  localStorage.removeItem(KEYS.SENTENCE_POSITION);
  localStorage.removeItem(KEYS.SENTENCE_MASTERY);
  localStorage.removeItem(KEYS.SENTENCE_PRACTICE_LOG);
  localStorage.removeItem(KEYS.SETTINGS);
  localStorage.removeItem(KEYS.ACTIVE_BOOK);
}
