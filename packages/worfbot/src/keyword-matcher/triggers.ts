export type Trigger = {
	keywords: string[];
	quoteIndex?: number;
	triggerMessage?: string;
	gifUrl?: string;
};

export type WorfGifs = {
	angryThrowHat: string;
	creepySmile: string;
};

const worfGifs = {
	angryThrowHat:
		'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMHpjZG83bTF3aDFrMW41NWRuaW9kdnQwdXAwaTZ1ZWRmaTJsdW45eCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2VWQ20reNgmgU/giphy.gif',
	creepySmile:
		'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzRtMGxoZWlmMjc2eHU5aGI5anMxdzh1eXZxd3RjY2RmazNnbXZscSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Y7rtYowpk3I9q/giphy.gif',
};

export const triggers: Trigger[] = [
	{ keywords: ['procrastinate'], quoteIndex: 19 },
	{ keywords: ['happy monday'], quoteIndex: 0 },
	{ keywords: ['cheer up'], quoteIndex: 1 },
	{ keywords: ['tinder', 'valentines day'], quoteIndex: 2 },
	{ keywords: ['good day', 'good afternoon'], quoteIndex: 3 },
	{ keywords: ['hostages'], quoteIndex: 4 },
	{ keywords: ['impossible', "I can't do it"], quoteIndex: 5 },
	{ keywords: ['was that a joke', 'just kidding'], quoteIndex: 6 },
	{ keywords: ['swimming lessons', 'going to the pool'], quoteIndex: 7 },
	{ keywords: ['honor'], quoteIndex: 8 },
	{ keywords: ['fight you'], quoteIndex: 9 },
	{ keywords: ['surrender'], quoteIndex: 10 },
	{ keywords: ['the good old days', 'back in my day'], quoteIndex: 15 },
	{ keywords: ['pineapple on pizza'], quoteIndex: 12 },
	{ keywords: ["I'll do it later", 'not right now'], quoteIndex: 19 },
	{ keywords: ['take a nap', 'nap time'], quoteIndex: 18 },
	{ keywords: ['here goes nothing', 'yolo'], quoteIndex: 16 },
	{ keywords: ['wine'], quoteIndex: 29 },
	{ keywords: ['lost cause'], quoteIndex: 31 },
	{ keywords: ['discipline', 'training'], quoteIndex: 32 },
	{ keywords: ['sorry to hear that'], quoteIndex: 33 },
	{ keywords: ['comfort'], quoteIndex: 34 },
	{
		keywords: ['dentist'],
		triggerMessage:
			'What is a dentist? I have no fear of death, and I welcome the opportunity to test my skills against such a worthy opponent.',
	},
	{ keywords: ['violence is never the answer', 'honor is dumb'], gifUrl: worfGifs.angryThrowHat },
	{ keywords: ['smile'], gifUrl: worfGifs.creepySmile },
];
