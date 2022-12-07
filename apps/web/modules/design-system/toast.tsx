import styled from '@emotion/styled'
import { motion } from 'framer-motion'
import { ReactNode } from 'react'

const Container = styled.div((props) => ({
	...props.theme.typography.button,
	color: props.theme.colors.white,
	position: 'fixed',
	display: 'flex',
	justifyContent: 'space-between',
	alignItems: 'center',
	bottom: props.theme.space * 10,
	backgroundColor: props.theme.colors.text,
	padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,
	borderRadius: props.theme.radius,
}))

const MotionContainer = motion(Container)

interface Props {
	children: ReactNode
}

export function Toast({ children }: Props) {
	return (
		<MotionContainer
			initial={{ y: 90 }}
			animate={{ y: 0 }}
			exit={{ y: 90 }}
			transition={{ duration: 0.1, ease: 'easeInOut' }}
		>
			{children}
		</MotionContainer>
	)
}
