import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color?: ColorName;
}

export function Publish({ color }: Props) {
  const theme = useTheme();
  const themeColor = color ? theme.colors[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15.5 4.25V8V11.5C15.5 13.7091 13.7091 15.5 11.5 15.5H4.5C2.29086 15.5 0.5 13.7091 0.5 11.5V4.5C0.5 2.29086 2.29086 0.5 4.5 0.5H8H11.75"
        stroke={themeColor}
      />
      <path
        d="M4 10.5C3.72386 10.5 3.5 10.7239 3.5 11C3.5 11.2761 3.72386 11.5 4 11.5V10.5ZM12 11.5C12.2761 11.5 12.5 11.2761 12.5 11C12.5 10.7239 12.2761 10.5 12 10.5V11.5ZM4 11.5H12V10.5H4V11.5Z"
        fill={themeColor}
      />
      <path
        d="M4 7.5C3.72386 7.5 3.5 7.72386 3.5 8C3.5 8.27614 3.72386 8.5 4 8.5V7.5ZM12 8.5C12.2761 8.5 12.5 8.27614 12.5 8C12.5 7.72386 12.2761 7.5 12 7.5V8.5ZM4 8.5H12V7.5H4V8.5Z"
        fill={themeColor}
      />
      <path
        d="M4 4.5C3.72386 4.5 3.5 4.72386 3.5 5C3.5 5.27614 3.72386 5.5 4 5.5V4.5ZM8 5.5C8.27614 5.5 8.5 5.27614 8.5 5C8.5 4.72386 8.27614 4.5 8 4.5V5.5ZM4 5.5H8V4.5H4V5.5Z"
        fill={themeColor}
      />
      <path d="M13 0.5H15.5V3" stroke={themeColor} />
      <path d="M15.5 0.5L10.5 5.5" stroke={themeColor} />
    </svg>
  );
}
