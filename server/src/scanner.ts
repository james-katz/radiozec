import { ZkoolClient } from './zkool';
import { Donation, getQueuePrice, getSkipPrice } from './db';
import { extractYouTubeUrlFromMemo } from './youtube';
import { enqueue, skipCurrent } from './queue';
import { config } from './config';
import { consumePendingRequest } from './pendingRequests';

let scanTimer: ReturnType<typeof setInterval> | null = null;
let lastProcessedTxid: string | null = null;

/**
 * Initialize the donation scanner.
 * Starts polling Zkool for new incoming transactions.
 */
export function startScanner(zkool: ZkoolClient): void {
  if (scanTimer) clearInterval(scanTimer);

  // Set initial lastProcessedTxid from latest received donation in DB
  initializeLastTxid().then(() => {
    console.log(`[Scanner] Started (interval: ${config.scanIntervalMs}ms)`);
  });

  scanTimer = setInterval(async () => {
    try {
      await scanForDonations(zkool);
    } catch (err) {
      console.error('[Scanner] Error:', err);
    }
  }, config.scanIntervalMs);
}

export function stopScanner(): void {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

async function initializeLastTxid(): Promise<void> {
  const latest = await Donation.findOne({
    order: [['createdAt', 'DESC']],
  });
  lastProcessedTxid = latest?.txid ?? null;
}

/**
 * Extract a pending request ID from a memo with the `QUEUE:` prefix.
 * Returns the request ID or null if the memo doesn't match the format.
 */
function extractQueueRequestId(memo: string): string | null {
  const trimmed = memo.trim();
  if (trimmed.startsWith('QUEUE:')) {
    const id = trimmed.slice('QUEUE:'.length).trim();
    return id.length > 0 ? id : null;
  }
  return null;
}

async function scanForDonations(zkool: ZkoolClient): Promise<void> {
  const lastTx = await zkool.getLastTxId();
  if (!lastTx.txid) return;

  // No new transactions
  if (lastTx.txid === lastProcessedTxid) {
    return;
  }

  console.log('[Scanner] Checking for new donations...');

  const txList = await zkool.getTransactions();
  const queuePrice = await getQueuePrice();
  const skipPrice = await getSkipPrice();

  let newDonations = 0;

  for (const tx of txList) {
    // Stop when we reach the last processed transaction
    if (tx.txid === lastProcessedTxid) break;

    // Only process incoming (received) transactions
    if (tx.value <= 0) continue;

    // Check if we already processed this one
    const existing = await Donation.findOne({ where: { txid: tx.txid } });
    if (existing) continue;

    // Fetch transaction details to get the memo
    const txInfo = await zkool.getTransactionInfo(tx.txid);

    let memo = '';
    if (txInfo.notes?.length > 0 && txInfo.notes[0].memo) {
      memo = txInfo.notes[0].memo;
    }

    const amount = Math.abs(tx.value);
    console.log(`[Scanner] New donation: ${amount} ZEC | Memo: "${memo}"`);

    // Determine action based on memo and amount
    let action: 'queue' | 'skip' | 'unknown' = 'unknown';
    let youtubeUrl: string | null = null;

    if (memo.trim().toUpperCase() === 'SKIP' && amount >= skipPrice) {
      action = 'skip';
    } else {
      // Try new format first: QUEUE:<requestId>
      const requestId = extractQueueRequestId(memo);
      if (requestId && amount >= queuePrice) {
        const pending = consumePendingRequest(requestId);
        if (pending) {
          action = 'queue';
          youtubeUrl = pending.youtubeId;
          console.log(`[Scanner] Matched pending request ${requestId} → ${pending.youtubeId}`);
        } else {
          console.warn(`[Scanner] Pending request not found or expired: ${requestId}`);
        }
      }

      // Backward compatibility: try legacy YouTube-URL-in-memo format
      if (action === 'unknown') {
        const videoId = extractYouTubeUrlFromMemo(memo);
        if (videoId && amount >= queuePrice) {
          action = 'queue';
          youtubeUrl = videoId;
          console.log(`[Scanner] Legacy memo format — extracted video ID: ${videoId}`);
        }
      }
    }

    // Record the donation
    await Donation.create({
      txid: tx.txid,
      value: amount,
      memo,
      youtubeUrl,
      action,
    });

    // Execute the action
    if (action === 'skip') {
      console.log(`[Scanner] Skip requested (${amount} ZEC)`);
      await skipCurrent();
    } else if (action === 'queue' && youtubeUrl) {
      console.log(`[Scanner] Queueing audio: ${youtubeUrl}`);
      await enqueue(youtubeUrl, tx.txid, amount);
    }

    newDonations++;
  }

  // Update the last processed txid
  if (txList.length > 0 && txList[0].value > 0) {
    lastProcessedTxid = txList[0].txid;
  } else if (lastTx.txid) {
    lastProcessedTxid = lastTx.txid;
  }

  if (newDonations > 0) {
    console.log(`[Scanner] Processed ${newDonations} new donation(s)`);
  }
}

