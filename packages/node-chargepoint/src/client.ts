import { USER_AGENT } from './constants.js';
import { APIError, CommunicationError, DatadomeCaptcha, InvalidSession, LoginError } from './exceptions.js';
import { fetchGlobalConfig } from './global-config.js';
import { ChargingSession } from './session.js';
import type {
  Account,
  ElectricVehicle,
  GlobalConfiguration,
  HomeChargerConfiguration,
  HomeChargerSchedule,
  HomeChargerStatus,
  HomeChargerTechnicalInfo,
  MapFilter,
  MapStation,
  StartSessionOptions,
  Station,
  StationInfo,
  UserChargingStatus,
  ZoomBounds,
} from './types.js';

type RawObj = Record<string, unknown>;

export interface ChargePointOptions {
  coulombToken?: string;
  region?: string;
  /** Request timeout in milliseconds. Applied via AbortSignal.timeout(). */
  timeout?: number;
  /** Optional debug callback. Called with request/response info — never with header values. */
  debug?: (msg: string) => void;
}

function parseMsTimestamp(v: unknown): Date {
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') return new Date(Number(v));
  return new Date(0);
}

export class ChargePoint {
  public globalConfig: GlobalConfiguration;
  private _username: string;
  private _coulombToken: string | null = null;
  private _region: string;
  private _userId: number | null = null;
  private _timeout: number | undefined;
  private _debug: ((msg: string) => void) | undefined;

  /** The current session token. Save this after login to avoid re-authenticating. */
  get coulombToken(): string | null {
    return this._coulombToken;
  }

  private constructor(username: string, globalConfig: GlobalConfiguration, region: string) {
    this._username = username;
    this.globalConfig = globalConfig;
    this._region = region;
  }

  static async create(username: string, options: ChargePointOptions = {}): Promise<ChargePoint> {
    const region = options.region ?? 'NA';
    const config = await fetchGlobalConfig(region);
    const client = new ChargePoint(username, config, region);

    if (options.coulombToken) {
      client._setToken(options.coulombToken, region);
    }

    client._timeout = options.timeout;
    client._debug = options.debug;

    return client;
  }

  private _setToken(token: string, region: string): void {
    try {
      this._coulombToken = decodeURIComponent(token);
    } catch {
      throw new APIError('Malformed coulomb_sess token: invalid percent-encoding');
    }
    this._region = region;
  }

  /** @internal Used by session.ts and tests. */
  async _request(method: string, url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers as string[][] | Record<string, string> | Headers);
    headers.set('user-agent', USER_AGENT);

    if (!headers.has('content-type') && method !== 'GET') {
      headers.set('content-type', 'application/json');
    }

    if (this._coulombToken) {
      headers.set('cookie', `coulomb_sess=${this._coulombToken}`);
      headers.set('cp-session-type', 'CP_SESSION_TOKEN');
      headers.set('cp-session-token', this._coulombToken);
      headers.set('cp-region', this._region);
    }

    this._debug?.(`${method} ${url}`);

    const signal = this._timeout !== undefined ? AbortSignal.timeout(this._timeout) : undefined;
    const response = await fetch(url, { ...init, method, headers, signal });

    this._debug?.(`${response.status} ${url}`);

