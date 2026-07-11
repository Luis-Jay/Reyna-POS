import { activationApi } from './activation'
import { settingsApi } from './settings'

export type ProAccessState = {
  activated: boolean
  batchPricingEnabled: boolean
  loyaltyEnabled: boolean
}

export async function getProAccessState(): Promise<ProAccessState> {
  const [activation, settings] = await Promise.all([
    activationApi.getStatus(),
    settingsApi.getAll(),
  ])

  return {
    activated: activation.activated === true,
    batchPricingEnabled: activation.activated === true && settings?.batch_pricing_enabled !== 'false',
    loyaltyEnabled: activation.activated === true && settings?.loyalty_enabled === 'true',
  }
}

export async function assertProAccess(message = 'This feature is available on Reyna Pro only.') {
  const access = await getProAccessState()
  if (!access.activated) {
    throw new Error(message)
  }
  return access
}
