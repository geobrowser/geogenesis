import fs from 'fs';

export function readCursor(cursorPath: string) {
  return fs.existsSync(cursorPath) ? fs.readFileSync(cursorPath, 'utf8') : '';
}
