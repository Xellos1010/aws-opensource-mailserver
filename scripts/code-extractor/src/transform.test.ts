import { describe, it, expect } from 'vitest';
import { redactSensitiveContent, stripJsComments, minifyAndNormalizeFileContent } from './transform';
import { parseImportSpecifiers } from './parseImports';
import { createTsConfigPathResolver } from './tsconfigPaths';
import { resolveRelativeImport } from './resolveImport';
import extractorConfig from '../extractor.config';

describe('code-extractor transform', () => {
  it('redacts emails/urls/tokens with typed placeholders', () => {
    expect(redactSensitiveContent('user@example.com')).toContain('[EMAIL]');
    expect(redactSensitiveContent('https://example.com/a/b')).toContain('[URL]');
    expect(redactSensitiveContent('Bearer token123')).toContain('Bearer [BEARER_TOKEN]');
  });

  it('strips line and block comments', () => {
    const input = `const x = 1; // hello\nconst y = 2; /* world */\n`;
    const output = stripJsComments(input);
    expect(output).toContain('const x = 1;');
    expect(output).toContain('const y = 2;');
    expect(output).not.toContain('hello');
    expect(output).not.toContain('world');
  });

  it('minifies JSON when valid', () => {
    const input = '{ "a": 1, "b": 2 }';
    const output = minifyAndNormalizeFileContent(input, 'x.json');
    expect(output).toBe('{"a":1,"b":2}');
  });
});

describe('code-extractor import helpers', () => {
  it('parses static import/export/require specifiers', () => {
    const filePath = 'x.ts';
    const content = `
      import x from './foo';
      export { y } from '@mailexample/content-extractor';
      const z = require('react');
    `;
    const { specifiers } = parseImportSpecifiers(filePath, content);
    expect(specifiers).toEqual(expect.arrayContaining(['./foo', '@mailexample/content-extractor', 'react']));
  });

  it('resolves tsconfig path aliases', () => {
    const resolver = createTsConfigPathResolver(process.cwd());
    const resolved = resolver.resolveAlias('@mailexample/content-extractor');
    expect(resolved).not.toBeNull();
    expect(resolved).toContain('libs/content-extractor/src/index.ts');
  });

  it('resolves relative imports with configured extensions', () => {
    const fromFile = `${process.cwd()}/tools/code-extractor/src/extractor.ts`;
    const resolved = resolveRelativeImport(fromFile, './transform', extractorConfig);
    expect(resolved).not.toBeNull();
    expect(resolved).toContain('tools/code-extractor/src/transform.ts');
  });
});

