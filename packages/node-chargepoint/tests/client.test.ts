import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './setup.js';
import { ChargePoint } from '../src/client.js';
import {
  CommunicationError,
  DatadomeCaptcha,
  InvalidSession,
  LoginError,
} from '../src/exceptions.js';
import {
  TEST_TOKEN,
  TEST_CHARGER_ID,
  TEST_SESSION_ID,
  TEST_DEVICE_ID,
} from './handlers.js';

async function authenticatedClient(): Promise<ChargePoint> {
  return ChargePoint.create('testuser', { coulombToken: TEST_TOKEN });
}

describe('ChargePoint.create()', () => {
  it('fetches global config and returns a client instance', async () => {
    const client = await ChargePoint.create('testuser');
    expect(client.globalConfig.region).toBe('NA');
    expect(client.globalConfig.endpoints.accountsEndpoint).toBe('https://account.chargepoint.com');
    expect(client.globalConfig.endpoints.ssoEndpoint).toBe('https://sso.chargepoint.com');
  });

  it('stores coulombToken when provided as option', async () => {
    const client = await ChargePoint.create('testuser', { coulombToken: TEST_TOKEN });
    // Token is private but we can verify it works by making an authenticated call
    const account = await client.getAccount();
    expect(account.user.userId).toBe(1234567890);
  });
});

describe('loginWithPassword()', () => {
  it('authenticates and stores the session cookie', async () => {
    const client = await ChargePoint.create('testuser');
    await client.loginWithPassword('password123');
    // Should be able to make authenticated calls now
    const account = await client.getAccount();
    expect(account.user.email).toBe('test@example.com');
  });

  it('throws LoginError on invalid credentials', async () => {
    server.use(
      http.post('https://sso.chargepoint.com/v1/user/login', () =>
        new HttpResponse(JSON.stringify({ error: 'invalid_credentials' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const client = await ChargePoint.create('testuser');
    await expect(client.loginWithPassword('wrongpass')).rejects.toThrow(LoginError);
  });
});

describe('loginWithSsoSession()', () => {
  it('exchanges SSO JWT for a coulomb session', async () => {
    const client = await ChargePoint.create('testuser');
    await expect(client.loginWithSsoSession('test-jwt')).resolves.not.toThrow();
  });
});

describe('logout()', () => {
  it('calls logout endpoint and clears token', async () => {
    const client = await authenticatedClient();
    await expect(client.logout()).resolves.not.toThrow();
  });
});

describe('getAccount()', () => {
  it('returns account information', async () => {
    const client = await authenticatedClient();
    const account = await client.getAccount();
    expect(account.user.userId).toBe(1234567890);
    expect(account.user.email).toBe('test@example.com');
    expect(account.accountBalance.currency).toBe('USD');
  });

  it('throws InvalidSession on 401', async () => {
    server.use(
      http.get('https://account.chargepoint.com/v1/driver/profile/user', () =>
        new HttpResponse(null, { status: 401 }),
      ),
    );

    const client = await authenticatedClient();
    await expect(client.getAccount()).rejects.toThrow(InvalidSession);
  });

  it('throws DatadomeCaptcha on 403 with Datadome URL', async () => {
    server.use(
      http.get('https://account.chargepoint.com/v1/driver/profile/user', () =>
        HttpResponse.json(
          { url: 'https://geo.datadome.co/captcha/?initialCid=abc&hash=xyz&cid=123' },
          { status: 403 },
        ),
      ),
    );

    const client = await authenticatedClient();
    await expect(client.getAccount()).rejects.toThrow(DatadomeCaptcha);
  });
});

describe('getVehicles()', () => {
  it('returns list of vehicles', async () => {
    const client = await authenticatedClient();
    const vehicles = await client.getVehicles();
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]?.make).toBe('Tesla');
    expect(vehicles[0]?.model).toBe('Model 3');
  });
});

describe('getUserChargingStatus()', () => {
  it('returns charging status when session is active', async () => {
    const client = await authenticatedClient();
    const status = await client.getUserChargingStatus();
    expect(status).not.toBeNull();
    expect(status?.sessionId).toBe(1);
    expect(status?.state).toBe('CHARGING');
    expect(status?.startTime).toBeInstanceOf(Date);
    expect(status?.stations).toHaveLength(1);
  });

  it('returns null when no active session', async () => {
    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', () =>
        HttpResponse.json({ user_status: null }),
      ),
    );

    const client = await authenticatedClient();
    const status = await client.getUserChargingStatus();
    expect(status).toBeNull();
  });
});

describe('getHomeChargers()', () => {
  it('returns list of charger IDs', async () => {
    const client = await authenticatedClient();
    const chargers = await client.getHomeChargers();
    expect(chargers).toEqual([12345, 67890]);
  });
});

describe('getHomeChargerStatus()', () => {
  it('returns charger status', async () => {
    const client = await authenticatedClient();
    const status = await client.getHomeChargerStatus(TEST_CHARGER_ID);
    expect(status.chargerId).toBe(12345);
    expect(status.chargingStatus).toBe('NOT_CHARGING');
    expect(status.amperageLimit).toBe(32);
    expect(status.possibleAmperageLimits).toEqual([16, 24, 32, 40, 48]);
  });
});

describe('getHomeChargerTechnicalInfo()', () => {
  it('returns technical info', async () => {
    const client = await authenticatedClient();
    const info = await client.getHomeChargerTechnicalInfo(TEST_CHARGER_ID);
    expect(info.modelNumber).toBe('CPH25-NEMA6-50');
    expect(info.softwareVersion).toBe('6.7.0.20');
    expect(info.stopChargeSupported).toBe(true);
  });
});

describe('getHomeChargerConfig()', () => {
  it('returns charger configuration', async () => {
    const client = await authenticatedClient();
    const config = await client.getHomeChargerConfig(TEST_CHARGER_ID);
    expect(config.stationNickname).toBe('Home Charger');
    expect(config.ledBrightness.level).toBe(3);
  });
});

describe('getHomeChargerSchedule()', () => {
  it('returns charging schedule', async () => {
    const client = await authenticatedClient();
    const schedule = await client.getHomeChargerSchedule(TEST_CHARGER_ID);
    expect(schedule.scheduleEnabled).toBe(true);
    expect(schedule.userSchedule.weekdays.startTime).toBe('22:00');
  });
});

describe('setHomeChargerSchedule()', () => {
  it('updates and returns the new schedule', async () => {
    const client = await authenticatedClient();
    const schedule = await client.setHomeChargerSchedule(
      TEST_CHARGER_ID,
      '23:00',
      '07:00',
      '22:00',
      '09:00',
    );
    expect(schedule).toBeDefined();
    expect(schedule.hasTouPricing).toBe(false);
  });
});

describe('disableHomeChargerSchedule()', () => {
  it('sends disable request without throwing', async () => {
    const client = await authenticatedClient();
    await expect(client.disableHomeChargerSchedule(TEST_CHARGER_ID)).resolves.not.toThrow();
  });
});

describe('setAmperageLimit()', () => {
  it('sends PUT request without throwing', async () => {
    const client = await authenticatedClient();
    await expect(client.setAmperageLimit(TEST_CHARGER_ID, 24)).resolves.not.toThrow();
  });
});

describe('setLedBrightness()', () => {
  it('sends PUT request without throwing', async () => {
    const client = await authenticatedClient();
    await expect(client.setLedBrightness(TEST_CHARGER_ID, 2)).resolves.not.toThrow();
  });
});

describe('restartHomeCharger()', () => {
  it('sends restart command without throwing', async () => {
    const client = await authenticatedClient();
    await expect(client.restartHomeCharger(TEST_CHARGER_ID)).resolves.not.toThrow();
  });
});

describe('getChargingSession()', () => {
  it('returns a populated ChargingSession', async () => {
    const client = await authenticatedClient();
    const session = await client.getChargingSession(TEST_SESSION_ID);
    expect(session.sessionId).toBe(1);
    expect(session.deviceId).toBe(1);
    expect(session.energyKwh).toBe(10.5);
    expect(session.startTime).toBeInstanceOf(Date);
    expect(session.updateData).toHaveLength(1);
  });
});

describe('getStation()', () => {
  it('returns station details', async () => {
    const client = await authenticatedClient();
    const station = await client.getStation(TEST_DEVICE_ID);
    expect(station.deviceId).toBe(9001);
    expect(station.stationStatus).toBe('AVAILABLE');
    expect(station.portsInfo.totalCount).toBe(2);
  });
});

describe('getNearbyStations()', () => {
  it('returns empty array when no stations nearby', async () => {
    const client = await authenticatedClient();
    const stations = await client.getNearbyStations({
      neLat: 37.8,
      neLon: -122.3,
      swLat: 37.7,
      swLon: -122.5,
    });
    expect(Array.isArray(stations)).toBe(true);
  });

  it('passes filter fields in request body', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ station_list: { stations: [] } });
      }),
    );

    const client = await authenticatedClient();
    await client.getNearbyStations(
      { neLat: 37.8, neLon: -122.3, swLat: 37.7, swLon: -122.5 },
      { dcFastCharging: true, statusAvailable: true },
    );

    const body = capturedBody as Record<string, unknown>;
    const list = body.station_list as Record<string, unknown>;
    expect(list.dcFastCharging).toBe(true);
    expect(list.statusAvailable).toBe(true);
  });
});

