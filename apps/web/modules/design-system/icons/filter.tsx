import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color: ColorName;
}

export function Filter({ color }: Props) {
  const theme = useTheme();
  const themeColor = theme.colors[color];

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 0V16" stroke={themeColor} />
      <path d="M8 0L8 16" stroke={themeColor} />
      <path d="M14.5 1V16" stroke={themeColor} />
      <circle cx="1.5" cy="5.5" r="1.5" fill={themeColor} />
      <circle cx="8" cy="11.5" r="1.5" fill={themeColor} />
      <circle cx="14.5" cy="1.5" r="1.5" fill={themeColor} />
    </svg>
  );
}
