import * as React from "react"

/**
 * Custom hook that provides a debounced value and setter
 * @param options - Configuration object
 * @param options.callback - The callback function to run after the debounce delay
 * @param options.delay - Debounce delay in milliseconds (default: 300)
 * @param options.initialValue - Initial value for the state
 * @returns Object with value and setValue
 */
export function useDebounceEffect<T>(options: {callback: (value: T) => void; delay?: number; initialValue?: T}): {
	value: T | undefined
	setValue: (value: T) => void
} {
	const {callback, delay = 300, initialValue} = options
	const [value, setValue] = React.useState<T | undefined>(initialValue)
	const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const callbackRef = React.useRef(callback)

	// Update callback ref when it changes
	React.useEffect(() => {
		callbackRef.current = callback
	}, [callback])

	React.useEffect(() => {
		if (value !== undefined) {
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current)
			}

			timeoutRef.current = setTimeout(() => {
				callbackRef.current(value)
			}, delay)
		}

		return () => {
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current)
			}
		}
	}, [value, delay])

	return {value, setValue}
}
