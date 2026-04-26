import type { FamilyMember } from '@repo/worfbot-data';
import { getAllFamilyMembers } from '@repo/worfbot-data';
import type { DiscordEmbed, DiscordInteraction } from '../discord/types';

function formatTimeForTimezone(timezone: string): string {
	return new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hour: 'numeric',
		minute: '2-digit',
		weekday: 'short',
		hour12: true,
	}).format(new Date());
}

function groupByTimezone(members: FamilyMember[]): Map<string, FamilyMember[]> {
	const groups = new Map<string, FamilyMember[]>();
	for (const member of members) {
		const group = groups.get(member.timezone) ?? [];
		group.push(member);
		groups.set(member.timezone, group);
	}
	return groups;
}

export async function handleTimezone(_interaction: DiscordInteraction): Promise<Response> {
	const members = await getAllFamilyMembers();

	if (members.length === 0) {
		return Response.json({
			type: 4,
			data: {
				content: 'No family members registered yet! Use `/add-member` to add someone.',
			},
		});
	}

	const groups = groupByTimezone(members);
	const fields: DiscordEmbed['fields'] = [];

	for (const [timezone, group] of groups) {
		const time = formatTimeForTimezone(timezone);
		const names = group.map((m) => m.display_name).join(', ');
		fields.push({
			name: `${timezone} — ${time}`,
			value: names,
			inline: false,
		});
	}

	return Response.json({
		type: 4,
		data: {
			embeds: [
				{
					title: '🌍 Family Timezones',
					description:
						'A warrior must know at all times whether his allies are sleeping or prepared for battle.',
					fields,
					color: 0x5865f2,
				},
			],
		},
	});
}
