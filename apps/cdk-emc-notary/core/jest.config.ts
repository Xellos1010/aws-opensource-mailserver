export default {
  displayName: 'cdk-emcnotary-core',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/apps/cdk-emc-notary/core',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/**/__tests__/**',
    '!src/**/__it__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testMatch: [
    '**/__tests__/**/*.spec.ts',
    '**/__it__/**/*.integration.spec.ts',
    '**/*.spec.ts',
    '**/tests/**/*.e2e.test.ts',
  ],
  moduleNameMapper: {
    '^@mm/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
  // Disable snapshot functionality to avoid babel dependency
  snapshotSerializers: [],
};

