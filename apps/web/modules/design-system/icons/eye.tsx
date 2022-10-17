import { useTheme } from '@emotion/react';
import { ColorName } from '../theme/colors';

interface Props {
  color: ColorName;
}

export function Eye({ color }: Props) {
  const theme = useTheme();
  const themeColor = theme.colors[color];

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <mask id="path-1-inside-1_359_18233" fill="white">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M-2.12591e-06 7.99999C1.89199 11.0514 4.77299 13 8 13C11.227 13 14.108 11.0514 16 8C14.108 4.94858 11.227 3 8 3C4.77299 3 1.89199 4.94858 -2.12591e-06 7.99999Z"
        />
      </mask>
      <path
        d="M-2.12591e-06 7.99999L-0.84989 7.47303L-1.17663 7.99999L-0.84989 8.52696L-2.12591e-06 7.99999ZM16 8L16.8499 8.52696L17.1766 8L16.8499 7.47303L16 8ZM8 12C5.20621 12 2.61072 10.3129 0.849886 7.47303L-0.84989 8.52696C1.17327 11.7899 4.33978 14 8 14L8 12ZM15.1501 7.47303C13.3893 10.3129 10.7938 12 8 12L8 14C11.6602 14 14.8267 11.7899 16.8499 8.52696L15.1501 7.47303ZM8 4C10.7938 4 13.3893 5.68708 15.1501 8.52696L16.8499 7.47303C14.8267 4.21008 11.6602 2 8 2L8 4ZM0.849886 8.52696C2.61072 5.68708 5.20621 4 8 4L8 2C4.33978 2 1.17327 4.21008 -0.84989 7.47303L0.849886 8.52696Z"
        fill={themeColor}
        mask="url(#path-1-inside-1_359_18233)"
      />
      <circle cx="8" cy="8" r="2.5" stroke={themeColor} />
    </svg>
  );
}
