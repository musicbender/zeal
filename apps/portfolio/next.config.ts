import createWithVercelToolbar from '@vercel/toolbar/plugins/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	serverExternalPackages: ['discord.js'],
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'us-west-2.graphassets.com',
			},
		],
	},
};

const withVercelToolbar = createWithVercelToolbar();
export default withVercelToolbar(nextConfig);
