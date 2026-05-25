import { describe, expect, it } from 'vitest';
import { isWithinChargeScheduleWindow, getActiveScheduleWindow } from '../src/utils.js';
import type { ChargeSchedule, ChargeScheduleWindow, HomeChargerSchedule } from '../src/types.js';

function makeDate(hours: number, minutes: number, dayOfWeek?: number): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  if (dayOfWeek !== undefined) {
    // Shift to the desired day of week without changing time
    const delta = dayOfWeek - d.getDay();
    d.setDate(d.getDate() + delta);
  }
  return d;
}

const WEEKDAY = 2; // Tuesday
const SATURDAY = 6;
const SUNDAY = 0;

const touSchedule: ChargeSchedule = {
  weekdays: { startTime: '22:00', endTime: '6:00' },
  weekends: { startTime: '22:00', endTime: '8:00' },
};

function makeSchedule(overrides: Partial<HomeChargerSchedule> = {}): HomeChargerSchedule {
  return {
    hasTouPricing: false,
    scheduleEnabled: true,
    hasUtilityInfo: false,
    basedOnUtility: null,
    defaultSchedule: {
      weekdays: { startTime: '0:00', endTime: '23:59' },
      weekends: { startTime: '0:00', endTime: '23:59' },
    },
    ...overrides,
  };
}

describe('isWithinChargeScheduleWindow()', () => {
  const solarWindow: ChargeScheduleWindow = { startTime: '9:00', endTime: '17:00' };
  const overnightWindow: ChargeScheduleWindow = { startTime: '22:00', endTime: '6:00' };

  describe('normal (non-midnight-crossing) window', () => {
    it('returns true when time is inside the window', () => {
      // 13:10 is the scenario from the bug report — high solar at 1:10 PM
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(13, 10))).toBe(true);
    });

    it('returns true at the start boundary (inclusive)', () => {
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(9, 0))).toBe(true);
    });

    it('returns false at the end boundary (exclusive)', () => {
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(17, 0))).toBe(false);
    });

    it('returns false before the window', () => {
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(8, 59))).toBe(false);
    });

    it('returns false after the window', () => {
      expect(isWithinChargeScheduleWindow(solarWindow, makeDate(17, 1))).toBe(false);
    });
  });

  describe('midnight-crossing window', () => {
    it('returns true when time is after start (same evening)', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(23, 30))).toBe(true);
    });

    it('returns true at the start boundary', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(22, 0))).toBe(true);
    });

    it('returns true when time is before end (early morning)', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(3, 0))).toBe(true);
    });

    it('returns false at the end boundary (exclusive)', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(6, 0))).toBe(false);
    });

    it('returns false during midday — reproduces the 1:10 PM solar bug', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(13, 10))).toBe(false);
    });

    it('returns false between end and start', () => {
      expect(isWithinChargeScheduleWindow(overnightWindow, makeDate(12, 0))).toBe(false);
    });
  });
});

describe('getActiveScheduleWindow()', () => {
  it('returns null when schedule is disabled', () => {
    const schedule = makeSchedule({ scheduleEnabled: false, userSchedule: touSchedule });
    expect(getActiveScheduleWindow(schedule)).toBeNull();
  });

  it('prefers userSchedule over defaultSchedule', () => {
    const schedule = makeSchedule({ userSchedule: touSchedule });
    const window = getActiveScheduleWindow(schedule, makeDate(10, 0, WEEKDAY));
    expect(window?.startTime).toBe('22:00');
    expect(window?.endTime).toBe('6:00');
  });

  it('prefers utilitySchedule over defaultSchedule when no userSchedule', () => {
    const utilitySchedule: ChargeSchedule = {
      weekdays: { startTime: '23:00', endTime: '7:00' },
      weekends: { startTime: '23:00', endTime: '9:00' },
    };
    const schedule = makeSchedule({ utilitySchedule });
    const window = getActiveScheduleWindow(schedule, makeDate(10, 0, WEEKDAY));
    expect(window?.startTime).toBe('23:00');
  });

  it('falls back to defaultSchedule when no user or utility schedule', () => {
    const schedule = makeSchedule();
    const window = getActiveScheduleWindow(schedule, makeDate(10, 0, WEEKDAY));
    expect(window?.startTime).toBe('0:00');
    expect(window?.endTime).toBe('23:59');
  });

  it('returns weekday window on a weekday', () => {
    const schedule = makeSchedule({ userSchedule: touSchedule });
    const window = getActiveScheduleWindow(schedule, makeDate(10, 0, WEEKDAY));
    expect(window?.endTime).toBe('6:00');
  });

  it('returns weekend window on Saturday', () => {
    const schedule = makeSchedule({ userSchedule: touSchedule });
    const window = getActiveScheduleWindow(schedule, makeDate(10, 0, SATURDAY));
    expect(window?.endTime).toBe('8:00');
  });

  it('returns weekend window on Sunday', () => {
    const schedule = makeSchedule({ userSchedule: touSchedule });
    const window = getActiveScheduleWindow(schedule, makeDate(10, 0, SUNDAY));
    expect(window?.endTime).toBe('8:00');
  });

  it('composes with isWithinChargeScheduleWindow — TOU user in window', () => {
    const schedule = makeSchedule({ userSchedule: touSchedule });
    const window = getActiveScheduleWindow(schedule, makeDate(23, 0, WEEKDAY));
    expect(window).not.toBeNull();
    expect(isWithinChargeScheduleWindow(window!, makeDate(23, 0, WEEKDAY))).toBe(true);
  });

  it('composes with isWithinChargeScheduleWindow — TOU user outside window (midday)', () => {
    const schedule = makeSchedule({ userSchedule: touSchedule });
    const window = getActiveScheduleWindow(schedule, makeDate(13, 10, WEEKDAY));
    expect(window).not.toBeNull();
    expect(isWithinChargeScheduleWindow(window!, makeDate(13, 10, WEEKDAY))).toBe(false);
  });

  it('solar-only user: null window signals custom logic should run', () => {
    // User has no ChargePoint schedule — getActiveScheduleWindow returns null
    const schedule = makeSchedule({ scheduleEnabled: false });
    const window = getActiveScheduleWindow(schedule);
    expect(window).toBeNull();

    // Caller applies their own solar window
    const solarWindow: ChargeScheduleWindow = { startTime: '7:00', endTime: '19:00' };
    expect(isWithinChargeScheduleWindow(solarWindow, makeDate(13, 10))).toBe(true);
  });
});
