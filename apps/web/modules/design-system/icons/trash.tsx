import { ColorValue } from '../theme/colors';

interface Props {
  color: ColorValue;
}

export function Trash({ color }: Props) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.15301 2.5H12.847C13.1513 2.5 13.385 2.76949 13.342 3.07071L11.6277 15.0707C11.5925 15.317 11.3815 15.5 11.1327 15.5H4.8673C4.61847 15.5 4.40751 15.317 4.37232 15.0707L2.65803 3.07071C2.615 2.76949 2.84873 2.5 3.15301 2.5Z"
        stroke={color}
      />
      <rect x="5.5" y="0.5" width="5" height="2" rx="0.5" stroke={color} />
    </svg>
  );
}
