export const MOBILE_CHECKOUT_ENABLED = false;

export const MOBILE_CHECKOUT_UNAVAILABLE_MESSAGE =
  'Checkout is temporarily unavailable on mobile during MVP testing. Please use the web app to complete payment.';

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
