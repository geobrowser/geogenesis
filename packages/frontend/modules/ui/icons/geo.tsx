import { motion } from 'framer-motion'
import { useState } from 'react'

interface Props {
  isActive: boolean
}

export function Geo({ isActive }: Props) {
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
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <motion.path
          d="M5.87159 13.721C6.95466 14.7261 8.40632 15.3414 10.0012 15.3414C11.596 15.3414 13.0462 14.7261 14.1307 13.721L10.0012 6.83984L5.87159 13.721Z"
          fill="#1C1C1C"
          animate={{
            fillOpacity: isActive || isHovered ? 1 : 0.32,
          }}
        />
        <motion.path
          d="M15.7936 16.501C14.2059 17.7741 12.1928 18.5368 9.99974 18.5368C7.80666 18.5368 5.79362 17.7741 4.20587 16.501H4.20303L2.10352 19.9998H17.896L15.7965 16.501H15.7936Z"
          fill="#1C1C1C"
          animate={{
            fillOpacity: isActive || isHovered ? 1 : 0.32,
          }}
        />
        <motion.path
          d="M9.99994 0C4.88086 0 0.731445 4.14942 0.731445 9.2685C0.731445 12.1945 2.08812 14.8029 4.20607 16.5013C5.79382 17.7743 7.80686 18.537 9.99994 18.537C12.193 18.537 14.2061 17.7743 15.7938 16.5013C17.9118 14.8029 19.2684 12.1945 19.2684 9.2685C19.2699 4.14942 15.119 0 9.99994 0ZM9.99994 16.5013C6.00505 16.5013 2.76717 13.2634 2.76717 9.2685C2.76717 5.2736 6.00505 2.03572 9.99994 2.03572C13.9948 2.03572 17.2327 5.2736 17.2327 9.2685C17.2327 13.2634 13.9948 16.5013 9.99994 16.5013Z"
          animate={{
            fill:
              isActive || isHovered
                ? 'url(#paint0_linear_11460_216574)'
                : '#1c1c1c',
            fillOpacity: isActive || isHovered ? 1 : 0.32,
          }}
        />
        <defs>
          <linearGradient
            id="paint0_linear_11460_216574"
            x1="0.731445"
            y1="18.537"
            x2="23.0095"
            y2="7.66774"
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

// fill:
// isActive || isHovered
//   ? 'url(#paint0_linear_11460_216578)'
//   : '#1c1c1c',
// fillOpacity: isActive || isHovered ? 1 : 0.32,
// }}
