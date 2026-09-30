import { useState, useCallback } from 'react'
import { createPixCharge } from '@/services/asaas'
import type { CreatePixInput, CreatePixResult, PaymentState } from '@/types/payment'

export function usePayment(userToken: string) {
  const [state, setState] = useState<PaymentState>({
    loading: false,
    error: null,
    payment: null,
  })

  const initiatePix = useCallback(
    async (input: CreatePixInput): Promise<CreatePixResult | null> => {
      setState({ loading: true, error: null, payment: null })
      try {
        const result = await createPixCharge(input, userToken)
        setState({ loading: false, error: null, payment: result })
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro inesperado'
        setState({ loading: false, error: message, payment: null })
        return null
      }
    },
    [userToken],
  )

  const reset = useCallback(() => {
    setState({ loading: false, error: null, payment: null })
  }, [])

  return { ...state, initiatePix, reset }
}
