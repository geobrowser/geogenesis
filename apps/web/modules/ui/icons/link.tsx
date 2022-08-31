interface Props {
  isActive: boolean
}

export function Link({ isActive }: Props) {
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
        d="M11.0595 8.82022L13.002 6.87774L14.9444 4.93527C16.0172 3.86247 17.7566 3.86247 18.8294 4.93527L19.8006 5.90651C20.8734 6.97931 20.8734 8.71866 19.8006 9.79146L15.1872 14.4048C14.5167 15.0753 13.4296 15.0753 12.7591 14.4048V14.4048L12.1521 13.7978"
        stroke={isActive ? '#1d4ed8' : '#1C1C1C'}
        strokeWidth="1.6625"
        strokeLinecap="round"
      />
      <path
        d="M14.9054 17.1207L12.9629 19.0632L11.0204 21.0057C9.94761 22.0784 8.20826 22.0784 7.13546 21.0056L6.16422 20.0344C5.09142 18.9616 5.09142 17.2223 6.16422 16.1495L10.7776 11.5361C11.4481 10.8656 12.5352 10.8656 13.2057 11.5361V11.5361L13.8127 12.1431"
        stroke={isActive ? '#1d4ed8' : '#1C1C1C'}
        strokeWidth="1.6625"
        strokeLinecap="round"
      />
    </svg>
  )
}
