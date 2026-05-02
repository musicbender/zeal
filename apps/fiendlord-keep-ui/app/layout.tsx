import { Sidebar } from '@/components/sidebar/sidebar';
import { Theme } from '@radix-ui/themes';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
	title: 'Fiendlord Keep',
	description: 'Magus system dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<Theme appearance="dark" accentColor="teal" radius="medium" scaling="100%">
					<div className="app-shell">
						<Sidebar />
						<main className="main-content">{children}</main>
					</div>
				</Theme>
			</body>
		</html>
	);
}
