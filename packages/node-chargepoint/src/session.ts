import type { ChargePoint } from './client.js';
import { ChargerBusyError, CommunicationError, NoActiveSessionError, StartVerificationTimeoutError, UnresolvedSessionError, VehicleNotReadyError } from './exceptions.js';
import type { ChargePointCommandErrorBody, ChargingSessionUpdate, ChargingStatus, HomeChargerStatus, PowerUtility, StartSessionOptions, VehicleInfo } from './types.js';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type RawObj = Record<string, unknown>;

async function sendCommand(
  client: ChargePoint,
  action: 'start' | 'stop',
  deviceId: number,
  portNumber = 1,
  sessionId = 0,
): Promise<RawObj | null> {
  const actionPath = action === 'start' ? 'startsession' : 'stopSession';
  const body: RawObj = { deviceId };

  if (action === 'stop') {
    body.portNumber = portNumber;
    body.sessionId = sessionId;
  }

  const url = `${client.globalConfig.endpoints.accountsEndpoint}/v1/driver/station/${actionPath}`;
  const response = await client._request('POST', url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    let cmdBody: unknown;
    try {
      cmdBody = await response.json();
    } catch {
      cmdBody = await response.text();
    }
    const cmdErrorMessage = typeof (cmdBody as RawObj)?.errorMessage === 'string'
      ? (cmdBody as RawObj).errorMessage as string
      : undefined;
    if (response.status === 422 && (cmdBody as RawObj)?.errorId === 89) {
      throw new ChargerBusyError(cmdErrorMessage, cmdBody as ChargePointCommandErrorBody);
    }
    if (action === 'stop' && response.status === 422 && (cmdBody as RawObj)?.errorId === 165) {
      throw new NoActiveSessionError(cmdErrorMessage, cmdBody);
    }
    if (response.status === 422 && (cmdBody as RawObj)?.errorId === 25) {
      throw new VehicleNotReadyError(cmdErrorMessage, cmdBody as ChargePointCommandErrorBody);
    }
    throw new CommunicationError(
      response.status,
      cmdErrorMessage ?? `Failed to ${action} ChargePoint session.`,
      cmdBody,
    );
  }

  const actionStatus = (await response.json()) as RawObj;
  const ackId = actionStatus.ackId;

  const ackUrl = `${client.globalConfig.endpoints.accountsEndpoint}/v1/driver/station/session/ack`;

  let lastStatus = 0;
  let errorMessage = `Session failed to ${action}.`;
  let errorBody: unknown;

  for (let attempt = 1; attempt <= 20; attempt++) {
    const ackResponse = await client._request('POST', ackUrl, {
      body: JSON.stringify({ ackId, action: `${action}_session` }),
      headers: { 'Content-Type': 'application/json' },
    });

    lastStatus = ackResponse.status;

    if (ackResponse.status === 200) {
      try {
        return (await ackResponse.json()) as RawObj;
      } catch {
        return null;
      }
    }

    try {
      errorBody = await ackResponse.json();
      const msg = (errorBody as RawObj).errorMessage;
      if (typeof msg === 'string') errorMessage = msg;
    } catch {
      errorBody = undefined;
    }

    if (ackResponse.status === 422 && (errorBody as RawObj)?.errorId === 89) {
      throw new ChargerBusyError(
        typeof (errorBody as RawObj)?.errorMessage === 'string'
          ? (errorBody as RawObj).errorMessage as string
          : undefined,
        errorBody as ChargePointCommandErrorBody,
      );
    }

    if (action === 'stop' && ackResponse.status === 422 && (errorBody as RawObj)?.errorId === 165) {
      throw new NoActiveSessionError(
        typeof (errorBody as RawObj)?.errorMessage === 'string'
          ? (errorBody as RawObj).errorMessage as string
          : undefined,
        errorBody,
      );
    }

    if (ackResponse.status === 422 && (errorBody as RawObj)?.errorId === 25) {
      throw new VehicleNotReadyError(
        typeof (errorBody as RawObj)?.errorMessage === 'string'
          ? (errorBody as RawObj).errorMessage as string
          : undefined,
        errorBody as ChargePointCommandErrorBody,
      );
    }

    if (attempt < 20) {
      await sleep(3000);
    }
  }

  throw new CommunicationError(lastStatus, errorMessage, errorBody);
}

function parseMsTimestamp(v: unknown): Date {
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') return new Date(Number(v));
  return new Date(0);
}

