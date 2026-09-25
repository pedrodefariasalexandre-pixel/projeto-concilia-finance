import { supabase } from './supabaseClient';

export type PinStatus = {
  configured: boolean;
  retryAfterSeconds: number | null;
};

export type SetPinResult = { status: 'ok' | 'invalid_format' | 'already_configured' };

export type VerifyPinResult =
  | { status: 'success' }
  | { status: 'invalid' }
  | { status: 'invalid_format' }
  | { status: 'not_configured' }
  | { status: 'locked'; retryAfterSeconds: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Nunca assume sucesso diante de um formato desconhecido — falha fechado. */
function parseRetryAfterSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  throw new Error('Resposta inesperada do servidor (retry_after_seconds).');
}

export async function getPinStatus(): Promise<PinStatus> {
  const { data, error } = await supabase.rpc('get_pin_status');
  if (error) throw error;
  if (!isRecord(data) || typeof data.configured !== 'boolean') {
    throw new Error('Resposta inesperada do servidor (get_pin_status).');
  }
  return {
    configured: data.configured,
    retryAfterSeconds: parseRetryAfterSeconds(data.retry_after_seconds),
  };
}

export async function setPin(pin: string): Promise<SetPinResult> {
  const { data, error } = await supabase.rpc('set_pin', { candidate_pin: pin });
  if (error) throw error;
  if (!isRecord(data) || typeof data.status !== 'string') {
    throw new Error('Resposta inesperada do servidor (set_pin).');
  }
  if (data.status === 'ok' || data.status === 'invalid_format' || data.status === 'already_configured') {
    return { status: data.status };
  }
  throw new Error(`Resposta inesperada do servidor (set_pin): ${data.status}`);
}

export async function verifyPin(pin: string): Promise<VerifyPinResult> {
  const { data, error } = await supabase.rpc('verify_pin', { candidate_pin: pin });
  if (error) throw error;
  if (!isRecord(data) || typeof data.status !== 'string') {
    throw new Error('Resposta inesperada do servidor (verify_pin).');
  }

  switch (data.status) {
    case 'success':
    case 'invalid':
    case 'invalid_format':
    case 'not_configured':
      return { status: data.status };
    case 'locked': {
      const retryAfterSeconds = parseRetryAfterSeconds(data.retry_after_seconds);
      if (retryAfterSeconds === null) {
        throw new Error('Resposta inesperada do servidor (verify_pin locked sem retry_after_seconds).');
      }
      return { status: 'locked', retryAfterSeconds };
    }
    default:
      throw new Error(`Resposta inesperada do servidor (verify_pin): ${data.status}`);
  }
}
