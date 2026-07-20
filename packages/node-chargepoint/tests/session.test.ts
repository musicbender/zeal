import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './setup.js';
import { ChargePoint } from '../src/client.js';
import { ChargingSession } from '../src/session.js';
import { ChargerBusyError, CommunicationError, NoActiveSessionError, StartVerificationTimeoutError, UnresolvedSessionError, VehicleNotReadyError } from '../src/exceptions.js';
import { TEST_TOKEN, TEST_SESSION_ID, TEST_SESSION_ID_99, TEST_DEVICE_ID, TEST_USER_ID } from './handlers.js';

async function authenticatedClient(): Promise<ChargePoint> {
  return ChargePoint.create('testuser', { coulombToken: TEST_TOKEN });
}

describe('ChargingSession.refresh()', () => {
  it('populates all fields from the driver-bff API response', async () => {
    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);

    await session.refresh();

    expect(session.deviceId).toBe(1);
    expect(session.deviceName).toBe('ChargePoint Home Flex');
    expect(session.chargingState).toBe('CHARGING');
    expect(session.energyKwh).toBe(10.5);
    expect(session.powerKw).toBe(7.2);
    expect(session.startTime).toBeInstanceOf(Date);
    expect(session.startTime?.getTime()).toBe(1609459200000);
    expect(session.lastUpdateDataTimestamp).toBeInstanceOf(Date);
    expect(session.updateData).toHaveLength(1);
    expect(session.updateData?.[0]?.energyKwh).toBe(10.5);
    expect(session.updateData?.[0]?.timestamp).toBeInstanceOf(Date);
    expect(session.latitude).toBe(37.7749);
    expect(session.address).toBe('123 Main St');
    expect(session.isHomeCharger).toBe(true);
  });

  it('throws CommunicationError when session API returns an error', async () => {
    server.use(
      http.post(
        `https://cpapi.chargepoint.com/driver-bff/v1/sessions/${TEST_SESSION_ID}`,
        () => HttpResponse.json({ charging_status: { error_message: 'Session not found' } }),
      ),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);

    const error = await session.refresh().catch((e) => e);
    expect(error).toBeInstanceOf(CommunicationError);
    expect(error.body).toEqual({ error_message: 'Session not found' });
  });

  it('throws CommunicationError on non-200 response', async () => {
    server.use(
      http.post(
        `https://cpapi.chargepoint.com/driver-bff/v1/sessions/${TEST_SESSION_ID}`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);

    await expect(session.refresh()).rejects.toThrow(CommunicationError);
  });
});

