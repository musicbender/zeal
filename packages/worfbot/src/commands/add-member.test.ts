import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/worfbot-data', () => ({
	getFamilyMemberByDiscordId: vi.fn(),
	createFamilyMember: vi.fn(),
}));

import { createFamilyMember, getFamilyMemberByDiscordId } from '@repo/worfbot-data';
import type { DiscordInteraction } from '../discord/types';
import { handleAddMember } from './add-member';

function makeInteraction(
	options: { name: string; type: number; value: string }[]
): DiscordInteraction {
	return {
		type: 2,
		data: {
			name: 'add-member',
			options,
		},
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

describe('handleAddMember', () => {
	it('creates a family member and returns success', async () => {
		vi.mocked(getFamilyMemberByDiscordId).mockResolvedValueOnce(null);
		vi.mocked(createFamilyMember).mockResolvedValueOnce({
			id: 1,
			discord_user_id: '12345',
			display_name: 'Pat',
			timezone: 'America/New_York',
			created_at: new Date(),
			updated_at: new Date(),
		});

		const response = await handleAddMember(
			makeInteraction([
				{ name: 'user', type: 6, value: '12345' },
				{ name: 'name', type: 3, value: 'Pat' },
				{ name: 'timezone', type: 3, value: 'America/New_York' },
			])
		);
		const body = await response.json();

		expect(body.type).toBe(4);
		expect(body.data.content).toContain('Pat');
		expect(createFamilyMember).toHaveBeenCalledWith({
			discord_user_id: '12345',
			display_name: 'Pat',
			timezone: 'America/New_York',
		});
	});

	it('returns ephemeral error for invalid timezone', async () => {
		const response = await handleAddMember(
			makeInteraction([
				{ name: 'user', type: 6, value: '12345' },
				{ name: 'name', type: 3, value: 'Pat' },
				{ name: 'timezone', type: 3, value: 'Fake/Timezone' },
			])
		);
		const body = await response.json();

		expect(body.type).toBe(4);
		expect(body.data.flags).toBe(64); // EPHEMERAL
		expect(body.data.content).toContain('Invalid timezone');
		expect(createFamilyMember).not.toHaveBeenCalled();
	});

	it('returns ephemeral error for duplicate user', async () => {
		vi.mocked(getFamilyMemberByDiscordId).mockResolvedValueOnce({
			id: 1,
			discord_user_id: '12345',
			display_name: 'Pat',
			timezone: 'America/New_York',
			created_at: new Date(),
			updated_at: new Date(),
		});

		const response = await handleAddMember(
			makeInteraction([
				{ name: 'user', type: 6, value: '12345' },
				{ name: 'name', type: 3, value: 'Pat' },
				{ name: 'timezone', type: 3, value: 'America/New_York' },
			])
		);
		const body = await response.json();

		expect(body.type).toBe(4);
		expect(body.data.flags).toBe(64);
		expect(body.data.content).toContain('already registered');
		expect(createFamilyMember).not.toHaveBeenCalled();
	});

	it('returns ephemeral error when database throws', async () => {
		vi.mocked(getFamilyMemberByDiscordId).mockRejectedValueOnce(new Error('DB connection failed'));

		const response = await handleAddMember(
			makeInteraction([
				{ name: 'user', type: 6, value: '12345' },
				{ name: 'name', type: 3, value: 'Pat' },
				{ name: 'timezone', type: 3, value: 'America/New_York' },
			])
		);
		const body = await response.json();

		expect(body.type).toBe(4);
		expect(body.data.flags).toBe(64);
		expect(body.data.content).toContain('Something went wrong');
	});
});
