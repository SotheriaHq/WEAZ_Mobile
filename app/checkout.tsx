import { Redirect } from 'expo-router';

import { useAuth } from '@/src/auth/AuthContext';
import { isBrandAccount } from '@/src/auth/brandAccess';
import MobileCheckoutScreen from '@/src/features/checkout/MobileCheckoutScreen';

/**
 * Checkout is a shopper surface, like the Bag chip that leads to it. A guest
 * or brand who reaches this route anyway (a deep link, a restored route) goes
 * home instead of into buyer-only requests the server would refuse.
 */
export default function CheckoutScreen() {
  const { status, user } = useAuth();
  if (status === 'unauthenticated' || isBrandAccount(user)) {
    return <Redirect href="/" />;
  }
  return <MobileCheckoutScreen />;
}
