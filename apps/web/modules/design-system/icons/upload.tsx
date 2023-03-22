import { ColorName, colors } from '../theme/colors';

interface Props {
  color?: ColorName;
}

export function Upload({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12.625 9.25V12.625H1.375V9.25" stroke={themeColor} strokeLinecap="round" />
      <path d="M7 1.75V10.375" stroke={themeColor} strokeLinecap="round" />
      <path d="M4 4.53271L7 1.53271L10 4.53271" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}
