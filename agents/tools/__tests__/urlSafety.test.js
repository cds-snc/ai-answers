import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateUrlForSsrf, isPrivateIp, ssrfBeforeRedirect } from '../urlSafety.js';

// Mock dns/promises to control resolved IPs
vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}));
import { lookup } from 'dns/promises';

beforeEach(() => {
  lookup.mockReset();
  // Default: resolve to a safe public IP
  lookup.mockResolvedValue([{ address: '93.184.216.34' }]);
});

describe('validateUrlForSsrf', () => {
  describe('blocks non-HTTP protocols', () => {
    it('rejects file:// URLs', async () => {
      await expect(validateUrlForSsrf('file:///etc/passwd'))
        .rejects.toThrow('only http: and https: are allowed');
    });

    it('rejects ftp:// URLs', async () => {
      await expect(validateUrlForSsrf('ftp://example.com'))
        .rejects.toThrow('only http: and https: are allowed');
    });

    it('rejects gopher:// URLs', async () => {
      await expect(validateUrlForSsrf('gopher://example.com'))
        .rejects.toThrow('only http: and https: are allowed');
    });
  });

  describe('blocks private/reserved IPs', () => {
    it('rejects 127.0.0.1 (loopback)', async () => {
      await expect(validateUrlForSsrf('http://127.0.0.1/'))
        .rejects.toThrow('private/reserved IP');
    });

    it('rejects 10.x (private class A)', async () => {
      await expect(validateUrlForSsrf('http://10.0.0.1/'))
        .rejects.toThrow('private/reserved IP');
    });

    it('rejects 172.16.x (private class B)', async () => {
      await expect(validateUrlForSsrf('http://172.16.0.1/'))
        .rejects.toThrow('private/reserved IP');
    });

    it('rejects 192.168.x (private class C)', async () => {
      await expect(validateUrlForSsrf('http://192.168.1.1/'))
        .rejects.toThrow('private/reserved IP');
    });

    it('rejects 169.254.169.254 (cloud metadata)', async () => {
      await expect(validateUrlForSsrf('http://169.254.169.254/latest/meta-data/'))
        .rejects.toThrow('private/reserved IP');
    });

    it('rejects 0.0.0.0', async () => {
      await expect(validateUrlForSsrf('http://0.0.0.0/'))
        .rejects.toThrow('private/reserved IP');
    });
  });

  describe('blocks localhost hostnames', () => {
    it('rejects localhost', async () => {
      await expect(validateUrlForSsrf('http://localhost/'))
        .rejects.toThrow('Blocked request to localhost');
    });

    it('rejects localhost with port', async () => {
      await expect(validateUrlForSsrf('http://localhost:8080/'))
        .rejects.toThrow('Blocked request to localhost');
    });
  });

  describe('blocks DNS rebinding (hostname resolving to private IP)', () => {
    it('blocks hostname resolving to 127.0.0.1', async () => {
      lookup.mockResolvedValue([{ address: '127.0.0.1' }]);
      await expect(validateUrlForSsrf('http://evil.example.com/'))
        .rejects.toThrow('private/reserved IP');
    });

    it('blocks hostname resolving to metadata IP', async () => {
      lookup.mockResolvedValue([{ address: '169.254.169.254' }]);
      await expect(validateUrlForSsrf('http://evil.example.com/'))
        .rejects.toThrow('private/reserved IP');
    });

    it('blocks hostname resolving to 10.x', async () => {
      lookup.mockResolvedValue([{ address: '10.0.0.5' }]);
      await expect(validateUrlForSsrf('http://internal.example.com/'))
        .rejects.toThrow('private/reserved IP');
    });

    it('blocks if any DNS record is private (multi-record)', async () => {
      lookup.mockResolvedValue([
        { address: '93.184.216.34' },
        { address: '10.0.0.1' },
      ]);
      await expect(validateUrlForSsrf('http://mixed.example.com/'))
        .rejects.toThrow('private/reserved IP');
    });
  });

  describe('blocks IPv4-mapped IPv6 addresses', () => {
    it('rejects ::ffff:127.0.0.1 via isPrivateIp', () => {
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    });

    it('rejects ::ffff:169.254.169.254 via isPrivateIp', () => {
      expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
    });

    it('rejects ::ffff:10.0.0.1 via isPrivateIp', () => {
      expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
    });

    it('allows ::ffff:93.184.216.34 via isPrivateIp', () => {
      expect(isPrivateIp('::ffff:93.184.216.34')).toBe(false);
    });

    it('blocks hostname resolving to IPv4-mapped IPv6', async () => {
      lookup.mockResolvedValue([{ address: '::ffff:127.0.0.1' }]);
      await expect(validateUrlForSsrf('http://evil.example.com/'))
        .rejects.toThrow('private/reserved IP');
    });
  });

  describe('ssrfBeforeRedirect hook', () => {
    it('blocks redirect to private IP', () => {
      expect(() => ssrfBeforeRedirect({ href: 'http://169.254.169.254/latest/' }))
        .toThrow('Blocked redirect to private/reserved IP');
    });

    it('blocks redirect to localhost', () => {
      expect(() => ssrfBeforeRedirect({ href: 'http://localhost:8080/admin' }))
        .toThrow('Blocked redirect to localhost');
    });

    it('blocks redirect to non-HTTP protocol', () => {
      expect(() => ssrfBeforeRedirect({ href: 'file:///etc/passwd' }))
        .toThrow('Blocked redirect to non-HTTP protocol');
    });

    it('allows redirect to public URL', () => {
      expect(() => ssrfBeforeRedirect({ href: 'https://www.canada.ca/en.html' }))
        .not.toThrow();
    });
  });

  describe('allows legitimate URLs', () => {
    it('allows https://www.canada.ca', async () => {
      await expect(validateUrlForSsrf('https://www.canada.ca/en.html'))
        .resolves.toBeUndefined();
    });

    it('allows http://example.com', async () => {
      await expect(validateUrlForSsrf('http://example.com/'))
        .resolves.toBeUndefined();
    });

    it('allows public IP address', async () => {
      await expect(validateUrlForSsrf('http://93.184.216.34/'))
        .resolves.toBeUndefined();
    });
  });

  describe('handles edge cases', () => {
    it('rejects empty string', async () => {
      await expect(validateUrlForSsrf(''))
        .rejects.toThrow('non-empty string');
    });

    it('rejects non-string input', async () => {
      await expect(validateUrlForSsrf(null))
        .rejects.toThrow('non-empty string');
    });

    it('rejects invalid URL', async () => {
      await expect(validateUrlForSsrf('not-a-url'))
        .rejects.toThrow('Invalid URL');
    });
  });
});
