/**
 * 滑动手势 Hook — 2.5.2
 *
 * 在移动端/Android 上支持滑动手势操作。
 * 检测四个方向的滑动手势并触发对应回调。
 *
 * 使用方式：
 *   const ref = useRef<HTMLDivElement>(null);
 *   useSwipe(ref, {
 *     onSwipeLeft: () => handleGrade(Grade.Again),
 *     onSwipeRight: () => handleGrade(Grade.Good),
 *     onSwipeUp: () => setFlipped(true),
 *     onSwipeDown: () => handleSkip(),
 *   });
 */

import { useEffect, type RefObject } from 'react';

export interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

const SWIPE_THRESHOLD = 50; // 最小滑动距离（像素）
const SWIPE_VELOCITY = 0.3; // 最小滑动速度

export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  callbacks: SwipeCallbacks,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
    }

    function onTouchEnd(e: TouchEvent) {
      if (!tracking) return;
      tracking = false;

      const t = e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      const velocity = Math.sqrt(dx * dx + dy * dy) / Math.max(dt, 1);

      if (velocity < SWIPE_VELOCITY && Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
        return; // 不是有效的滑动
      }

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > absDy) {
        // 水平滑动
        if (dx > SWIPE_THRESHOLD) {
          callbacks.onSwipeRight?.();
        } else if (dx < -SWIPE_THRESHOLD) {
          callbacks.onSwipeLeft?.();
        }
      } else {
        // 垂直滑动
        if (dy > SWIPE_THRESHOLD) {
          callbacks.onSwipeDown?.();
        } else if (dy < -SWIPE_THRESHOLD) {
          callbacks.onSwipeUp?.();
        }
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref, callbacks]);
}
