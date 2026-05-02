import type { ServiceConfig } from '@repo/magus-data';

export const SERVICE_REGISTRY: ServiceConfig[] = [
	{
		name: 'gaspar',
		displayName: 'Gaspar',
		port: 3000,
		systemdUnit: 'gaspar',
		color: 'teal',
	},
	{
		name: 'worfbot-gateway',
		displayName: 'Worfbot Gateway',
		port: 3001,
		systemdUnit: 'worfbot-gateway',
		color: 'purple',
	},
	{
		name: 'homebridge',
		displayName: 'Homebridge',
		port: 8581,
		systemdUnit: 'homebridge',
		color: 'orange',
	},
	{
		name: 'github-runner',
		displayName: 'GitHub Runner',
		systemdUnit: 'actions.runner',
		color: 'gray',
	},
];

export function getServiceByName(name: string): ServiceConfig | undefined {
	return SERVICE_REGISTRY.find((s) => s.name === name);
}
