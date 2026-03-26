export type FencedCodeBlock = {
  openingLine: string;
  codeText: string;
  nextIndex: number;
  closingLine: string | null;
};

export function getFenceLength(line: string): number | null {
  const match = line.match(/^(`{3,})/);
  return match ? match[1].length : null;
}

export function isClosingFence(line: string, fenceLength: number): boolean {
  return new RegExp(`^\`{${fenceLength},}\\s*$`).test(line.trim());
}

export function readFencedCodeBlock(lines: string[], startIndex: number): FencedCodeBlock | null {
  const openingLine = lines[startIndex];
  const fenceLength = getFenceLength(openingLine);
  if (!fenceLength) return null;

  const codeLines: string[] = [];
  let nextIndex = startIndex + 1;

  while (nextIndex < lines.length && !isClosingFence(lines[nextIndex], fenceLength)) {
    codeLines.push(lines[nextIndex]);
    nextIndex++;
  }

  const hasClosingFence = nextIndex < lines.length;

  return {
    openingLine,
    codeText: codeLines.join('\n'),
    nextIndex: hasClosingFence ? nextIndex + 1 : nextIndex,
    closingLine: hasClosingFence ? lines[nextIndex] : null,
  };
}
