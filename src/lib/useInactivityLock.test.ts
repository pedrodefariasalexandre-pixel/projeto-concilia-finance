import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInactivityLock } from './useInactivityLock';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useInactivityLock', () => {
  it('chama onTimeout após o tempo de inatividade configurado', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLock({ enabled: true, minutes: 5, onTimeout }));

    act(() => {
      vi.advanceTimersByTime(5 * 60_000 - 1);
    });
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('reseta o timer após atividade válida', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLock({ enabled: true, minutes: 5, onTimeout }));

    act(() => {
      vi.advanceTimersByTime(4 * 60_000);
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(4 * 60_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60_000 + 1);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('não registra listeners duplicados mesmo após vários eventos de atividade', () => {
    const onTimeout = vi.fn();
    const addSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useInactivityLock({ enabled: true, minutes: 5, onTimeout }));

    const listenersAfterMount = addSpy.mock.calls.filter(([type]) => ACTIVITY_EVENTS.includes(type as string));
    expect(listenersAfterMount).toHaveLength(ACTIVITY_EVENTS.length);

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
      window.dispatchEvent(new Event('keydown'));
      window.dispatchEvent(new Event('touchstart'));
    });

    const listenersAfterActivity = addSpy.mock.calls.filter(([type]) => ACTIVITY_EVENTS.includes(type as string));
    expect(listenersAfterActivity).toHaveLength(ACTIVITY_EVENTS.length);

    act(() => {
      vi.advanceTimersByTime(5 * 60_000 + 1);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('não agenda bloqueio quando desabilitado', () => {
    const onTimeout = vi.fn();
    renderHook(() => useInactivityLock({ enabled: false, minutes: 5, onTimeout }));

    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('bloqueia imediatamente ao voltar para a aba depois do tempo limite', () => {
    const onTimeout = vi.fn();
    const start = Date.now();
    renderHook(() => useInactivityLock({ enabled: true, minutes: 5, onTimeout }));

    setVisibility('hidden');

    act(() => {
      // simula o timer suspenso pelo navegador em aba oculta: o relógio avança,
      // mas o setTimeout pendente não é executado (não usamos advanceTimersByTime aqui).
      vi.setSystemTime(start + 10 * 60_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      setVisibility('visible');
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('não bloqueia ao voltar para a aba antes do tempo limite', () => {
    const onTimeout = vi.fn();
    const start = Date.now();
    renderHook(() => useInactivityLock({ enabled: true, minutes: 5, onTimeout }));

    setVisibility('hidden');

    act(() => {
      vi.setSystemTime(start + 2 * 60_000);
    });

    act(() => {
      setVisibility('visible');
    });

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('remove listeners e timer ao desmontar', () => {
    const onTimeout = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useInactivityLock({ enabled: true, minutes: 5, onTimeout }));
    unmount();

    const removedActivityListeners = removeSpy.mock.calls.filter(([type]) => ACTIVITY_EVENTS.includes(type as string));
    expect(removedActivityListeners).toHaveLength(ACTIVITY_EVENTS.length);

    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
