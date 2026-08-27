import { MathExtension } from '@aarkue/tiptap-math-extension';

import { MATH_DELIMITERS } from '~/core/state/editor/math-delimiters';

export const MathNode = MathExtension.configure({
  evaluation: false,
  delimiters: MATH_DELIMITERS,
  katexOptions: { throwOnError: false },
});
