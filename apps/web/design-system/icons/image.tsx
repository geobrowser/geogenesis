import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
  color?: ColorName;
  className?: string;
}

export function Image({ color, className }: Props) {
  const themeColor = color ? colors.light[color] : 'currentColor';

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M0.5 12V4C0.5 2.067 2.067 0.5 4 0.5H8H12C13.933 0.5 15.5 2.067 15.5 4V8V12C15.5 13.933 13.933 15.5 12 15.5H4C2.067 15.5 0.5 13.933 0.5 12Z"
        stroke={themeColor}
      />
      <path
        d="M0.5 8L2.58579 10.0858C3.36684 10.8668 4.63316 10.8668 5.41421 10.0858L8.08579 7.41421C8.86683 6.63317 10.1332 6.63316 10.9142 7.41421L15.5 12"
        stroke={themeColor}
      />
      <circle cx="4.5" cy="4.5" r="2" stroke={themeColor} />
    </svg>
  );
}
