import { handleAddMember, handleTimezone } from '@repo/navi';
import { verifyKey } from 'discord-interactions';

type Interaction = { type: number; data?: { name: string } };

type Handler = (interaction: Interaction) => Promise<Response>;

const commandHandlers: Record<string, Handler> = {
	timezone: handleTimezone as Handler,
	'add-member': handleAddMember as Handler,
};

export async function POST(req: Request): Promise<Response> {
	const body = await req.text();
	const signature = req.headers.get('x-signature-ed25519') ?? '';
	const timestamp = req.headers.get('x-signature-timestamp') ?? '';
	const publicKey = process.env.DISCORD_PUBLIC_KEY;
	if (!publicKey) {
		console.error('DISCORD_PUBLIC_KEY environment variable is not set');
		return new Response('Server misconfiguration', { status: 500 });
	}

	const isValid = await verifyKey(body, signature, timestamp, publicKey);
	if (!isValid) {
		return new Response('Invalid signature', { status: 401 });
	}

	const interaction = JSON.parse(body) as Interaction;

	// PING verification handshake
	if (interaction.type === 1) {
		return Response.json({ type: 1 });
	}

	// APPLICATION_COMMAND
	if (interaction.type === 2) {
		const commandName = interaction.data?.name;
		const handler = commandName ? commandHandlers[commandName] : undefined;
		if (handler) {
			return handler(interaction);
		}
		return new Response('Unknown command', { status: 400 });
	}

	return new Response('Unhandled interaction type', { status: 400 });
}
