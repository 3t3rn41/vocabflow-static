/**
 * API 客户端 — 静态网页版（本地存储）
 *
 * 原版本通过 HTTP 请求发送到 Express + MySQL 后端。
 * 静态版将所有数据存储在 localStorage 中，无需后端服务。
 * 所有接口保持与原版兼容，仅将 HTTP 调用替换为本地读写。
 */

import type { StoredCard, ReviewLog } from '@/types';
import {
  loadAllCards as _loadAllCards,
  reviewAndPersist as _reviewAndPersist,
  undoReview as _undoReview,
  clearAllSrs as _clearAllSrs,
  loadReviewLogs as _loadReviewLogs,
  loadSentenceProgress as _loadSentenceProgress,
  markSentenceComplete as _markSentenceComplete,
  findNextSentencePosition as _findNextSentencePosition,
  saveSentencePosition as _saveSentencePosition,
  loadSentenceMastery as _loadSentenceMastery,
  markSentenceMastery as _markSentenceMastery,
  unmarkSentenceMastery as _unmarkSentenceMastery,
  clearBandMastery as _clearBandMastery,
  logSentencePractice as _logSentencePractice,
  getSentenceStats as _getSentenceStats,
  getProficiencyHistory as _getProficiencyHistory,
  loadSettings as _loadSettings,
  saveSettings as _saveSettings,
  loadActiveBook as _loadActiveBook,
  saveActiveBook as _saveActiveBook,
  clearActiveBook as _clearActiveBook,
  exportAllData as _exportAllData,
  downloadExportData as _downloadExportData,
  importAllData as _importAllData,
  clearAllData as _clearAllData,
  type SentenceProgress,
  type SentencePosition,
  type SentenceMasteryDetail,
  type SentenceMasteryResult,
  type SentenceStats,
  type SentenceProficiencyDaily,
  type SentencePracticeRecord,
  type SentenceProficiencyHistory,
  type LocalSettings,
} from '@/lib/localDb';

/* ------------------------------------------------------------------ */
/* Token 管理 — 静态版无需认证，保留接口兼容                            */
/* ------------------------------------------------------------------ */

const TOKEN_KEY = 'vocabflow_token';

/** 获取本地存储的 JWT Token（静态版始终返回 null） */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** 保存 JWT Token（静态版 no-op） */
export function setToken(_token: string): void {
  // 静态版无需认证，保留接口兼容
}

/** 清除 JWT Token */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/* ------------------------------------------------------------------ */
/* 401 回调 — 静态版无需处理                                            */
/* ------------------------------------------------------------------ */

let _onUnauthorized: (() => void) | null = null;

/** 注册 401 回调 (静态版 no-op，保留接口兼容) */
export function onUnauthorized(cb: () => void): void {
  _onUnauthorized = cb;
}

/* ------------------------------------------------------------------ */
/* 认证 API — 静态版自动登录                                            */
/* ------------------------------------------------------------------ */

export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  /** 注册 — 静态版直接返回本地用户 */
  register: async (username: string, _password: string): Promise<AuthResponse> => {
    return {
      token: 'static-local-token',
      user: { id: 1, username: username || '学习者' },
    };
  },

  /** 登录 — 静态版直接返回本地用户 */
  login: async (username: string, _password: string): Promise<AuthResponse> => {
    return {
      token: 'static-local-token',
      user: { id: 1, username: username || '学习者' },
    };
  },

  /** 获取当前用户信息 — 静态版返回固定用户 */
  me: async (): Promise<{ user: AuthUser }> => {
    return {
      user: { id: 1, username: '学习者' },
    };
  },
};

/* ------------------------------------------------------------------ */
/* SRS API — 本地存储实现                                               */
/* ------------------------------------------------------------------ */

export const srsApi = {
  /** 获取全部卡片 */
  getAllCards: async (): Promise<Record<string, StoredCard>> => {
    return _loadAllCards();
  },

  /** 评分 */
  review: async (wordId: string, bookId: string, grade: number): Promise<StoredCard> => {
    return _reviewAndPersist(wordId, bookId, grade);
  },

  /** 获取复习日志 */
  getLogs: async (): Promise<ReviewLog[]> => {
    return _loadReviewLogs();
  },

  /** 撤销 */
  undo: async (wordId: string): Promise<{ ok: boolean }> => {
    _undoReview(wordId);
    return { ok: true };
  },

  /** 清除所有 SRS 数据 */
  clearAll: async (): Promise<{ ok: boolean }> => {
    _clearAllSrs();
    return { ok: true };
  },

  /** 词书统计 */
  getStats: async (bookId: string): Promise<{ total: number; learned: number; due: number }> => {
    // 由 srs/engine.ts 本地计算，此处返回空让引擎补充
    return { total: 0, learned: 0, due: 0 };
  },

  /** 今日进度 */
  getTodayProgress: async (bookId: string): Promise<{ dueCount: number; newCount: number; finishedToday: number }> => {
    // 由 srs/engine.ts 本地计算
    return { dueCount: 0, newCount: 20, finishedToday: 0 };
  },
};

