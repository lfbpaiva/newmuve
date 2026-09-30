import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HANDLED_EVENTS = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'])

serve(async (req: Request) => {
  const webhookToken = req.headers.get('asaas-access-token')
  const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

  if (!webhookToken || webhookToken !== expectedToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json()
  const { event, payment } = body

  if (!HANDLED_EVENTS.has(event)) {
    return new Response(JSON.stringify({ received: true, handled: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const newStatus = event === 'PAYMENT_RECEIVED' ? 'RECEIVED' : 'CONFIRMED'

  // Update payments table
  const { error: paymentError } = await supabase
    .from('payments')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('asaas_id', payment.id)

  if (paymentError) {
    console.error('Failed to update payment:', paymentError)
    return new Response(JSON.stringify({ error: 'DB error', details: paymentError }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fetch the local payment to get order_id
  const { data: localPayment } = await supabase
    .from('payments')
    .select('order_id')
    .eq('asaas_id', payment.id)
    .single()

  if (localPayment?.order_id) {
    const orderStatus = newStatus === 'CONFIRMED' ? 'PAID' : 'PAYMENT_RECEIVED'
    await supabase
      .from('orders')
      .update({ status: orderStatus, updated_at: new Date().toISOString() })
      .eq('id', localPayment.order_id)
  }

  return new Response(JSON.stringify({ received: true, handled: true, status: newStatus }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
