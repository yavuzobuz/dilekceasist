import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.stubEnv('LEGAL_AGENT_PIPELINE', '0');
vi.stubEnv('LEGAL_AGENT_JUDGE', '0');
