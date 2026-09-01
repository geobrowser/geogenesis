import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
}
export function Camera({ color }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0_69177_3224)">
        <path
          d="M5.9668 0.5H10.0332C10.6589 0.5 11.1668 1.00715 11.167 1.63281C11.167 2.07295 11.5237 2.42969 11.9639 2.42969H14C14.8283 2.42969 15.4998 3.10144 15.5 3.92969V10C15.5 10.8284 14.8284 11.5 14 11.5H2C1.17157 11.5 0.5 10.8284 0.5 10V3.92969L0.507812 3.77637C0.584786 3.02015 1.22347 2.42969 2 2.42969H4.03613C4.47627 2.42969 4.83301 2.07295 4.83301 1.63281C4.83318 1.00715 5.34109 0.5 5.9668 0.5Z"
          stroke="#606060"
        />
        <circle cx="8" cy="6.5" r="2.5" stroke="#606060" />
      </g>
      <defs>
        <clipPath id="clip0_69177_3224">
          <rect width="16" height="12" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
