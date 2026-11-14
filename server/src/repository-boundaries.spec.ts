import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = import.meta.dirname;
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : path.endsWith('.ts') && !path.endsWith('.spec.ts')
        ? [path]
        : [];
  });
}

it('keeps persistence dependencies out of business modules and their interfaces', () => {
  const violations: string[] = [];
  for (const file of sourceFiles(root)) {
    const name = relative(root, file);
    // Composition, schema and concrete storage adapters own database technology.
    if (
      name.startsWith('database/') ||
      name === 'app.module.ts' ||
      name.endsWith('.repository.ts') ||
      name.endsWith('.repository.helpers.ts') ||
      name === 'auth/drizzle-auth.store.ts'
    )
      continue;
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of source.statements) {
      if (!(
        ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
      ))
        continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      if (
        /^(drizzle-orm|@nestjs\/drizzle)(\/|$)/.test(specifier.text) ||
        /(^|\/)database\//.test(specifier.text) ||
        specifier.text.endsWith('.repository.helpers.js')
      )
        violations.push(`${name}: ${specifier.text}`);
    }
  }
  expect(violations).toEqual([]);
});
