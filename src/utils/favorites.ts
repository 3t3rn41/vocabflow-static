/**
 * 生词本 / 收藏夹工具模块 — 2.2.2
 *
 * 数据存储在 localStorage（vf_favorites）。
 * 提供收藏的增删查改功能。
 */

import { favoritesApi } from '@/api/client';
import type { FavoriteEntry } from '@/lib/localDb';

export type { FavoriteEntry };

/** 获取所有收藏单词 */
export function getFavorites(): FavoriteEntry[] {
  return favoritesApi.getAll();
}

/** 添加到收藏夹 */
export function addFavorite(entry: Omit<FavoriteEntry, 'addedAt'>): void {
  favoritesApi.add(entry);
}

/** 从收藏夹移除 */
export function removeFavorite(wordId: string): void {
  favoritesApi.remove(wordId);
}

/** 检查是否已收藏 */
export function isFavorite(wordId: string): boolean {
  return favoritesApi.isFavorite(wordId);
}

/** 切换收藏状态，返回是否已收藏 */
export function toggleFavorite(entry: Omit<FavoriteEntry, 'addedAt'>): boolean {
  return favoritesApi.toggle(entry);
}
