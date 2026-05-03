import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactSensitiveContent } from './transform';

describe('redactSensitiveContent', () => {
  it('redacts PEM blocks', () => {
    const input = `before\n-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----\nafter`;
    const out = redactSensitiveContent(input);
    assert.match(out, /\[PEM_BLOCK\]/);
    assert.doesNotMatch(out, /MIIE/);
  });

  it('redacts postgres URLs with credentials', () => {
    const out = redactSensitiveContent('postgres://user:pass@host:5432/db');
    assert.equal(out, '[DATABASE_OR_BROKER_URL]');
  });

  it('redacts GitHub classic and fine-grained tokens', () => {
    const classic = `ghp_${'0'.repeat(36)}`;
    assert.match(redactSensitiveContent(classic), /\[GITHUB_TOKEN\]/);
    assert.match(
      redactSensitiveContent('github_pat_01ABCxyz_01234567890123456789012'),
      /\[GITHUB_FINE_GRAINED_PAT\]/
    );
  });

  it('redacts OpenAI-style sk keys', () => {
    assert.match(redactSensitiveContent('sk-proj-0123456789abcdefghijklmnop'), /\[OPENAI_API_KEY\]/);
  });

  it('redacts Anthropic-style sk-ant keys', () => {
    assert.match(redactSensitiveContent('sk-ant-api03-0123456789abcdefghij'), /\[ANTHROPIC_API_KEY\]/);
  });

  it('redacts dotenv lines', () => {
    const out = redactSensitiveContent('export OPENAI_API_KEY=sk-secret-value-here\n');
    assert.match(out, /OPENAI_API_KEY=\[(?:ENV_SECRET|API_KEY)\]/);
    assert.doesNotMatch(out, /sk-secret/);
  });

  it('redacts Authorization headers', () => {
    assert.match(
      redactSensitiveContent('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.x.y'),
      /Bearer \[BEARER_TOKEN\]/
    );
    assert.match(redactSensitiveContent('Authorization: Basic dXNlcjpwYXNz'), /Basic \[BASIC_AUTH\]/);
  });
});
