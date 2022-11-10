import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color: ColorName;
}

function getInverseColor(color: ColorName) {
  switch (color) {
    case 'text':
      return 'white';
    case 'white':
      return 'text';
    default:
      return 'white';
  }
}

export function Copy({ color }: Props) {
  const theme = useTheme();
  const themeColor = theme.colors[color];
  console.log(getInverseColor(color));

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="3.5" width="10" height="12" rx="1.5" stroke={themeColor} />
      <rect
        x="4.5"
        y="0.5"
        width="10"
        height="12"
        rx="1.5"
        fill={theme.colors[getInverseColor(color)]}
        stroke={themeColor}
      />
    </svg>
  );
}