function parseSessionUpdates(raw: unknown): ChargingSessionUpdate[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((u: unknown) => {
    const item = u as RawObj;
    return {
      energyKwh: typeof item.energy_kwh === 'number' ? item.energy_kwh : 0,
      powerKw: typeof item.power_kw === 'number' ? item.power_kw : 0,
      timestamp: parseMsTimestamp(item.timestamp),
    };
  });
}

export class ChargingSession {
  sessionId: number;
  deviceId = 0;
  deviceName = '';
  chargingState: ChargingStatus = '';
  chargingTime = 0;
  energyKwh = 0;
  milesAdded = 0;
  milesAddedPerHour = 0;
  outletNumber = 0;
  portLevel = 0;
  powerKw = 0;
  purpose = '';
  currencyIsoCode = '';
  paymentCompleted = false;
  paymentType = '';
  pricingSpecId = 0;
  totalAmount = 0;
  apiFlag = false;
  enableStopCharging = false;
  hasChargingReceipt = false;
  hasUtilityInfo = false;
  isHomeCharger = false;
  isPurposeFinalized = false;
  stopChargeSupported = false;
  companyId = 0;
  companyName = '';
  latitude = 0;
  longitude = 0;
  address = '';
  city = '';
  stateName = '';
  country = '';
  zipcode = '';
  updatePeriod = 0;
  startTime: Date | null = null;
  lastUpdateDataTimestamp: Date | null = null;
  updateData: ChargingSessionUpdate[] | null = null;
  utility: PowerUtility | null = null;
  vehicleInfo: VehicleInfo | null = null;

  private _client: ChargePoint | null = null;

  constructor(sessionId: number) {
    this.sessionId = sessionId;
  }

  /** @internal */
  _setClient(client: ChargePoint): void {
    this._client = client;
  }

  /**
   * @internal Backfill deviceId from context (the device we already queried for)
   * when the driver-bff /sessions/{id} response didn't include device_id — observed
   * on some home-charger sessions. Never overwrites a value the API did supply.
   */
  _ensureDeviceId(deviceId: number): void {
    if (this.deviceId === 0) this.deviceId = deviceId;
  }

  /**
   * @internal Backfill outletNumber from context when the driver-bff response didn't
   * include outlet_number. Never overwrites a value the API did supply.
   */
  _ensureOutletNumber(outletNumber: number): void {
    if (this.outletNumber === 0) this.outletNumber = outletNumber;
  }

  /** @internal Apply raw session data from the driver-bff API (snake_case keys). */
  _apply(data: RawObj): void {
    if (data.device_id !== undefined) this.deviceId = data.device_id as number;
    if (data.device_name !== undefined) this.deviceName = data.device_name as string;
    if (data.current_charging !== undefined) this.chargingState = data.current_charging as string;
    if (data.charging_time !== undefined) this.chargingTime = data.charging_time as number;
    if (data.energy_kwh !== undefined) this.energyKwh = data.energy_kwh as number;
    if (data.miles_added !== undefined) this.milesAdded = data.miles_added as number;
    if (data.miles_added_per_hour !== undefined) this.milesAddedPerHour = data.miles_added_per_hour as number;
    if (data.outlet_number !== undefined) this.outletNumber = data.outlet_number as number;
    if (data.port_level !== undefined) this.portLevel = data.port_level as number;
    if (data.power_kw !== undefined) this.powerKw = data.power_kw as number;
    if (data.purpose !== undefined) this.purpose = data.purpose as string;
    if (data.currency_iso_code !== undefined) this.currencyIsoCode = String(data.currency_iso_code);
    if (data.payment_completed !== undefined) this.paymentCompleted = data.payment_completed as boolean;
    if (data.payment_type !== undefined) this.paymentType = data.payment_type as string;
    if (data.pricing_spec_id !== undefined) this.pricingSpecId = data.pricing_spec_id as number;
    if (data.total_amount !== undefined) this.totalAmount = data.total_amount as number;
    if (data.api_flag !== undefined) this.apiFlag = data.api_flag as boolean;
    if (data.enable_stop_charging !== undefined) this.enableStopCharging = data.enable_stop_charging as boolean;
    if (data.has_charging_receipt !== undefined) this.hasChargingReceipt = data.has_charging_receipt as boolean;
    if (data.has_utility_info !== undefined) this.hasUtilityInfo = data.has_utility_info as boolean;
    if (data.is_home_charger !== undefined) this.isHomeCharger = data.is_home_charger as boolean;
    if (data.is_purpose_finalized !== undefined) this.isPurposeFinalized = data.is_purpose_finalized as boolean;
    if (data.stop_charge_supported !== undefined) this.stopChargeSupported = data.stop_charge_supported as boolean;
    if (data.company_id !== undefined) this.companyId = data.company_id as number;
    if (data.company_name !== undefined) this.companyName = data.company_name as string;
    if (data.lat !== undefined) this.latitude = data.lat as number;
    if (data.lon !== undefined) this.longitude = data.lon as number;
    if (data.address1 !== undefined) this.address = data.address1 as string;
    if (data.city !== undefined) this.city = data.city as string;
    if (data.state_name !== undefined) this.stateName = data.state_name as string;
    if (data.country !== undefined) this.country = data.country as string;
    if (data.zipcode !== undefined) this.zipcode = data.zipcode as string;
    if (data.update_period !== undefined) this.updatePeriod = data.update_period as number;
    if (data.start_time !== undefined) this.startTime = parseMsTimestamp(data.start_time);
    if (data.last_update_data_timestamp !== undefined) {
      this.lastUpdateDataTimestamp = parseMsTimestamp(data.last_update_data_timestamp);
    }
    if (data.update_data !== undefined) this.updateData = parseSessionUpdates(data.update_data);
    if (data.utility !== undefined) this.utility = (data.utility as PowerUtility) ?? null;
    if (data.vehicle_info !== undefined) this.vehicleInfo = (data.vehicle_info as VehicleInfo) ?? null;
  }

