import { STSClient, GetSessionTokenCommand } from '@aws-sdk/client-sts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { main } from './mfa-user';

// Mock AWS SDK
jest.mock('@aws-sdk/client-sts');
jest.mock('@aws-sdk/credential-providers', () => ({
  fromIni: jest.fn(() => ({
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  })),
}));

// Mock readline
jest.mock('node:readline', () => ({
  createInterface: jest.fn(() => ({
    question: jest.fn((prompt: string, callback: (answer: string) => void) => {
      callback('123456');
    }),
    close: jest.fn(),
  })),
}));

// Mock fs
jest.mock('node:fs');
jest.mock('node:os', () => ({
  homedir: jest.fn(() => '/tmp'),
}));

describe('mfa-user', () => {
  const mockSend = jest.fn();
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    (STSClient as jest.MockedClass<typeof STSClient>).mockImplementation(
      () =>
        ({
          send: mockSend,
        }) as unknown as STSClient
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getSession', () => {
    it('should get session token with valid MFA code', async () => {
      const mockCredentials = {
        Credentials: {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          SessionToken: 'test-session-token',
          Expiration: new Date('2024-12-31T23:59:59Z'),
        },
      };

      mockSend.mockResolvedValue(mockCredentials);

      // Mock fs.existsSync and readFileSync
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('[default]\naws_access_key_id=test');
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      process.env.MFA_DEVICE_ARN = 'arn:aws:iam::123456789012:mfa/test';
      process.env.SOURCE_PROFILE = 'test-profile';
      process.env.TARGET_PROFILE = 'test-profile-mfa';
      process.env.DRY_RUN = '1';
      process.env.FEATURE_NX_SCRIPTS_ENABLED = '1';

      await main();

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            SerialNumber: 'arn:aws:iam::123456789012:mfa/test',
            TokenCode: '123456',
            DurationSeconds: 43200,
          }),
        })
      );
    });

    it('should throw error for invalid MFA code format', async () => {
      const { createInterface } = require('node:readline');
      createInterface.mockReturnValue({
        question: jest.fn((prompt: string, callback: (answer: string) => void) => {
          callback('invalid');
        }),
        close: jest.fn(),
      });

      process.env.FEATURE_NX_SCRIPTS_ENABLED = '1';

      await expect(main()).rejects.toThrow('MFA code must be 6 digits');
    });

    it('should handle dry run mode', async () => {
      const mockCredentials = {
        Credentials: {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          SessionToken: 'test-session-token',
          Expiration: new Date('2024-12-31T23:59:59Z'),
        },
      };

      mockSend.mockResolvedValue(mockCredentials);
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      process.env.DRY_RUN = '1';
      process.env.FEATURE_NX_SCRIPTS_ENABLED = '1';

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await main();

      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DRY_RUN: would write temporary credentials')
      );

      consoleSpy.mockRestore();
    });

    it('should update credentials file in non-dry-run mode', async () => {
      const mockCredentials = {
        Credentials: {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          SessionToken: 'test-session-token',
          Expiration: new Date('2024-12-31T23:59:59Z'),
        },
      };

      mockSend.mockResolvedValue(mockCredentials);
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      process.env.DRY_RUN = '0';
      process.env.TARGET_PROFILE = 'test-profile-mfa';
      process.env.FEATURE_NX_SCRIPTS_ENABLED = '1';

      await main();

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[0]).toContain('.aws/credentials');
      expect(writeCall[2]).toEqual({ mode: 0o600 });
    });

    it('should warn when feature flag is not enabled', async () => {
      const mockCredentials = {
        Credentials: {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          SessionToken: 'test-session-token',
        },
      };

      mockSend.mockResolvedValue(mockCredentials);
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      process.env.FEATURE_NX_SCRIPTS_ENABLED = '0';
      process.env.DRY_RUN = '1';

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await main();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Nx scripts feature flag not enabled')
      );

      consoleSpy.mockRestore();
    });
  });
});

