import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Gem({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <span className="h-3 w-3 flex-none [&>svg]:h-full [&>svg]:w-full">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block"
      >
        <title>Bounty</title>
        <circle cx="6" cy="6" r="6" fill={themeColor} />
        <path
          d="M5.62891 3.15234C5.86716 3.05712 6.13284 3.05712 6.37109 3.15234C6.46473 3.18978 6.58625 3.27397 6.78223 3.50195C6.97975 3.73173 7.21122 4.05587 7.5459 4.52441L7.88281 4.99609C8.32625 5.61691 8.63856 6.0545 8.84082 6.40039C9.04641 6.75202 9.08894 6.92973 9.08496 7.03711C9.07395 7.3338 8.93132 7.61059 8.69629 7.79199C8.61121 7.8576 8.44228 7.92582 8.03711 7.96289C7.63796 7.99938 7.09936 8 6.33594 8H5.66406C4.90064 8 4.36204 7.99938 3.96289 7.96289C3.55772 7.92582 3.38879 7.8576 3.30371 7.79199C3.06868 7.61059 2.92605 7.3338 2.91504 7.03711C2.91106 6.92973 2.95359 6.75202 3.15918 6.40039C3.36144 6.0545 3.67375 5.61691 4.11719 4.99609L4.4541 4.52441C4.78878 4.05587 5.02025 3.73173 5.21777 3.50195C5.41375 3.27397 5.53527 3.18978 5.62891 3.15234Z"
          stroke="white"
        />
      </svg>
    </span>
  );
}