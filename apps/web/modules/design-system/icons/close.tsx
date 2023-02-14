import { useTheme } from '@emotion/react';
import { ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Close({ color }: Props) {
  const theme = useTheme();
  const themeColor = color ? theme.colors[color] : 'currentColor';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 14L14 2" stroke={themeColor} />
      <path d="M2 2L14 14" stroke={themeColor} />
    </svg>
  );
}
