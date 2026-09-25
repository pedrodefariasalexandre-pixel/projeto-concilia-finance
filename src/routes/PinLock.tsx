import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { verifyPin } from '../lib/pinApi';
import { supabase } from '../lib/supabaseClient';
import './Pin.css';

type PinLockProps = {
  initialRetryAfterSeconds: number | null;
  onUnlock: () => void;
  /** verify_pin respondeu not_configured (ex.: PIN removido em outro lugar) — recarregar o status no PinGate. */
  onNotConfigured: () => void;
};

export function PinLock({ initialRetryAfterSeconds, onUnlock, onNotConfigured }: PinLockProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Countdown é só UX — quem decide se o desbloqueio é aceito continua sendo o servidor,
  // a cada chamada de verify_pin (mesmo depois do contador chegar a zero aqui).
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(initialRetryAfterSeconds);

  const locked = retryAfterSeconds !== null && retryAfterSeconds > 0;

  useEffect(() => {
    if (!locked) return;
    const timeout = setTimeout(() => {
      setRetryAfterSeconds((current) => (current === null ? null : current - 1));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [locked, retryAfterSeconds]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || locked) return;

    if (!pin) {
      setError('Digite o PIN.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await verifyPin(pin);
      setPin('');

      switch (result.status) {
        case 'success':
          onUnlock();
          return;
        case 'invalid':
          setError('PIN incorreto.');
          setSubmitting(false);
          return;
        case 'invalid_format':
          setError('PIN inválido.');
          setSubmitting(false);
          return;
        case 'locked':
          setRetryAfterSeconds(result.retryAfterSeconds);
          setSubmitting(false);
          return;
        case 'not_configured':
          onNotConfigured();
          return;
      }
    } catch {
      setPin('');
      setError('Não foi possível verificar agora. Tente novamente.');
      setSubmitting(false);
    }
  }

  return (
    <section className="pin">
      <form onSubmit={handleSubmit} noValidate>
        <h1>Digite o PIN</h1>
        <p className="subtitle">Desbloqueie para continuar.</p>

        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            autoFocus
            disabled={submitting || locked}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || locked ? 'pin-lock-error' : undefined}
          />
        </div>

        {locked && (
          <p id="pin-lock-error" className="error" role="alert">
            Bloqueado por muitas tentativas. Tente novamente em {retryAfterSeconds}s.
          </p>
        )}
        {!locked && error && (
          <p id="pin-lock-error" className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting || locked}>
          {submitting ? 'Verificando...' : 'Desbloquear'}
        </button>

        <button type="button" className="signout" onClick={() => void supabase.auth.signOut()}>
          Sair
        </button>
      </form>
    </section>
  );
}
