// Session Timing Validation

import { InstrumentType } from '@/types/analysis';

/**
 * Check if current time is within valid trading session
 */
export function isValidSessionTime(
  timestamp: Date,
  instrument: string,
  instrumentType: InstrumentType
): boolean {
  // Synthetic indices ignore session timing
  if (instrumentType === 'synthetic') {
    return true;
  }

  const hour = timestamp.getUTCHours();
  const minute = timestamp.getUTCMinutes();
  const timeInMinutes = hour * 60 + minute;

  // London Open: 08:00 - 12:00 UTC
  const londonOpenStart = 8 * 60; // 08:00 UTC
  const londonOpenEnd = 12 * 60; // 12:00 UTC

  // NY Kill Zone: 13:00 - 16:00 UTC
  const nyKillZoneStart = 13 * 60; // 13:00 UTC
  const nyKillZoneEnd = 16 * 60; // 16:00 UTC

  // Check if time is within London Open or NY Kill Zone
  const inLondonOpen =
    timeInMinutes >= londonOpenStart && timeInMinutes <= londonOpenEnd;
  const inNYKillZone =
    timeInMinutes >= nyKillZoneStart && timeInMinutes <= nyKillZoneEnd;

  return inLondonOpen || inNYKillZone;
}

/**
 * Get session name for current time
 */
export function getCurrentSession(timestamp: Date): string {
  const hour = timestamp.getUTCHours();
  const minute = timestamp.getUTCMinutes();
  const timeInMinutes = hour * 60 + minute;

  // London Open: 08:00 - 12:00 UTC
  if (timeInMinutes >= 8 * 60 && timeInMinutes <= 12 * 60) {
    return 'london-open';
  }

  // NY Kill Zone: 13:00 - 16:00 UTC
  if (timeInMinutes >= 13 * 60 && timeInMinutes <= 16 * 60) {
    return 'ny-kill-zone';
  }

  // Asian Range: 00:00 - 08:00 UTC
  if (timeInMinutes >= 0 && timeInMinutes < 8 * 60) {
    return 'asian-range';
  }

  return 'outside-session';
}

/**
 * Get next session start time
 */
export function getNextSessionStart(timestamp: Date): Date {
  const hour = timestamp.getUTCHours();
  const minute = timestamp.getUTCMinutes();
  const timeInMinutes = hour * 60 + minute;

  const next = new Date(timestamp);

  if (timeInMinutes < 8 * 60) {
    // Next is London Open at 08:00
    next.setUTCHours(8, 0, 0, 0);
  } else if (timeInMinutes < 13 * 60) {
    // Next is NY Kill Zone at 13:00
    next.setUTCHours(13, 0, 0, 0);
  } else {
    // Next is London Open tomorrow
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(8, 0, 0, 0);
  }

  return next;
}

