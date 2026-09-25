import { useState } from 'react';
import type { FormEvent } from 'react';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, validatePinFormat } from '../lib/pin';
import { setPin } from '../lib/pinApi';
import './Pin.css';

type PinSetupProps = {
  /** PIN criado com sucesso por este cliente: já pode ser tratado como desbloqueado. */
  onCreated: () => void;
  /** Alguém (outra aba/sessão) configurou um PIN entretanto — nunca sobrescrever, só recarregar o status. */
  onAlreadyConfigured: () => void;
};

export function PinSetup({ onCreated, onAlreadyConfigured }: PinSetupProps) {
  const [pin, setPinValue] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (!validatePinFormat(pin)) {
      setError(`O PIN precisa ter de ${PIN_MIN_LENGTH} a ${PIN_MAX_LENGTH} dígitos numéricos.`);
      setPinValue('');
      setConfirmPin('');
      return;
    }

    if (pin !== confirmPin) {
      setError('Os PINs digitados não são iguais.');
      setPinValue('');
      setConfirmPin('');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await setPin(pin);

      if (result.status === 'ok') {
        onCreated();
        return;
      }

      if (result.status === 'already_configured') {
        onAlreadyConfigured();
        return;
      }

      // invalid_format: validação client-side já deveria ter barrado, mas o servidor é a fonte final.
      setError(`O PIN precisa ter de ${PIN_MIN_LENGTH} a ${PIN_MAX_LENGTH} dígitos numéricos.`);
      setPinValue('');
      setConfirmPin('');
      setSubmitting(false);
    } catch {
      setError('Não foi possível salvar o PIN. Tente novamente.');
      setPinValue('');
      setConfirmPin('');
      setSubmitting(false);
    }
  }

  return (
    <section className="pin">
      <form onSubmit={handleSubmit} noValidate>
        <h1>Criar PIN</h1>
        <p className="subtitle">Configure um PIN para proteger o app neste aparelho.</p>

        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_MAX_LENGTH}
            value={pin}
            onChange={(event) => setPinValue(event.target.value.replace(/\D/g, ''))}
            autoFocus
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'pin-setup-error' : undefined}
          />
        </div>

        <div className="field">
          <label htmlFor="pin-confirm">Confirmar PIN</label>
          <input
            id="pin-confirm"
            name="pin-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_MAX_LENGTH}
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ''))}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'pin-setup-error' : undefined}
          />
        </div>

        {error && (
          <p id="pin-setup-error" className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Criar PIN'}
        </button>
      </form>
    </section>
  );
}
