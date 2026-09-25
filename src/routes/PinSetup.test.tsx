import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PinSetup } from './PinSetup';
import { setPin } from '../lib/pinApi';

vi.mock('../lib/pinApi');

const mockedSetPin = vi.mocked(setPin);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PinSetup', () => {
  it('chama onCreated quando set_pin retorna ok', async () => {
    mockedSetPin.mockResolvedValue({ status: 'ok' });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<PinSetup onCreated={onCreated} onAlreadyConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '1234');
    await user.type(screen.getByLabelText(/confirmar pin/i), '1234');
    await user.click(screen.getByRole('button', { name: /criar pin/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockedSetPin).toHaveBeenCalledWith('1234');
  });

  it('valida formato no cliente antes de chamar o servidor', async () => {
    const user = userEvent.setup();
    render(<PinSetup onCreated={vi.fn()} onAlreadyConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '12');
    await user.type(screen.getByLabelText(/confirmar pin/i), '12');
    await user.click(screen.getByRole('button', { name: /criar pin/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockedSetPin).not.toHaveBeenCalled();
  });

  it('mostra erro quando os PINs digitados não conferem', async () => {
    const user = userEvent.setup();
    render(<PinSetup onCreated={vi.fn()} onAlreadyConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '1234');
    await user.type(screen.getByLabelText(/confirmar pin/i), '4321');
    await user.click(screen.getByRole('button', { name: /criar pin/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockedSetPin).not.toHaveBeenCalled();
  });

  it('chama onAlreadyConfigured (sem sobrescrever) quando o servidor diz already_configured', async () => {
    mockedSetPin.mockResolvedValue({ status: 'already_configured' });
    const onAlreadyConfigured = vi.fn();
    const user = userEvent.setup();
    render(<PinSetup onCreated={vi.fn()} onAlreadyConfigured={onAlreadyConfigured} />);

    await user.type(screen.getByLabelText(/^pin$/i), '1234');
    await user.type(screen.getByLabelText(/confirmar pin/i), '1234');
    await user.click(screen.getByRole('button', { name: /criar pin/i }));

    await waitFor(() => expect(onAlreadyConfigured).toHaveBeenCalled());
  });

  it('mostra erro de formato quando o servidor rejeita (defesa em profundidade)', async () => {
    mockedSetPin.mockResolvedValue({ status: 'invalid_format' });
    const user = userEvent.setup();
    render(<PinSetup onCreated={vi.fn()} onAlreadyConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '1234');
    await user.type(screen.getByLabelText(/confirmar pin/i), '1234');
    await user.click(screen.getByRole('button', { name: /criar pin/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('mostra erro técnico quando a RPC falha, sem travar em loading', async () => {
    mockedSetPin.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    render(<PinSetup onCreated={vi.fn()} onAlreadyConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '1234');
    await user.type(screen.getByLabelText(/confirmar pin/i), '1234');
    await user.click(screen.getByRole('button', { name: /criar pin/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByRole('button', { name: /criar pin/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('nunca inclui o PIN em nenhuma chamada de console', async () => {
    mockedSetPin.mockResolvedValue({ status: 'ok' });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<PinSetup onCreated={vi.fn()} onAlreadyConfigured={vi.fn()} />);

    await user.type(screen.getByLabelText(/^pin$/i), '135797');
    await user.type(screen.getByLabelText(/confirmar pin/i), '135797');
    await user.click(screen.getByRole('button', { name: /criar pin/i }));

    await waitFor(() => expect(mockedSetPin).toHaveBeenCalled());

    for (const call of [...consoleSpy.mock.calls, ...errorSpy.mock.calls]) {
      expect(call.join(' ')).not.toContain('135797');
    }
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