describe('ChargingSession.stop()', () => {
  it('sends stop command and polls for acknowledgement', async () => {
    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);
    await session.refresh();

    await expect(session.stop()).resolves.not.toThrow();
  });

  it('throws NoActiveSessionError when initial stop command returns errorId 165', async () => {
    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/stopSession', () =>
        HttpResponse.json(
          { errorId: 165, errorCategory: 'CHARGE', errorMessage: 'unable to find charging session' },
          { status: 422 },
        ),
      ),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);
    await session.refresh();

    const error = await session.stop().catch((e) => e);
    expect(error).toBeInstanceOf(NoActiveSessionError);
    expect(error).toBeInstanceOf(CommunicationError);
    expect(error.message).toBe('unable to find charging session');
    expect(error.statusCode).toBe(422);
    expect(error.body).toEqual({ errorId: 165, errorCategory: 'CHARGE', errorMessage: 'unable to find charging session' });
  });

  it('throws NoActiveSessionError when stop ack returns errorId 165', async () => {
    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/session/ack', () =>
        HttpResponse.json(
          { errorId: 165, errorMessage: 'unable to find charging session' },
          { status: 422 },
        ),
      ),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);
    await session.refresh();

    const error = await session.stop().catch((e) => e);
    expect(error).toBeInstanceOf(NoActiveSessionError);
    expect(error.body).toEqual({ errorId: 165, errorMessage: 'unable to find charging session' });
  });

  it('throws ChargerBusyError (carrying body) when initial stop command returns errorId 89', async () => {
    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/stopSession', () =>
        HttpResponse.json(
          { errorId: 89, errorCategory: 'CHARGE', errorMessage: 'Charger is currently busy' },
          { status: 422 },
        ),
      ),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);
    await session.refresh();

    const error = await session.stop().catch((e) => e);
    expect(error).toBeInstanceOf(ChargerBusyError);
    expect(error).toBeInstanceOf(CommunicationError);
    expect(error.message).toBe('Charger is currently busy');
    expect(error.body).toEqual({ errorId: 89, errorCategory: 'CHARGE', errorMessage: 'Charger is currently busy' });
  });

  it('throws a CommunicationError carrying the parsed body for unmapped error responses, without embedding JSON in the message', async () => {
    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/stopSession', () =>
        HttpResponse.json(
          { errorId: 7, errorCategory: 'CHARGE', errorMessage: 'Some other failure' },
          { status: 422 },
        ),
      ),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);
    await session.refresh();

    const error = await session.stop().catch((e) => e);
    expect(error).toBeInstanceOf(CommunicationError);
    expect(error).not.toBeInstanceOf(NoActiveSessionError);
    expect(error).not.toBeInstanceOf(ChargerBusyError);
    expect(error).not.toBeInstanceOf(VehicleNotReadyError);
    expect(error.message).toBe('Some other failure');
    expect(error.message).not.toContain('{');
    expect(error.body).toEqual({ errorId: 7, errorCategory: 'CHARGE', errorMessage: 'Some other failure' });
  });

  it('throws CommunicationError after 20 failed ack attempts', async () => {
    vi.useFakeTimers();

    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/session/ack', () =>
        HttpResponse.json(
          { errorMessage: 'Session stop failed', errorId: 42 },
          { status: 400 },
        ),
      ),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);
    await session.refresh();

    // Attach catch immediately to prevent unhandled rejection warning while
    // timers are being advanced.
    let caughtError: unknown;
    session.stop().catch((e: unknown) => { caughtError = e; });

    // Advance through all 20 polling attempts (19 sleeps of 3000ms each).
    for (let i = 0; i < 19; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    // Flush any remaining microtasks after the last attempt.
    await vi.runAllTimersAsync();

    expect(caughtError).toBeInstanceOf(CommunicationError);
    expect((caughtError as CommunicationError).message).toBe('Session stop failed');

    vi.useRealTimers();
  });
});

