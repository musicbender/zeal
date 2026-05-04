import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	output: 'standalone',
	serverExternalPackages: ['systeminformation', 'pino', 'pino-pretty'],
};

export default nextConfig;
