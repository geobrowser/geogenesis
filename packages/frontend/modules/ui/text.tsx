import cx from 'classnames'
import React, { ElementType, HTMLAttributes } from 'react'

type Variant = 'subheadline' | 'body' | 'title2'
type Weight = 'regular' | 'medium' | 'bold'
type Color = 'grey-100' | 'grey-70' | 'white' | 'blue' | 'red' | 'green'

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
  body: 'text-geo-body',
  title2: 'text-geo-title2',
}

const colors: Record<Color, string> = {
  'grey-100': 'text-geo-grey-100',
  'grey-70': 'text-geo-grey-70',
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
