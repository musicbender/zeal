import { http, HttpResponse } from 'msw';

import globalConfigFixture from './fixtures/global-config.json' with { type: 'json' };
import accountFixture from './fixtures/account.json' with { type: 'json' };
import vehiclesFixture from './fixtures/vehicles.json' with { type: 'json' };
import homeChargersFixture from './fixtures/home-chargers.json' with { type: 'json' };
import chargerStatusFixture from './fixtures/charger-status.json' with { type: 'json' };
import chargerTechInfoFixture from './fixtures/charger-technical-info.json' with { type: 'json' };
import chargerConfigFixture from './fixtures/charger-config.json' with { type: 'json' };
import chargerScheduleFixture from './fixtures/charger-schedule.json' with { type: 'json' };
import chargingStatusFixture from './fixtures/charging-status.json' with { type: 'json' };
import sessionFixture from './fixtures/session.json' with { type: 'json' };
import stationFixture from './fixtures/station.json' with { type: 'json' };

export const TEST_TOKEN = 'test-coulomb-sess';
export const TEST_USER_ID = 1234567890;
export const TEST_CHARGER_ID = 12345;
export const TEST_SESSION_ID = 1;
export const TEST_DEVICE_ID = 9001;
export const TEST_ACK_ID = 'ack-12345';

const SESSION_COOKIE = `coulomb_sess=${TEST_TOKEN}; Domain=.chargepoint.com; Path=/; Max-Age=7200`;

export const handlers = [
  // Discovery
  http.post('https://discovery.chargepoint.com/discovery/v3/globalconfig', () =>
    HttpResponse.json(globalConfigFixture),
  ),

  // SSO login
  http.post('https://sso.chargepoint.com/v1/user/login', () =>
    HttpResponse.json({ success: true }, {
      headers: { 'Set-Cookie': SESSION_COOKIE },
    }),
  ),

  // SSO logout
  http.post('https://sso.chargepoint.com/v1/user/logout', () =>
    new HttpResponse(null, { status: 200 }),
  ),

  // SSO session exchange (loginWithSsoSession)
  http.get('https://mc.chargepoint.com/index.php/nghelper/getSession', () =>
    HttpResponse.json({ success: true }, {
      headers: { 'Set-Cookie': SESSION_COOKIE },
    }),
  ),

  // Account
  http.get('https://account.chargepoint.com/v1/driver/profile/user', () =>
    HttpResponse.json(accountFixture),
  ),

  // Vehicles
  http.get('https://account.chargepoint.com/v1/driver/vehicle', () =>
    HttpResponse.json(vehiclesFixture),
  ),

  // User charging status
  http.post('https://mc.chargepoint.com/map-prod/v2', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    if ('user_status' in body) {
      return HttpResponse.json(chargingStatusFixture);
    }
    if ('station_list' in body) {
      return HttpResponse.json({
        station_list: {
          stations: [],
        },
      });
    }
    return new HttpResponse(null, { status: 400 });
  }),

  // Home chargers list
  http.get(
    `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers`,
    () => HttpResponse.json(homeChargersFixture),
  ),

  // Home charger status
  http.get(
    `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_CHARGER_ID}/status`,
    () => HttpResponse.json(chargerStatusFixture),
  ),

  // Home charger technical info
  http.get(
    `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_CHARGER_ID}/technical-info`,
    () => HttpResponse.json(chargerTechInfoFixture),
  ),

  // Home charger configuration
  http.get(
    `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_CHARGER_ID}/configurations`,
    () => HttpResponse.json(chargerConfigFixture),
  ),

  // Home charger schedule (GET)
  http.get(
    `https://hcpoprodhcm.chargepoint.com/api/v1/schedule/charger/${TEST_CHARGER_ID}/schedule`,
    () => HttpResponse.json(chargerScheduleFixture),
  ),

  // Home charger schedule (PUT - set or disable)
  http.put(
    `https://hcpoprodhcm.chargepoint.com/api/v1/schedule/charger/${TEST_CHARGER_ID}/schedule`,
    () => HttpResponse.json(chargerScheduleFixture),
  ),

  // Amperage limit
  http.put(
    `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/chargers/${TEST_CHARGER_ID}/charge-amperage-limit`,
    () => new HttpResponse(null, { status: 200 }),
  ),

  // LED brightness
  http.put(
    `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/chargers/${TEST_CHARGER_ID}/led-brightness`,
    () => new HttpResponse(null, { status: 200 }),
  ),

  // Restart charger
  http.post(
    `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_CHARGER_ID}/restart`,
    () => new HttpResponse(null, { status: 200 }),
  ),

  // Start charging session
  http.post('https://account.chargepoint.com/v1/driver/station/startsession', () =>
    HttpResponse.json({ ackId: TEST_ACK_ID }),
  ),

  // Stop charging session
  http.post('https://account.chargepoint.com/v1/driver/station/stopSession', () =>
    HttpResponse.json({ ackId: TEST_ACK_ID }),
  ),

  // Session ACK
  http.post('https://account.chargepoint.com/v1/driver/station/session/ack', () =>
    new HttpResponse(null, { status: 200 }),
  ),

  // Get session details
  http.post(
    `https://cpapi.chargepoint.com/driver-bff/v1/sessions/${TEST_SESSION_ID}`,
    () => HttpResponse.json(sessionFixture),
  ),

  // Station info
  http.get('https://mc.chargepoint.com/map-prod/v3/station/info', () =>
    HttpResponse.json(stationFixture),
  ),
];
