import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Importar } from './Importar';
import { SAMPLE_OFX } from './Importar.fixtures';
import { parseOfx } from '../domain/ofx';
import { mergeByFitid } from '../domain/merge';
import { computeStatementSignature } from '../domain/signature';
import type { MergedTransaction } from '../domain/merge';
import * as accountsLib from '../lib/accounts';
import * as categoriesLib from '../lib/categories';
import * as peopleLib from '../lib/people';
import * as memoryRulesLib from '../lib/memoryRules';
import * as closedMonthsLib from '../lib/closedMonths';
import * as openImportFingerprintsLib from '../lib/openImportFingerprints';
import * as importTransactionsLib from '../lib/importTransactions';

vi.mock('../lib/useAuthenticatedUserId', () => ({
  useAuthenticatedUserId: () => 'user-1',
}));
vi.mock('../lib/accounts');
vi.mock('../lib/categories');
vi.mock('../lib/people');
vi.mock('../lib/memoryRules');
vi.mock('../lib/closedMonths');
vi.mock('../lib/openImportFingerprints');
vi.mock('../lib/importTransactions');

const mockedAccounts = vi.mocked(accountsLib, true);
const mockedCategories = vi.mocked(categoriesLib, true);
const mockedPeople = vi.mocked(peopleLib, true);
const mockedMemoryRules = vi.mocked(memoryRulesLib, true);
const mockedClosedMonths = vi.mocked(closedMonthsLib, true);
const mockedOpenImportFingerprints = vi.mocked(openImportFingerprintsLib, true);
const mockedImportTransactions = vi.mocked(importTransactionsLib, true);

const account: accountsLib.Account = {
  id: 'acc1',
  user_id: 'user-1',
  name: 'Cartão',
  kind: 'cartao_manual',
  opening_balance_cents: 0,
  created_at: '2026-01-01T00:00:00Z',
};

const category: categoriesLib.Category = {
  id: 'cat-stream',
  user_id: 'user-1',
  name: 'Streaming',
  created_at: '2026-01-01T00:00:00Z',
};

const pedro: peopleLib.Person = {
  id: 'person-1',
  user_id: 'user-1',
  name: 'Pedro',
  phone: null,
  color: null,
  archived: false,
  created_at: '2026-01-01T00:00:00Z',
};

const nega: peopleLib.Person = {
  id: 'person-2',
  user_id: 'user-1',
  name: 'Nega',
  phone: null,
  color: null,
  archived: false,
  created_at: '2026-01-01T00:00:00Z',
};

const netflixMemoryRule = {
  id: 'rule-1',
  key: 'NETFLIX COM|-5990',
  sampleDescription: 'Netflix.com',
  amountCents: -5990,
  personIds: ['person-1', 'person-2'],
  categoryId: 'cat-stream',
};

function keyOf(tx: MergedTransaction): string {
  return `${tx.fitid}|${tx.amountCents}|${tx.description.trim()}`;
}

function renderImportar() {
  return render(
    <MemoryRouter>
      <Importar />
    </MemoryRouter>,
  );
}

async function uploadFile(user: ReturnType<typeof userEvent.setup>, content: string, filename = 'extrato.ofx') {
  const file = new File([content], filename, { type: 'text/plain' });
  const input = screen.getByLabelText(/arquivo ofx/i);
  await user.upload(input, file);
}

function rowFor(description: string): HTMLElement {
  const el = screen.getByText(description, { selector: 'span' });
  const li = el.closest('li');
  if (!li) throw new Error(`linha não encontrada para "${description}"`);
  return li as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAccounts.listAccounts.mockResolvedValue([account]);
  mockedCategories.listCategories.mockResolvedValue([category]);
  mockedPeople.listPeople.mockResolvedValue([pedro, nega]);
  mockedMemoryRules.listMemoryRules.mockResolvedValue([netflixMemoryRule]);
  mockedClosedMonths.listClosedMonthFingerprints.mockResolvedValue([]);
  mockedOpenImportFingerprints.listOpenImportFingerprints.mockResolvedValue([]);
  mockedImportTransactions.importOfxTransactions.mockResolvedValue({ inserted: 7 });
});

