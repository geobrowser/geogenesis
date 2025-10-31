import {useMotionValue, useSpring} from "framer-motion"
import {useEffect, useRef} from "react"
import {useMobile} from "./use-mobile"

interface UseDragScrollAnimatedOptions {
	stiffness?: number
	damping?: number
	mass?: number
}

/**
 * A React hook that provides smooth drag-to-scroll functionality with spring animations and momentum.
 *
 * This hook creates an enhanced horizontal scrolling experience by combining:
 * 1. Mouse drag interactions (with grab cursor states)
 * 2. Touch gestures for mobile devices
 * 3. Keyboard navigation (arrow keys with continuous scrolling)
 * 4. Framer Motion spring physics for smooth animations
 * 5. Momentum-based scrolling that continues after drag release
 *
 * Requirements:
 * - Must distinguish between clicks and drags using a movement threshold
 * - Must provide smooth spring-based animations for all scroll movements
 * - Must support both mouse and touch interactions seamlessly
 * - Must implement keyboard navigation with left/right arrow keys
 * - Must prevent accidental link navigation when dragging
 * - Must apply momentum scrolling based on drag velocity
 * - Must respect scroll boundaries and clamp values appropriately
 * - Must provide appropriate cursor states (grab/grabbing)
 * - Must handle continuous keyboard scrolling with proper cleanup
 *
 * Algorithm Overview:
 * - Tracks drag state and calculates velocity during mouse/touch movements
 * - Uses a drag threshold to distinguish between clicks and actual drags
 * - Applies spring animations via Framer Motion's useSpring for natural movement
 * - Implements momentum scrolling by calculating velocity and applying it as additional scroll distance
 * - Prevents link clicks when dragging has occurred to avoid accidental navigation
 * - Clamps scroll values to valid bounds (0 to scrollWidth - clientWidth)
 * - Provides keyboard support with smooth continuous scrolling via intervals
 *
 * @param options - Configuration for spring physics (stiffness, damping, mass)
 * @returns A ref to attach to the scrollable element
 */