describe('ChargingSession.stopByDevice()', () => {
  it('resolves the driver-plane session and stops with the real sessionId + outletNumber', async () => {
    let stopBody: Record<string, unknown> | undefined;
    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/stopSession', async ({ request }) => {
        stopBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ackId: 'ack-12345' });
      }),
    );

    const client = await authenticatedClient();
    // Default user-status fixture resolves to session 1, which lives on device 1.
    await ChargingSession.stopByDevice(1, client);

    expect(stopBody?.sessionId).toBe(TEST_SESSION_ID);
    expect(stopBody?.deviceId).toBe(1);
    expect(stopBody?.portNumber).toBe(1);
    // Regression guard: must never send the bogus sessionId:0 the old default produced.
    expect(stopBody?.sessionId).not.toBe(0);
  });

  it('ignores a driver-plane session on a different device and uses the device-plane session', async () => {
    let stopBody: Record<string, unknown> | undefined;
    server.use(
      // Driver plane reports an active session (1) that lives on device 1 — NOT the
      // device we are asking to stop (TEST_DEVICE_ID). The guard must reject it.
      http.post('https://mc.chargepoint.com/map-prod/v2', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        if ('user_status' in body) {
          return HttpResponse.json({
            user_status: {
              charging_status: {
                session_id: TEST_SESSION_ID, start_time: 1609459200000,
                current_charging: 'CHARGING', stations: [],
              },
            },
          });
        }
        return new HttpResponse(null, { status: 400 });
      }),
      // Device plane for the requested device surfaces its own session id (99).
      http.get(
        `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_DEVICE_ID}/status`,
        () => HttpResponse.json({
          brand: 'ChargePoint', model: 'CPH25', macAddress: 'AA:BB:CC:DD:EE:FF',
          chargingStatus: 'CHARGING', sessionId: TEST_SESSION_ID_99,
          isPluggedIn: true, isConnected: true, isReminderEnabled: false,
          plugInReminderTime: '22:00', hasUtilityInfo: false, isDuringScheduledTime: false,
          chargeAmperageSettings: { chargeLimit: 32, inProgress: false, possibleChargeLimit: [16, 24, 32] },
        }),
      ),
      http.post('https://account.chargepoint.com/v1/driver/station/stopSession', async ({ request }) => {
        stopBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ackId: 'ack-12345' });
      }),
    );

    const client = await authenticatedClient();
    await ChargingSession.stopByDevice(TEST_DEVICE_ID, client);

    // Must stop this device's own session (99, device 12345), never the unrelated
    // driver-plane session (1, device 1).
    expect(stopBody?.sessionId).toBe(TEST_SESSION_ID_99);
    expect(stopBody?.sessionId).not.toBe(TEST_SESSION_ID);
    expect(stopBody?.deviceId).toBe(12345);
  });

  it('falls back to the device plane (home-charger status) when the driver plane is empty', async () => {
    let stopBody: Record<string, unknown> | undefined;
    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        if ('user_status' in body) return HttpResponse.json({ user_status: null });
        return new HttpResponse(null, { status: 400 });
      }),
      http.get(
        `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_DEVICE_ID}/status`,
        () => HttpResponse.json({
          brand: 'ChargePoint', model: 'CPH25', macAddress: 'AA:BB:CC:DD:EE:FF',
          chargingStatus: 'CHARGING', sessionId: TEST_SESSION_ID_99,
          isPluggedIn: true, isConnected: true, isReminderEnabled: false,
          plugInReminderTime: '22:00', hasUtilityInfo: false, isDuringScheduledTime: false,
          chargeAmperageSettings: { chargeLimit: 32, inProgress: false, possibleChargeLimit: [16, 24, 32] },
        }),
      ),
      http.post('https://account.chargepoint.com/v1/driver/station/stopSession', async ({ request }) => {
        stopBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ackId: 'ack-12345' });
      }),
    );

    const client = await authenticatedClient();
    await ChargingSession.stopByDevice(TEST_DEVICE_ID, client);

    // session-99 fixture: device_id 12345, outlet_number 1.
    expect(stopBody?.sessionId).toBe(TEST_SESSION_ID_99);
    expect(stopBody?.deviceId).toBe(12345);
    expect(stopBody?.portNumber).toBe(1);
  });

  it('throws UnresolvedSessionError (not NoActiveSessionError) when neither plane yields a session', async () => {
    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        if ('user_status' in body) return HttpResponse.json({ user_status: null });
        return new HttpResponse(null, { status: 400 });
      }),
      http.get(
        `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_DEVICE_ID}/status`,
        () => HttpResponse.json({
          brand: 'ChargePoint', model: 'CPH25', macAddress: 'AA:BB:CC:DD:EE:FF',
          chargingStatus: 'NOT_CHARGING',
          isPluggedIn: false, isConnected: true, isReminderEnabled: false,
          plugInReminderTime: '22:00', hasUtilityInfo: false, isDuringScheduledTime: false,
          chargeAmperageSettings: { chargeLimit: 32, inProgress: false, possibleChargeLimit: [16, 24, 32] },
        }),
      ),
    );

    const client = await authenticatedClient();
    const error = await ChargingSession.stopByDevice(TEST_DEVICE_ID, client).catch((e) => e);

    expect(error).toBeInstanceOf(UnresolvedSessionError);
    expect(error).not.toBeInstanceOf(NoActiveSessionError);
    expect(error.deviceId).toBe(TEST_DEVICE_ID);
  });

  it('throws UnresolvedSessionError when the device-plane lookup itself fails', async () => {
    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        if ('user_status' in body) return HttpResponse.json({ user_status: null });
        return new HttpResponse(null, { status: 400 });
      }),
      http.get(
        `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_DEVICE_ID}/status`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    const client = await authenticatedClient();
    const error = await ChargingSession.stopByDevice(TEST_DEVICE_ID, client).catch((e) => e);

    expect(error).toBeInstanceOf(UnresolvedSessionError);
  });
});

