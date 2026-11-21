import type { ChargePointCommandErrorBody } from './types.js';

export class APIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'APIError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CommunicationError extends APIError {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'CommunicationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class LoginError extends CommunicationError {
  constructor(statusCode: number, message: string, body?: unknown) {
    super(statusCode, message, body);
    this.name = 'LoginError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidSession extends CommunicationError {
  constructor(statusCode = 401, message = 'ChargePoint session expired. Please log in again.', body?: unknown) {
    super(statusCode, message, body);
    this.name = 'InvalidSession';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ChargerBusyError extends CommunicationError {
  constructor(message = 'Charger is busy.', body?: ChargePointCommandErrorBody) {
    super(422, message, body);
    this.name = 'ChargerBusyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VehicleNotReadyError extends CommunicationError {
  constructor(message = 'Vehicle is not ready to charge — it may be at its charge limit. Unplug and reconnect, or try again shortly.', body?: ChargePointCommandErrorBody) {
    super(422, message, body);
    this.name = 'VehicleNotReadyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DatadomeCaptcha extends APIError {
  constructor(
    public readonly captchaUrl: string,
    message = 'Datadome captcha protection triggered.',
  ) {
    super(message);
    this.name = 'DatadomeCaptcha';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NoActiveSessionError extends CommunicationError {
  constructor(message = 'No active charging session found.', body?: unknown) {
    super(422, message, body);
    this.name = 'NoActiveSessionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnresolvedSessionError extends APIError {
  constructor(
    public readonly deviceId: number,
    message = `Could not resolve an active charging session for device ${deviceId}. The driver plane (getUserChargingStatus) returned no session and the device plane (getHomeChargerStatus) did not surface a session id. The device may not be charging, or the session may have been started in a way that is not visible to this account.`,
  ) {
    super(message);
    this.name = 'UnresolvedSessionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StartVerificationTimeoutError extends APIError {
  constructor(
    public readonly deviceId: number,
    public readonly pollTimeoutMs: number,
    public readonly pollAttempts: number,
    public readonly chargerConfirmedCharging: boolean = false,
    message = 'No active charging session found after start command.',
  ) {
    super(message);
    this.name = 'StartVerificationTimeoutError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

