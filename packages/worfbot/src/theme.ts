type EmbedField = { name: string; value: string; inline?: boolean };

type EmbedFooter = { text: string; icon_url?: string };

type EmbedJSON = {
	title?: string;
	description?: string;
	color?: number;
	timestamp?: string;
	footer?: EmbedFooter;
	fields?: EmbedField[];
};

class EmbedBuilder {
	private data: EmbedJSON = {};

	setTitle(title: string): this {
		this.data.title = title;
		return this;
	}

	setDescription(description: string): this {
		this.data.description = description;
		return this;
	}

	setColor(color: number): this {
		this.data.color = color;
		return this;
	}

	setFooter(footer: EmbedFooter): this {
		this.data.footer = footer;
		return this;
	}

	setTimestamp(): this {
		this.data.timestamp = new Date().toISOString();
		return this;
	}

	addFields(fields: EmbedField[]): this {
		this.data.fields = [...(this.data.fields ?? []), ...fields];
		return this;
	}

	toJSON(): EmbedJSON {
		return { ...this.data };
	}
}

// Discord button style values from the API spec.
export const ButtonStyle = {
	Primary: 1,
	Secondary: 2,
	Success: 3,
	Danger: 4,
	Link: 5,
} as const;

export type ButtonStyle = (typeof ButtonStyle)[keyof typeof ButtonStyle];

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
