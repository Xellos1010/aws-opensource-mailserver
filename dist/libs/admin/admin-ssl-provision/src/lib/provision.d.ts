/**
 * SSL Certificate Provisioning Library
 *
 * This library provides functionality for provisioning SSL certificates
 * using ACME (Let's Encrypt) protocol. This is scaffolded for future
 * implementation when the EMC-Notary mail server is brought up.
 *
 * Planned features:
 * - Detect domains without valid certificates
 * - Use ACME (Let's Encrypt) to provision certificates automatically
 * - Deploy certificates to server (place in path, update configuration)
 * - Restart services after certificate deployment
 * - Record status in system
 */
/**
 * Options for certificate provisioning
 */
export type ProvisionOptions = {
    /**
     * Domains to provision certificates for
     */
    domains: string[];
    /**
     * Email address for ACME registration
     */
    email?: string;
    /**
     * ACME server URL (defaults to Let's Encrypt production)
     */
    acmeServer?: string;
    /**
     * Challenge type (http-01 or dns-01)
     */
    challengeType?: 'http-01' | 'dns-01';
    /**
     * Path to store certificates
     */
    certPath?: string;
    /**
     * Whether to restart services after provisioning
     */
    restartServices?: boolean;
};
/**
 * Provision result
 */
export type ProvisionResult = {
    success: boolean;
    domains: string[];
    certificates: Array<{
        domain: string;
        status: 'issued' | 'failed' | 'skipped';
        expiresAt?: Date;
        error?: string;
    }>;
};
/**
 * Provisions SSL certificates for the given domains using ACME
 *
 * @param options - Provisioning options
 * @returns Promise resolving to provision result
 *
 * @example
 * ```typescript
 * const result = await provisionCertificate({
 *   domains: ['example.com', 'www.example.com'],
 *   email: 'admin@example.com',
 *   challengeType: 'dns-01'
 * });
 * ```
 */
export declare function provisionCertificate(options: ProvisionOptions): Promise<ProvisionResult>;
/**
 * Checks which domains need certificate provisioning
 *
 * @param domains - Domains to check
 * @returns Promise resolving to list of domains that need certificates
 */
export declare function checkDomainsNeedingCertificates(domains: string[]): Promise<string[]>;
/**
 * Deploys a certificate to the server
 *
 * @param domain - Domain name
 * @param certPath - Path to certificate files
 * @param targetPath - Target path on server
 * @returns Promise resolving when deployment is complete
 */
export declare function deployCertificate(domain: string, certPath: string, targetPath: string): Promise<void>;