export function useDragScrollAnimated(options: UseDragScrollAnimatedOptions = {}) {
	const {stiffness = 300, damping = 30, mass = 0.5} = options

	const ref = useRef<HTMLDivElement>(null)
	const isMobile = useMobile()
	const scrollX = useMotionValue(0)
	const springScrollX = useSpring(scrollX, {
		stiffness,
		damping,
		mass,
	})

	useEffect(() => {
		const element = ref.current
		if (!element) return

		let isDragging = false
		let hasMoved = false
		let startX = 0
		let scrollStart = 0
		const dragThreshold = 3

		// Velocity tracking for momentum
		let lastMoveTime = 0
		let lastMoveX = 0
		let velocity = 0

		const onMouseDown = (e: MouseEvent) => {
			isDragging = true
			hasMoved = false
			startX = e.clientX
			scrollStart = scrollX.get()
			lastMoveTime = Date.now()
			lastMoveX = e.clientX
			velocity = 0
			element.style.cursor = "grabbing"
			document.body.style.userSelect = "none"
		}

		const onMouseMove = (e: MouseEvent) => {
			if (!isDragging) return

			const deltaX = Math.abs(e.clientX - startX)
			if (deltaX > dragThreshold) {
				hasMoved = true
				e.preventDefault()

				// Calculate velocity
				const currentTime = Date.now()
				const timeDelta = currentTime - lastMoveTime
				if (timeDelta > 0) {
					velocity = (e.clientX - lastMoveX) / timeDelta
				}
				lastMoveTime = currentTime
				lastMoveX = e.clientX

				const newScrollX = scrollStart - (e.clientX - startX)
				scrollX.set(Math.max(0, Math.min(element.scrollWidth - element.clientWidth, newScrollX)))
			}
		}

		const onMouseUp = (e: MouseEvent) => {
			if (isDragging && hasMoved) {
				const target = e.target as HTMLElement
				const link = target.closest("a")
				if (link) {
					e.preventDefault()
					e.stopPropagation()
				}

				// Apply momentum based on velocity
				if (Math.abs(velocity) > 0.1) {
					// Only if there's significant velocity
					const currentScrollX = scrollX.get()
					const momentumDistance = -velocity * 200 // Multiply by factor for momentum distance
					const targetScrollX = currentScrollX + momentumDistance
					const clampedTargetX = Math.max(
						0,
						Math.min(element.scrollWidth - element.clientWidth, targetScrollX),
					)
					scrollX.set(clampedTargetX)
				}
			}
			isDragging = false
			hasMoved = false
			element.style.cursor = "grab"
			document.body.style.userSelect = ""
		}

		let keyScrollInterval: NodeJS.Timeout | null = null

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				e.preventDefault()

				if (keyScrollInterval) return

				const scrollDirection = e.key === "ArrowLeft" ? -1 : 1
				const scrollAmount = 15

				const animateScroll = () => {
					const currentX = scrollX.get()
					const newX = currentX + scrollDirection * scrollAmount
					const clampedX = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, newX))
					scrollX.set(clampedX)
				}

				animateScroll()
				keyScrollInterval = setInterval(animateScroll, 7)
			}
		}

		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				if (keyScrollInterval) {
					clearInterval(keyScrollInterval)
					keyScrollInterval = null
				}
			}
		}

		const onTouchStart = (e: TouchEvent) => {
			if (!e.touches[0]) return
			isDragging = true
			hasMoved = false
			startX = e.touches[0].clientX
			scrollStart = scrollX.get()
			lastMoveTime = Date.now()
			lastMoveX = e.touches[0].clientX
			velocity = 0
		}

		const onTouchMove = (e: TouchEvent) => {
			if (!isDragging || !e.touches[0]) return

			const deltaX = Math.abs(e.touches[0].clientX - startX)
			if (deltaX > dragThreshold) {
				hasMoved = true
				e.preventDefault()

				// Calculate velocity
				const currentTime = Date.now()
				const timeDelta = currentTime - lastMoveTime
				if (timeDelta > 0) {
					velocity = (e.touches[0].clientX - lastMoveX) / timeDelta
				}
				lastMoveTime = currentTime
				lastMoveX = e.touches[0].clientX

				const newScrollX = scrollStart - (e.touches[0].clientX - startX)
				scrollX.set(Math.max(0, Math.min(element.scrollWidth - element.clientWidth, newScrollX)))
			}
		}

		const onTouchEnd = (e: TouchEvent) => {
			if (isDragging && hasMoved) {
				const target = e.target as HTMLElement
				const link = target.closest("a")
				if (link) {
					e.preventDefault()
					e.stopPropagation()
				}

				// Apply momentum based on velocity
				if (Math.abs(velocity) > 0.1) {
					// Only if there's significant velocity
					const currentScrollX = scrollX.get()
					const momentumDistance = -velocity * 200 // Multiply by factor for momentum distance
					const targetScrollX = currentScrollX + momentumDistance
					const clampedTargetX = Math.max(
						0,
						Math.min(element.scrollWidth - element.clientWidth, targetScrollX),
					)
					scrollX.set(clampedTargetX)
				}
			}
			isDragging = false
			hasMoved = false
		}

		element.style.cursor = "grab"
		element.tabIndex = 0

		element.addEventListener("mousedown", onMouseDown)
		element.addEventListener("keydown", onKeyDown)
		element.addEventListener("keyup", onKeyUp)
		document.addEventListener("mousemove", onMouseMove)
		document.addEventListener("mouseup", onMouseUp)

		if (isMobile) {
			element.addEventListener("touchstart", onTouchStart, {passive: false})
			document.addEventListener("touchmove", onTouchMove, {passive: false})
			document.addEventListener("touchend", onTouchEnd)
		}

		return () => {
			if (keyScrollInterval) clearInterval(keyScrollInterval)
			element.removeEventListener("mousedown", onMouseDown)
			element.removeEventListener("keydown", onKeyDown)
			element.removeEventListener("keyup", onKeyUp)
			document.removeEventListener("mousemove", onMouseMove)
			document.removeEventListener("mouseup", onMouseUp)

			if (isMobile) {
				element.removeEventListener("touchstart", onTouchStart)
				document.removeEventListener("touchmove", onTouchMove)
				document.removeEventListener("touchend", onTouchEnd)
			}
		}
	}, [isMobile, scrollX])

	useEffect(() => {
		const element = ref.current
		if (!element) return

		const unsubscribe = springScrollX.on("change", (latest) => {
			element.scrollLeft = latest
		})

		return unsubscribe
	}, [springScrollX])

	return ref
}
