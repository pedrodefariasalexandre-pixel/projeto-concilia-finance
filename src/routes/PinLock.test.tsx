import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PinLock } from './PinLock';
import { verifyPin } from '../lib/pinApi';

vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));
vi.mock('../lib/pinApi');

const mockedVerifyPin = vi.mocked(verifyPin);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PinLock', () => {
  it('chama onUnlock quando verify_pin retorna success', async () => {
    mockedVerifyPin.mockResolvedValue({ status: 'success' });
    const onUnlock = vi.fn();
    const user = userEvent.setup();
    render(<PinLock initialRetryAfterSeconds={null} onUnlock={onUnlock} onNotConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '1234');
    await user.click(screen.getByRole('button', { name: /desbloquear/i }));

    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
    expect(mockedVerifyPin).toHaveBeenCalledWith('1234');
  });

  it('mostra "PIN incorreto" e limpa o campo quando invalid', async () => {
    mockedVerifyPin.mockResolvedValue({ status: 'invalid' });
    const user = userEvent.setup();
    render(<PinLock initialRetryAfterSeconds={null} onUnlock={vi.fn()} onNotConfigured={vi.fn()} />);

    const input = screen.getByLabelText(/^pin$/i) as HTMLInputElement;
    await user.type(input, '0000');
    await user.click(screen.getByRole('button', { name: /desbloquear/i }));

    expect(await screen.findByText(/pin incorreto/i)).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('entra em estado locked com contagem e bloqueia envio/campo', async () => {
    mockedVerifyPin.mockResolvedValue({ status: 'locked', retryAfterSeconds: 5 });
    const user = userEvent.setup();
    render(<PinLock initialRetryAfterSeconds={null} onUnlock={vi.fn()} onNotConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '1234');
    await user.click(screen.getByRole('button', { name: /desbloquear/i }));

    expect(await screen.findByText(/tente novamente em 5s/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /desbloquear/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^pin$/i) as HTMLInputElement).disabled).toBe(true);
  });

  it('conta regressivamente a cada segundo e reabilita o envio ao chegar a zero', () => {
    vi.useFakeTimers();
    try {
      render(<PinLock initialRetryAfterSeconds={2} onUnlock={vi.fn()} onNotConfigured={vi.fn()} />);

      expect(screen.getByText(/tente novamente em 2s/i)).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(/tente novamente em 1s/i)).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.queryByText(/tente novamente/i)).toBeNull();
      expect((screen.getByRole('button', { name: /desbloquear/i }) as HTMLButtonElement).disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('o countdown é só UX: ao chegar a zero, quem decide continua sendo verify_pin (não desbloqueia sozinho)', async () => {
    mockedVerifyPin.mockResolvedValue({ status: 'invalid' });
    vi.useFakeTimers();
    try {
      const onUnlock = vi.fn();
      render(<PinLock initialRetryAfterSeconds={1} onUnlock={onUnlock} onNotConfigured={vi.fn()} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect((screen.getByRole('button', { name: /desbloquear/i }) as HTMLButtonElement).disabled).toBe(false);

      fireEvent.change(screen.getByLabelText(/^pin$/i), { target: { value: '9999' } });
      fireEvent.click(screen.getByRole('button', { name: /desbloquear/i }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mockedVerifyPin).toHaveBeenCalledWith('9999');
      expect(onUnlock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('chama onNotConfigured quando verify_pin retorna not_configured', async () => {
    mockedVerifyPin.mockResolvedValue({ status: 'not_configured' });
    const onNotConfigured = vi.fn();
    const user = userEvent.setup();
    render(<PinLock initialRetryAfterSeconds={null} onUnlock={vi.fn()} onNotConfigured={onNotConfigured} />);

    await user.type(screen.getByLabelText(/^pin$/i), '1234');
    await user.click(screen.getByRole('button', { name: /desbloquear/i }));

    await waitFor(() => expect(onNotConfigured).toHaveBeenCalled());
  });

  it('mostra erro técnico e nunca desbloqueia quando a RPC falha', async () => {
    mockedVerifyPin.mockRejectedValue(new Error('network down'));
    const onUnlock = vi.fn();
    const user = userEvent.setup();
    render(<PinLock initialRetryAfterSeconds={null} onUnlock={onUnlock} onNotConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '1234');
    await user.click(screen.getByRole('button', { name: /desbloquear/i }));

    expect(await screen.findByText(/não foi possível verificar agora/i)).toBeTruthy();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('input é numérico e limitado a 6 dígitos', () => {
    render(<PinLock initialRetryAfterSeconds={null} onUnlock={vi.fn()} onNotConfigured={vi.fn()} />);

    const input = screen.getByLabelText(/^pin$/i) as HTMLInputElement;
    expect(input.getAttribute('inputMode')).toBe('numeric');
    expect(input.maxLength).toBe(6);
  });

  it('nunca inclui o PIN em nenhuma chamada de console', async () => {
    mockedVerifyPin.mockResolvedValue({ status: 'invalid' });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<PinLock initialRetryAfterSeconds={null} onUnlock={vi.fn()} onNotConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '246810');
    await user.click(screen.getByRole('button', { name: /desbloquear/i }));

    await waitFor(() => expect(mockedVerifyPin).toHaveBeenCalled());

    for (const call of [...consoleSpy.mock.calls, ...errorSpy.mock.calls]) {
      expect(call.join(' ')).not.toContain('246810');
    }
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