describe('ChargingSession.start()', () => {
  it('sends start command, polls ack, then fetches session on first try', async () => {
    const client = await authenticatedClient();
    const session = await ChargingSession.start(TEST_DEVICE_ID, client);

    expect(session).toBeInstanceOf(ChargingSession);
    expect(session.sessionId).toBe(TEST_SESSION_ID);
    expect(session.energyKwh).toBe(10.5);
  });

  it('returns session after polling finds status on retry', async () => {
    vi.useFakeTimers();
    let callCount = 0;

    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        if ('user_status' in body) {
          callCount++;
          if (callCount < 3) {
            return HttpResponse.json({ user_status: null });
          }
          return HttpResponse.json({ user_status: { charging_status: { session_id: TEST_SESSION_ID, start_time: 1609459200000, current_charging: 'CHARGING', stations: [] } } });
        }
        return new HttpResponse(null, { status: 400 });
      }),
    );

    const client = await authenticatedClient();
    const startPromise = ChargingSession.start(TEST_DEVICE_ID, client, { pollTimeoutMs: 30_000 });

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    const session = await startPromise;
    expect(session).toBeInstanceOf(ChargingSession);
    expect(callCount).toBe(3);

    vi.useRealTimers();
  });

  it('throws StartVerificationTimeoutError (not generic APIError) when polling exhausts', async () => {
    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', () =>
        HttpResponse.json({ user_status: null }),
      ),
    );

    const client = await authenticatedClient();
    const error = await ChargingSession.start(TEST_DEVICE_ID, client, { pollTimeoutMs: 0 }).catch((e) => e);

    expect(error).toBeInstanceOf(StartVerificationTimeoutError);
    expect(error.deviceId).toBe(TEST_DEVICE_ID);
    expect(error.pollTimeoutMs).toBe(0);
    expect(error.pollAttempts).toBeGreaterThanOrEqual(1);
    expect(error.constructor.name).toBe('StartVerificationTimeoutError');
  });

  it('includes chargerConfirmedCharging: true when home charger reports CHARGING after poll exhaustion', async () => {
    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', () =>
        HttpResponse.json({ user_status: null }),
      ),
      http.get(
        `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_DEVICE_ID}/status`,
        () => HttpResponse.json({ chargingStatus: 'CHARGING', brand: 'ChargePoint', model: 'CPH25', macAddress: 'AA:BB:CC:DD:EE:FF', isPluggedIn: true, isConnected: true, isReminderEnabled: false, plugInReminderTime: '22:00', hasUtilityInfo: false, isDuringScheduledTime: false, chargeAmperageSettings: { chargeLimit: 32, inProgress: false, possibleChargeLimit: [16, 24, 32] } }),
      ),
    );

    const client = await authenticatedClient();
    const error = await ChargingSession.start(TEST_DEVICE_ID, client, { pollTimeoutMs: 0 }).catch((e) => e);

    expect(error).toBeInstanceOf(StartVerificationTimeoutError);
    expect(error.chargerConfirmedCharging).toBe(true);
  });

  it('uses session ID from start ack body and skips getUserChargingStatus polling', async () => {
    let userStatusCallCount = 0;

    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/session/ack', () =>
        HttpResponse.json({ session_id: TEST_SESSION_ID }),
      ),
      http.post('https://mc.chargepoint.com/map-prod/v2', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        if ('user_status' in body) {
          userStatusCallCount++;
          return HttpResponse.json({ user_status: null });
        }
        return new HttpResponse(null, { status: 400 });
      }),
    );

    const client = await authenticatedClient();
    const session = await ChargingSession.start(TEST_DEVICE_ID, client);

    expect(session).toBeInstanceOf(ChargingSession);
    expect(session.sessionId).toBe(TEST_SESSION_ID);
    expect(session.energyKwh).toBe(10.5);
    expect(userStatusCallCount).toBe(0);
  });

  it('resolves via device-plane session id when driver-plane polling exhausts but charger reports CHARGING with sessionId', async () => {
    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', () =>
        HttpResponse.json({ user_status: null }),
      ),
      http.get(
        `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_DEVICE_ID}/status`,
        () => HttpResponse.json({
          brand: 'ChargePoint', model: 'CPH25', macAddress: 'AA:BB:CC:DD:EE:FF',
          chargingStatus: 'CHARGING', sessionId: TEST_SESSION_ID_99,
          isPluggedIn: true, isConnected: true, isReminderEnabled: false,
          plugInReminderTime: '22:00', hasUtilityInfo: false, isDuringScheduledTime: false,
          chargeAmperageSettings: { chargeLimit: 32, inProgress: false, possibleChargeLimit: [16, 24, 32] },
        }),
      ),
    );

    const client = await authenticatedClient();
    const session = await ChargingSession.start(TEST_DEVICE_ID, client, { pollTimeoutMs: 0 });

    expect(session).toBeInstanceOf(ChargingSession);
    expect(session.sessionId).toBe(TEST_SESSION_ID_99);
    expect(session.energyKwh).toBe(8.3);
  });

  it('propagates sendCommand failure as CommunicationError, not StartVerificationTimeoutError', async () => {
    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/startsession', () =>
        new HttpResponse(JSON.stringify({ error: 'Auth failed' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
      ),
    );

    const client = await authenticatedClient();
    const error = await ChargingSession.start(TEST_DEVICE_ID, client).catch((e) => e);

    expect(error).toBeInstanceOf(CommunicationError);
    expect(error).not.toBeInstanceOf(StartVerificationTimeoutError);
  });

  it('throws VehicleNotReadyError when start command returns errorId 25', async () => {
    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/startsession', () =>
        HttpResponse.json(
          { errorId: 25, errorCategory: 'CHARGE', errorMessage: 'Vehicle is at charge limit. Unplug and try again.' },
          { status: 422 },
        ),
      ),
    );

    const client = await authenticatedClient();
    const error = await ChargingSession.start(TEST_DEVICE_ID, client).catch((e) => e);

    expect(error).toBeInstanceOf(VehicleNotReadyError);
    expect(error).toBeInstanceOf(CommunicationError);
    expect(error.statusCode).toBe(422);
    expect(error.message).toBe('Vehicle is at charge limit. Unplug and try again.');
    expect(error.body).toEqual({ errorId: 25, errorCategory: 'CHARGE', errorMessage: 'Vehicle is at charge limit. Unplug and try again.' });
  });
});

