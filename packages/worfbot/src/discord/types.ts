export interface DiscordInteraction {
	type: number;
	data?: {
		name: string;
		options?: DiscordCommandOption[];
	};
	member?: {
		user: {
			id: string;
			username: string;
		};
	};
}

export interface DiscordCommandOption {
	name: string;
	type: number;
	value: string;
}

export interface DiscordEmbed {
	title?: string;
	description?: string;
	color?: number;
	fields?: { name: string; value: string; inline?: boolean }[];
	footer?: { text: string };
}
