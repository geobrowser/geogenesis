import styled from '@emotion/styled'

export const Input = styled.input((props) => ({
	...props.theme.typography.input,
	boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,
	borderRadius: props.theme.radius,
	width: '100%',
	padding: `${9}px ${props.theme.space * 2.5}px`,
	outline: 'none',
	WebkitAppearance: 'none',

	'::placeholder': {
		color: props.theme.colors['grey-03'],
	},

	':hover:enabled': {
		boxShadow: `inset 0 0 0 1px ${props.theme.colors.ctaPrimary}`,
	},

	':focus': {
		boxShadow: `inset 0 0 0 2px ${props.theme.colors.ctaPrimary}`,
	},

	':disabled': {
		backgroundColor: props.theme.colors.divider,
		color: props.theme.colors['grey-03'],
		cursor: 'not-allowed',
	},
}))
