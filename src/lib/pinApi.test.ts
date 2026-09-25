import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPinStatus, setPin, verifyPin } from './pinApi';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

const mockedSupabase = vi.mocked(supabase, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPinStatus', () => {
  it('retorna configured/retryAfterSeconds para uma resposta válida', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { configured: true, retry_after_seconds: 12 }, error: null } as never);

    const status = await getPinStatus();

    expect(status).toEqual({ configured: true, retryAfterSeconds: 12 });
    expect(mockedSupabase.rpc).toHaveBeenCalledWith('get_pin_status');
  });

  it('trata retry_after_seconds ausente como null', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { configured: false, retry_after_seconds: null }, error: null } as never);

    const status = await getPinStatus();

    expect(status).toEqual({ configured: false, retryAfterSeconds: null });
  });

  it('lança erro (nunca sucesso) para uma resposta em formato inesperado', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { oops: true }, error: null } as never);

    await expect(getPinStatus()).rejects.toThrow();
  });

  it('propaga erro de RPC/rede', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: new Error('network down') } as never);

    await expect(getPinStatus()).rejects.toThrow('network down');
  });
});

describe('setPin', () => {
  it('retorna ok', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'ok' }, error: null } as never);

    const result = await setPin('1234');

    expect(result).toEqual({ status: 'ok' });
    expect(mockedSupabase.rpc).toHaveBeenCalledWith('set_pin', { candidate_pin: '1234' });
  });

  it('retorna already_configured', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'already_configured' }, error: null } as never);

    expect(await setPin('1234')).toEqual({ status: 'already_configured' });
  });

  it('retorna invalid_format', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'invalid_format' }, error: null } as never);

    expect(await setPin('12')).toEqual({ status: 'invalid_format' });
  });

  it('lança erro para status desconhecido', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'wat' }, error: null } as never);

    await expect(setPin('1234')).rejects.toThrow();
  });
});

describe('verifyPin', () => {
  it('retorna success', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'success' }, error: null } as never);

    expect(await verifyPin('1234')).toEqual({ status: 'success' });
    expect(mockedSupabase.rpc).toHaveBeenCalledWith('verify_pin', { candidate_pin: '1234' });
  });

  it('retorna invalid', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'invalid' }, error: null } as never);

    expect(await verifyPin('0000')).toEqual({ status: 'invalid' });
  });

  it('retorna not_configured', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'not_configured' }, error: null } as never);

    expect(await verifyPin('1234')).toEqual({ status: 'not_configured' });
  });

  it('retorna locked com retryAfterSeconds', async () => {
    mockedSupabase.rpc.mockResolvedValue({
      data: { status: 'locked', retry_after_seconds: 28 },
      error: null,
    } as never);

    expect(await verifyPin('1234')).toEqual({ status: 'locked', retryAfterSeconds: 28 });
  });

  it('lança erro quando locked vem sem retry_after_seconds', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: { status: 'locked' }, error: null } as never);

    await expect(verifyPin('1234')).rejects.toThrow();
  });

  it('propaga erro de RPC/rede sem tratar como PIN inválido', async () => {
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: new Error('network down') } as never);

    await expect(verifyPin('1234')).rejects.toThrow('network down');
  });
});
