type Props = {
  color?: string;
  className?: string;
};

/** X (formerly Twitter) logo mark for share actions. */
export function XIcon({ color = 'currentColor', className }: Props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M17.687 3H20.5L13.936 10.777L21.5 21H15.19L10.294 14.909L4.81 21H2L8.956 12.777L1.5 3H8.06L12.555 8.648L17.687 3ZM16.619 19.2H18.239L7.482 4.632H5.724L16.619 19.2Z"
        fill={color}
      />
    </svg>
  );
}
