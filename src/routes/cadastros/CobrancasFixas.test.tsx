import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CobrancasFixas } from './CobrancasFixas';
import * as fixedChargesLib from '../../lib/fixedCharges';
import * as categoriesLib from '../../lib/categories';
import * as peopleLib from '../../lib/people';

vi.mock('../../lib/useAuthenticatedUserId', () => ({
  useAuthenticatedUserId: () => 'user-1',
}));

vi.mock('../../lib/fixedCharges');
vi.mock('../../lib/categories');
vi.mock('../../lib/people');

const mockedFixedCharges = vi.mocked(fixedChargesLib, true);
const mockedCategories = vi.mocked(categoriesLib, true);
const mockedPeople = vi.mocked(peopleLib, true);

const category: categoriesLib.Category = {
  id: 'cat1',
  user_id: 'user-1',
  name: 'Assinaturas',
  created_at: '2026-01-01T00:00:00Z',
};

const activePerson: peopleLib.Person = {
  id: 'per1',
  user_id: 'user-1',
  name: 'Pedro',
  phone: null,
  color: null,
  archived: false,
  created_at: '2026-01-01T00:00:00Z',
};

const archivedPerson: peopleLib.Person = {
  id: 'per2',
  user_id: 'user-1',
  name: 'Nega',
  phone: null,
  color: null,
  archived: true,
  created_at: '2026-01-01T00:00:00Z',
};

function charge(overrides: Partial<fixedChargesLib.FixedCharge> = {}): fixedChargesLib.FixedCharge {
  return {
    id: 'fc1',
    user_id: 'user-1',
    description: 'Netflix',
    amount_cents: 3990,
    category_id: null,
    person_ids: [],
    installment_current: null,
    installment_total: null,
    active: true,
    last_advanced_competency: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

async function openCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/nenhuma cobrança fixa cadastrada/i);
  await user.click(screen.getByRole('button', { name: /nova cobrança/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCategories.listCategories.mockResolvedValue([category]);
  mockedPeople.listPeople.mockResolvedValue([activePerson, archivedPerson]);
  mockedFixedCharges.listFixedCharges.mockResolvedValue([]);
});

describe('CobrancasFixas', () => {
  it('lista cobranças com valor formatado, categoria e pessoas', async () => {
    mockedFixedCharges.listFixedCharges.mockResolvedValue([
      charge({ category_id: 'cat1', person_ids: ['per1'] }),
    ]);
    render(<CobrancasFixas />);

    expect(await screen.findByText('Netflix')).toBeTruthy();
    expect(screen.getByText(/R\$ 39,90/)).toBeTruthy();
    expect(screen.getByText(/Assinaturas/)).toBeTruthy();
    expect(screen.getByText(/Pedro/)).toBeTruthy();
  });

  it('cria uma cobrança com valor monetário, categoria e pessoa corretos', async () => {
    mockedFixedCharges.createFixedCharge.mockResolvedValue(charge());
    const user = userEvent.setup();
    render(<CobrancasFixas />);

    await openCreateForm(user);
    await user.type(screen.getByLabelText(/descrição/i), 'Netflix');

    const amountInput = screen.getByLabelText(/valor/i);
    await user.clear(amountInput);
    await user.type(amountInput, '39,90');

    await user.selectOptions(screen.getByLabelText(/categoria/i), 'cat1');
    await user.click(screen.getByRole('checkbox', { name: /pedro/i }));

    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(mockedFixedCharges.createFixedCharge).toHaveBeenCalledWith('user-1', {
        description: 'Netflix',
        amount_cents: 3990,
        category_id: 'cat1',
        person_ids: ['per1'],
        installment_current: null,
        installment_total: null,
        active: true,
      });
    });
  });

  it('aceita parcela válida (2 de 12)', async () => {
    mockedFixedCharges.createFixedCharge.mockResolvedValue(charge());
    const user = userEvent.setup();
    render(<CobrancasFixas />);

    await openCreateForm(user);
    await user.type(screen.getByLabelText(/descrição/i), 'Financiamento');
    const amountInput = screen.getByLabelText(/valor/i);
    await user.clear(amountInput);
    await user.type(amountInput, '100,00');

    await user.type(screen.getByLabelText(/parcela atual/i), '2');
    await user.type(screen.getByLabelText(/total de parcelas/i), '12');

    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(mockedFixedCharges.createFixedCharge).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ installment_current: 2, installment_total: 12 }),
      );
    });
  });

  it('bloqueia quando a parcela atual é maior que o total (13/12)', async () => {
    const user = userEvent.setup();
    render(<CobrancasFixas />);

    await openCreateForm(user);
    await user.type(screen.getByLabelText(/descrição/i), 'Financiamento');
    const amountInput = screen.getByLabelText(/valor/i);
    await user.clear(amountInput);
    await user.type(amountInput, '100,00');

    await user.type(screen.getByLabelText(/parcela atual/i), '13');
    await user.type(screen.getByLabelText(/total de parcelas/i), '12');

    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockedFixedCharges.createFixedCharge).not.toHaveBeenCalled();
  });

  it('bloqueia parcela decimal ou não numérica', async () => {
    const user = userEvent.setup();
    render(<CobrancasFixas />);

    await openCreateForm(user);
    await user.type(screen.getByLabelText(/descrição/i), 'Financiamento');
    const amountInput = screen.getByLabelText(/valor/i);
    await user.clear(amountInput);
    await user.type(amountInput, '100,00');

    const currentInput = screen.getByLabelText(/parcela atual/i);
    await user.type(currentInput, '1.5');
    await user.type(screen.getByLabelText(/total de parcelas/i), '12');

    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockedFixedCharges.createFixedCharge).not.toHaveBeenCalled();
  });

  it('bloqueia quando o valor monetário é inválido', async () => {
    const user = userEvent.setup();
    render(<CobrancasFixas />);

    await openCreateForm(user);
    await user.type(screen.getByLabelText(/descrição/i), 'Financiamento');
    const amountInput = screen.getByLabelText(/valor/i);
    await user.clear(amountInput);
    await user.type(amountInput, 'abc');

    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockedFixedCharges.createFixedCharge).not.toHaveBeenCalled();
  });

  it('não oferece pessoa arquivada para nova seleção, mas mostra quando já vinculada ao editar', async () => {
    mockedFixedCharges.listFixedCharges.mockResolvedValue([charge({ person_ids: ['per2'] })]);
    const user = userEvent.setup();
    render(<CobrancasFixas />);

    await screen.findByText('Netflix');
    await user.click(screen.getByRole('button', { name: /nova cobrança/i }));
    expect(screen.queryByRole('checkbox', { name: /nega/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    await user.click(await screen.findByRole('button', { name: /editar/i }));
    const archivedCheckbox = screen.getByRole('checkbox', { name: /nega/i }) as HTMLInputElement;
    expect(archivedCheckbox.checked).toBe(true);
  });

  it('exclui uma cobrança fixa após confirmação', async () => {
    mockedFixedCharges.listFixedCharges.mockResolvedValue([charge()]);
    mockedFixedCharges.deleteFixedCharge.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CobrancasFixas />);

    await user.click(await screen.findByRole('button', { name: /^excluir$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^excluir$/i }));

    await waitFor(() => {
      expect(mockedFixedCharges.deleteFixedCharge).toHaveBeenCalledWith('fc1');
    });
  });
});
