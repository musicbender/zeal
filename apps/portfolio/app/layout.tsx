import { Theme } from '@radix-ui/themes';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const spaceMono = localFont({
	src: [
		{ path: '../public/fonts/SpaceMono-Regular.woff2', weight: '400', style: 'normal' },
		{ path: '../public/fonts/SpaceMono-Bold.woff2', weight: '700', style: 'normal' },
	],
	variable: '--font-space-mono',
});

export const metadata: Metadata = {
	title: 'Pat Jacobs',
	description: 'Software Engineer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className={spaceMono.variable}>
				<Theme appearance="dark" accentColor="gray" radius="none" scaling="100%">
					{children}
				</Theme>
			</body>
		</html>
	);
}
