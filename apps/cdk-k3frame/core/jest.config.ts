export default {
  displayName: 'cdk-k3frame-core',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/apps/cdk-k3frame/core',
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
    '^@mm/infra-shared-constructs$': '<rootDir>/../../../libs/infra/shared-constructs/src/index.ts',
    '^@mm/infra-core-params$': '<rootDir>/../../../libs/infra/core-params/src/index.ts',
    '^@mm/infra-naming$': '<rootDir>/../../../libs/infra/naming/src/index.ts',
    '^@mm/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
  setupFiles: ['<rootDir>/src/test-setup.ts'],
  // Disable snapshot functionality to avoid babel dependency
  snapshotSerializers: [],
};
