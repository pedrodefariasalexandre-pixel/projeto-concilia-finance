import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

type UseInactivityLockOptions = {
  enabled: boolean;
  minutes: number;
  onTimeout: () => void;
};

export function useInactivityLock({ enabled, minutes, onTimeout }: UseInactivityLockOptions) {
  const lastActivityRef = useRef(Date.now());
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled || minutes <= 0) return;

    const timeoutMs = minutes * 60_000;
    lastActivityRef.current = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    function scheduleTimer() {
      clearTimeout(timer);
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(timeoutMs - elapsed, 0);
      timer = setTimeout(() => {
        onTimeoutRef.current();
      }, remaining);
    }

    function handleActivity() {
      lastActivityRef.current = Date.now();
      scheduleTimer();
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeoutMs) {
        onTimeoutRef.current();
        return;
      }
      scheduleTimer();
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleTimer();

    return () => {
      clearTimeout(timer);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, minutes]);
}
