import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
	cleanup();
});

// Prevent 'server-only' from throwing in unit test environments
vi.mock('server-only', () => ({}));
