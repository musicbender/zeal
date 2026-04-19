'use client';

import { useEffect } from 'react';
import styles from './drawer-shell.module.css';

interface DrawerShellProps {
	children: React.ReactNode;
	onClose: () => void;
}

export function DrawerShell({ children, onClose }: DrawerShellProps) {
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose();
		}
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [onClose]);

	return (
		<div className={styles.overlay}>
			<div className={styles.panel} role="dialog">
				<div className={styles.panelEdge} />
				<div className={styles.close}>
					<button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
						[x] close
					</button>
				</div>
				<div className={styles.content}>{children}</div>
			</div>
		</div>
	);
}
