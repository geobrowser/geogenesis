interface Props {
  isActive: boolean
}

export function LargeHeading({ isActive }: Props) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="26" height="26" rx="4" fill="none" />
      <path
        d="M10.85 24H14.75V6.6H20.6V3H5V6.6H10.85V24Z"
        fill={isActive ? '#1d4ed8' : '#1C1C1C'}
      />
    </svg>
  )
}
