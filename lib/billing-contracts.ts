export type BillingProviderReference = {
  providerKey: string
  externalReference: string
}

export type ClubMerchantBillingContext = {
  barbershopId: string
  membershipId: string
  amount: string
  currency: string
  cycleStartsAt: Date
  cycleEndsAt: Date
}

export type PlatformSaasBillingContext = {
  barbershopId: string
  planKey: string
  price: string
  currency: string
  periodStartsAt: Date
  periodEndsAt: Date
}

export interface ClubMerchantBillingProvider {
  createCustomerPaymentAttempt(
    context: ClubMerchantBillingContext,
  ): Promise<BillingProviderReference>
}

export interface PlatformSaasBillingProvider {
  createPlatformSubscription(
    context: PlatformSaasBillingContext,
  ): Promise<{
    providerKey: string
    externalCustomerRef?: string
    externalSubscriptionRef: string
  }>
}
