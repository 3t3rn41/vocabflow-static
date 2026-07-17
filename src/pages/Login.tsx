/**
 * 登录/注册页面 — 静态网页版
 *
 * 静态版无需认证，此页面仅用于兼容性保留。
 * 实际上 App.tsx 不会渲染此页面（已移除认证门控）。
 */

import { Navigate } from 'react-router-dom';

export function Login() {
  // 静态版自动认证，直接跳转到今日学习页
  return <Navigate to="/today" replace />;
}
