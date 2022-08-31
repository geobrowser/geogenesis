import { motion, AnimationProps } from 'framer-motion'

type AnimationType = 'fade' | 'slide-up' | 'slide-down'

interface AnimateProps {
  children: React.ReactNode
  animation: AnimationType
  className?: string
  delay?: number
}

const animationMap: Record<AnimationType, AnimationProps> = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  'slide-up': {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 30 },
  },
  'slide-down': {
    initial: { opacity: 0, y: -30 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -30 },
  },
}

export function Animate({
  delay = 0,
  className,
  animation,
  children,
}: AnimateProps) {
  const animationProps = animationMap[animation]

  return (
    <motion.div
      className={className}
      {...animationProps}
      transition={{ delay: delay }}
    >
      {children}
    </motion.div>
  )
}
