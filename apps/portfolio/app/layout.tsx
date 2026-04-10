import { Theme } from '@radix-ui/themes';
import type { Metadata } from 'next';
import { Inconsolata } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';

const cufel = localFont({
	src: [
		{ path: '../public/fonts/CUFEL.woff2', weight: '400', style: 'normal' },
	],
	variable: '--font-cufel',
});

const inconsolata = Inconsolata({
	weight: ['400'],
  subsets: ['latin'],
})

export const metadata: Metadata = {
	title: 'Pat Jacobs',
	description: 'Software Engineer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className={inconsolata.className + ' ' + cufel.variable}>
				<Theme appearance="dark" accentColor="gray" radius="none" scaling="100%">
					{children}
				</Theme>
			</body>
		</html>
	);
}
