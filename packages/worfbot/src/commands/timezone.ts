import { getAllFamilyMembers } from '@repo/worfbot-data';
import type { DiscordEmbed, DiscordInteraction } from '../discord/types';
import { createEmbed } from '../theme';

function getLocalTimeInfo(timezone: string): { display: string; sortKey: number } {
	const now = new Date();

	const display = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		weekday: 'short',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	}).format(now);

	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(now);

	const day = parseInt(parts.find((p) => p.type === 'day')?.value ?? '0');
	const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0');
	const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0');

	return { display, sortKey: day * 1440 + hour * 60 + minute };
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

	const groups = new Map<string, { names: string[]; sortKey: number }>();
	for (const member of members) {
		const { display, sortKey } = getLocalTimeInfo(member.timezone);
		const group = groups.get(display) ?? { names: [], sortKey };
		group.names.push(member.display_name);
		groups.set(display, group);
	}

	const fields: DiscordEmbed['fields'] = [...groups.entries()]
		.sort(([, a], [, b]) => a.sortKey - b.sortKey)
		.map(([time, { names }]) => ({
			name: time,
			value: names.join(', '),
			inline: false,
		}));

	const embed = createEmbed('default')
		.setTitle('Time Check')
		.setDescription(
			'A warrior must know at all times whether his allies are sleeping or prepared for battle.'
		)
		.addFields(fields ?? []);

	return Response.json({
		type: 4,
		data: { embeds: [embed.toJSON()] },
	});
}
