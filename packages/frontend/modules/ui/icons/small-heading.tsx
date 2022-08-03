interface Props {
  isActive: boolean
}

export function SmallHeading({ isActive }: Props) {
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
        d="M10.7507 20.9498H13.5178V8.60409H17.6685V6.0498H6.59998V8.60409H10.7507V20.9498Z"
        fill={isActive ? '#1d4ed8' : '#1C1C1C'}
      />
    </svg>
  )
}
