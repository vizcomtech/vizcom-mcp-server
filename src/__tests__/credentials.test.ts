import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const testHome = '/private/tmp/claude-501/vizcom-test-home';

vi.mock('node:os', () => ({
  default: { homedir: () => '/private/tmp/claude-501/vizcom-test-home' },
  homedir: () => '/private/tmp/claude-501/vizcom-test-home',
}));

import {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  type Credentials,
} from '../auth/credentials.js';

describe('credentials', () => {
  const credDir = path.join(testHome, '.vizcom');
  const credFile = path.join(credDir, 'credentials.json');

  beforeEach(() => {
    fs.mkdirSync(credDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testHome, { recursive: true, force: true });
  });

  it('returns null when no credentials file exists', () => {
    fs.rmSync(credFile, { force: true });
    expect(loadCredentials()).toBeNull();
  });

  it('saves and loads credentials', () => {
    const creds: Credentials = {
      apiUrl: 'https://app.vizcom.ai/api/v1',
      authToken: 'test-jwt',
      organizationId: 'org-123',
      userId: 'user-123',
      email: 'test@example.com',
    };
    saveCredentials(creds);

    const loaded = loadCredentials();
    expect(loaded).toEqual(creds);
  });

  it('clears credentials', () => {
    saveCredentials({
      apiUrl: 'https://app.vizcom.ai/api/v1',
      authToken: 'test-jwt',
      organizationId: 'org-123',
      userId: 'user-123',
      email: 'test@example.com',
    });
    clearCredentials();
    expect(loadCredentials()).toBeNull();
  });
});
