import {motion} from "framer-motion"
import React from "react"
import {useDragScrollAnimated} from "@/hooks/use-drag-scroll-animated"
import {cn} from "@/lib/utils"

interface ScrollableProps {
	children: React.ReactNode
	className?: string
	gap?: string
	springOptions?: {
		stiffness?: number
		damping?: number
		mass?: number
	}
}

export function Scrollable({children, className, gap = "gap-3", springOptions}: ScrollableProps) {
	const scrollRef = useDragScrollAnimated(springOptions)

	return (
		<motion.div
			ref={scrollRef}
			className={cn("flex overflow-x-auto select-none focus:outline-none", gap, className)}
			style={{scrollbarWidth: "none", msOverflowStyle: "none"}}
		>
			{children}
		</motion.div>
	)
}
