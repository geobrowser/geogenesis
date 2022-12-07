import styled from '@emotion/styled'

interface Props {
	type: 'horizontal' | 'vertical'
}

export const Divider = styled.div<Props>((props) => ({
	alignSelf: props.type === 'vertical' ? 'stretch' : 'none',
	justifySelf: props.type === 'horizontal' ? 'stretch' : 'none',
	border: `0.5px solid ${props.theme.colors['grey-02']}`,
}))
