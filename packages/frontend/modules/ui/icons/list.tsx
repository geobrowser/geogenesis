interface Props {
  isActive: boolean
}

export function List({ isActive }: Props) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="26" height="26" rx="4" fill="none" />
      <rect
        x="8.85083"
        y="6"
        width="13"
        height="1"
        rx="0.5"
        fill={isActive ? '#1d4ed8' : '#1C1C1C'}
      />
      <rect
        x="8.85083"
        y="13"
        width="13"
        height="1"
        rx="0.5"
        fill={isActive ? '#1d4ed8' : '#1C1C1C'}
      />
      <rect
        x="8.85083"
        y="20"
        width="13"
        height="1"
        rx="0.5"
        fill={isActive ? '#1d4ed8' : '#1C1C1C'}
      />
      <circle
        cx="5.44678"
        cy="6.5"
        r="1.5"
        fill={isActive ? '#1d4ed8' : '#1C1C1C'}
      />
      <circle
        cx="5.44678"
        cy="13.5"
        r="1.5"
        fill={isActive ? '#1d4ed8' : '#1C1C1C'}
      />
      <circle
        cx="5.44678"
        cy="20.5"
        r="1.5"
        fill={isActive ? '#1d4ed8' : '#1C1C1C'}
      />
    </svg>
  )
}
