import cx from 'classnames'
import React, { ElementType, HTMLAttributes } from 'react'

type Variant = 'subheadline'
type Weight = 'regular' | 'medium' | 'bold'
type Color = 'gray' | 'white' | 'blue' | 'red' | 'green'

interface TextProps extends HTMLAttributes<HTMLElement> {
  children: React.ReactNode
  className?: string
  variant: Variant
  weight?: Weight
  color?: Color
  as?: ElementType
}

const variants: Record<Variant, string> = {
  subheadline: 'text-geo-subheadline',
}

const colors: Record<Color, string> = {
  gray: 'text-geo-gray-100',
  white: 'text-geo-white-100',
  blue: 'text-geo-blue-100',
  red: 'text-geo-red-100',
  green: 'text-geo-green-100',
}

const weights: Record<Weight, string> = {
  regular: 'font-regular',
  medium: 'font-medium',
  bold: 'font-bold',
}

export function Text({
  children,
  className,
  variant,
  color,
  weight,
  as: Component = 'p',
  ...props
}: TextProps) {
  const variantStyles = variants[variant]
  const colorStyles = color ? colors[color] : ''
  const weightStyles = weight ? weights[weight] : ''

  const classes = cx(variantStyles, colorStyles, weightStyles, className)

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  )
}
