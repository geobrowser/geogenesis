import { MathExtension } from '@aarkue/tiptap-math-extension';

export const MathNode = MathExtension.configure({
  evaluation: false,
  delimiters: 'bracket',
  katexOptions: { throwOnError: false },
});
