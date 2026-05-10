import { describe, it, expect, beforeAll } from 'vitest';
import { createAuthenticatedClient } from './auth.js';
import type { ChargePoint } from '../../src/client.js';

let client: ChargePoint;
let chargerId: number;

const MUTATIONS_ENABLED = process.env['E2E_MUTATIONS'] === 'true';

beforeAll(async () => {
  const ctx = await createAuthenticatedClient();
  client = ctx.client;
  if (ctx.chargerId === undefined) {
    throw new Error('[E2E] No home chargers found on this account. Charger tests cannot run.');
  }
  chargerId = ctx.chargerId;

  if (process.env['E2E_DEBUG'] === 'true') {
    const ep = client.globalConfig.endpoints;
    const account = await client.getAccount();
    const uid = account.user.userId;

    const raw = async (url: string) => {
      const r = await client._request('GET', url);
      return r.json();
    };

    console.log('[E2E DEBUG] charger status:', JSON.stringify(
      await raw(`${ep.hcpoHcmEndpoint}/api/v1/configuration/users/${uid}/chargers/${chargerId}/status`), null, 2));
    console.log('[E2E DEBUG] charger config:', JSON.stringify(
      await raw(`${ep.hcpoHcmEndpoint}/api/v1/configuration/users/${uid}/chargers/${chargerId}/configurations`), null, 2));
    console.log('[E2E DEBUG] charger schedule:', JSON.stringify(
      await raw(`${ep.hcpoHcmEndpoint}/api/v1/schedule/charger/${chargerId}/schedule`), null, 2));
    console.log('[E2E DEBUG] charger tech info:', JSON.stringify(
      await raw(`${ep.hcpoHcmEndpoint}/api/v1/configuration/users/${uid}/chargers/${chargerId}/technical-info`), null, 2));
  }
});

describe('getHomeChargers()', () => {
  it('returns a non-empty array of numeric charger IDs', async () => {
    const ids = await client.getHomeChargers();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(typeof id).toBe('number');
    }
  });
});

describe('getHomeChargerStatus()', () => {
  it('returns a HomeChargerStatus with expected shape', async () => {
    const status = await client.getHomeChargerStatus(chargerId);
    expect(typeof status.chargerId).toBe('number');
    expect(typeof status.chargingStatus).toBe('string');
    expect(typeof status.amperageLimit).toBe('number');
    expect(Array.isArray(status.possibleAmperageLimits)).toBe(true);
    expect(status.possibleAmperageLimits.length).toBeGreaterThan(0);
  });
});

describe('getHomeChargerTechnicalInfo()', () => {
  it('returns technical info with non-empty modelNumber and softwareVersion', async () => {
    const info = await client.getHomeChargerTechnicalInfo(chargerId);
    expect(typeof info.modelNumber).toBe('string');
    expect(info.modelNumber.length).toBeGreaterThan(0);
    expect(typeof info.softwareVersion).toBe('string');
    expect(typeof info.stopChargeSupported).toBe('boolean');
  });
});

describe('getHomeChargerConfig()', () => {
  it('returns config with stationNickname and ledBrightness', async () => {
    const config = await client.getHomeChargerConfig(chargerId);
    expect(typeof config.stationNickname).toBe('string');
    expect(typeof config.ledBrightness.level).toBe('number');
    expect(Array.isArray(config.ledBrightness.supportedLevels)).toBe(true);
  });
});

describe('getHomeChargerSchedule()', () => {
  it('returns schedule with scheduleEnabled and defaultSchedule time strings', async () => {
    const schedule = await client.getHomeChargerSchedule(chargerId);
    expect(typeof schedule.scheduleEnabled).toBe('boolean');
    expect(typeof schedule.defaultSchedule.weekdays.startTime).toBe('string');
    expect(typeof schedule.defaultSchedule.weekdays.endTime).toBe('string');
    expect(typeof schedule.defaultSchedule.weekends.startTime).toBe('string');
    expect(typeof schedule.defaultSchedule.weekends.endTime).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Mutation tests — only run when E2E_MUTATIONS=true
// restartHomeCharger, startChargingSession, stopChargingSession are excluded
// ---------------------------------------------------------------------------

describe.skipIf(!MUTATIONS_ENABLED)('setHomeChargerSchedule() + disableHomeChargerSchedule() [MUTATION]', () => {
  it('changes schedule then restores original', async () => {
    const original = await client.getHomeChargerSchedule(chargerId);
    const testStart = original.defaultSchedule.weekdays.startTime === '23:00' ? '22:00' : '23:00';

    try {
      await client.setHomeChargerSchedule(
        chargerId,
        testStart,
        original.defaultSchedule.weekdays.endTime,
        original.defaultSchedule.weekends.startTime,
        original.defaultSchedule.weekends.endTime,
      );

      const changed = await client.getHomeChargerSchedule(chargerId);
      expect(changed.scheduleEnabled).toBe(true);
      expect(changed.defaultSchedule.weekdays.startTime).toBe(testStart);
    } finally {
      await client.setHomeChargerSchedule(
        chargerId,
        original.defaultSchedule.weekdays.startTime,
        original.defaultSchedule.weekdays.endTime,
        original.defaultSchedule.weekends.startTime,
        original.defaultSchedule.weekends.endTime,
      );
      if (!original.scheduleEnabled) {
        await client.disableHomeChargerSchedule(chargerId);
      }
    }
  });
});

describe.skipIf(!MUTATIONS_ENABLED)('setAmperageLimit() [MUTATION]', () => {
  it('changes amperage limit then restores original', async () => {
    const status = await client.getHomeChargerStatus(chargerId);
    const original = status.amperageLimit;
    const testLimit = status.possibleAmperageLimits.find((a) => a !== original);

    if (testLimit === undefined) {
      console.log('[E2E] Only one amperage limit supported; skipping mutation assertion.');
      return;
    }

    try {
      await client.setAmperageLimit(chargerId, testLimit);
      const after = await client.getHomeChargerStatus(chargerId);
      expect(after.amperageLimit).toBe(testLimit);
    } finally {
      await client.setAmperageLimit(chargerId, original);
    }
  });
});

describe.skipIf(!MUTATIONS_ENABLED)('setLedBrightness() [MUTATION]', () => {
  it('changes LED brightness then restores original', async () => {
    const config = await client.getHomeChargerConfig(chargerId);
    const original = config.ledBrightness.level;
    const testLevel = config.ledBrightness.supportedLevels.find((l) => l !== original);

    if (testLevel === undefined) {
      console.log('[E2E] Only one LED level supported; skipping mutation assertion.');
      return;
    }

    try {
      await client.setLedBrightness(chargerId, testLevel);
      const after = await client.getHomeChargerConfig(chargerId);
      expect(after.ledBrightness.level).toBe(testLevel);
    } finally {
      await client.setLedBrightness(chargerId, original);
    }
  });
});
