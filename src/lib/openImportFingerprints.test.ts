import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listOpenImportFingerprints } from './openImportFingerprints';
import { computeStatementSignature, itemKey } from '../domain/signature';
import { supabase } from './supabaseClient';

function createQueryBuilder() {
  const builder = { select: vi.fn(), eq: vi.fn() };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

vi.mock('./supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

const mockedSupabase = vi.mocked(supabase, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listOpenImportFingerprints', () => {
  it('consulta transactions filtrando por user_id e source=ofx (nunca closed_months)', async () => {
    const builder = createQueryBuilder();
    // a segunda chamada de .eq() (encadeada) precisa resolver a promise
    builder.eq.mockImplementationOnce(() => builder).mockImplementationOnce(() => Promise.resolve({ data: [], error: null }));
    mockedSupabase.from.mockReturnValue(builder as never);

    await listOpenImportFingerprints('user-1');

    expect(mockedSupabase.from).toHaveBeenCalledWith('transactions');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.eq).toHaveBeenCalledWith('source', 'ofx');
  });

  it('reconstrói um fingerprint por competência, com a MESMA assinatura que computeStatementSignature produziria pro mesmo conjunto', async () => {
    const rows = [
      { competency: '2026-07', fitid: 'T1', amount_cents: -5990, description: 'Netflix.com' },
      { competency: '2026-07', fitid: 'T2', amount_cents: -101500, description: 'Loja Parc 2/12' },
    ];
    const builder = createQueryBuilder();
    builder.eq.mockImplementationOnce(() => builder).mockImplementationOnce(() => Promise.resolve({ data: rows, error: null }));
    mockedSupabase.from.mockReturnValue(builder as never);

    const [fingerprint] = await listOpenImportFingerprints('user-1');

    const expectedTransactions = rows.map((r) => ({
      fitid: r.fitid,
      amountCents: r.amount_cents,
      description: r.description,
      postedOn: null,
      installment: null,
      mergePending: false,
    }));
    const expectedSignature = await computeStatementSignature(expectedTransactions);

    expect(fingerprint).toEqual({
      competency: '2026-07',
      signature: expectedSignature,
      itemKeys: expectedTransactions.map(itemKey),
    });
  });

  it('agrupa por competência separadamente quando há mais de uma', async () => {
    const rows = [
      { competency: '2026-06', fitid: 'A', amount_cents: -100, description: 'X' },
      { competency: '2026-07', fitid: 'B', amount_cents: -200, description: 'Y' },
    ];
    const builder = createQueryBuilder();
    builder.eq.mockImplementationOnce(() => builder).mockImplementationOnce(() => Promise.resolve({ data: rows, error: null }));
    mockedSupabase.from.mockReturnValue(builder as never);

    const fingerprints = await listOpenImportFingerprints('user-1');

    expect(fingerprints.map((f) => f.competency).sort()).toEqual(['2026-06', '2026-07']);
  });

  it('retorna lista vazia quando não há transações de fonte ofx', async () => {
    const builder = createQueryBuilder();
    builder.eq.mockImplementationOnce(() => builder).mockImplementationOnce(() => Promise.resolve({ data: [], error: null }));
    mockedSupabase.from.mockReturnValue(builder as never);

    expect(await listOpenImportFingerprints('user-1')).toEqual([]);
  });

  it('lança erro quando a consulta falha', async () => {
    const builder = createQueryBuilder();
    builder.eq
      .mockImplementationOnce(() => builder)
      .mockImplementationOnce(() => Promise.resolve({ data: null, error: new Error('boom') }));
    mockedSupabase.from.mockReturnValue(builder as never);

    await expect(listOpenImportFingerprints('user-1')).rejects.toThrow('boom');
  });
});
