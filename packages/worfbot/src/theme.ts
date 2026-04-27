import { ButtonStyle, EmbedBuilder } from 'discord.js';

/** Raw hex color palette for the Worfbot visual identity. */
export const colors = {
	obsidianBlack: 0x151210,
	warriorCharcoal: 0x2e2924,
	bloodCrimson: 0x8b1a1a,
	ironSteel: 0x4a4a52,
	battleBronze: 0x6b4c2a,
	klingonGold: 0xc49a2e,
} as const;

export const theme = {
	embed: {
		/** Default embed color — klingon gold as the primary Worfbot identity color. */
		default: colors.klingonGold,
		/** Announcement embed color — klingon gold for high-visibility broadcasts. */
		announcement: colors.klingonGold,
		/** Alert embed color — blood crimson for warnings and errors. */
		alert: colors.bloodCrimson,
		/** Success embed color — battle bronze for confirmations and victories. */
		success: colors.battleBronze,
		/** Neutral embed color — warrior charcoal for low-key informational messages. */
		neutral: colors.warriorCharcoal,
	},
	footer: {
		/** Footer text displayed on all themed embeds. */
		text: '⚔️ Worfbot • House of Martok',
		/** Bot avatar URL — undefined until a bot avatar is configured. */
		iconUrl: undefined as string | undefined,
	},
	button: {
		// Discord does not support custom button colors; ButtonStyle.Secondary (gray) is the
		// closest match to ironSteel and is used as the primary action style.
		/** Primary action button — gray (Secondary) as the nearest approximation to iron steel. */
		primary: ButtonStyle.Secondary,
		/** Destructive action button — Discord's red danger style. */
		danger: ButtonStyle.Danger,
		/** Confirmation button — Discord's green success style. */
		confirm: ButtonStyle.Success,
	},
} as const;

/**
 * Creates a pre-configured EmbedBuilder for the given semantic embed type.
 * Applies the matching theme color, standard footer, and a timestamp.
 */
export function createEmbed(type: keyof typeof theme.embed): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(theme.embed[type])
		.setFooter({ text: theme.footer.text })
		.setTimestamp();
}
