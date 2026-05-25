import type { ChargeSchedule, ChargeScheduleWindow, HomeChargerSchedule, TimeString } from './types.js';

function parseTimeString(t: TimeString): [number, number] {
  const parts = (t as string).split(':');
  return [Number(parts[0]), Number(parts[1])];
}

/**
 * Returns true if the time component of `date` falls within the given schedule window.
 *
 * Handles midnight-crossing windows (e.g. startTime "22:00", endTime "06:00").
 * The start boundary is inclusive; the end boundary is exclusive.
 */
export function isWithinChargeScheduleWindow(window: ChargeScheduleWindow, date: Date = new Date()): boolean {
  const [startH, startM] = parseTimeString(window.startTime);
  const [endH, endM] = parseTimeString(window.endTime);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Midnight-crossing window
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * Returns the ChargePoint schedule window that is currently active, or null if the
 * ChargePoint schedule is disabled.
 *
 * Priority when multiple schedules are present: userSchedule > utilitySchedule > defaultSchedule.
 * Automatically picks the weekday or weekend window based on `date`.
 *
 * Combine with isWithinChargeScheduleWindow to check whether charging should run now:
 *
 *   const window = getActiveScheduleWindow(schedule);
 *   if (window) {
 *     // ChargePoint schedule is on — check if we're in it
 *     const inWindow = isWithinChargeScheduleWindow(window);
 *   } else {
 *     // Schedule is off — apply your own logic (solar window, time-of-day, etc.)
 *   }
 */
export function getActiveScheduleWindow(
  schedule: HomeChargerSchedule,
  date: Date = new Date(),
): ChargeScheduleWindow | null {
  if (!schedule.scheduleEnabled) return null;

  // Prefer the most specific schedule the user has configured.
  const active: ChargeSchedule =
    schedule.userSchedule ?? schedule.utilitySchedule ?? schedule.defaultSchedule;

  // getDay(): 0 = Sunday, 6 = Saturday
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;

  return isWeekend ? active.weekends : active.weekdays;
}
