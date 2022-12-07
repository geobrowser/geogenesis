import styled from '@emotion/styled'

interface Props {
	shouldTruncate?: boolean
	maxLines?: number
}

export const Truncate = styled.div<Props>((props) => ({
	display: '-webkit-box',
	WebkitBoxOrient: 'vertical',

	...(props.shouldTruncate && {
		overflow: 'hidden',
		WebkitLineClamp: String(props.maxLines ?? 1),
	}),
}))
