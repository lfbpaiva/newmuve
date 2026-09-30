export type PaymentStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'CANCELLED'

export type BillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD'

export interface Payment {
  id: string
  orderId: string
  userId: string
  status: PaymentStatus
  amount: number
  billingType: BillingType
  asaasId: string
  pixCopyPaste: string | null
  pixQrCode: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePixInput {
  orderId: string
  amount: number
  customer: string
  description?: string
}

export interface CreatePixResult {
  paymentId: string
  status: PaymentStatus
  pixCopyPaste: string | null
  pixQrCode: string | null
}

export interface PaymentState {
  loading: boolean
  error: string | null
  payment: CreatePixResult | null
}
