import { ColorValue } from '../theme/colors';

interface Props {
  color: ColorValue;
}

export function Create({ color }: Props) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 0V16" stroke={color} />
      <path d="M0 8L16 8" stroke={color} />
    </svg>
  );
}
