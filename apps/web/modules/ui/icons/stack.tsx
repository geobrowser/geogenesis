import { motion } from 'framer-motion'
import { useState } from 'react'

interface Props {
  isActive: boolean
}

export function Stack({ isActive }: Props) {
  const [isHovered, setHovered] = useState(false)

  return (
    <motion.div
      className={`${isActive && 'shadow-lg'} rounded-full navbar-icon`}
      initial={{ scale: 1 }}
      animate={{ scale: isHovered || isActive ? 1.1 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <motion.path
          d="M1 16L11 21L21 16"
          animate={{
            strokeOpacity: isHovered || isActive ? 1 : 0.32,
          }}
          stroke="#1C1C1C"
          strokeWidth="1.33"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <motion.path
          d="M1 11L11 16L21 11"
          animate={{
            strokeOpacity: isHovered || isActive ? 1 : 0.32,
          }}
          stroke="#1C1C1C"
          strokeWidth="1.33"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <motion.path
          d="M11 1L1 6L11 11L21 6L11 1Z"
          animate={{
            fill:
              isHovered || isActive
                ? 'url(#paint0_linear_11460_216606)'
                : '#1c1c1c',
            stroke:
              isHovered || isActive
                ? 'url(#paint0_linear_11460_216606)'
                : '#1c1c1c',
            fillOpacity: isHovered || isActive ? 1 : 0.0,
            strokeOpacity: isHovered || isActive ? 1 : 0.32,
          }}
          strokeWidth="1.33"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient
            id="paint0_linear_11460_216606"
            x1="1"
            y1="11"
            x2="16.2436"
            y2="-3.87445"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#DB0D00" />
            <stop offset="0.341526" stopColor="#DF18A7" />
            <stop offset="0.779208" stopColor="#8124F7" />
            <stop offset="1" stopColor="#2374D9" />
          </linearGradient>
          <linearGradient
            id="paint1_linear_11460_216606"
            x1="1"
            y1="11"
            x2="16.2436"
            y2="-3.87445"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#DB0D00" />
            <stop offset="0.341526" stopColor="#DF18A7" />
            <stop offset="0.779208" stopColor="#8124F7" />
            <stop offset="1" stopColor="#2374D9" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  )
}
