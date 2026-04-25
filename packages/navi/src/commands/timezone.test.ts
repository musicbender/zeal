import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/navi-data', () => ({
	getAllFamilyMembers: vi.fn(),
}));

import { getAllFamilyMembers } from '@repo/navi-data';
import type { DiscordInteraction } from '../discord/types';
import { handleTimezone } from './timezone';

const mockInteraction: DiscordInteraction = {
	type: 2,
	data: { name: 'timezone' },
};

afterEach(() => {
	vi.clearAllMocks();
});

describe('handleTimezone', () => {
	it('returns a message when no family members exist', async () => {
		vi.mocked(getAllFamilyMembers).mockResolvedValueOnce([]);

		const response = await handleTimezone(mockInteraction);
		const body = await response.json();

		expect(body.type).toBe(4); // CHANNEL_MESSAGE_WITH_SOURCE
		expect(body.data.content).toContain('No family members');
	});

	it('groups family members by timezone', async () => {
		vi.mocked(getAllFamilyMembers).mockResolvedValueOnce([
			{
				id: 1,
				discord_user_id: '111',
				display_name: 'Pat',
				timezone: 'America/New_York',
				created_at: new Date(),
				updated_at: new Date(),
			},
			{
				id: 2,
				discord_user_id: '222',
				display_name: 'Jordan',
				timezone: 'America/New_York',
				created_at: new Date(),
				updated_at: new Date(),
			},
			{
				id: 3,
				discord_user_id: '333',
				display_name: 'Alex',
				timezone: 'Europe/London',
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const response = await handleTimezone(mockInteraction);
		const body = await response.json();

		expect(body.type).toBe(4);
		expect(body.data.embeds).toHaveLength(1);
		const embed = body.data.embeds[0];
		expect(embed.fields).toHaveLength(2); // two timezone groups
		// America/New_York group should contain both Pat and Jordan
		const nyField = embed.fields.find((f: { value: string }) => f.value.includes('Pat'));
		expect(nyField.value).toContain('Jordan');
		// Europe/London group should contain Alex
		const londonField = embed.fields.find((f: { value: string }) => f.value.includes('Alex'));
		expect(londonField).toBeDefined();
	});
});
