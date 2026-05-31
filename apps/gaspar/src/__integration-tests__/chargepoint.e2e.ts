import 'dotenv/config';
import { ChargePoint } from 'node-chargepoint';
import { describe, expect, it } from 'vitest';

const username = process.env.CHARGEPOINT_USERNAME;
const password = process.env.CHARGEPOINT_PASSWORD;
const token = process.env.CHARGEPOINT_TOKEN;
const deviceId = process.env.CHARGEPOINT_DEVICE_ID
	? Number(process.env.CHARGEPOINT_DEVICE_ID)
	: undefined;
const configured = Boolean(username && (token || password) && deviceId);

describe.skipIf(!configured)('ChargePoint integration', () => {
	it('authenticates and fetches charger status', async () => {
		const cp = await ChargePoint.create(username!, { coulombToken: token });
		if (!token) {
			await cp.loginWithPassword(password!);
		}

		const status = await cp.getHomeChargerStatus(deviceId!);

		expect(typeof status.isPluggedIn).toBe('boolean');
		expect(typeof status.isConnected).toBe('boolean');
		expect(typeof status.amperageLimit).toBe('number');
		expect(Array.isArray(status.possibleAmperageLimits)).toBe(true);
		expect(status.possibleAmperageLimits.every((a: unknown) => typeof a === 'number')).toBe(true);
		expect(status.chargerId).toBe(deviceId);
	});
});
