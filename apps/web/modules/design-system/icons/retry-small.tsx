import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color?: ColorName;
}

export function RetrySmall({ color }: Props) {
  const theme = useTheme();
  const themeColor = color ? theme.colors[color] : 'currentColor';

  return (
    <svg width="13" height="12" viewBox="0 0 13 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10.8242 6.1875C10.8242 3.59867 8.72555 1.5 6.13672 1.5C3.54788 1.5 1.44922 3.59867 1.44922 6.1875C1.44922 8.77633 3.54788 10.875 6.13672 10.875C7.21136 10.875 8.20154 10.5134 8.9922 9.90517"
        stroke={themeColor}
      />
      <path d="M12.3242 5.1001L10.8242 6.6001L9.32422 5.1001" stroke={themeColor} />
    </svg>
  );
}
