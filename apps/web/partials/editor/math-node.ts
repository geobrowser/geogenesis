import { MathExtension } from '@aarkue/tiptap-math-extension';

export const MathNode = MathExtension.configure({
  evaluation: false,
  katexOptions: { throwOnError: false },
});
