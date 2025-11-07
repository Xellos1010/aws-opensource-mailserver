/**
 * Options for bootstrapping an instance
 */
export interface BootstrapOptions {
    /** Domain name (e.g., "emcnotary.com") - used to derive stack name if stackName not provided */
    domain?: string;
    /** Explicit stack name (overrides domain-derived) */
    stackName?: string;
    /** AWS region (default: "us-east-1") */
    region?: string;
    /** AWS profile for credentials (e.g., "hepe-admin-mfa") */
    profile?: string;
    /** Dry run mode - show what would be done without executing */
    dryRun?: boolean;
    /** Feature flag environment variable name (default: "FEATURE_INSTANCE_BOOTSTRAP_ENABLED") */
    featureFlagEnv?: string;
    /** Restore prefix for backup restoration */
    restorePrefix?: string;
    /** Whether to reboot after setup (default: false, as nightly reboot is handled by EventBridge) */
    rebootAfterSetup?: boolean;
}
/**
 * Main bootstrap function
 */
export declare function bootstrapInstance(options: BootstrapOptions): Promise<void>;
