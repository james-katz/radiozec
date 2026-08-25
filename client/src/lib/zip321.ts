/**
 * Build a ZIP-321 payment request URI (client-side).
 */
export function buildPaymentUri(address: string, amount: number, memo: string): string {
  const parts = [`zcash:${address}`];
  const params: string[] = [];

  if (amount > 0) {
    params.push(`amount=${amount}`);
  }

  if (memo) {
    const encoded = btoa(memo)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    params.push(`memo=${encoded}`);
  }

  if (params.length > 0) {
    parts.push(params.join('&'));
  }

  return parts.join('?');
}
