/**
 * Escrow Auto-Release Scheduler
 *
 * Runs every 5 minutes and auto-releases any HELD payments
 * whose 24-hour window has expired.
 *
 * Usage: call startEscrowScheduler() once at server startup.
 * Call stopEscrowScheduler() for graceful shutdown.
 */

import { processExpiredEscrows } from './index';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

const runTick = async (): Promise<void> => {
  if (isRunning) {
    console.log('[EscrowScheduler] Previous tick still running — skipping');
    return;
  }

  isRunning = true;
  try {
    const released = await processExpiredEscrows();
    if (released > 0) {
      console.log(`[EscrowScheduler] Auto-released ${released} payment(s)`);
    }
  } catch (err) {
    console.error('[EscrowScheduler] Tick error:', err);
  } finally {
    isRunning = false;
  }
};

export const startEscrowScheduler = (): void => {
  if (intervalHandle) {
    console.warn('[EscrowScheduler] Already running');
    return;
  }

  console.log(`[EscrowScheduler] Started — checking every ${INTERVAL_MS / 60000} minutes`);

  // Run immediately on startup to catch any that were missed during downtime
  runTick();

  intervalHandle = setInterval(runTick, INTERVAL_MS);
};

export const stopEscrowScheduler = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[EscrowScheduler] Stopped');
  }
};
