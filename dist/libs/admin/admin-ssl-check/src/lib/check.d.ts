/**
 * Certificate information retrieved from a TLS connection
 */
export type CertInfo = {
    validFrom: Date;
    validTo: Date;
    issuer: string;
    subjectAltNames: string[];
    subject: string;
};
/**
 * Certificate check result with status and details
 */
export type CertCheckResult = {
    hostname: string;
    port: number;
    isValid: boolean;
    daysUntilExpiry: number;
    expiresSoon: boolean;
    info: CertInfo;
    warnings: string[];
    errors: string[];
};
/**
 * Options for certificate checking
 */
export type CheckOptions = {
    port?: number;
    timeout?: number;
    servername?: string;
};
/**
 * Retrieves certificate information from a TLS connection
 * @param hostname - The hostname to check
 * @param options - Optional configuration (port, timeout, servername)
 * @returns Promise resolving to certificate information
 * @throws Error if certificate cannot be retrieved
 */
export declare function getCertInfo(hostname: string, options?: CheckOptions): Promise<CertInfo>;
/**
 * Checks a certificate and returns detailed status information
 * @param hostname - The hostname to check
 * @param options - Optional configuration
 * @returns Promise resolving to certificate check result
 */
export declare function checkCertificate(hostname: string, options?: CheckOptions): Promise<CertCheckResult>;
/**
 * Formats certificate check result for console output
 * @param result - The certificate check result
 * @returns Formatted string for display
 */
export declare function formatCertCheckResult(result: CertCheckResult): string;
