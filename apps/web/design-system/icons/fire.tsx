import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

/**
 * The flame beside a Controversial claim.
 *
 * Drawn at its Figma size (8×10) rather than squared off to the usual 16, because it is set inline
 * with the tag's 14px text: a square box would either float the flame above the baseline or force
 * the row taller than the line it sits on.
 *
 * Defaults to `currentColor`, as most of this folder does, so the caller's text colour carries it —
 * which is what keeps the flame and the word the same red without either having to name it twice.
 *
 * `aria-hidden` because it is decoration: the word "Controversial" sits right beside it and says
 * the same thing, so announcing an unnamed graphic first only adds noise.
 */
export function Fire({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="8" height="10" viewBox="0 0 8 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M7.26544 3.34551C7.22829 3.28383 7.15398 3.2505 7.07967 3.26216C7.00537 3.27383 6.94697 3.33051 6.93636 3.40052C6.78067 4.31567 6.31712 4.61736 6.04289 4.71743C6.38436 1.26183 3.59605 0.0266457 3.56593 0.0150171C3.50754 -0.00998743 3.44031 -0.00331969 3.389 0.0316865C3.3377 0.0666926 3.30938 0.125035 3.31646 0.185044C3.59778 2.64709 2.50791 3.57727 2.11155 3.82894C2.03194 3.63223 2.00009 3.27551 2.00363 3.03381C2.00363 2.96213 1.95763 2.89879 1.88686 2.87379C1.8161 2.84878 1.73648 2.87045 1.68871 2.92713C0.239668 4.63738 -0.280523 6.16093 0.142401 7.45788C0.740405 9.29157 2.99088 9.96666 3.08464 9.99333C3.10233 9.99833 3.12002 10 3.13595 10C3.20495 10 3.26864 9.96166 3.29695 9.90165C3.33411 9.82497 3.30226 9.73329 3.22618 9.68995C3.16603 9.65661 1.8461 8.89148 2.19824 6.99117C2.28494 7.08951 2.39287 7.19286 2.51671 7.26788C2.56094 7.29455 2.61402 7.30122 2.66356 7.28789C2.87234 7.22954 3.09172 6.7878 3.29696 6.00768C3.40312 5.60095 3.47389 5.32923 3.51635 5.1442C3.93035 5.44759 4.7601 6.22608 4.53544 7.45796C4.52306 7.5263 4.55668 7.59298 4.6186 7.62799C4.68053 7.66301 4.76014 7.65967 4.81676 7.61799C4.83976 7.60132 5.28208 7.27794 5.50323 6.75785C5.69077 7.15792 5.91547 7.81636 5.76332 8.46149C5.64477 8.9599 5.31569 9.37497 4.78668 9.69166C4.71768 9.73333 4.6876 9.81501 4.71414 9.88669C4.74068 9.96003 4.81853 10.005 4.89991 9.99837C4.92822 9.99504 7.79267 9.66665 7.99785 6.23948C7.99785 6.23281 7.99785 6.22447 7.99962 6.21781C8.01908 4.6359 7.29368 3.3957 7.2636 3.34396L7.26544 3.34551Z"
        fill={themeColor}
      />
    </svg>
  );
}
