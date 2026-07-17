/**
 * 用户认证状态管理 — 静态网页版
 *
 * 静态版无需后端认证，始终处于已登录状态。
 * 保留接口兼容性，使上层组件无需修改。
 */

import { create } from 'zustand';
import {
  authApi,
  setToken,
  clearToken,
  onUnauthorized,
  type AuthUser,
} from '@/api/client';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** 是否已登录 */
  isAuthenticated: boolean;

  /** 初始化: 静态版自动认证 */
  init: () => Promise<void>;
  /** 登录（静态版直接通过） */
  login: (username: string, password: string) => Promise<void>;
  /** 注册（静态版直接通过） */
  register: (username: string, password: string) => Promise<void>;
  /** 登出（静态版 no-op） */
  logout: () => void;
}

const LOCAL_USER: AuthUser = { id: 1, username: '学习者' };

export const useAuthStore = create<AuthState>((set) => {
  // 注册 401 回调（静态版不会触发，保留兼容）
  onUnauthorized(() => {
    set({ user: LOCAL_USER, isAuthenticated: true });
  });

  return {
    user: LOCAL_USER,
    loading: false,
    isAuthenticated: true,

    init: async () => {
      // 静态版自动认证，无需检查 token
      setToken('static-local-token');
      set({ user: LOCAL_USER, isAuthenticated: true, loading: false });
    },

    login: async (username, _password) => {
      setToken('static-local-token');
      set({ user: { ...LOCAL_USER, username: username || '学习者' }, isAuthenticated: true });
    },

    register: async (username, _password) => {
      setToken('static-local-token');
      set({ user: { ...LOCAL_USER, username: username || '学习者' }, isAuthenticated: true });
    },

    logout: () => {
      // 静态版无需登出，保留兼容
      clearToken();
      set({ user: LOCAL_USER, isAuthenticated: true });
    },
  };
});
