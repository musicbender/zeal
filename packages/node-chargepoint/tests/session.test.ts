import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './setup.js';
import { ChargePoint } from '../src/client.js';
import { ChargingSession } from '../src/session.js';
import { CommunicationError } from '../src/exceptions.js';
import { TEST_TOKEN, TEST_SESSION_ID } from './handlers.js';

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

    await expect(session.refresh()).rejects.toThrow(CommunicationError);
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

describe('ChargingSession.start()', () => {
  it('sends start command, polls ack, then fetches session', async () => {
    const client = await authenticatedClient();
    const session = await ChargingSession.start(9001, client);

    expect(session).toBeInstanceOf(ChargingSession);
    expect(session.sessionId).toBe(TEST_SESSION_ID);
    expect(session.energyKwh).toBe(10.5);
  });

  it('throws APIError when no active session found after start', async () => {
    server.use(
      http.post('https://mc.chargepoint.com/map-prod/v2', () =>
        HttpResponse.json({ user_status: null }),
      ),
    );

    const client = await authenticatedClient();
    const { APIError } = await import('../src/exceptions.js');
    await expect(ChargingSession.start(9001, client)).rejects.toThrow(APIError);
  }, 20_000);
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
});
