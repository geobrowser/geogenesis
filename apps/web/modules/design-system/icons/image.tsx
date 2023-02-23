
import { ColorName, colors } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Image({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="13" viewBox="0 0 12 13" fill="none">
<path d="M11.5 10.5C11.5 11.3284 10.8284 12 10 12H2C1.17157 12 0.5 11.3284 0.5 10.5V2.5C0.5 1.67157 1.17157 1 2 1H6H10C10.8284 1 11.5 1.67157 11.5 2.5V6.5V10.5Z" stroke={themeColor}/>
<path d="M0.375 6.5L3 9.125L7.125 5L11.625 9.5" stroke={themeColor}/>
<circle cx="3.375" cy="3.875" r="1.375" stroke={themeColor}/>
</svg>
  );
}
