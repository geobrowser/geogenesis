import { useTheme } from '@emotion/react'
import { ColorName } from '~/modules/design-system/theme/colors'

interface Props {
	color?: ColorName
}

export function Search({ color }: Props) {
	const theme = useTheme()
	const themeColor = color ? theme.colors[color] : 'currentColor'

	return (
		<svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
			<rect x="0.5" y="1" width="12" height="12" rx="6" stroke={themeColor} />
			<path d="M15.33 15.83L11 11.5" stroke={themeColor} strokeLinecap="round" />
		</svg>
	)
}
