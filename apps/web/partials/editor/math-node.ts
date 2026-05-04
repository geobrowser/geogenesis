import { MathExtension } from '@aarkue/tiptap-math-extension';

export const MathNode = MathExtension.configure({
  evaluation: false,
  delimiters: {
    inlineStart: '$$',
    inlineEnd: '$$',
    inlineRegex: '\\$\\$(?!\\s)(.*?(?<!\\\\))\\$\\$',
  },
  katexOptions: { throwOnError: false },
});
