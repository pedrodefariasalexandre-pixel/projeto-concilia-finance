import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importOfxTransactions } from './importTransactions';
import { supabase } from './supabaseClient';
import type { ImportTransactionInput } from './importTransactions';

vi.mock('./supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));

const mockedSupabase = vi.mocked(supabase, true);

function tx(overrides: Partial<ImportTransactionInput> = {}): ImportTransactionInput {
  return {
    accountId: 'acc1',
    competency: '2026-07',
    postedOn: '2026-07-05',
    amountCents: -5990,
    description: 'Netflix.com',
    descriptionNorm: 'NETFLIX COM',
    fitid: 'F1',
    installmentCurrent: null,
    installmentTotal: null,
    categoryId: null,
    ignored: false,
    mergePending: false,
    fromMemory: false,
    people: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('importOfxTransactions', () => {
  it('converte para snake_case e chama a RPC import_ofx_transactions', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'ok', inserted: 1 }, error: null } as never);

    const result = await importOfxTransactions([
      tx({ people: [{ personId: 'p1', shareCents: -2995 }, { personId: 'p2', shareCents: -2995 }] }),
    ]);

    expect(result).toEqual({ inserted: 1 });
    expect(mockedSupabase.rpc).toHaveBeenCalledWith('import_ofx_transactions', {
      payload: [
        {
          account_id: 'acc1',
          competency: '2026-07',
          posted_on: '2026-07-05',
          amount_cents: -5990,
          description: 'Netflix.com',
          description_norm: 'NETFLIX COM',
          fitid: 'F1',
          installment_current: null,
          installment_total: null,
          category_id: null,
          ignored: false,
          merge_pending: false,
          from_memory: false,
          people: [
            { person_id: 'p1', share_cents: -2995 },
            { person_id: 'p2', share_cents: -2995 },
          ],
        },
      ],
    });
  });

  it('nunca envia user_id — a RPC usa auth.uid() da sessão', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'ok', inserted: 1 }, error: null } as never);

    await importOfxTransactions([tx()]);

    const call = mockedSupabase.rpc.mock.calls[0]!;
    const payload = (call[1] as { payload: Record<string, unknown>[] }).payload;
    expect(payload[0]).not.toHaveProperty('user_id');
  });

  it('propaga erro do Supabase (ex.: rateio rejeitado pela RPC)', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: new Error('rateio inconsistente') } as never);

    await expect(importOfxTransactions([tx()])).rejects.toThrow('rateio inconsistente');
  });

  it('lança erro para resposta em formato inesperado', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { oops: true }, error: null } as never);

    await expect(importOfxTransactions([tx()])).rejects.toThrow();
  });
});
