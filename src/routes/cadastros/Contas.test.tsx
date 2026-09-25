import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Contas } from './Contas';
import * as accountsLib from '../../lib/accounts';

vi.mock('../../lib/useAuthenticatedUserId', () => ({
  useAuthenticatedUserId: () => 'user-1',
}));

vi.mock('../../lib/accounts', async () => {
  const actual = await vi.importActual<typeof accountsLib>('../../lib/accounts');
  return {
    ...actual,
    listAccounts: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
  };
});

const mockedAccounts = vi.mocked(accountsLib, true);

function account(overrides: Partial<accountsLib.Account> = {}): accountsLib.Account {
  return {
    id: 'a1',
    user_id: 'user-1',
    name: 'Nubank',
    kind: 'corrente',
    opening_balance_cents: 123456,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Contas', () => {
  it('lista contas com saldo formatado em reais', async () => {
    mockedAccounts.listAccounts.mockResolvedValue([account()]);
    render(<Contas />);

    expect(await screen.findByText('Nubank')).toBeTruthy();
    expect(screen.getByText(/R\$ 1\.234,56/)).toBeTruthy();
  });

  it('converte entrada em reais para opening_balance_cents corretamente ao criar', async () => {
    mockedAccounts.listAccounts.mockResolvedValue([]);
    mockedAccounts.createAccount.mockResolvedValue(account());
    const user = userEvent.setup();
    render(<Contas />);

    await screen.findByText(/nenhuma conta cadastrada/i);
    await user.click(screen.getByRole('button', { name: /nova conta/i }));
    await user.type(screen.getByLabelText(/^nome$/i), 'Nubank');

    const balanceInput = screen.getByLabelText(/saldo inicial/i);
    await user.clear(balanceInput);
    await user.type(balanceInput, '1.234,56');

    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(mockedAccounts.createAccount).toHaveBeenCalledWith('user-1', {
        name: 'Nubank',
        kind: 'corrente',
        opening_balance_cents: 123456,
      });
    });
  });

  it('trata centavos exatos e valores pequenos corretamente', async () => {
    mockedAccounts.listAccounts.mockResolvedValue([]);
    mockedAccounts.createAccount.mockResolvedValue(account());
    const user = userEvent.setup();
    render(<Contas />);

    await screen.findByText(/nenhuma conta cadastrada/i);
    await user.click(screen.getByRole('button', { name: /nova conta/i }));
    await user.type(screen.getByLabelText(/^nome$/i), 'Carteira');

    const balanceInput = screen.getByLabelText(/saldo inicial/i);
    await user.clear(balanceInput);
    await user.type(balanceInput, '0,01');

    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(mockedAccounts.createAccount).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ opening_balance_cents: 1 }),
      );
    });
  });

  it('apresenta o saldo existente em reais ao editar', async () => {
    mockedAccounts.listAccounts.mockResolvedValue([account({ opening_balance_cents: 1005 })]);
    const user = userEvent.setup();
    render(<Contas />);

    await user.click(await screen.findByRole('button', { name: /editar/i }));

    const balanceInput = screen.getByLabelText(/saldo inicial/i) as HTMLInputElement;
    expect(balanceInput.value).toBe('10,05');
  });

  it('bloqueia envio quando o saldo digitado não é um valor válido', async () => {
    mockedAccounts.listAccounts.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<Contas />);

    await screen.findByText(/nenhuma conta cadastrada/i);
    await user.click(screen.getByRole('button', { name: /nova conta/i }));
    await user.type(screen.getByLabelText(/^nome$/i), 'Conta X');

    const balanceInput = screen.getByLabelText(/saldo inicial/i);
    await user.clear(balanceInput);
    await user.type(balanceInput, 'abc');

    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockedAccounts.createAccount).not.toHaveBeenCalled();
  });
});