  async refresh(): Promise<void> {
    if (!this._client) throw new Error('ChargingSession client not set.');

    const url = `${this._client.globalConfig.endpoints.internalApiGatewayEndpoint}/driver-bff/v1/sessions/${this.sessionId}`;
    const response = await this._client._request('POST', url, {
      body: JSON.stringify({
        charging_status: { session_id: this.sessionId, mfhs: [] },
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get charging session data.');
    }

    const json = (await response.json()) as RawObj;
    const status = json.charging_status as RawObj | undefined;

    if (!status || 'error_message' in status || 'error' in status) {
      throw new CommunicationError(response.status, 'Failed to get charging session data.', status);
    }

    this._apply(status);
  }

  async stop(): Promise<void> {
    if (!this._client) throw new Error('ChargingSession client not set.');
    await sendCommand(
      this._client,
      'stop',
      this.deviceId,
      this.outletNumber,
      this.sessionId,
    );
  }

  /**
   * Resolve the active session for a device across both planes, without requiring
   * a session handle. Returns `null` when no session id can be found.
   *
   * Resolution order:
   * 1. Driver plane (`getUserChargingStatus`) — works for any session bound to the
   *    authenticated driver, including ones the car auto-started on plug-in.
   * 2. Device plane (`getHomeChargerStatus`) — used when the driver plane has no session,
   *    or reports one belonging to a different charger. Some models (CPH50 family) never
   *    surface a session id here, which is why the driver plane is tried first.
   */
  private static async resolveActiveByDevice(
    deviceId: number,
    client: ChargePoint,
  ): Promise<ChargingSession | null> {
    const userStatus = await client.getUserChargingStatus();
    let chargerStatus: HomeChargerStatus | null = null;

    if (userStatus && userStatus.sessionId > 0) {
      const session = await client.getChargingSession(userStatus.sessionId);
      // getUserChargingStatus reports the driver's active session, which may live
      // on a *different* device than the one we were asked to stop (e.g. a household
      // with two chargers). Only accept it when it belongs to this device, otherwise
      // we could stop the wrong charger. Fall through to the device plane on mismatch.
      if (session.deviceId === deviceId) {
        return session;
      }
      if (session.deviceId === 0) {
        // The driver-bff /sessions/{id} response omitted device_id entirely — observed
        // on some home-charger sessions. We can't compare it to `deviceId` directly, so
        // corroborate against the device plane: only accept this session as belonging
        // to `deviceId` when that device itself reports CHARGING, then backfill the
        // fields the stop command needs (deviceId, and outletNumber for a single-outlet
        // home charger).
        chargerStatus = await ChargingSession._tryGetHomeChargerStatus(deviceId, client);
        if (chargerStatus?.chargingStatus === 'CHARGING') {
          session._ensureDeviceId(deviceId);
          session._ensureOutletNumber(1);
          return session;
        }
      }
    }

    if (chargerStatus === null) {
      chargerStatus = await ChargingSession._tryGetHomeChargerStatus(deviceId, client);
    }
    if (chargerStatus?.sessionId !== undefined && chargerStatus.sessionId > 0) {
      const session = await client.getChargingSession(chargerStatus.sessionId);
      session._ensureDeviceId(deviceId);
      session._ensureOutletNumber(1);
      return session;
    }

    return null;
  }

  private static async _tryGetHomeChargerStatus(
    deviceId: number,
    client: ChargePoint,
  ): Promise<HomeChargerStatus | null> {
    try {
      return await client.getHomeChargerStatus(deviceId);
    } catch {
      // Device-plane lookup unavailable (e.g. deviceId is not a home charger
      // owned by this account).
      return null;
    }
  }

  static async stopByDevice(deviceId: number, client: ChargePoint): Promise<void> {
    // A device-level stop must carry the real sessionId + outletNumber. ChargePoint
    // rejects a stop for sessionId 0 with HTTP 422 errorId 165 (NoActiveSessionError),
    // so the previous default of portNumber=1/sessionId=0 could never stop a real
    // session. Resolve the active session first, then issue the stop with its real
    // identifiers (mirrors python-chargepoint's ChargingSession.stop()).
    const session = await ChargingSession.resolveActiveByDevice(deviceId, client);
    if (!session) {
      throw new UnresolvedSessionError(deviceId);
    }
    await session.stop();
  }

  static async start(
    deviceId: number,
    client: ChargePoint,
    options?: StartSessionOptions,
  ): Promise<ChargingSession> {
    const startAckData = await sendCommand(client, 'start', deviceId);

    // Some ChargePoint backends include the session_id in the start ack body.
    // Use it directly when present — it names the session this very command created,
    // so it needs no cross-plane corroboration.
    const directSessionId =
      typeof startAckData?.session_id === 'number' && startAckData.session_id > 0
        ? startAckData.session_id
        : typeof startAckData?.sessionId === 'number' && startAckData.sessionId > 0
          ? startAckData.sessionId
          : null;

    if (directSessionId !== null) {
      const session = new ChargingSession(directSessionId);
      session._setClient(client);
      await session.refresh();
      return session;
    }

    // The start ack confirms the cloud received the command, but the session
    // may take a moment to appear in the status API (same async IoT pattern
    // as amperage/LED changes). Poll until it shows up.
    const pollTimeoutMs = options?.pollTimeoutMs ?? 15_000;
    const pollIntervalMs = options?.pollIntervalMs ?? 2_000;
    const deadline = Date.now() + pollTimeoutMs;
    let pollAttempts = 0;

    for (;;) {
      const status = await client.getUserChargingStatus();
      pollAttempts++;

      // The driver plane reports whichever session the *account* is running, which in a
      // multi-charger household may be a different charger than the one we just started.
      // Only accept a session we can tie back to `deviceId` — mirroring
      // resolveActiveByDevice() — otherwise calling .stop() on the returned handle would
      // stop the wrong charger.
      if (status && typeof status.sessionId === 'number' && status.sessionId > 0) {
        const session = await client.getChargingSession(status.sessionId);

        if (session.deviceId === deviceId) {
          return session;
        }

        if (session.deviceId === 0) {
          // driver-bff omitted device_id entirely (observed on some home-charger
          // sessions). Corroborate against the device plane before claiming it.
          const chargerStatus = await ChargingSession._tryGetHomeChargerStatus(deviceId, client);
          if (chargerStatus?.chargingStatus === 'CHARGING') {
            session._ensureDeviceId(deviceId);
            session._ensureOutletNumber(1);
            return session;
          }
        }
        // Otherwise the session names a different charger — keep polling for ours.
      }

      if (Date.now() >= deadline) break;
      await sleep(pollIntervalMs);
    }

    // Driver plane never produced a session for this device — fall back to the device plane.
    let chargerConfirmedCharging = false;
    let chargerSessionId: number | undefined;
    try {
      const chargerStatus = await client.getHomeChargerStatus(deviceId);
      chargerConfirmedCharging = chargerStatus.chargingStatus === 'CHARGING';
      chargerSessionId = chargerStatus.sessionId;
    } catch {
      // Cross-check unavailable; proceed with what we know.
    }

    // Device plane may supply a session id even when the driver plane does not
    if (chargerConfirmedCharging && chargerSessionId !== undefined) {
      const session = new ChargingSession(chargerSessionId);
      session._setClient(client);
      await session.refresh();
      // The device plane named this session for this charger, so backfill the identifiers
      // a later stop() needs when the driver-bff response omits them.
      session._ensureDeviceId(deviceId);
      session._ensureOutletNumber(1);
      return session;
    }

    throw new StartVerificationTimeoutError(deviceId, pollTimeoutMs, pollAttempts, chargerConfirmedCharging);
  }
}
