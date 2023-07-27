import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Image({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15.5 14C15.5 14.8284 14.8284 15.5 14 15.5H2C1.17157 15.5 0.5 14.8284 0.5 14V2C0.5 1.17157 1.17157 0.5 2 0.5H8H14C14.8284 0.5 15.5 1.17157 15.5 2V8V14Z"
        stroke={themeColor}
      />
      <path d="M0.5 8L4 11.5L9.5 6L15.5 12" stroke={themeColor} />
      <circle cx="4.5" cy="4.5" r="2" stroke={themeColor} />
    </svg>
  );
}
