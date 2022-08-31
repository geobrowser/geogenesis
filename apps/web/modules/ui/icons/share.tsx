import { motion } from 'framer-motion'

interface Props {
  isHovered: boolean
  isActive: boolean
}

export function Share({ isHovered, isActive }: Props) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <motion.path
        d="M11 12L5 9"
        animate={{
          stroke: isHovered || isActive ? 'rgba(10, 132, 255, 1)' : '#1c1c1c',
        }}
        strokeWidth="1.33"
      />
      <motion.path
        d="M5 7L11 4"
        animate={{
          stroke: isHovered || isActive ? 'rgba(10, 132, 255, 1)' : '#1c1c1c',
        }}
        strokeWidth="1.33"
      />
      <motion.circle
        cx="13"
        cy="13"
        r="2.335"
        transform="rotate(-180 13 13)"
        strokeWidth="1.33"
        animate={{
          stroke: isHovered || isActive ? 'rgba(10, 132, 255, 1)' : '#1c1c1c',
        }}
      />
      <motion.circle
        cx="3"
        cy="8"
        r="2.335"
        transform="rotate(-180 3 8)"
        animate={{
          stroke: isHovered || isActive ? 'rgba(10, 132, 255, 1)' : '#1c1c1c',
        }}
        strokeWidth="1.33"
      />
      <motion.circle
        cx="13"
        cy="3"
        r="2.335"
        transform="rotate(-180 13 3)"
        animate={{
          stroke: isHovered || isActive ? 'rgba(10, 132, 255, 1)' : '#1c1c1c',
        }}
        strokeWidth="1.33"
      />
    </svg>
  )
}
