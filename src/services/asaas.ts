import type { CreatePixInput, CreatePixResult } from '@/types/payment'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

function edgeFunctionUrl(fn: string): string {
  return `${SUPABASE_URL}/functions/v1/${fn}`
}

async function authHeaders(token: string): Promise<HeadersInit> {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
  }
}

export async function createPixCharge(
  input: CreatePixInput,
  userToken: string,
): Promise<CreatePixResult> {
  const response = await fetch(edgeFunctionUrl('create-pix'), {
    method: 'POST',
    headers: await authHeaders(userToken),
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(err?.error ?? 'Falha ao criar cobrança PIX')
  }

  return response.json() as Promise<CreatePixResult>
}
