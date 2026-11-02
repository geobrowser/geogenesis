import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

/** New operation sites must supply the shared description before reaching CI. */
it('requires attribution at every production operation site', () => {
  const missing: string[] = [];
  const visitDirectory = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visitDirectory(file);
        continue;
      }
      if (!/\.tsx?$/.test(file) || /\.test\./.test(file)) continue;
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'observeOperation' &&
          node.arguments.length < 5
        )
          missing.push(file);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  for (const directory of ['core', 'partials', 'app']) visitDirectory(path.join(process.cwd(), directory));
  expect(missing).toEqual([]);
});
