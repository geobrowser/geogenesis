import { motion } from 'framer-motion'

interface Props {
  isHovered: boolean
  isActive: boolean
}

export function Heart({ isHovered, isActive }: Props) {
  return (
    <svg
      width="18"
      height="16"
      viewBox="0 0 18 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <motion.path
        d="M9.75762 14.6534C9.27272 14.8873 8.70598 14.8873 8.2211 14.6534C1.69569 11.5056 -0.730508 4.97361 2.28054 2.09557C5.32564 -0.815013 8.80337 2.97619 8.98228 3.17544C8.98778 3.18156 8.9942 3.18352 9.00244 3.18352V3.18352C9.01068 3.18352 9.0171 3.18156 9.0226 3.17543C9.20151 2.97613 12.6792 -0.816056 15.7243 2.09487C18.7354 4.97326 16.2849 11.5056 9.75762 14.6534Z"
        animate={{
          stroke: isHovered || isActive ? 'rgba(234, 68, 88, 1)' : '#1c1c1c',
          fill: isActive ? 'rgba(234, 68, 88, 1)' : '#ffffff',
        }}
        stroke="black"
        strokeWidth="2"
        strokeMiterlimit="10"
      />
    </svg>
  )
}
