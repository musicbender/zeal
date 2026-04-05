import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Prevent 'server-only' from throwing in unit test environments
vi.mock('server-only', () => ({}));
