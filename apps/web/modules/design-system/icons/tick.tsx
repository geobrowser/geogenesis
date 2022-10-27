import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color: ColorName;
}

export function Tick({ color }: Props) {
  const theme = useTheme();
  const themeColor = theme.colors[color];

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 8L6 12L14 4" stroke={themeColor} />
    </svg>
  );
}
