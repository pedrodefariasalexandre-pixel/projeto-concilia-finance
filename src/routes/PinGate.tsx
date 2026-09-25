import { useCallback, useEffect, useState } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import type { ProtectedOutletContext } from './ProtectedRoute';
import { getAppSettings } from '../lib/appSettings';
import type { AppSettings } from '../lib/appSettings';
import { getPinStatus } from '../lib/pinApi';
import type { PinStatus } from '../lib/pinApi';
import { useInactivityLock } from '../lib/useInactivityLock';
import { PinSetup } from './PinSetup';
import { PinLock } from './PinLock';
import './Pin.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; settings: AppSettings; pinStatus: PinStatus };

export function PinGate() {
  const { userId } = useOutletContext<ProtectedOutletContext>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [unlocked, setUnlocked] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(async () => {
    const [settings, pinStatus] = await Promise.all([getAppSettings(userId), getPinStatus()]);
    return { settings, pinStatus };
  }, [userId]);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    setUnlocked(false);

    load()
      .then(({ settings, pinStatus }) => {
        if (!active) return;
        setState({ status: 'loaded', settings, pinStatus });
      })
      .catch(() => {
        if (!active) return;
        setState({ status: 'error' });
      });

    return () => {
      active = false;
    };
  }, [load, reloadToken]);

  async function refreshPinStatus() {
    try {
      const pinStatus = await getPinStatus();
      setState((current) => (current.status === 'loaded' ? { ...current, pinStatus } : current));
    } catch {
      setState({ status: 'error' });
    }
  }

  const hasPin = state.status === 'loaded' && state.pinStatus.configured;

  useInactivityLock({
    enabled: unlocked && hasPin,
    minutes: state.status === 'loaded' ? state.settings.inactivity_minutes : 0,
    onTimeout: () => setUnlocked(false),
  });

  if (state.status === 'loading') {
    return null;
  }

  if (state.status === 'error') {
    return (
      <section className="pin">
        <form onSubmit={(event) => event.preventDefault()} noValidate>
          <h1>Não foi possível carregar</h1>
          <p className="subtitle">Tente novamente para continuar.</p>
          <button type="button" onClick={() => setReloadToken((token) => token + 1)}>
            Tentar novamente
          </button>
        </form>
      </section>
    );
  }

  if (!hasPin) {
    return (
      <PinSetup
        onCreated={() => {
          // set_pin já confirmou a criação no servidor — atualiza local e otimisticamente
          // (em vez de esperar um refetch) para não piscar de volta pro PinSetup entre o
          // setUnlocked síncrono e a resposta assíncrona de um refreshPinStatus.
          setState((current) =>
            current.status === 'loaded'
              ? { ...current, pinStatus: { ...current.pinStatus, configured: true, retryAfterSeconds: null } }
              : current,
          );
          setUnlocked(true);
        }}
        onAlreadyConfigured={() => {
          void refreshPinStatus();
        }}
      />
    );
  }

  if (!unlocked) {
    return (
      <PinLock
        initialRetryAfterSeconds={state.pinStatus.retryAfterSeconds}
        onUnlock={() => setUnlocked(true)}
        onNotConfigured={() => void refreshPinStatus()}
      />
    );
  }

  return <Outlet context={{ userId } satisfies ProtectedOutletContext} />;
}
