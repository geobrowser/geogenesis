import { motion } from 'framer-motion'
import { useState } from 'react'

interface Props {
  isActive: boolean
}

export function Geo({ isActive }: Props) {
  const [isHovered, setHovered] = useState(false)

  return (
    <motion.div
      className={`${isActive && 'shadow-lg'} rounded-full`}
      initial={{ scale: 1 }}
      animate={{ scale: isHovered || isActive ? 1.1 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        width="50"
        height="50"
        viewBox="0 0 50 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g filter="url(#filter0_d_11460_216578)">
          <motion.path
            d="M20.8716 24.721C21.9547 25.7261 23.4063 26.3414 25.0012 26.3414C26.596 26.3414 28.0462 25.7261 29.1307 24.721L25.0012 17.8398L20.8716 24.721Z"
            animate={{
              fill: isActive || isHovered ? '#1c1c1c' : '#1c1c1c',
              fillOpacity: isActive || isHovered ? 1 : 0.32,
            }}
          />
          <motion.path
            d="M30.7936 27.501C29.2059 28.7741 27.1928 29.5368 24.9997 29.5368C22.8067 29.5368 20.7936 28.7741 19.2059 27.501H19.203L17.1035 30.9998H32.896L30.7965 27.501H30.7936Z"
            animate={{
              fill: isActive || isHovered ? '#1c1c1c' : '#1c1c1c',
              fillOpacity: isActive || isHovered ? 1 : 0.32,
            }}
          />
          <motion.path
            d="M24.9999 11C19.8809 11 15.7314 15.1494 15.7314 20.2685C15.7314 23.1945 17.0881 25.8029 19.2061 27.5013C20.7938 28.7743 22.8069 29.537 24.9999 29.537C27.193 29.537 29.2061 28.7743 30.7938 27.5013C32.9118 25.8029 34.2684 23.1945 34.2684 20.2685C34.2699 15.1494 30.119 11 24.9999 11ZM24.9999 27.5013C21.005 27.5013 17.7672 24.2634 17.7672 20.2685C17.7672 16.2736 21.005 13.0357 24.9999 13.0357C28.9948 13.0357 32.2327 16.2736 32.2327 20.2685C32.2327 24.2634 28.9948 27.5013 24.9999 27.5013Z"
            animate={{
              fill:
                isActive || isHovered
                  ? 'url(#paint0_linear_11460_216578)'
                  : '#1c1c1c',
              fillOpacity: isActive || isHovered ? 1 : 0.32,
            }}
          />
        </g>
        <defs>
          <filter
            id="filter0_d_11460_216578"
            x="0"
            y="0"
            width="50"
            height="50"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feMorphology
              radius="3"
              operator="dilate"
              in="SourceAlpha"
              result="effect1_dropShadow_11460_216578"
            />
            <feOffset dy="4" />
            <feGaussianBlur stdDeviation="6" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.109804 0 0 0 0 0.109804 0 0 0 0 0.109804 0 0 0 0.1 0"
            />
            <feBlend
              mode="normal"
              in2="BackgroundImageFix"
              result="effect1_dropShadow_11460_216578"
            />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect1_dropShadow_11460_216578"
              result="shape"
            />
          </filter>
          <linearGradient
            id="paint0_linear_11460_216578"
            x1="15.7314"
            y1="29.537"
            x2="38.0095"
            y2="18.6677"
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
