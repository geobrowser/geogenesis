import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Download({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15.5 11V13.5C15.5 14.6046 14.6046 15.5 13.5 15.5H2.5C1.39543 15.5 0.5 14.6046 0.5 13.5V11"
        stroke={themeColor}
        strokeLinecap="round"
      />
      <path d="M8 12.2109V0.710938" stroke={themeColor} strokeLinecap="round" />
      <path d="M4 8.5L8 12.5L12 8.5" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}
