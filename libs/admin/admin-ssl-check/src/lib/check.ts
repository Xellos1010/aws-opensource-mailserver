import * as tls from 'node:tls';

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
export async function getCertInfo(
  hostname: string,
  options: CheckOptions = {}
): Promise<CertInfo> {
  const port = options.port ?? 443;
  const timeout = options.timeout ?? 10000;
  const servername = options.servername ?? hostname;

  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: hostname, port, servername },
      () => {
        const cert = socket.getPeerCertificate(true);
        if (!cert || Object.keys(cert).length === 0) {
          socket.destroy();
          reject(new Error('No certificate returned'));
          return;
        }

        const validFrom = new Date(cert.valid_from as string);
        const validTo = new Date(cert.valid_to as string);
        const issuer =
          (cert.issuer as { CN?: string })?.CN ||
          JSON.stringify(cert.issuer);
        const subject =
          (cert.subject as { CN?: string })?.CN ||
          JSON.stringify(cert.subject);

        // Parse subjectAltName
        const sanRaw = (cert.subjectaltname as string) || '';
        const subjectAltNames = sanRaw
          .split(', ')
          .map((s) => s.replace(/^DNS:/, ''))
          .filter(Boolean);

        socket.destroy();

        resolve({
          validFrom,
          validTo,
          issuer,
          subject,
          subjectAltNames,
        });
      }
    );

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.setTimeout(timeout, () => {
      socket.destroy();
      reject(new Error(`Connection timeout after ${timeout}ms`));
    });
  });
}

/**
 * Checks a certificate and returns detailed status information
 * @param hostname - The hostname to check
 * @param options - Optional configuration
 * @returns Promise resolving to certificate check result
 */
export async function checkCertificate(
  hostname: string,
  options: CheckOptions = {}
): Promise<CertCheckResult> {
  const port = options.port ?? 443;
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    const info = await getCertInfo(hostname, options);
    const now = new Date();
    const daysLeft = Math.floor(
      (info.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if certificate is expired
    if (info.validTo < now) {
      errors.push(`Certificate expired on ${info.validTo.toISOString()}`);
    }

    // Check if certificate expires soon (less than 14 days)
    if (daysLeft < 14 && daysLeft >= 0) {
      warnings.push(
        `Certificate expires in ${daysLeft} days — consider renewal`
      );
    }

    // Check if hostname is in SAN list
    const hostnameLower = hostname.toLowerCase();
    const sanLower = info.subjectAltNames.map((s) => s.toLowerCase());
    if (!sanLower.includes(hostnameLower)) {
      warnings.push(
        `Hostname ${hostname} not in SAN list: ${info.subjectAltNames.join(', ')}`
      );
    }

    // Check if certificate is valid for current time
    if (info.validFrom > now) {
      warnings.push(
        `Certificate not yet valid (valid from ${info.validFrom.toISOString()})`
      );
    }

    return {
      hostname,
      port,
      isValid: errors.length === 0 && info.validTo >= now,
      daysUntilExpiry: daysLeft,
      expiresSoon: daysLeft < 14 && daysLeft >= 0,
      info,
      warnings,
      errors,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    errors.push(`Failed to retrieve certificate: ${errorMessage}`);

    return {
      hostname,
      port,
      isValid: false,
      daysUntilExpiry: -1,
      expiresSoon: false,
      info: {
        validFrom: new Date(),
        validTo: new Date(),
        issuer: 'unknown',
        subject: 'unknown',
        subjectAltNames: [],
      },
      warnings,
      errors,
    };
  }
}

/**
 * Formats certificate check result for console output
 * @param result - The certificate check result
 * @returns Formatted string for display
 */
export function formatCertCheckResult(result: CertCheckResult): string {
  const lines: string[] = [];
  lines.push(`\nCertificate Status for ${result.hostname}:${result.port}`);
  lines.push('─'.repeat(50));

  if (result.errors.length > 0) {
    lines.push('❌ ERRORS:');
    result.errors.forEach((err) => lines.push(`   ${err}`));
  }

  if (result.warnings.length > 0) {
    lines.push('⚠️  WARNINGS:');
    result.warnings.forEach((warn) => lines.push(`   ${warn}`));
  }

  if (result.isValid && result.errors.length === 0) {
    lines.push('✔ Certificate is valid');
  }

  lines.push(`\nIssuer: ${result.info.issuer}`);
  lines.push(`Subject: ${result.info.subject}`);
  lines.push(`Valid from: ${result.info.validFrom.toISOString()}`);
  lines.push(`Valid to:   ${result.info.validTo.toISOString()}`);

  if (result.daysUntilExpiry >= 0) {
    lines.push(`Days until expiry: ${result.daysUntilExpiry}`);
  } else if (result.daysUntilExpiry < 0 && result.info.validTo < new Date()) {
    lines.push(`Certificate expired ${Math.abs(result.daysUntilExpiry)} days ago`);
  }

  if (result.info.subjectAltNames.length > 0) {
    lines.push(`Subject Alternative Names: ${result.info.subjectAltNames.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * CLI entry point for certificate checking
 */
if (require.main === module) {
  const hostname = process.argv[2];
  const portArg = process.argv[3];

  if (!hostname) {
    console.error('Usage: ssl-check <hostname> [port]');
    process.exit(1);
  }

  const options: CheckOptions = {};
  if (portArg) {
    const port = parseInt(portArg, 10);
    if (isNaN(port)) {
      console.error(`Invalid port: ${portArg}`);
      process.exit(1);
    }
    options.port = port;
  }

  checkCertificate(hostname, options)
    .then((result) => {
      console.log(formatCertCheckResult(result));
      process.exit(result.isValid ? 0 : 1);
    })
    .catch((err) => {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exit(2);
    });
}

