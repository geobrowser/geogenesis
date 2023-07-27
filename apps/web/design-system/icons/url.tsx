import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Url({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.18011 7.32139V7.32139C8.00853 6.14981 6.10904 6.14981 4.93746 7.32139L2.81614 9.44271C1.64457 10.6143 1.64457 12.5138 2.81614 13.6853V13.6853C3.98772 14.8569 5.88721 14.8569 7.05879 13.6853L8.11945 12.6247L9.71044 11.0337"
        stroke={themeColor}
        strokeLinecap="round"
      />
      <path
        d="M6.81599 8.68527V8.68527C7.98756 9.85684 9.88706 9.85684 11.0586 8.68527L13.1799 6.56395C14.3515 5.39237 14.3515 3.49288 13.1799 2.32131V2.32131C12.0084 1.14973 10.1089 1.14973 8.93731 2.32131L7.87665 3.38197L6.28566 4.97296"
        stroke={themeColor}
        strokeLinecap="round"
      />
    </svg>
  );
}
