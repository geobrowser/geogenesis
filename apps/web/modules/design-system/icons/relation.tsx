import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color?: ColorName;
}

export function Relation({ color }: Props) {
  const theme = useTheme();
  const themeColor = color ? theme.colors[color] : 'currentColor';

  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="8.5" r="4.5" stroke={themeColor} />
      <circle cx="11" cy="8.5" r="4.5" stroke={themeColor} />
    </svg>
  );
}
