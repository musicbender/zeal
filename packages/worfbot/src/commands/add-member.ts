import { createFamilyMember, getFamilyMemberByDiscordId } from '@repo/worfbot-data';
import type { DiscordInteraction } from '../discord/types';

function getOptionValue(interaction: DiscordInteraction, name: string): string | undefined {
	return interaction.data?.options?.find((o) => o.name === name)?.value;
}

function isValidTimezone(tz: string): boolean {
	try {
		Intl.DateTimeFormat(undefined, { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

function ephemeral(content: string): Response {
	return Response.json({
		type: 4,
		data: { content, flags: 64 },
	});
}

export async function handleAddMember(interaction: DiscordInteraction): Promise<Response> {
	const userId = getOptionValue(interaction, 'user');
	const displayName = getOptionValue(interaction, 'name');
	const timezone = getOptionValue(interaction, 'timezone');

	if (!userId || !displayName || !timezone) {
		return ephemeral('Missing required options.');
	}

	if (!isValidTimezone(timezone)) {
		return ephemeral(
			`Invalid timezone "${timezone}". Use an IANA timezone like \`America/New_York\` or \`Europe/London\`.`
		);
	}

	try {
		const existing = await getFamilyMemberByDiscordId(userId);
		if (existing) {
			return ephemeral(`<@${userId}> is already registered as "${existing.display_name}".`);
		}

		const member = await createFamilyMember({
			discord_user_id: userId,
			display_name: displayName,
			timezone,
		});

		const currentTime = new Intl.DateTimeFormat('en-US', {
			timeZone: member.timezone,
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
		}).format(new Date());

		return Response.json({
			type: 4,
			data: {
				content: `Added **${member.display_name}** (<@${member.discord_user_id}>) with timezone \`${member.timezone}\`. Their current time is **${currentTime}**.`,
			},
		});
	} catch {
		return ephemeral('Something went wrong. Please try again later.');
	}
}
