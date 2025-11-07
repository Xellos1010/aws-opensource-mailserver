/**
 * Domain-specific configuration for mail server instances
 */
export interface DomainConfig {
  /** Domain name (e.g., "emcnotary.com") */
  domainName: string;
  /** Instance DNS name (e.g., "box") */
  instanceDns: string;
  /** SSM parameter prefix for core parameters (e.g., "/emcnotary/core") */
  coreParamPrefix: string;
  /** Stack name for this domain */
  stackName: string;
}

/**
 * Instance configuration options
 */
export interface InstanceConfig {
  /** EC2 instance type (default: "t2.micro") */
  instanceType?: string;
  /** Instance DNS name (default: "box") */
  instanceDns?: string;
  /** Whether to enable SES relay (default: true) */
  sesRelay?: boolean;
  /** Swap size in GiB (default: 2) */
  swapSizeGiB?: number;
  /** Mail-in-a-Box version (default: "v64.0") */
  mailInABoxVersion?: string;
  /** Mail-in-a-Box clone URL */
  mailInABoxCloneUrl?: string;
  /** Nightly reboot schedule (cron expression, default: "0 8 * * ? *" = 08:00 UTC) */
  nightlyRebootSchedule?: string;
  /** Nightly reboot timezone description (default: "03:00 ET (08:00 UTC)") */
  nightlyRebootDescription?: string;
}
