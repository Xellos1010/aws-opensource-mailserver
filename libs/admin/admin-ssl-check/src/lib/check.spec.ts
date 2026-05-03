import { getCertInfo, checkCertificate, formatCertCheckResult } from './check';
import * as tls from 'node:tls';

// Mock tls module
jest.mock('node:tls', () => ({
  connect: jest.fn(),
}));

describe('SSL Certificate Check', () => {
  const mockSocket = {
    getPeerCertificate: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
    setTimeout: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (tls.connect as jest.Mock).mockImplementation((options, callback) => {
      // Simulate successful connection
      setTimeout(() => {
        if (callback) callback();
      }, 0);
      return mockSocket;
    });
  });

  describe('getCertInfo', () => {
    it('should retrieve certificate information successfully', async () => {
      const mockCert = {
        valid_from: '2024-01-01T00:00:00.000Z',
        valid_to: '2025-12-31T23:59:59.999Z',
        issuer: { CN: 'Let\'s Encrypt' },
        subject: { CN: 'example.com' },
        subjectaltname: 'DNS:example.com, DNS:www.example.com',
      };

      mockSocket.getPeerCertificate.mockReturnValue(mockCert);

      const result = await getCertInfo('example.com');

      expect(result.issuer).toBe("Let's Encrypt");
      expect(result.subject).toBe('example.com');
      expect(result.subjectAltNames).toEqual([
        'example.com',
        'www.example.com',
      ]);
      expect(result.validFrom).toBeInstanceOf(Date);
      expect(result.validTo).toBeInstanceOf(Date);
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should handle missing certificate', async () => {
      mockSocket.getPeerCertificate.mockReturnValue({});

      await expect(getCertInfo('example.com')).rejects.toThrow(
        'No certificate returned'
      );
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      (tls.connect as jest.Mock).mockImplementation((options, callback) => {
        const socket = {
          ...mockSocket,
          on: jest.fn((event, handler) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('Connection failed')), 0);
            }
          }),
        };
        return socket;
      });

      await expect(getCertInfo('example.com')).rejects.toThrow(
        'Connection failed'
      );
    });

    it('should handle timeout', async () => {
      (tls.connect as jest.Mock).mockImplementation((options, callback) => {
        const socket = {
          ...mockSocket,
          setTimeout: jest.fn((timeout, handler) => {
            setTimeout(() => handler(), timeout);
          }),
        };
        return socket;
      });

      await expect(
        getCertInfo('example.com', { timeout: 1 })
      ).rejects.toThrow('Connection timeout');
    });

    it('should use custom port', async () => {
      const mockCert = {
        valid_from: '2024-01-01T00:00:00.000Z',
        valid_to: '2025-12-31T23:59:59.999Z',
        issuer: { CN: 'Test CA' },
        subject: { CN: 'example.com' },
        subjectaltname: 'DNS:example.com',
      };

      mockSocket.getPeerCertificate.mockReturnValue(mockCert);

      await getCertInfo('example.com', { port: 8443 });

      expect(tls.connect).toHaveBeenCalledWith(
        expect.objectContaining({ port: 8443 }),
        expect.any(Function)
      );
    });
  });

  describe('checkCertificate', () => {
    it('should return valid result for good certificate', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const mockCert = {
        valid_from: new Date(Date.now() - 86400000).toISOString(),
        valid_to: futureDate.toISOString(),
        issuer: { CN: 'Let\'s Encrypt' },
        subject: { CN: 'example.com' },
        subjectaltname: 'DNS:example.com',
      };

      mockSocket.getPeerCertificate.mockReturnValue(mockCert);

      const result = await checkCertificate('example.com');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.daysUntilExpiry).toBeGreaterThan(14);
      expect(result.expiresSoon).toBe(false);
    });

    it('should warn for certificate expiring soon', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 7 days

      const mockCert = {
        valid_from: new Date(Date.now() - 86400000).toISOString(),
        valid_to: futureDate.toISOString(),
        issuer: { CN: 'Let\'s Encrypt' },
        subject: { CN: 'example.com' },
        subjectaltname: 'DNS:example.com',
      };

      mockSocket.getPeerCertificate.mockReturnValue(mockCert);

      const result = await checkCertificate('example.com');

      expect(result.expiresSoon).toBe(true);
      expect(result.warnings.some((w) => w.includes('expires in'))).toBe(true);
    });

    it('should error for expired certificate', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const mockCert = {
        valid_from: new Date(Date.now() - 86400000 * 100).toISOString(),
        valid_to: pastDate.toISOString(),
        issuer: { CN: 'Let\'s Encrypt' },
        subject: { CN: 'example.com' },
        subjectaltname: 'DNS:example.com',
      };

      mockSocket.getPeerCertificate.mockReturnValue(mockCert);

      const result = await checkCertificate('example.com');

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('expired'))).toBe(true);
    });

    it('should warn when hostname not in SAN', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const mockCert = {
        valid_from: new Date(Date.now() - 86400000).toISOString(),
        valid_to: futureDate.toISOString(),
        issuer: { CN: 'Let\'s Encrypt' },
        subject: { CN: 'example.com' },
        subjectaltname: 'DNS:www.example.com',
      };

      mockSocket.getPeerCertificate.mockReturnValue(mockCert);

      const result = await checkCertificate('example.com');

      expect(result.warnings.some((w) => w.includes('not in SAN list'))).toBe(true);
    });

    it('should handle connection failures gracefully', async () => {
      (tls.connect as jest.Mock).mockImplementation((options, callback) => {
        const socket = {
          ...mockSocket,
          on: jest.fn((event, handler) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('ECONNREFUSED')), 0);
            }
          }),
        };
        return socket;
      });

      const result = await checkCertificate('nonexistent.example.com');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Failed to retrieve certificate');
    });
  });

  describe('formatCertCheckResult', () => {
    it('should format valid certificate result', () => {
      const result = {
        hostname: 'example.com',
        port: 443,
        isValid: true,
        daysUntilExpiry: 30,
        expiresSoon: false,
        info: {
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2025-12-31'),
          issuer: "Let's Encrypt",
          subject: 'example.com',
          subjectAltNames: ['example.com'],
        },
        warnings: [],
        errors: [],
      };

      const formatted = formatCertCheckResult(result);

      expect(formatted).toContain('example.com');
      expect(formatted).toContain("Let's Encrypt");
      expect(formatted).toContain('✔ Certificate is valid');
      expect(formatted).not.toContain('ERRORS');
      expect(formatted).not.toContain('WARNINGS');
    });

    it('should format result with errors', () => {
      const result = {
        hostname: 'example.com',
        port: 443,
        isValid: false,
        daysUntilExpiry: -10,
        expiresSoon: false,
        info: {
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2024-01-01'),
          issuer: 'Test CA',
          subject: 'example.com',
          subjectAltNames: ['example.com'],
        },
        warnings: [],
        errors: ['Certificate expired'],
      };

      const formatted = formatCertCheckResult(result);

      expect(formatted).toContain('❌ ERRORS');
      expect(formatted).toContain('Certificate expired');
    });

    it('should format result with warnings', () => {
      const result = {
        hostname: 'example.com',
        port: 443,
        isValid: true,
        daysUntilExpiry: 7,
        expiresSoon: true,
        info: {
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2025-12-31'),
          issuer: "Let's Encrypt",
          subject: 'example.com',
          subjectAltNames: ['www.example.com'],
        },
        warnings: ['Certificate expires in 7 days'],
        errors: [],
      };

      const formatted = formatCertCheckResult(result);

      expect(formatted).toContain('⚠️  WARNINGS');
      expect(formatted).toContain('Certificate expires in 7 days');
    });
  });
});

