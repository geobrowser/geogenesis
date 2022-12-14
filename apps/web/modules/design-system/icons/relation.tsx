import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color?: ColorName;
}

export function Relation({ color }: Props) {
  const theme = useTheme();
  const themeColor = color ? theme.colors[color] : 'currentColor';

  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3.75" cy="6.5" r="3.25" stroke={themeColor} />
      <circle cx="8.25" cy="6.5" r="3.25" stroke={themeColor} />
    </svg>
  );
}
