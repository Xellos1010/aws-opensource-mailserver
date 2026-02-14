import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CmsRole } from '@mm/cms-contracts';
import { AuthError } from './errors';

interface TokenPayload {
  sub: string;
  roles: CmsRole[];
  type: 'access' | 'refresh';
  exp: number;
}

function base64urlEncode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64').toString('utf8');
}

export function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = Buffer.from(hashPassword(password, salt));
  const existing = Buffer.from(hash);
  if (candidate.length !== existing.length) {
    return false;
  }
  return timingSafeEqual(candidate, existing);
}

function sign(parts: string, secret: string): string {
  return createHmac('sha256', secret).update(parts).digest('base64url');
}

export function createToken(
  payload: Omit<TokenPayload, 'exp'>,
  ttlSeconds: number,
  secret: string
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const tokenPayload: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(tokenPayload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(unsigned, secret);
  return `${unsigned}.${signature}`;
}

export function verifyToken(token: string, secret: string): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthError('Invalid token format');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const unsigned = `${headerPart}.${payloadPart}`;
  const expected = sign(unsigned, secret);

  const candidate = Buffer.from(signaturePart);
  const existing = Buffer.from(expected);
  if (candidate.length !== existing.length || !timingSafeEqual(candidate, existing)) {
    throw new AuthError('Invalid token signature');
  }

  const payload = JSON.parse(base64urlDecode(payloadPart)) as TokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError('Token expired');
  }
  return payload;
}

export function parseBearerToken(headerValue?: string): string {
  if (!headerValue) {
    throw new AuthError();
  }
  const [scheme, token] = headerValue.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AuthError('Invalid authorization header');
  }
  return token;
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
