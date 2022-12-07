import { Theme, useTheme } from '@emotion/react'
import styled from '@emotion/styled'
import { ComponentProps } from 'react'
import { SmallButton } from '~/modules/design-system/button'
import { CaretUp } from '~/modules/design-system/icons/caret-up'
import { Spacer } from '~/modules/design-system/spacer'
import { Text } from '~/modules/design-system/text'
import { FilterState } from '~/modules/types'

type DefaultSpaceStyle = {
	backgroundColor: string
	borderColor: string
}

function getSpaceBackgroundColors(spaceName: string, theme: Theme): DefaultSpaceStyle {
	switch (spaceName) {
		case 'Health':
			return {
				backgroundColor: '#D2E5DA',
				borderColor: '#8FBCA2',
			}
		case 'San Francisco':
			return {
				backgroundColor: '#D5E2F2',
				borderColor: '#739ACA',
			}
		case 'Values':
			return {
				backgroundColor: '#E5E5E7',
				borderColor: theme.colors['grey-03'],
			}
		default:
			return {
				backgroundColor: theme.colors.white,
				borderColor: theme.colors.text,
			}
	}
}

type SpaceSpecificProps = { spaceName: string }

const Container = styled.div<SpaceSpecificProps>(({ theme, spaceName }) => {
	const { backgroundColor, borderColor } = getSpaceBackgroundColors(spaceName, theme)

	return {
		position: 'relative',
		backgroundColor,
		border: `1px solid ${borderColor}`,
		borderRadius: theme.radius,
		padding: `${theme.space * 4}px ${theme.space * 3}px`,
	}
})

const ArrowContainer = styled.div<SpaceSpecificProps>(({ theme, spaceName }) => {
	const { borderColor } = getSpaceBackgroundColors(spaceName, theme)

	return {
		rotate: '180deg',
		position: 'absolute',
		right: 13,
		bottom: -10,

		svg: {
			color: borderColor,
		},
	}
})

const FilterItemContainer = styled.div({
	display: 'flex',
	gap: 8,
	flexDirection: 'row',
	flexWrap: 'wrap',
})

function FilterItem({ spaceName, ...rest }: ComponentProps<typeof SmallButton> & SpaceSpecificProps) {
	const theme = useTheme()
	const { borderColor } = getSpaceBackgroundColors(spaceName, theme)

	return <SmallButton borderColor={borderColor} {...rest} />
}

type PredefinedQuery = {
	label: string
	filterState: FilterState
}

interface Props extends SpaceSpecificProps {
	predefinedQueries: PredefinedQuery[]
	onSetFilterState: (filterState: FilterState) => void
}

export function PredefinedQueriesContainer({ spaceName, onSetFilterState, predefinedQueries }: Props) {
	return (
		<Container spaceName={spaceName}>
			<Text variant="bodySemibold" as="h2">
				Preset {spaceName} queries
			</Text>
			<Spacer height={4} />
			<Text>
				These queries will help you get a better idea of how to structure your own searches, as well as what kinds of
				data you can find within Geo.
			</Text>
			<Spacer height={20} />
			<FilterItemContainer>
				{predefinedQueries.map(({ filterState, label }) => {
					return (
						<FilterItem
							key={label}
							spaceName={spaceName}
							onClick={() => {
								onSetFilterState(filterState)
							}}
						>
							{label}
						</FilterItem>
					)
				})}
			</FilterItemContainer>
			<ArrowContainer spaceName={spaceName}>
				<CaretUp />
			</ArrowContainer>
		</Container>
	)
}
