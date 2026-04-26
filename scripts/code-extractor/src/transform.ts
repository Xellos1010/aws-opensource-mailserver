import { extname, basename } from 'node:path';
/**
 * Strip JS/TS comments while trying to preserve strings/template literals.
 * This is a heuristic tokenizer (not a full parser) but is sufficient for typical codebases.
 */
export function stripJsComments(input: string): string {
  type Mode =
    | { kind: 'code'; braceDepth?: undefined }
    | { kind: 'singleQuote'; escape: boolean }
    | { kind: 'doubleQuote'; escape: boolean }
    | { kind: 'template'; escape: boolean }
    | { kind: 'blockComment' }
    | { kind: 'lineComment' }
    | { kind: 'templateExpr'; escape: boolean; braceDepth: number };

  let mode: Mode = { kind: 'code' };
  let out = '';

  const s = input;
  let i = 0;

  function startsWithAt(needle: string, at: number): boolean {
    return s.slice(at, at + needle.length) === needle;
  }

  while (i < s.length) {
    const ch = s[i];

    if (mode.kind === 'blockComment') {
      if (startsWithAt('*/', i)) {
        mode = { kind: 'code' };
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (mode.kind === 'lineComment') {
      if (ch === '\n') {
        mode = { kind: 'code' };
        out += ch;
      }
      i += 1;
      continue;
    }

    if (mode.kind === 'singleQuote') {
      out += ch;
      if (mode.escape) {
        mode = { ...mode, escape: false };
      } else if (ch === '\\') {
        mode = { ...mode, escape: true };
      } else if (ch === "'") {
        mode = { kind: 'code' };
      }
      i += 1;
      continue;
    }

    if (mode.kind === 'doubleQuote') {
      out += ch;
      if (mode.escape) {
        mode = { ...mode, escape: false };
      } else if (ch === '\\') {
        mode = { ...mode, escape: true };
      } else if (ch === '"') {
        mode = { kind: 'code' };
      }
      i += 1;
      continue;
    }

    if (mode.kind === 'template') {
      out += ch;
      if (mode.escape) {
        mode = { ...mode, escape: false };
      } else if (ch === '\\') {
        mode = { ...mode, escape: true };
      } else if (ch === '`') {
        mode = { kind: 'code' };
      } else if (ch === '$' && s[i + 1] === '{') {
        // Enter template expression: ${ ... }
        out += '{';
        mode = { kind: 'templateExpr', escape: false, braceDepth: 1 };
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (mode.kind === 'templateExpr') {
      out += ch;
      if (mode.escape) {
        mode = { ...mode, escape: false };
      } else if (ch === '\\') {
        mode = { ...mode, escape: true };
      } else {
        if (ch === "'") {
          mode = { kind: 'singleQuote', escape: false };
          i += 1;
          continue;
        }
        if (ch === '"') {
          mode = { kind: 'doubleQuote', escape: false };
          i += 1;
          continue;
        }
        if (ch === '`') {
          mode = { kind: 'template', escape: false };
          i += 1;
          continue;
        }

        // Comments inside template expressions are real code, so strip them.
        if (ch === '/' && s[i + 1] === '*') {
          mode = { kind: 'blockComment' };
          i += 2;
          out = out.slice(0, -1);
          continue;
        }
        if (ch === '/' && s[i + 1] === '/') {
          mode = { kind: 'lineComment' };
          i += 2;
          out = out.slice(0, -1);
          continue;
        }

        if (ch === '{') {
          mode = { ...mode, braceDepth: mode.braceDepth + 1 };
        } else if (ch === '}') {
          const nextDepth = mode.braceDepth - 1;
          if (nextDepth <= 0) {
            mode = { kind: 'template', escape: false };
          } else {
            mode = { ...mode, braceDepth: nextDepth };
          }
        }
      }

      i += 1;
      continue;
    }

    // mode.kind === 'code'
    if (ch === "'") {
      out += ch;
      mode = { kind: 'singleQuote', escape: false };
      i += 1;
      continue;
    }

    if (ch === '"') {
      out += ch;
      mode = { kind: 'doubleQuote', escape: false };
      i += 1;
      continue;
    }

    if (ch === '`') {
      out += ch;
      mode = { kind: 'template', escape: false };
      i += 1;
      continue;
    }

    if (ch === '/' && s[i + 1] === '*') {
      mode = { kind: 'blockComment' };
      i += 2;
      continue;
    }

    if (ch === '/' && s[i + 1] === '/') {
      mode = { kind: 'lineComment' };
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function normalizeWhitespaceForTokens(input: string): string {
  return input
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type RedactionRule = {
  name: string;
  regex: RegExp;
  placeholder: string;
};

/**
 * Redact sensitive literals using typed placeholders.
 * Aim: eliminate secrets/PII while preserving structure/context.
 * Order matters: PEM and DB URLs before generic https URL capture.
 */
export function redactSensitiveContent(input: string): string {
  let out = input;

  out = out.replace(
    /-----BEGIN [A-Z0-9 -]+-----[\s\S]*?-----END [A-Z0-9 -]+-----/g,
    '[PEM_BLOCK]'
  );
  out = out.replace(
    /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|amqps):\/\/[^\s"'<>]+/gi,
    '[DATABASE_OR_BROKER_URL]'
  );

  const rules: RedactionRule[] = [
    {
      name: 'github_classic_pat',
      regex: /\bghp_[A-Za-z0-9]{36,}\b/g,
      placeholder: '[GITHUB_TOKEN]',
    },
    {
      name: 'github_oauth',
      regex: /\bgho_[A-Za-z0-9]{36,}\b/g,
      placeholder: '[GITHUB_OAUTH_TOKEN]',
    },
    {
      name: 'github_user_to_server',
      regex: /\bghu_[A-Za-z0-9]{36,}\b/g,
      placeholder: '[GITHUB_USER_TOKEN]',
    },
    {
      name: 'github_server_to_server',
      regex: /\bghs_[A-Za-z0-9]{36,}\b/g,
      placeholder: '[GITHUB_SERVER_TOKEN]',
    },
    {
      name: 'github_fine_grained_pat',
      regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
      placeholder: '[GITHUB_FINE_GRAINED_PAT]',
    },
    {
      name: 'slack_token',
      regex: /\bxox[abprse]-[0-9A-Za-z-]{10,}\b/g,
      placeholder: '[SLACK_TOKEN]',
    },
    {
      name: 'stripe_secret',
      regex: /\bsk_(?:live|test)_[0-9a-zA-Z]{20,}\b/g,
      placeholder: '[STRIPE_SECRET_KEY]',
    },
    {
      name: 'stripe_restricted',
      regex: /\brk_(?:live|test)_[0-9a-zA-Z]{20,}\b/g,
      placeholder: '[STRIPE_RESTRICTED_KEY]',
    },
    {
      name: 'google_api_key',
      regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
      placeholder: '[GOOGLE_API_KEY]',
    },
    {
      name: 'anthropic_api_key',
      regex: /\bsk-ant-[A-Za-z0-9_-]{10,}\b/g,
      placeholder: '[ANTHROPIC_API_KEY]',
    },
    {
      name: 'openai_api_key',
      regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
      placeholder: '[OPENAI_API_KEY]',
    },
    {
      name: 'npm_auth_token',
      regex: /\b_authToken\s*=\s*[^\s#]+/gi,
      placeholder: '_authToken=[NPM_AUTH_TOKEN]',
    },
    {
      name: 'email',
      regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      placeholder: '[EMAIL]',
    },
    {
      name: 'url',
      regex: /\bhttps?:\/\/[^\s"'<>]+/gi,
      placeholder: '[URL]',
    },
    // JWT-like tokens: 3 base64url segments separated by dots.
    {
      name: 'jwt',
      regex: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      placeholder: '[JWT]',
    },
    // AWS access key id
    {
      name: 'aws_access_key',
      regex: /\b(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})\b/g,
      placeholder: '[AWS_ACCESS_KEY_ID]',
    },
    // UUIDs
    {
      name: 'uuid',
      regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/g,
      placeholder: '[UUID]',
    },
  ];

  for (const rule of rules) {
    out = out.replace(rule.regex, rule.placeholder);
  }

  // Key-value style redaction (heuristic): common secret-bearing keys in code and config.
  out = out.replace(
    /(\b(?:password|passwd|secret|token|apiKey|apikey|clientSecret|jwtSecret|adminPassword|encryptionKey|privateKey|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|TWILIO_AUTH_TOKEN|TELEGRAMBOT_TOKEN|SMTP_PASSWORD|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|GITHUB_TOKEN|GITLAB_TOKEN|NPM_TOKEN|NPM_AUTH_TOKEN|VERCEL_TOKEN|NETLIFY_AUTH_TOKEN|DATADOG_API_KEY|SENTRY_AUTH_TOKEN|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|SLACK_BOT_TOKEN|DISCORD_BOT_TOKEN|LINEAR_API_KEY|NOTION_TOKEN|PINECONE_API_KEY|SUPABASE_(?:SERVICE_ROLE|JWT)_SECRET|DATABASE_URL|REDIS_URL|MONGO(?:DB)?_URI|PGPASSWORD|PGPASS)\b)(\s*[:=]\s*)(['"`]?)([^'"`\r\n]{2,})\3/gi,
    (_match, keyName: string, sep: string, quote: string, _value: string) => {
      const k = String(keyName).toLowerCase();
      if (
        k === 'openai_api_key' ||
        k === 'anthropic_api_key' ||
        k === 'gemini_api_key' ||
        k === 'google_api_key' ||
        k === 'github_token' ||
        k === 'gitlab_token' ||
        k === 'npm_token' ||
        k === 'npm_auth_token' ||
        k === 'vercel_token' ||
        k === 'netlify_auth_token' ||
        k === 'datadog_api_key' ||
        k === 'sentry_auth_token' ||
        k === 'cloudflare_api_token' ||
        k === 'cf_api_token' ||
        k === 'slack_bot_token' ||
        k === 'discord_bot_token' ||
        k === 'linear_api_key' ||
        k === 'notion_token' ||
        k === 'pinecone_api_key'
      ) {
        return `${keyName}${sep}${quote}[API_KEY]${quote}`;
      }
      if (k.includes('aws_secret_access_key')) return `${keyName}${sep}${quote}[AWS_SECRET_ACCESS_KEY]${quote}`;
      if (k.includes('aws_session_token')) return `${keyName}${sep}${quote}[AWS_SESSION_TOKEN]${quote}`;
      if (k.includes('password') || k.includes('passwd')) return `${keyName}${sep}${quote}[PASSWORD]${quote}`;
      if (k.includes('token')) return `${keyName}${sep}${quote}[TOKEN]${quote}`;
      if (k.includes('apikey')) return `${keyName}${sep}${quote}[API_KEY]${quote}`;
      if (k.includes('clientsecret') || k.includes('secret') || k.includes('privatekey')) {
        return `${keyName}${sep}${quote}[SECRET_VALUE]${quote}`;
      }
      if (k.includes('jwtsecret')) return `${keyName}${sep}${quote}[JWT_SECRET]${quote}`;
      if (k.includes('encryptionkey')) return `${keyName}${sep}${quote}[ENCRYPTION_KEY]${quote}`;
      if (k.includes('database_url') || k.includes('redis_url') || k.includes('mongo') || k.includes('pgpass')) {
        return `${keyName}${sep}${quote}[CONNECTION_STRING]${quote}`;
      }
      return `${keyName}${sep}${quote}[REDACTED_VALUE]${quote}`;
    }
  );

  // Dotenv / shell: OPENAI_API_KEY=value (line-anchored common names)
  out = out.replace(
    /^(\s*)(export\s+)?(OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GITLAB_TOKEN|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|NPM_TOKEN|GEMINI_API_KEY|GOOGLE_API_KEY|STRIPE_SECRET_KEY|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|DATADOG_API_KEY|SENTRY_AUTH_TOKEN)\s*=\s*[^\s#'"`;]*\s*$/gim,
    (_m, lead: string, exp: string | undefined, key: string) =>
      exp ? `${lead}${exp}${key}=[ENV_SECRET]` : `${lead}${key}=[ENV_SECRET]`
  );

  // Bearer / Basic schemes and HTTP Authorization headers
  out = out.replace(/\bBearer\s+[A-Za-z0-9\-\._~\+\/]+=*\b/gi, 'Bearer [BEARER_TOKEN]');
  out = out.replace(/\bBasic\s+[A-Za-z0-9+/=]{8,}\b/gi, 'Basic [BASIC_AUTH]');
  out = out.replace(/\bAuthorization\s*:\s*Bearer\s+[^\s\r\n]+/gi, 'Authorization: Bearer [BEARER_TOKEN]');
  out = out.replace(/\bAuthorization\s*:\s*Basic\s+[^\s\r\n]+/gi, 'Authorization: Basic [BASIC_AUTH]');

  return out;
}

export function minifyAndNormalizeFileContent(input: string, filePath: string): string {
  const lowerBase = basename(filePath).toLowerCase();
  const ext = extname(filePath).toLowerCase();

  if (lowerBase === 'dockerfile') {
    return normalizeWhitespaceForTokens(input);
  }

  if (lowerBase === '.env.example') {
    return normalizeWhitespaceForTokens(input);
  }

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    const stripped = stripJsComments(input);
    return normalizeWhitespaceForTokens(stripped);
  }

  if (ext === '.json') {
    try {
      const parsed = JSON.parse(input) as unknown;
      return JSON.stringify(parsed);
    } catch {
      // If invalid JSON, fall back to comment/whitespace normalization only.
      return normalizeWhitespaceForTokens(input);
    }
  }

  if (ext === '.yaml' || ext === '.yml') {
    // Keep YAML tags (e.g. CloudFormation !Ref/!Sub) intact by avoiding parse/serialize.
    return normalizeWhitespaceForTokens(input);
  }

  // YAML/TOML/TEXT/config/docs: just normalize whitespace for token efficiency.
  return normalizeWhitespaceForTokens(input);
}

export function transformForSnapshot(input: string, filePath: string): string {
  const redacted = redactSensitiveContent(input);
  return minifyAndNormalizeFileContent(redacted, filePath);
}

