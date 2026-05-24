import type { ChargePoint } from './client.js';
import { CommunicationError, StartVerificationTimeoutError } from './exceptions.js';
import type { ChargingSessionUpdate, ChargingStatus, PowerUtility, StartSessionOptions, VehicleInfo } from './types.js';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type RawObj = Record<string, unknown>;

async function sendCommand(
  client: ChargePoint,
  action: 'start' | 'stop',
  deviceId: number,
  portNumber = 1,
  sessionId = 0,
): Promise<void> {
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
    const text = await response.text();
    throw new CommunicationError(
      response.status,
      `Failed to ${action} ChargePoint session: ${text}`,
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
      return;
    }

    try {
      errorBody = await ackResponse.json();
      const msg = (errorBody as RawObj).errorMessage;
      if (typeof msg === 'string') errorMessage = msg;
    } catch {
      errorBody = undefined;
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
      throw new CommunicationError(response.status, 'Failed to get charging session data.');
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

  static async start(
    deviceId: number,
    client: ChargePoint,
    options?: StartSessionOptions,
  ): Promise<ChargingSession> {
    await sendCommand(client, 'start', deviceId);

    // The start ack confirms the cloud received the command, but the session
    // may take a moment to appear in the status API (same async IoT pattern
    // as amperage/LED changes). Poll until it shows up.
    const pollTimeoutMs = options?.pollTimeoutMs ?? 15_000;
    const pollIntervalMs = options?.pollIntervalMs ?? 2_000;
    const deadline = Date.now() + pollTimeoutMs;
    let pollAttempts = 0;
    let status = await client.getUserChargingStatus();
    pollAttempts++;
    while (!status && Date.now() < deadline) {
      await sleep(pollIntervalMs);
      status = await client.getUserChargingStatus();
      pollAttempts++;
    }

    if (!status) {
      let chargerConfirmedCharging = false;
      try {
        const chargerStatus = await client.getHomeChargerStatus(deviceId);
        chargerConfirmedCharging = chargerStatus.chargingStatus === 'CHARGING';
      } catch {
        // Cross-check unavailable; proceed with what we know.
      }
      throw new StartVerificationTimeoutError(deviceId, pollTimeoutMs, pollAttempts, chargerConfirmedCharging);
    }

    const session = new ChargingSession(status.sessionId);
    session._setClient(client);
    await session.refresh();
    return session;
  }
}
