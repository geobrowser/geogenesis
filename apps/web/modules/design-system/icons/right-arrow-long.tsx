import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color?: ColorName;
}

export function RightArrowLong({ color }: Props) {
  const theme = useTheme();
  const themeColor = color ? theme.colors[color] : 'currentColor';

  return (
    <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.6534 3.64645C11.4581 3.45118 11.1415 3.45118 10.9463 3.64645C10.751 3.84171 10.751 4.15829 10.9463 4.35355L11.6534 3.64645ZM15.2998 8L15.6534 8.35355L16.0069 8L15.6534 7.64645L15.2998 8ZM10.9463 11.6464C10.751 11.8417 10.751 12.1583 10.9463 12.3536C11.1415 12.5488 11.4581 12.5488 11.6534 12.3536L10.9463 11.6464ZM10.9463 4.35355L14.9463 8.35355L15.6534 7.64645L11.6534 3.64645L10.9463 4.35355ZM14.9463 7.64645L10.9463 11.6464L11.6534 12.3536L15.6534 8.35355L14.9463 7.64645Z"
        fill={themeColor}
      />
      <path d="M0.5 8H15" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}
