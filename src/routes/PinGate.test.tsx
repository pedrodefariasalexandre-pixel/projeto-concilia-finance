import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { PinGate } from './PinGate';
import { supabase } from '../lib/supabaseClient';
import * as appSettingsLib from '../lib/appSettings';
import * as pinApiLib from '../lib/pinApi';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock('../lib/appSettings');
vi.mock('../lib/pinApi');

const mockedSupabase = vi.mocked(supabase, true);
const mockedAppSettings = vi.mocked(appSettingsLib, true);
const mockedPinApi = vi.mocked(pinApiLib, true);

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>Tela de login</div>} />
        <Route element={<ProtectedRoute />}>
          <Route element={<PinGate />}>
            <Route path="/" element={<div>App privado</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

let authChangeCallback: (event: string, session: unknown) => void = () => {};

function mockAuthenticated() {
  mockedSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'user-1' } } },
    error: null,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  authChangeCallback = () => {};
  mockedSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
    authChangeCallback = cb as never;
    return { data: { subscription: { unsubscribe: vi.fn() } } } as never;
  });
  mockedAppSettings.getAppSettings.mockResolvedValue({ user_id: 'user-1', inactivity_minutes: 5 });
});

describe('PinGate', () => {
  it('mostra PinSetup quando configured=false', async () => {
    mockAuthenticated();
    mockedPinApi.getPinStatus.mockResolvedValue({ configured: false, retryAfterSeconds: null });

    renderApp();

    expect(await screen.findByRole('heading', { name: /criar pin/i })).toBeTruthy();
  });

  it('mostra PinLock quando configured=true (locked por padrão)', async () => {
    mockAuthenticated();
    mockedPinApi.getPinStatus.mockResolvedValue({ configured: true, retryAfterSeconds: null });

    renderApp();

    expect(await screen.findByRole('heading', { name: /digite o pin/i })).toBeTruthy();
  });

  it('não mostra app privado nem telas de PIN enquanto appSettings/pinStatus carregam em paralelo', async () => {
    mockAuthenticated();
    mockedAppSettings.getAppSettings.mockReturnValue(new Promise(() => {}));
    mockedPinApi.getPinStatus.mockReturnValue(new Promise(() => {}));

    renderApp();

    await waitFor(() => {
      expect(mockedAppSettings.getAppSettings).toHaveBeenCalled();
      expect(mockedPinApi.getPinStatus).toHaveBeenCalled();
    });

    expect(screen.queryByText('App privado')).toBeNull();
    expect(screen.queryByRole('heading', { name: /criar pin/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /digite o pin/i })).toBeNull();
  });

  it('desbloqueia com verify_pin bem-sucedido e dá acesso ao app', async () => {
    mockAuthenticated();
    mockedPinApi.getPinStatus.mockResolvedValue({ configured: true, retryAfterSeconds: null });
    mockedPinApi.verifyPin.mockResolvedValue({ status: 'success' });

    renderApp();

    const input = await screen.findByLabelText(/^pin$/i);
    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /desbloquear/i }));

    expect(await screen.findByText('App privado')).toBeTruthy();
  });

  it('desbloqueia ao criar um PIN novo (onCreated) sem exigir reentrada imediata', async () => {
    mockAuthenticated();
    mockedPinApi.getPinStatus.mockResolvedValue({ configured: false, retryAfterSeconds: null });
    mockedPinApi.setPin.mockResolvedValue({ status: 'ok' });

    renderApp();

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^pin$/i), '1234');
    await user.type(screen.getByLabelText(/confirmar pin/i), '1234');
    await user.click(screen.getByRole('button', { name: /criar pin/i }));

    expect(await screen.findByText('App privado')).toBeTruthy();
  });

  it('limpa o estado (unlocked) ao fazer logout, e redireciona para /login', async () => {
    mockAuthenticated();
    mockedPinApi.getPinStatus.mockResolvedValue({ configured: true, retryAfterSeconds: null });
    mockedPinApi.verifyPin.mockResolvedValue({ status: 'success' });

    renderApp();

    const input = await screen.findByLabelText(/^pin$/i);
    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /desbloquear/i }));
    expect(await screen.findByText('App privado')).toBeTruthy();

    act(() => {
      authChangeCallback('SIGNED_OUT', null);
    });

    expect(await screen.findByText('Tela de login')).toBeTruthy();
  });

  it('reinicia bloqueado em um novo mount (equivalente conceitual a reload)', async () => {
    mockAuthenticated();
    mockedPinApi.getPinStatus.mockResolvedValue({ configured: true, retryAfterSeconds: null });
    mockedPinApi.verifyPin.mockResolvedValue({ status: 'success' });

    const { unmount } = renderApp();

    const input = await screen.findByLabelText(/^pin$/i);
    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /desbloquear/i }));
    expect(await screen.findByText('App privado')).toBeTruthy();

    unmount();
    renderApp();

    expect(await screen.findByRole('heading', { name: /digite o pin/i })).toBeTruthy();
  });

  it('bloqueia novamente após o tempo de inatividade configurado', async () => {
    mockAuthenticated();
    mockedAppSettings.getAppSettings.mockResolvedValue({ user_id: 'user-1', inactivity_minutes: 1 });
    mockedPinApi.getPinStatus.mockResolvedValue({ configured: true, retryAfterSeconds: null });
    mockedPinApi.verifyPin.mockResolvedValue({ status: 'success' });

    vi.useFakeTimers();
    try {
      renderApp();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const input = screen.getByLabelText(/^pin$/i);
      fireEvent.change(input, { target: { value: '1234' } });
      fireEvent.click(screen.getByRole('button', { name: /desbloquear/i }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText('App privado')).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000 + 1);
      });

      expect(screen.getByRole('heading', { name: /digite o pin/i })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
