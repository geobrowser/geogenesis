import { MathExtension } from '@aarkue/tiptap-math-extension';

export const MATH_DELIMITERS = {
  inlineStart: '$$',
  inlineEnd: '$$',
  inlineRegex: '\\$\\$(.*?)\\$\\$',
};

export const MathNode = MathExtension.configure({
  evaluation: false,
  delimiters: MATH_DELIMITERS,
  katexOptions: { throwOnError: false },
});