    // Refresh coulomb_sess from Set-Cookie response header
    const setCookies: string[] =
      typeof (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie ===
      'function'
        ? (response.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : [response.headers.get('set-cookie') ?? ''].filter(Boolean);

    for (const cookie of setCookies) {
      const match = /^coulomb_sess=([^;]+)/.exec(cookie);
      if (match) {
        try {
          this._coulombToken = decodeURIComponent(match[1] ?? '');
        } catch {
          throw new CommunicationError(response.status, 'Malformed coulomb_sess cookie: invalid percent-encoding');
        }
        break;
      }
    }

    if (response.status === 401) {
      throw new InvalidSession(401, 'ChargePoint session expired. Please log in again.');
    }

    if (response.status === 403) {
      let body: unknown;
      try {
        body = await response.clone().json();
      } catch {
        // not JSON
      }
      const captchaUrl = (body as RawObj)?.url;
      if (typeof captchaUrl === 'string') {
        let isDatadomeCaptchaHost = false;
        try {
          const host = new URL(captchaUrl).hostname.toLowerCase();
          isDatadomeCaptchaHost =
            host === 'datadome.co' ||
            host.endsWith('.datadome.co') ||
            host === 'captcha-delivery.com' ||
            host.endsWith('.captcha-delivery.com');
        } catch {
          // Invalid URL; ignore and fall through.
        }
        if (isDatadomeCaptchaHost) {
          throw new DatadomeCaptcha(captchaUrl);
        }
      }
    }

    return response;
  }

  private async _errorBody(response: Response): Promise<string> {
    try {
      return await response.clone().text();
    } catch {
      return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  async loginWithPassword(password: string): Promise<void> {
    const url = `${this.globalConfig.endpoints.ssoEndpoint}/v1/user/login`;
    const response = await this._request('POST', url, {
      body: JSON.stringify({ user_name: this._username, password }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      let body: unknown;
      try { body = await response.json(); } catch { /* ignore */ }
      throw new LoginError(response.status, 'Failed to login with password.', body);
    }

    // The coulomb_sess cookie is set by the SSO endpoint on success;
    // _request() already extracted it from Set-Cookie above.
    await response.text(); // drain body

    if (!this._coulombToken) {
      throw new LoginError(response.status, 'Login succeeded but no session token was returned.');
    }
  }

  async loginWithSsoSession(ssoJwt: string): Promise<void> {
    // Exchange an SSO JWT for a coulomb_sess cookie via the portal endpoint.
    const url = `${this.globalConfig.endpoints.portalDomainEndpoint}/index.php/nghelper/getSession`;
    const response = await this._request('GET', url, {
      headers: {
        cookie: `auth-session=${ssoJwt}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      let body: unknown;
      try { body = await response.json(); } catch { /* ignore */ }
      throw new LoginError(response.status, 'Failed to login with SSO session.', body);
    }

    await response.text();
  }

  async logout(): Promise<void> {
    const url = `${this.globalConfig.endpoints.ssoEndpoint}/v1/user/logout`;
    try {
      await this._request('POST', url);
    } finally {
      this._coulombToken = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Account
  // ---------------------------------------------------------------------------

  async getAccount(): Promise<Account> {
    const url = `${this.globalConfig.endpoints.accountsEndpoint}/v1/driver/profile/user`;
    const response = await this._request('GET', url);

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get account information.');
    }

    const data = (await response.json()) as Account;
    if (data.user?.userId) {
      this._userId = data.user.userId;
    }
    return data;
  }

  async getVehicles(): Promise<ElectricVehicle[]> {
    const url = `${this.globalConfig.endpoints.accountsEndpoint}/v1/driver/vehicle`;
    const response = await this._request('GET', url);

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get vehicles.');
    }

    const data = (await response.json()) as RawObj;
    return (Array.isArray(data.vehicles) ? data.vehicles : []) as ElectricVehicle[];
  }

  async getUserChargingStatus(): Promise<UserChargingStatus | null> {
    const url = `${this.globalConfig.endpoints.mapcacheEndpoint}/v2`;
    const response = await this._request('POST', url, {
      body: JSON.stringify({ user_status: { timestamp: Date.now() } }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get user charging status.');
    }

    const data = (await response.json()) as RawObj;
    const userStatus = data.user_status as RawObj | null | undefined;

    if (!userStatus) return null;

    const charging = userStatus.charging_status as RawObj | null | undefined;
    if (!charging) return null;

    const stations: Station[] = Array.isArray(charging.stations)
      ? (charging.stations as RawObj[]).map((s) => ({
          id: s.id as number,
          name: typeof s.name === 'string' ? s.name : '',
          latitude: typeof s.lat === 'number' ? s.lat : (s.latitude as number ?? 0),
          longitude: typeof s.lon === 'number' ? s.lon : (s.longitude as number ?? 0),
        }))
      : [];

    return {
      sessionId: charging.session_id as number,
      startTime: parseMsTimestamp(charging.start_time),
      state: typeof charging.current_charging === 'string' ? charging.current_charging : '',
      stations,
    };
  }

  // ---------------------------------------------------------------------------
  // Home charger helpers
  // ---------------------------------------------------------------------------

  private async ensureUserId(): Promise<number> {
    if (this._userId !== null) return this._userId;
    const account = await this.getAccount();
    return account.user.userId;
  }

  async getHomeChargers(): Promise<number[]> {
    const userId = await this.ensureUserId();
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/configuration/users/${userId}/chargers`;
    const response = await this._request('GET', url);

    if (!response.ok) {
      let body: unknown;
      try { body = await response.json(); } catch { /* ignore */ }
      throw new CommunicationError(response.status, 'Failed to get home chargers.', body);
    }

    const data = (await response.json()) as RawObj;
    // API returns { data: [...] }; older shape used { chargers: [...] }
    const arr = Array.isArray(data.data)
      ? (data.data as RawObj[])
      : Array.isArray(data.chargers)
        ? (data.chargers as RawObj[])
        : [];
    return arr.map((c) => {
      // API uses "id" (string); older shape used chargerId / charger_id (number)
      const id = c.id ?? c.chargerId ?? c.charger_id;
      return typeof id === 'number' ? id : Number(id);
    });
  }

  async getHomeChargerStatus(chargerId: number): Promise<HomeChargerStatus> {
    const userId = await this.ensureUserId();
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/configuration/users/${userId}/chargers/${chargerId}/status`;
    const response = await this._request('GET', url);

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get home charger status.');
    }

    const data = (await response.json()) as RawObj;
    // Real API nests amperage info under chargeAmperageSettings; fall back to flat fields for older shapes
    const amp = (data.chargeAmperageSettings ?? {}) as RawObj;
    return {
      chargerId, // not echoed by the API; inject from parameter
      brand: String(data.brand ?? ''),
      model: String(data.model ?? ''),
      macAddress: String(data.macAddress ?? ''),
      chargingStatus: String(data.chargingStatus ?? ''),
      isPluggedIn: Boolean(data.isPluggedIn),
      isConnected: Boolean(data.isConnected),
      isReminderEnabled: Boolean(data.isReminderEnabled),
      plugInReminderTime: String(data.plugInReminderTime ?? ''),
      hasUtilityInfo: Boolean(data.hasUtilityInfo),
      isDuringScheduledTime: Boolean(data.isDuringScheduledTime),
      amperageLimit: Number(amp.chargeLimit ?? data.amperageLimit ?? 0),
      possibleAmperageLimits: ((amp.possibleChargeLimit ?? data.possibleAmperageLimits ?? []) as number[]).map(Number),
    };
  }

  async getHomeChargerTechnicalInfo(chargerId: number): Promise<HomeChargerTechnicalInfo> {
    const userId = await this.ensureUserId();
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/configuration/users/${userId}/chargers/${chargerId}/technical-info`;
    const response = await this._request('GET', url);

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get home charger technical info.');
    }

    return (await response.json()) as HomeChargerTechnicalInfo;
  }

  async getHomeChargerConfig(chargerId: number): Promise<HomeChargerConfiguration> {
    const userId = await this.ensureUserId();
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/configuration/users/${userId}/chargers/${chargerId}/configurations`;
    const response = await this._request('GET', url);

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get home charger configuration.');
    }

    const data = (await response.json()) as RawObj;
    // Real API wraps all fields under "settings"; fall back to flat shape for older responses
    const s = (data.settings ?? data) as RawObj;
    // LED brightness: real API uses settings.led.brightness with string-typed level/supportedLevels
    const rawLed = ((s.led as RawObj | undefined)?.brightness ?? s.ledBrightness ?? {}) as RawObj;
    const level =
      typeof rawLed.level === 'string'
        ? Number(rawLed.level)
        : Number(rawLed.level ?? rawLed.currentBrightnessSettings ?? 0);
    const supportedLevels = Array.isArray(rawLed.supportedLevels)
      ? (rawLed.supportedLevels as (string | number)[]).map(Number)
      : [];
    const rawPs = s.powerSource as RawObj | undefined;
    const powerSource =
      rawPs && typeof rawPs.amps === 'number' && typeof rawPs.type === 'string'
        ? { amps: rawPs.amps, type: rawPs.type }
        : null;

    return {
      powerSource,
      serialNumber: String(s.serialNumber ?? ''),
      macAddress: String(s.macAddress ?? ''),
      stationNickname: String(s.stationNickname ?? ''),
      streetAddress: String(s.streetAddress ?? ''),
      hasUtilityInfo: Boolean(s.hasUtilityInfo),
      utility: (s.utility ?? null) as HomeChargerConfiguration['utility'],
      // API may return boolean true/false or string "ON"/"OFF"
      indicatorLightEcoMode: s.indicatorLightEcoMode === true || s.indicatorLightEcoMode === 'ON',
      flashlightReset: Boolean(s.flashlightReset),
      worksWithNest: Boolean(s.worksWithNest),
      isPairedWithNest: Boolean(s.isPairedWithNest),
      isInstalledByInstaller: Boolean(s.isInstalledByInstaller),
      ledBrightness: {
        level,
        inProgress: Boolean(rawLed.inProgress),
        supportedLevels,
        isEnabled: rawLed.isEnabled !== false,
      },
    };
  }

  async getHomeChargerSchedule(chargerId: number): Promise<HomeChargerSchedule> {
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/schedule/charger/${chargerId}/schedule`;
    const response = await this._request('GET', url);

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get home charger schedule.');
    }

    return (await response.json()) as HomeChargerSchedule;
  }

  async setHomeChargerSchedule(
    chargerId: number,
    weekdayStart: string,
    weekdayEnd: string,
    weekendStart: string,
    weekendEnd: string,
  ): Promise<HomeChargerSchedule> {
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/schedule/charger/${chargerId}/schedule`;
    const response = await this._request('PUT', url, {
      body: JSON.stringify({
        schedule: {
          weekdays: { startTime: weekdayStart, endTime: weekdayEnd },
          weekends: { startTime: weekendStart, endTime: weekendEnd },
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const body = await this._errorBody(response);
      throw new CommunicationError(response.status, `Failed to set home charger schedule. HTTP ${response.status}: ${body}`);
    }

    return (await response.json()) as HomeChargerSchedule;
  }

  async disableHomeChargerSchedule(chargerId: number): Promise<void> {
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/schedule/charger/${chargerId}/schedule`;
    const response = await this._request('PUT', url, {
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to disable home charger schedule.');
    }

    await response.text();
  }

  async setAmperageLimit(chargerId: number, amperageLimit: number): Promise<void> {
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/configuration/chargers/${chargerId}/charge-amperage-limit`;
    const response = await this._request('PUT', url, {
      body: JSON.stringify({ chargeAmperageLimit: amperageLimit }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const body = await this._errorBody(response);
      throw new CommunicationError(response.status, `Failed to set amperage limit. HTTP ${response.status}: ${body}`);
    }

    await response.text();
  }

  async setLedBrightness(chargerId: number, level: number): Promise<void> {
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/configuration/chargers/${chargerId}/led-brightness`;
    const response = await this._request('PUT', url, {
      body: JSON.stringify({ ledBrightnessLevel: level }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const body = await this._errorBody(response);
      throw new CommunicationError(response.status, `Failed to set LED brightness. HTTP ${response.status}: ${body}`);
    }

    await response.text();
  }

  async restartHomeCharger(chargerId: number): Promise<void> {
    const userId = await this.ensureUserId();
    const url = `${this.globalConfig.endpoints.hcpoHcmEndpoint}/api/v1/configuration/users/${userId}/chargers/${chargerId}/restart`;
    const response = await this._request('POST', url);

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to restart home charger.');
    }

    await response.text();
  }

  // ---------------------------------------------------------------------------
  // Charging sessions
  // ---------------------------------------------------------------------------

  async getChargingSession(sessionId: number): Promise<ChargingSession> {
    const session = new ChargingSession(sessionId);
    session._setClient(this);
    await session.refresh();
    return session;
  }

  async startChargingSession(deviceId: number, options?: StartSessionOptions): Promise<ChargingSession> {
    return ChargingSession.start(deviceId, this, options);
  }

  // ---------------------------------------------------------------------------
  // Stations
  // ---------------------------------------------------------------------------

  async getStation(deviceId: number): Promise<StationInfo> {
    const url = `${this.globalConfig.endpoints.mapcacheEndpoint}/v3/station/info?deviceId=${deviceId}&use_cache=false`;
    const response = await this._request('GET', url);

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get station info.');
    }

    return (await response.json()) as StationInfo;
  }

  async getNearbyStations(bounds: ZoomBounds, filter: MapFilter = {}): Promise<MapStation[]> {
    const url = `${this.globalConfig.endpoints.mapcacheEndpoint}/v2`;
    const stationList: RawObj = {
      ne_lat: bounds.neLat,
      ne_lon: bounds.neLon,
      sw_lat: bounds.swLat,
      sw_lon: bounds.swLon,
      ...filter,
    };

    const response = await this._request('POST', url, {
      body: JSON.stringify({ station_list: stationList }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new CommunicationError(response.status, 'Failed to get nearby stations.');
    }

    const data = (await response.json()) as RawObj;
    const list = data.station_list as RawObj | undefined;
    return Array.isArray(list?.stations) ? (list.stations as MapStation[]) : [];
  }
}