describe('sendCommand() polling', () => {
  it('succeeds on first successful ack', async () => {
    let callCount = 0;
    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/session/ack', () => {
        callCount++;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);
    await session.refresh();
    await session.stop();

    expect(callCount).toBe(1);
  });

  it('retries and eventually succeeds', async () => {
    vi.useFakeTimers();
    let callCount = 0;

    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/session/ack', () => {
        callCount++;
        if (callCount < 3) {
          return new HttpResponse(
            JSON.stringify({ errorMessage: 'Pending' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);
    await session.refresh();

    const stopPromise = session.stop();

    // Advance through the first two sleep intervals
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);

    await expect(stopPromise).resolves.not.toThrow();
    expect(callCount).toBe(3);

    vi.useRealTimers();
  });

  it('throws VehicleNotReadyError (carrying body) when the ack poll returns errorId 25', async () => {
    server.use(
      http.post('https://account.chargepoint.com/v1/driver/station/session/ack', () =>
        HttpResponse.json(
          { errorId: 25, errorCategory: 'CHARGE', errorMessage: 'Vehicle is at charge limit. Unplug and try again.' },
          { status: 422 },
        ),
      ),
    );

    const client = await authenticatedClient();
    const session = new ChargingSession(TEST_SESSION_ID);
    session._setClient(client);
    await session.refresh();

    const error = await session.stop().catch((e) => e);
    expect(error).toBeInstanceOf(VehicleNotReadyError);
    expect(error).toBeInstanceOf(CommunicationError);
    expect(error.message).toBe('Vehicle is at charge limit. Unplug and try again.');
    expect(error.body).toEqual({ errorId: 25, errorCategory: 'CHARGE', errorMessage: 'Vehicle is at charge limit. Unplug and try again.' });
  });
});