describe('Importar', () => {
  it('arquivo válido é parseado através do domínio e chega na revisão', async () => {
    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);

    expect(await screen.findByRole('button', { name: /confirmar importação/i })).toBeTruthy();
    expect(screen.getByText('Netflix.com')).toBeTruthy();
  });

  it('merge é aplicado: 2 linhas do mesmo FITID (compra + IOF) viram 1 item somado, com parcela', async () => {
    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);
    await screen.findByRole('button', { name: /confirmar importação/i });

    const row = rowFor('Loja Parc 2/12');
    expect(within(row).getByText(/mesclado de 2 linhas/i)).toBeTruthy();
    expect(within(row).getByText('2/12')).toBeTruthy();
    expect(within(row).getByText(/r\$ 1\.015,00/i)).toBeTruthy();
  });

  it('item ambíguo (grupo de 4+ FITID) permanece pendente de revisão manual, nunca mescla sozinho', async () => {
    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);
    await screen.findByRole('button', { name: /confirmar importação/i });

    expect(screen.getByText(/pendentes de revisão manual/i)).toBeTruthy();
    expect(screen.getByText('Linha A')).toBeTruthy();
    expect(screen.getByText('Linha B')).toBeTruthy();
    expect(screen.getByText('Linha C')).toBeTruthy();
    expect(screen.getByText('Linha D')).toBeTruthy();
  });

  it('memória pré-preenche categoria e pessoas, e marca visualmente a origem', async () => {
    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);
    await screen.findByRole('button', { name: /confirmar importação/i });

    const row = rowFor('Netflix.com');
    expect(within(row).getByText(/memória/i)).toBeTruthy();
    expect((within(row).getByLabelText(/categoria/i) as HTMLSelectElement).value).toBe('cat-stream');
    expect((within(row).getByRole('checkbox', { name: /pedro/i }) as HTMLInputElement).checked).toBe(true);
    expect((within(row).getByRole('checkbox', { name: /nega/i }) as HTMLInputElement).checked).toBe(true);
  });

  it('item sugerido como ignorado (sinal oposto/pagamento) permanece representado na lista, nunca some', async () => {
    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);
    await screen.findByRole('button', { name: /confirmar importação/i });

    const row = rowFor('Pagamento recebido');
    expect(within(row).getByText(/sugestão: ignorar/i)).toBeTruthy();
    const checkbox = within(row).getByRole('checkbox', { name: /ignorar este lançamento/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('match total de assinatura bloqueia a importação (nunca permite mesmo confirmando)', async () => {
    const statement = parseOfx(SAMPLE_OFX);
    const merged = mergeByFitid(statement.transactions);
    const signature = await computeStatementSignature(merged);
    mockedClosedMonths.listClosedMonthFingerprints.mockResolvedValue([
      { competency: '2026-06', signature, itemKeys: [] },
    ]);

    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);

    expect(await screen.findByText(/já ter sido importado integralmente/i)).toBeTruthy();
    await screen.findByLabelText(/conta de destino/i);
    await user.selectOptions(screen.getByLabelText(/conta de destino/i), 'acc1');

    expect((screen.getByRole('button', { name: /confirmar importação/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(mockedImportTransactions.importOfxTransactions).not.toHaveBeenCalled();
  });

  it('CASO A — reimportação do mesmo OFX num mês AINDA ABERTO (sem closed_months) também é bloqueada', async () => {
    // Simula: este extrato já foi importado antes (transactions persistidas com source='ofx'),
    // o mês nunca foi fechado (nenhuma linha em closed_months existe pra ele). A detecção precisa
    // vir da reconstrução via transactions (listOpenImportFingerprints), não de closed_months.
    const statement = parseOfx(SAMPLE_OFX);
    const merged = mergeByFitid(statement.transactions);
    const signatureOfPriorImport = await computeStatementSignature(merged);

    mockedClosedMonths.listClosedMonthFingerprints.mockResolvedValue([]);
    mockedOpenImportFingerprints.listOpenImportFingerprints.mockResolvedValue([
      { competency: '2026-07', signature: signatureOfPriorImport, itemKeys: merged.map(keyOf) },
    ]);

    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);

    expect(await screen.findByText(/já ter sido importado integralmente/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/conta de destino/i), 'acc1');
    expect((screen.getByRole('button', { name: /confirmar importação/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(mockedImportTransactions.importOfxTransactions).not.toHaveBeenCalled();
  });

  it('match parcial (>50%) só avisa — não bloqueia, sempre permite importar mesmo assim', async () => {
    const statement = parseOfx(SAMPLE_OFX);
    const merged = mergeByFitid(statement.transactions);
    const overlappingKeys = merged.slice(0, 5).map(keyOf);
    mockedClosedMonths.listClosedMonthFingerprints.mockResolvedValue([
      { competency: '2026-06', signature: 'assinatura-antiga-diferente', itemKeys: overlappingKeys },
    ]);

    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);

    expect(await screen.findByText(/já apareceu no mês 2026-06/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/conta de destino/i), 'acc1');
    expect((screen.getByRole('button', { name: /confirmar importação/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('confirmação: múltiplas pessoas fecham exatamente o valor, description_norm vem do domínio, payload correto', async () => {
    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);
    await screen.findByRole('button', { name: /confirmar importação/i });

    await user.selectOptions(screen.getByLabelText(/conta de destino/i), 'acc1');
    await user.click(screen.getByRole('button', { name: /confirmar importação/i }));

    await waitFor(() => expect(mockedImportTransactions.importOfxTransactions).toHaveBeenCalledTimes(1));

    const payload = mockedImportTransactions.importOfxTransactions.mock.calls[0]![0];
    const netflix = payload.find((tx) => tx.fitid === 'T1')!;
    expect(netflix.accountId).toBe('acc1');
    expect(netflix.descriptionNorm).toBe('NETFLIX COM');
    expect(netflix.fromMemory).toBe(true);
    expect(netflix.people).toEqual([
      { personId: 'person-1', shareCents: -2995 },
      { personId: 'person-2', shareCents: -2995 },
    ]);
    expect(netflix.people.reduce((sum, p) => sum + p.shareCents, 0)).toBe(netflix.amountCents);

    expect(await screen.findByText(/7 lançamento\(s\) importado/i)).toBeTruthy();
  });

  it('rateio inválido (soma diferente do valor) bloqueia o botão e nunca chama a persistência', async () => {
    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);
    await screen.findByRole('button', { name: /confirmar importação/i });
    await user.selectOptions(screen.getByLabelText(/conta de destino/i), 'acc1');

    const row = rowFor('Netflix.com');
    const shareInput = within(row).getByRole('textbox', { name: /pedro/i });
    await user.clear(shareInput);
    await user.type(shareInput, '10,00');
    shareInput.blur();

    expect(within(row).getByText(/soma do rateio/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /confirmar importação/i }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: /confirmar importação/i }));
    expect(mockedImportTransactions.importOfxTransactions).not.toHaveBeenCalled();
  });

  it('duplo clique não dispara duas chamadas de importação', async () => {
    let resolveImport: ((value: { inserted: number }) => void) | undefined;
    mockedImportTransactions.importOfxTransactions.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        }),
    );

    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);
    await screen.findByRole('button', { name: /confirmar importação/i });
    await user.selectOptions(screen.getByLabelText(/conta de destino/i), 'acc1');

    const button = screen.getByRole('button', { name: /confirmar importação/i });
    await user.click(button);
    await user.click(button);

    expect(mockedImportTransactions.importOfxTransactions).toHaveBeenCalledTimes(1);

    resolveImport?.({ inserted: 7 });
    await screen.findByText(/lançamento\(s\) importado/i);
  });

  it('erro do Supabase na confirmação aparece de forma amigável, sem stack trace ou mensagem crua', async () => {
    mockedImportTransactions.importOfxTransactions.mockRejectedValue(
      new Error('duplicate key value violates constraint "transactions_pkey"'),
    );

    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);
    await screen.findByRole('button', { name: /confirmar importação/i });
    await user.selectOptions(screen.getByLabelText(/conta de destino/i), 'acc1');
    await user.click(screen.getByRole('button', { name: /confirmar importação/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/não foi possível concluir a importação/i);
    expect(alert.textContent).not.toMatch(/duplicate key/i);
    expect(alert.textContent).not.toMatch(/constraint/i);
  });

  it('arquivo com extensão inválida é rejeitado antes de qualquer parse', async () => {
    renderImportar();
    // userEvent.upload respeita o atributo accept do input e nem dispara o evento pra um
    // arquivo fora do filtro — aqui o alvo é a validação da própria aplicação (defesa em
    // profundidade, já que o filtro accept do navegador pode ser contornado por "Todos os arquivos"),
    // então disparamos o evento de mudança diretamente.
    const file = new File(['qualquer coisa'], 'extrato.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/arquivo ofx/i) as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText(/selecione um arquivo \.ofx ou \.txt/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /confirmar importação/i })).toBeNull();
  });

  it('OFX sem nenhuma transação mostra estado vazio, sem quebrar', async () => {
    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, '<OFX></OFX>');

    expect(await screen.findByText(/nenhum lançamento foi encontrado/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /confirmar importação/i })).toBeNull();
  });

  it('erro ao carregar dados de apoio (categorias/pessoas/contas) mostra mensagem amigável, sem stack trace', async () => {
    mockedCategories.listCategories.mockRejectedValue(new Error('relation "categories" does not exist'));

    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/não foi possível carregar os dados necessários/i);
    expect(alert.textContent).not.toMatch(/relation/i);
  });

  it('nunca loga nada no console durante parse, revisão e confirmação', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const user = userEvent.setup();
    renderImportar();
    await uploadFile(user, SAMPLE_OFX);
    await screen.findByRole('button', { name: /confirmar importação/i });
    await user.selectOptions(screen.getByLabelText(/conta de destino/i), 'acc1');
    await user.click(screen.getByRole('button', { name: /confirmar importação/i }));
    await screen.findByText(/lançamento\(s\) importado/i);

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
