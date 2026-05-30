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
  constructor(message = 'Charger is busy.', body?: unknown) {
    super(422, message, body);
    this.name = 'ChargerBusyError';
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
