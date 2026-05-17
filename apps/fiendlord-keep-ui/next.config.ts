import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
	output: 'standalone',
	outputFileTracingRoot: path.join(__dirname, '../../'),
	transpilePackages: ['@repo/logger', '@radix-ui/themes'],
	serverExternalPackages: ['systeminformation', 'pino', 'pino-pretty'],
};

export default nextConfig;
