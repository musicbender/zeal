import { initLogger } from '@repo/logger/server';
import type { ChargingSession, HomeChargerStatus } from 'node-chargepoint';
import type { PowerwallClient } from './powerwall.client.js';
import type {
	ActiveSessionSummary,
	PowerwallData,
	SunkeepConfig,
	SunkeepStatus,
} from './sunkeep.types.js';
import { StopReason, SunkeepState } from './sunkeep.types.js';

const log = initLogger('sunkeep.service');

const MIN_AMPS = 8;
const MAX_AMPS = 32;
const VOLTAGE = 240;
const MIN_EXCESS_KW = 1.5;

function calcTargetAmps(excessKw: number): number {
	const raw = Math.floor((excessKw * 1000) / VOLTAGE);
	return Math.max(MIN_AMPS, Math.min(MAX_AMPS, raw));
}

function isWithinSolarWindow(start: string, end: string): boolean {
	const now = new Date();
	const startParts = start.split(':').map(Number);
	const endParts = end.split(':').map(Number);
	const startH = startParts[0];
	const startM = startParts[1];
	const endH = endParts[0];
	const endM = endParts[1];
	if (
		startH === undefined ||
		startM === undefined ||
		endH === undefined ||
		endM === undefined ||
		isNaN(startH) ||
		isNaN(startM) ||
		isNaN(endH) ||
		isNaN(endM)
	) {
		return false;
	}
	const nowMinutes = now.getHours() * 60 + now.getMinutes();
	const startMinutes = startH * 60 + startM;
	const endMinutes = endH * 60 + endM;
	return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

interface IChargePointClient {
	getHomeChargerStatus(chargerId: number): Promise<HomeChargerStatus>;
	setAmperageLimit(chargerId: number, amps: number): Promise<void>;
	startChargingSession(deviceId: number): Promise<ChargingSession>;
}

interface IPrismaChargingEvent {
	create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
	update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}

interface IPrisma {
	chargingEvent: IPrismaChargingEvent;
}

export class SunkeepService {
	private state: SunkeepState = SunkeepState.DISABLED;
	private activeSession: ChargingSession | null = null;
	private activeEventId: string | null = null;
	private currentAmps = 0;
	private peakSolarKw = 0;
	private lastPollAt: Date | null = null;
	private lastPwData: PowerwallData | null = null;
	private sessionStartedAt: Date | null = null;

	constructor(
		private readonly chargePoint: IChargePointClient,
		private readonly powerwall: PowerwallClient,
		private readonly prisma: IPrisma,
		private readonly config: SunkeepConfig
	) {}

	enable(): void {
		if (this.state === SunkeepState.DISABLED) {
			this.state = SunkeepState.IDLE;
			log.info('Sunkeep enabled');
		}
	}

	async disable(): Promise<void> {
		if (this.state === SunkeepState.CHARGING) {
			await this.stopActiveSession(StopReason.MANUAL);
		}
		this.state = SunkeepState.DISABLED;
		log.info('Sunkeep disabled');
	}

	getStatus(): SunkeepStatus {
		const session: ActiveSessionSummary | null = this.activeSession
			? {
					sessionId: this.activeSession.sessionId,
					currentAmps: this.currentAmps,
					startedAt: this.sessionStartedAt?.toISOString() ?? null,
				}
			: null;

		return {
			state: this.state,
			enabled: this.state !== SunkeepState.DISABLED,
			lastPollAt: this.lastPollAt?.toISOString() ?? null,
			activeSession: session,
			solarKw: this.lastPwData?.solarKw ?? null,
			excessKw: this.lastPwData ? this.lastPwData.solarKw - this.lastPwData.loadKw : null,
			batteryPct: this.lastPwData?.batteryPct ?? null,
		};
	}

	async runTick(): Promise<void> {
		if (this.state === SunkeepState.DISABLED) return;

		if (!isWithinSolarWindow(this.config.solarWindowStart, this.config.solarWindowEnd)) {
			return;
		}

		this.lastPollAt = new Date();

		try {
			await this.tick();
		} catch (err) {
			log.error({ err }, 'Sunkeep tick error');
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.ERROR);
			}
			this.state = SunkeepState.ERROR;
		}
	}

	async manualStopSession(): Promise<void> {
		if (this.state !== SunkeepState.CHARGING) return;
		await this.stopActiveSession(StopReason.MANUAL);
		this.state = SunkeepState.IDLE;
	}

	async manualStartSession(): Promise<void> {
		if (this.state === SunkeepState.CHARGING) return;
		const pwData = await this.powerwall.getData();
		this.lastPwData = pwData;
		const excessKw = pwData.solarKw - pwData.loadKw;
		const targetAmps = calcTargetAmps(excessKw);
		await this.startSession(targetAmps);
	}

	private async tick(): Promise<void> {
		const chargerStatus = await this.chargePoint.getHomeChargerStatus(
			this.config.chargePointDeviceId
		);

		if (!chargerStatus.isPluggedIn) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.UNPLUGGED);
			}
			this.state = SunkeepState.IDLE;
			return;
		}

		const pwData = await this.powerwall.getData();
		this.lastPwData = pwData;

		if (pwData.solarKw === 0) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.NIGHT_SAFETY);
			}
			this.state = SunkeepState.IDLE;
			return;
		}

		if (pwData.batteryPct < this.config.powerwallSoeThreshold) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.BATTERY_DEPLETED);
				this.state = SunkeepState.WAITING;
			} else {
				this.state = SunkeepState.WAITING;
			}
			return;
		}

		const excessKw = pwData.solarKw - pwData.loadKw;

		if (excessKw < MIN_EXCESS_KW) {
			if (this.state === SunkeepState.CHARGING) {
				await this.stopActiveSession(StopReason.SOLAR_DROPPED);
				this.state = SunkeepState.WAITING;
			} else {
				this.state = SunkeepState.WAITING;
			}
			return;
		}

		const targetAmps = calcTargetAmps(excessKw);

		if (this.state === SunkeepState.CHARGING) {
			if (targetAmps !== this.currentAmps) {
				await this.chargePoint.setAmperageLimit(this.config.chargePointDeviceId, targetAmps);
				this.currentAmps = targetAmps;
				log.info({ targetAmps }, 'Adjusted charge amps');
			}
			if (pwData.solarKw > this.peakSolarKw && this.activeEventId) {
				this.peakSolarKw = pwData.solarKw;
				await this.prisma.chargingEvent.update({
					where: { id: this.activeEventId },
					data: { peakSolarKw: this.peakSolarKw },
				});
			}
		} else {
			await this.startSession(targetAmps);
		}
	}

	private async startSession(targetAmps: number): Promise<void> {
		await this.chargePoint.setAmperageLimit(this.config.chargePointDeviceId, targetAmps);
		const session = await this.chargePoint.startChargingSession(this.config.chargePointDeviceId);
		const event = await this.prisma.chargingEvent.create({
			data: {
				startAmps: targetAmps,
				peakSolarKw: this.lastPwData?.solarKw ?? null,
			},
		});
		this.activeSession = session;
		this.activeEventId = event.id;
		this.currentAmps = targetAmps;
		this.peakSolarKw = this.lastPwData?.solarKw ?? 0;
		this.sessionStartedAt = new Date();
		this.state = SunkeepState.CHARGING;
		log.info({ targetAmps, sessionId: session.sessionId }, 'Charging session started');
	}

	private async stopActiveSession(reason: StopReason): Promise<void> {
		if (!this.activeSession || !this.activeEventId) return;

		const session = this.activeSession;
		const eventId = this.activeEventId;
		const endAmps = this.currentAmps;

		try {
			await session.stop();
		} catch (err) {
			log.warn({ err }, 'Error stopping ChargePoint session');
		}

		try {
			await this.prisma.chargingEvent.update({
				where: { id: eventId },
				data: {
					stoppedAt: new Date(),
					stopReason: reason,
					endAmps,
					energyKwh: session.energyKwh,
				},
			});
		} catch (err) {
			log.error({ err }, 'Failed to update ChargingEvent on session stop');
		}

		log.info({ reason, sessionId: session.sessionId }, 'Charging session stopped');
		this.activeSession = null;
		this.activeEventId = null;
		this.currentAmps = 0;
		this.peakSolarKw = 0;
		this.sessionStartedAt = null;
	}
}