/* ------------------------------------------------------------------ */
/* 句子练习 API — 本地存储实现                                           */
/* ------------------------------------------------------------------ */

export type { SentenceProgress, SentencePosition, SentenceMasteryDetail, SentenceMasteryResult, SentenceStats, SentenceProficiencyDaily, SentencePracticeRecord as SentenceProficiencyRecord, SentenceProficiencyHistory };

export const sentenceApi = {
  /** 加载句子完成进度 */
  getProgress: async (): Promise<SentenceProgress> => {
    return _loadSentenceProgress();
  },

  /** 标记句子完成 */
  markComplete: async (band: number, topicIdx: number, dialogueIdx: number): Promise<{ ok: boolean }> => {
    _markSentenceComplete(band, topicIdx, dialogueIdx);
    return { ok: true };
  },

  /** 加载下一个未完成句子位置 */
  getPosition: async (structure?: Array<{ band: number; topics: number[] }>): Promise<SentencePosition | null> => {
    return _findNextSentencePosition(structure);
  },

  /** 保存当前位置 */
  savePosition: async (pos: SentencePosition): Promise<{ ok: boolean }> => {
    _saveSentencePosition(pos);
    return { ok: true };
  },

  /** 加载所有熟知标记 */
  getMastery: async (): Promise<SentenceMasteryResult> => {
    return _loadSentenceMastery();
  },

  /** 标记句子为熟知 */
  markMastery: async (params: {
    band: number;
    topicIdx: number;
    dialogueIdx: number;
    source?: string;
    proficiency?: number;
    pauseMs?: number;
    tabCount?: number;
    typoCount?: number;
  }): Promise<{ ok: boolean }> => {
    _markSentenceMastery(params);
    return { ok: true };
  },

  /** 取消句子熟知标记 */
  unmarkMastery: async (band: number, topicIdx: number, dialogueIdx: number): Promise<{ ok: boolean }> => {
    _unmarkSentenceMastery(band, topicIdx, dialogueIdx);
    return { ok: true };
  },

  /** 清除某 band 的所有熟知标记 */
  clearBandMastery: async (band: number): Promise<{ ok: boolean }> => {
    _clearBandMastery(band);
    return { ok: true };
  },

  /** 记录一次句子练习 */
  logPractice: async (params: {
    band: number;
    topicIdx: number;
    dialogueIdx: number;
    proficiency?: number;
    pauseMs?: number;
    tabCount?: number;
    typoCount?: number;
  }): Promise<{ ok: boolean }> => {
    _logSentencePractice(params);
    return { ok: true };
  },

  /** 获取句子练习统计 */
  getStats: async (): Promise<SentenceStats> => {
    return _getSentenceStats();
  },

  /** 获取熟练度历史 */
  getProficiencyHistory: async (): Promise<SentenceProficiencyHistory> => {
    return _getProficiencyHistory();
  },
};

/* ------------------------------------------------------------------ */
/* 用户设置 & 活跃词书 API — 本地存储实现                                */
/* ------------------------------------------------------------------ */

export type { LocalSettings as RemoteSettings };

export const userApi = {
  /** 加载设置 */
  getSettings: async (): Promise<LocalSettings> => {
    return _loadSettings();
  },

  /** 保存设置 */
  saveSettings: async (settings: LocalSettings): Promise<{ ok: boolean }> => {
    _saveSettings(settings);
    return { ok: true };
  },

  /** 获取活跃词书 */
  getActiveBook: async (): Promise<{ bookId: string | null }> => {
    return { bookId: _loadActiveBook() };
  },

  /** 设置活跃词书 */
  setActiveBook: async (bookId: string): Promise<{ ok: boolean }> => {
    _saveActiveBook(bookId);
    return { ok: true };
  },

  /** 清除活跃词书 */
  clearActiveBook: async (): Promise<{ ok: boolean }> => {
    _clearActiveBook();
    return { ok: true };
  },
};

/* ------------------------------------------------------------------ */
/* 导出 / 导入 API                                                      */
/* ------------------------------------------------------------------ */

export const dataApi = {
  /** 导出所有学习数据 */
  exportData: (): Record<string, unknown> => {
    return _exportAllData();
  },

  /** 导出数据并触发下载 */
  downloadData: (): void => {
    _downloadExportData();
  },

  /** 从导入数据恢复所有学习记录 */
  importData: (data: Record<string, unknown>): void => {
    _importAllData(data);
  },

  /** 清除所有学习数据 */
  clearData: (): void => {
    _clearAllData();
  },
};
