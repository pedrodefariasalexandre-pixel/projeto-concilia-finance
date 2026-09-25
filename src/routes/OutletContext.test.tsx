import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { PinGate } from './PinGate';
import { AppLayout } from './AppLayout';
import { useAuthenticatedUserId } from '../lib/useAuthenticatedUserId';
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

/**
 * Folha REAL (não mockada): usa o hook de verdade. Se PinGate ou AppLayout voltarem a
 * devolver <Outlet /> sem repassar o context recebido de cima, useAuthenticatedUserId()
 * lança (useOutletContext retornaria undefined) e este teste falha.
 */
function LeafPage() {
  const userId = useAuthenticatedUserId();
  return <div>userId na folha: {userId}</div>;
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>Tela de login</div>} />
        <Route element={<ProtectedRoute />}>
          <Route element={<PinGate />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<LeafPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'user-real-id-42' } } },
    error: null,
  } as never);
  mockedSupabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  } as never);
  mockedAppSettings.getAppSettings.mockResolvedValue({ user_id: 'user-real-id-42', inactivity_minutes: 5 });
});

describe('Outlet context: ProtectedRoute → PinGate → AppLayout → página', () => {
  it('propaga o userId real da sessão até um componente folha, sem mockar useAuthenticatedUserId', async () => {
    mockedPinApi.getPinStatus.mockResolvedValue({ configured: true, retryAfterSeconds: null });
    mockedPinApi.verifyPin.mockResolvedValue({ status: 'success' });

    renderApp();

    const input = await screen.findByLabelText(/^pin$/i);
    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /desbloquear/i }));

    expect(await screen.findByText('userId na folha: user-real-id-42')).toBeTruthy();
  });
});
