export default {
  displayName: 'cdk-k3frame-instance',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/apps/cdk-k3frame/instance',
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
    '^@mm/infra-instance-constructs$': '<rootDir>/../../../libs/infra/instance-constructs/src/index.ts',
    '^@mm/infra-shared-constructs$': '<rootDir>/../../../libs/infra/shared-constructs/src/index.ts',
    '^@mm/infra-naming$': '<rootDir>/../../../libs/infra/naming/src/index.ts',
    '^@mm/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
  // Disable snapshot functionality to avoid babel dependency
  snapshotSerializers: [],
};

