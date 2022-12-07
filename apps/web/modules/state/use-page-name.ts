import { observable } from '@legendapp/state'
import { useSelector } from '@legendapp/state/react'
import { useCallback } from 'react'

const pageName$ = observable('')

export function usePageName() {
	const pageName = useSelector(pageName$)

	const setPageName = useCallback((newName: string) => {
		pageName$.set(newName)
	}, [])

	return {
		pageName,
		setPageName,
	}
}
