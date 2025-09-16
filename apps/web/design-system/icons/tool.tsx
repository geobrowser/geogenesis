interface Props {
  color?: string;
  size?: number;
}

export function Tool({ color = 'grey-04', size }: Props) {
  const style = size ? { width: size, height: size } : {};

  return (
    <svg
      className={`text-${color}`}
      style={style}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14.8 6.4L9.6 1.2C9.2 0.8 8.4 0.8 8 1.2L1.2 8C0.8 8.4 0.8 9.2 1.2 9.6L6.4 14.8C6.8 15.2 7.6 15.2 8 14.8L14.8 8C15.2 7.6 15.2 6.8 14.8 6.4ZM7.2 13.6L2.4 8.8L8.8 2.4L13.6 7.2L7.2 13.6Z"
        fill="currentColor"
      />
      <path
        d="M11.2 4.8C11.6 4.8 12 4.4 12 4C12 3.6 11.6 3.2 11.2 3.2C10.8 3.2 10.4 3.6 10.4 4C10.4 4.4 10.8 4.8 11.2 4.8Z"
        fill="currentColor"
      />
    </svg>
  );
}