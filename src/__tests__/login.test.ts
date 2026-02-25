import { describe, it, expect, vi } from 'vitest';
import { loginWithCredentials } from '../auth/login.js';

describe('loginWithCredentials', () => {
  it('returns credentials on successful login', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      organizations: {
        nodes: [{ id: 'org-123', name: 'Test Org' }],
      },
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        data: {
          login: {
            authToken: 'jwt-token-123',
            user: mockUser,
          },
        },
      }),
    } as Response);

    const result = await loginWithCredentials(
      'https://app.vizcom.ai/api/v1',
      'test@example.com',
      'password123'
    );

    expect(result.authToken).toBe('jwt-token-123');
    expect(result.userId).toBe('user-123');
    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0].name).toBe('Test Org');
  });

  it('throws on invalid credentials', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        errors: [{ message: 'Invalid email or password' }],
      }),
    } as Response);

    await expect(
      loginWithCredentials(
        'https://app.vizcom.ai/api/v1',
        'bad@example.com',
        'wrong'
      )
    ).rejects.toThrow('Invalid email or password');
  });
});
