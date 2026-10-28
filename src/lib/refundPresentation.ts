/** Provider processing and credit to a shopper's bank are separate events. */
export function describeRefund(status: unknown): { title: string; description: string } | null {
  if (typeof status !== 'string' || !status.trim()) return null;
  switch (status.trim().toUpperCase()) {
    case 'REQUESTED':
      return { title: 'Refund requested', description: 'Your refund request is recorded and waiting to be sent to the payment provider.' };
    case 'SUBMITTING':
      return { title: 'Refund being submitted', description: 'WIEZ is sending your refund to the payment provider. This does not confirm bank credit.' };
    case 'PROCESSING':
      return { title: 'Refund processing', description: 'The payment provider is processing your refund. Bank credit is not yet confirmed.' };
    case 'FAILED':
      return { title: 'Refund retry pending', description: 'Your refund has not completed. WIEZ has recorded the unsuccessful attempt for retry.' };
    case 'NEEDS_ATTENTION':
      return { title: 'Refund needs WIEZ attention', description: 'Your refund request remains recorded. Contact WIEZ through your order conversation for help verifying the payment provider’s result.' };
    case 'SETTLED':
      return { title: 'Refund processed by the payment provider', description: 'The provider confirmed processing. Your bank or original payment method may take additional time to show the credit.' };
    default:
      return { title: 'Refund status being verified', description: 'WIEZ has not confirmed completion. Refresh the order for the latest refund status.' };
  }
}
