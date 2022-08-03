import { motion, AnimationProps } from 'framer-motion'

type AnimationType = 'fade' | 'slide-up'

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
}

export function Animate(props: AnimateProps) {
  const animationProps = animationMap[props.animation]

  return (
    <motion.div className={props.className} {...animationProps}>
      {props.children}
    </motion.div>
  )
}
