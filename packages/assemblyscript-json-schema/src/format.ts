import {IFS} from 'buffs';
import path from 'path';
import prettier from 'prettier';

export function formatTypeScript(source: string) {
  return prettier.format(source, {parser: 'typescript'});
}

/**
 * Format all files in a directory
 */
export async function formatDirectory(fs: IFS, directoryPath: string) {
  const files = await fs.promises.readdir(directoryPath);

  await Promise.all(
    files.map(async name => {
      if (path.extname(name) !== '.ts') return;

      const filePath = path.join(directoryPath, name);
      const source = await fs.promises.readFile(filePath, 'utf8');
      const formatted = formatTypeScript(source);

      await fs.promises.writeFile(filePath, formatted);
    })
  );
}
