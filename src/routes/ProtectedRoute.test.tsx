import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

const mockedSupabase = vi.mocked(supabase, true);

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>Tela de login</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Conteúdo privado</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProtectedRoute', () => {
  it('redireciona para /login quando não há sessão', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);
    mockedSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as never);

    renderProtected();

    expect(await screen.findByText('Tela de login')).toBeTruthy();
  });

  it('renderiza o conteúdo protegido quando há sessão válida', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: '1' } } },
      error: null,
    } as never);
    mockedSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as never);

    renderProtected();

    expect(await screen.findByText('Conteúdo privado')).toBeTruthy();
  });

  it('não mostra conteúdo privado nem faz redirect durante o carregamento inicial', () => {
    mockedSupabase.auth.getSession.mockReturnValue(new Promise(() => {}) as never);
    mockedSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as never);

    renderProtected();

    expect(screen.queryByText('Conteúdo privado')).toBeNull();
    expect(screen.queryByText('Tela de login')).toBeNull();
  });

  it('bloqueia a rota quando onAuthStateChange remove a sessão', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: '1' } } },
      error: null,
    } as never);

    let authChangeCallback: (event: string, session: unknown) => void = () => {};
    mockedSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authChangeCallback = cb as never;
      return { data: { subscription: { unsubscribe: vi.fn() } } } as never;
    });

    renderProtected();

    expect(await screen.findByText('Conteúdo privado')).toBeTruthy();

    authChangeCallback('SIGNED_OUT', null);

    expect(await screen.findByText('Tela de login')).toBeTruthy();
  });

  it('faz cleanup (unsubscribe) da subscription ao desmontar', async () => {
    const unsubscribe = vi.fn();
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);
    mockedSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    } as never);

    const { unmount } = renderProtected();
    await screen.findByText('Tela de login');

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
