/**
 * Build a ZIP-321 payment request URI.
 * Format: zcash:<address>?amount=<amount>&memo=<base64url-encoded-memo>
 * @see https://zips.z.cash/zip-0321
 */
export function buildPaymentUri(address: string, amount: number, memo: string): string {
  const parts = [`zcash:${address}`];
  const params: string[] = [];

  if (amount > 0) {
    params.push(`amount=${amount}`);
  }

  if (memo) {
    const encoded = Buffer.from(memo, 'utf-8').toString('base64url');
    params.push(`memo=${encoded}`);
  }

  if (params.length > 0) {
    parts.push(params.join('&'));
  }

  return parts.join('?');
}

/**
 * Build a "Queue Video" payment URI.
 * Memo contains `QUEUE:<requestId>` to match against pending requests.
 */
export function buildQueueUri(address: string, price: number, requestId: string): string {
  return buildPaymentUri(address, price, `QUEUE:${requestId}`);
}

/**
 * Build a "Skip Video" payment URI.
 * Memo contains "SKIP" to signal the scanner.
 */
export function buildSkipUri(address: string, price: number): string {
  return buildPaymentUri(address, price, 'SKIP');
}
