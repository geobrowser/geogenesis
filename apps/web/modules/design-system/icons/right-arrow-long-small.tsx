import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color?: ColorName;
}

export function RightArrowLongSmall({ color }: Props) {
  const theme = useTheme();
  const themeColor = color ? theme.colors[color] : 'currentColor';

  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.4751 3L12.4751 6L9.4751 9" stroke={themeColor} stroke-linecap="round" />
      <path d="M1.375 6H12.25" stroke={themeColor} stroke-linecap="round" />
    </svg>
  );
}
