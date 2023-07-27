import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function NotificationEmpty({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 1.65385C5.87571 1.65385 4.15363 3.24337 4.15363 5.20414C4.15363 5.94299 4.30648 6.54013 3.85497 7.86686C3.68874 8.35534 3.01303 9.34663 2.30003 10.3139C1.52645 11.3634 2.33645 12.8077 3.72828 12.8077C6.57609 12.8077 9.42391 12.8077 12.2717 12.8077C13.6636 12.8077 14.4736 11.3634 13.7 10.3139C12.987 9.34663 12.3113 8.35534 12.145 7.86686C11.6935 6.54013 11.8464 5.94299 11.8464 5.20414C11.8464 3.24337 10.1243 1.65385 8 1.65385ZM8 1.65385V0.5M10.5442 12.8077V13.1923C10.5442 14.7217 9.4051 15.5 8 15.5C6.5949 15.5 5.45585 14.7217 5.45585 13.1923V12.8077"
        stroke={themeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
