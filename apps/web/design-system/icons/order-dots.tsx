interface Props {
  color?: string;
  className?: string;
}

export function OrderDots({ color, className }: Props) {
  return (
    <svg
      width="8"
      height="15"
      viewBox="0 0 8 15"
      fill="none"
      className={className ? className : ''}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="1.335" cy="1.335" r="1.335" fill={color} />
      <circle cx="1.335" cy="6.675" r="1.335" fill={color} />
      <circle cx="1.335" cy="12.015" r="1.335" fill={color} />

      <circle cx="6.675" cy="1.335" r="1.335" fill={color} />
      <circle cx="6.675" cy="6.675" r="1.335" fill={color} />
      <circle cx="6.675" cy="12.015" r="1.335" fill={color} />
    </svg>
  );
}
