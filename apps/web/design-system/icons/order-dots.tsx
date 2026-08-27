import { ColorName, colors } from '~/design-system/theme/colors';

type Props = {
  /** Theme token (e.g. `grey-04`) or any valid SVG fill (`#hex`, `currentColor`, …). */
  color?: ColorName | string;
  className?: string;
};

function resolveFill(input?: string): string {
  if (input === undefined || input === '') return colors.light['grey-04'];
  if (input in colors.light) return colors.light[input as ColorName];
  return input;
}

export function OrderDots({ color, className }: Props) {
  const fill = resolveFill(color);

  return (
    <svg
      width="8"
      height="15"
      viewBox="0 0 8 15"
      fill="none"
      className={className ?? ''}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="1.335" cy="1.335" r="1.335" fill={fill} />
      <circle cx="1.335" cy="6.675" r="1.335" fill={fill} />
      <circle cx="1.335" cy="12.015" r="1.335" fill={fill} />

      <circle cx="6.675" cy="1.335" r="1.335" fill={fill} />
      <circle cx="6.675" cy="6.675" r="1.335" fill={fill} />
      <circle cx="6.675" cy="12.015" r="1.335" fill={fill} />
    </svg>
  );
}
