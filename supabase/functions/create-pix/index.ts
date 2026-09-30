import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const token = authHeader.replace('Bearer ', '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const asaasApiKey = Deno.env.get('ASAAS_API_KEY')!
  const asaasApiUrl = Deno.env.get('ASAAS_API_URL')!

  const body = await req.json()
  const { orderId, amount, customer, description } = body

  // Create PIX charge on Asaas
  const asaasResponse = await fetch(`${asaasApiUrl}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': asaasApiKey,
    },
    body: JSON.stringify({
      customer,
      billingType: 'PIX',
      value: amount,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: description ?? `Pedido #${orderId}`,
      externalReference: orderId,
    }),
  })

  if (!asaasResponse.ok) {
    const err = await asaasResponse.json()
    return new Response(JSON.stringify({ error: 'Asaas error', details: err }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const payment = await asaasResponse.json()

  // Fetch PIX QR code
  const pixResponse = await fetch(`${asaasApiUrl}/payments/${payment.id}/pixQrCode`, {
    headers: { 'access_token': asaasApiKey },
  })
  const pixData = pixResponse.ok ? await pixResponse.json() : null

  // Persist payment record in Supabase
  await supabase.from('payments').insert({
    id: payment.id,
    order_id: orderId,
    user_id: user.id,
    status: 'PENDING',
    amount,
    billing_type: 'PIX',
    asaas_id: payment.id,
    pix_copy_paste: pixData?.payload ?? null,
    pix_qr_code: pixData?.encodedImage ?? null,
  })

  return new Response(
    JSON.stringify({
      paymentId: payment.id,
      status: payment.status,
      pixCopyPaste: pixData?.payload ?? null,
      pixQrCode: pixData?.encodedImage ?? null,
    }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
