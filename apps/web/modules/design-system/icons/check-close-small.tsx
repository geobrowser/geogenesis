import { useTheme } from '@emotion/react';
import { ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function CheckCloseSmall({ color }: Props) {
  const theme = useTheme();
  const themeColor = color ? theme.colors[color] : 'currentColor';

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="5.5" stroke={themeColor} />
      <path d="M3.75 8.25L8.25 3.75" stroke={themeColor} />
      <path d="M3.75 3.75L8.25 8.25" stroke={themeColor} />
    </svg>
  );
}
