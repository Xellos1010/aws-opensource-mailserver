import ts from 'typescript';

export type ImportSpecifiers = {
  /**
   * Raw module specifiers as written in source (e.g. `./foo`, `@mm/bar`, `react`)
   */
  specifiers: string[];
};

function getScriptKind(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.ts')) return ts.ScriptKind.TS;
  if (lower.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.Unknown;
}

export function parseImportSpecifiers(filePath: string, content: string): ImportSpecifiers {
  const kind = getScriptKind(filePath);
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2022, true, kind);

  const specifiers: string[] = [];
  const seen = new Set<string>();

  function add(spec: string): void {
    if (seen.has(spec)) return;
    seen.add(spec);
    specifiers.push(spec);
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const ms = node.moduleSpecifier;
      if (ms && ts.isStringLiteral(ms)) add(ms.text);
    } else if (ts.isExportDeclaration(node)) {
      const ms = node.moduleSpecifier;
      if (ms && ts.isStringLiteral(ms)) add(ms.text);
    } else if (ts.isImportEqualsDeclaration(node)) {
      const ref = node.moduleReference;
      if (ref && ts.isExternalModuleReference(ref) && ref.expression && ts.isStringLiteral(ref.expression)) {
        add(ref.expression.text);
      }
    } else if (ts.isCallExpression(node)) {
      // require('...')
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const [arg0] = node.arguments;
        if (arg0 && ts.isStringLiteral(arg0)) add(arg0.text);
      }

      // import('...') dynamic
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [arg0] = node.arguments;
        if (arg0 && ts.isStringLiteral(arg0)) add(arg0.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { specifiers };
}

