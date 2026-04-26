export const commands = [
	{
		name: 'timezone',
		description: 'Show current local times for all family members',
	},
	{
		name: 'add-member',
		description: 'Add a family member with their timezone',
		options: [
			{
				name: 'user',
				type: 6, // USER
				description: 'Discord user to add',
				required: true,
			},
			{
				name: 'name',
				type: 3, // STRING
				description: 'Display name for the family member',
				required: true,
			},
			{
				name: 'timezone',
				type: 3, // STRING
				description: 'IANA timezone (e.g. America/New_York)',
				required: true,
			},
		],
	},
];
