import { ColorName, colors } from '../theme/colors';

interface Props {
  color?: ColorName;
}

export function Upload({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';
  
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M15.5 11V15.5H0.5V11" stroke={themeColor} strokeLinecap="round" />
      <path d="M8 1V12.5" stroke={themeColor} strokeLinecap="round" />
      <path d="M4 4.70999L8 0.709991L12 4.70999" stroke={themeColor} strokeLinecap="round" />
    </svg>
  );
}