describe('_request() error handling', () => {
  it('refreshes coulomb_sess from Set-Cookie on response', async () => {
    const newToken = 'refreshed-token-xyz';
    server.use(
      http.get('https://account.chargepoint.com/v1/driver/profile/user', () =>
        HttpResponse.json(
          { user: { userId: 1234567890, email: 'test@example.com', username: 'testuser', fullName: 'Test User', givenName: 'Test', familyName: 'User', phone: '', phoneCountryId: 1, evatarUrl: '' }, accountBalance: { accountNumber: '', accountState: 'ACTIVE', amount: 0, currency: 'USD' } },
          {
            headers: {
              'Set-Cookie': `coulomb_sess=${newToken}; Domain=.chargepoint.com; Path=/; Max-Age=7200`,
            },
          },
        ),
      ),
    );

    const client = await authenticatedClient();
    await client.getAccount();
    // Make another request to verify the refreshed token is sent
    let receivedCookie = '';
    server.use(
      http.get('https://account.chargepoint.com/v1/driver/vehicle', ({ request }) => {
        receivedCookie = request.headers.get('cookie') ?? '';
        return HttpResponse.json({ vehicles: [] });
      }),
    );
    await client.getVehicles();
    expect(receivedCookie).toContain(`coulomb_sess=${newToken}`);
  });

  it('throws CommunicationError for non-2xx responses', async () => {
    server.use(
      http.get('https://account.chargepoint.com/v1/driver/vehicle', () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const client = await authenticatedClient();
    await expect(client.getVehicles()).rejects.toThrow(CommunicationError);
  });
});
