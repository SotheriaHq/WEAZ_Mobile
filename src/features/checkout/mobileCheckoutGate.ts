import { env } from '@/src/config/env';

export const MOBILE_CHECKOUT_ENABLED = env.mobileCheckout.enabled;

export const MOBILE_CHECKOUT_UNAVAILABLE_MESSAGE =
  'Checkout is temporarily unavailable on mobile. Your bag stays saved and can still be completed on the web app.';

export class MobileCheckoutUnavailableError extends Error {
  constructor(message = MOBILE_CHECKOUT_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'MobileCheckoutUnavailableError';
  }
}

export function isMobileCheckoutEnabled() {
  return MOBILE_CHECKOUT_ENABLED;
}

export function getMobileCheckoutUnavailableMessage() {
  return MOBILE_CHECKOUT_UNAVAILABLE_MESSAGE;
}

export function assertMobileCheckoutEnabled() {
  if (!MOBILE_CHECKOUT_ENABLED) {
    throw new MobileCheckoutUnavailableError();
  }
}
