import * as React from "react"

import {cn} from "@/lib/utils"

function Input({className, type, ...props}: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"h-10 file:text-primary-text placeholder:text-secondary-light selection:bg-primary-cta selection:text-primary-black dark:bg-input/30 flex w-full min-w-0 rounded-full bg-primary-black px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
				"focus-visible:ring-primary-cta focus-visible:ring-[3px]",
				className,
			)}
			{...props}
		/>
	)
}

export {Input}
