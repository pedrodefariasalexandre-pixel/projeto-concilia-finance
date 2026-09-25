import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
    },
  },
}));

const mockedSupabase = vi.mocked(supabase, true);

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>App autenticado</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSupabase.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  } as never);
});

describe('Login', () => {
  it('mostra erro ao tentar enviar com campos vazios', async () => {
    renderLogin();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockedSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('chama signInWithPassword com email e senha informados e redireciona', async () => {
    mockedSupabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null } as never);
    renderLogin();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/email/i), 'pedro@example.com');
    await user.type(screen.getByLabelText(/senha/i), 'segredo123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(mockedSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'pedro@example.com',
        password: 'segredo123',
      });
    });

    expect(await screen.findByText('App autenticado')).toBeTruthy();
  });

  it('mostra erro compreensível quando o login falha', async () => {
    mockedSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    } as never);
    renderLogin();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/email/i), 'pedro@example.com');
    await user.type(screen.getByLabelText(/senha/i), 'errada');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('impede duplo submit enquanto a requisição está em andamento', async () => {
    let resolveSignIn: (value: unknown) => void = () => {};
    mockedSupabase.auth.signInWithPassword.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }) as never,
    );
    renderLogin();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/email/i), 'pedro@example.com');
    await user.type(screen.getByLabelText(/senha/i), 'segredo123');

    const button = screen.getByRole('button', { name: /entrar/i });
    await user.click(button);
    await user.click(button);

    expect(mockedSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);

    resolveSignIn({ data: {}, error: null });
  });

  it('redireciona para a área autenticada quando já existe sessão ao montar', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: '1' } } },
      error: null,
    } as never);

    renderLogin();

    expect(await screen.findByText('App autenticado')).toBeTruthy();
  });
});
