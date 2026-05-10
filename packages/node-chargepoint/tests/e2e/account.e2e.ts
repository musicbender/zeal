import { describe, it, expect, beforeAll } from 'vitest';
import { createAuthenticatedClient } from './auth.js';
import type { ChargePoint } from '../../src/client.js';

let client: ChargePoint;

beforeAll(async () => {
  const ctx = await createAuthenticatedClient();
  client = ctx.client;
});

describe('getAccount()', () => {
  it('returns a userId that is a positive number', async () => {
    const account = await client.getAccount();
    expect(typeof account.user.userId).toBe('number');
    expect(account.user.userId).toBeGreaterThan(0);
  });

  it('returns a non-empty email string', async () => {
    const account = await client.getAccount();
    expect(typeof account.user.email).toBe('string');
    expect(account.user.email.length).toBeGreaterThan(0);
  });

  it('returns a 3-character ISO currency code', async () => {
    const account = await client.getAccount();
    expect(typeof account.accountBalance.balance.currency).toBe('string');
    expect(account.accountBalance.balance.currency.length).toBe(3);
  });
});

describe('getVehicles()', () => {
  it('returns an array', async () => {
    const vehicles = await client.getVehicles();
    expect(Array.isArray(vehicles)).toBe(true);
  });

  it('each vehicle has string make and model and numeric year', async () => {
    const vehicles = await client.getVehicles();
    for (const v of vehicles) {
      expect(typeof v.make).toBe('string');
      expect(typeof v.model).toBe('string');
      expect(typeof v.year).toBe('number');
    }
  });
});

describe('getUserChargingStatus()', () => {
  it('returns null or a valid UserChargingStatus', async () => {
    const status = await client.getUserChargingStatus();
    if (status === null) {
      expect(status).toBeNull();
    } else {
      expect(typeof status.sessionId).toBe('number');
      expect(status.startTime).toBeInstanceOf(Date);
      expect(typeof status.state).toBe('string');
      expect(Array.isArray(status.stations)).toBe(true);
    }
  });
});
