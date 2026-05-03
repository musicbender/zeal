import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	serverExternalPackages: ['systeminformation', 'pino', 'pino-pretty'],
};

export default nextConfig;
