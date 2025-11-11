import {Slot} from "@radix-ui/react-slot"
import {cva, type VariantProps} from "class-variance-authority"
import * as React from "react"

import {cn} from "@/lib/utils"

export const tabVariants = cva(
	"text-button inline-flex items-center justify-center rounded-full font-bold border px-4 h-8 w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
	{
		variants: {
			variant: {
				default: "border-transparent bg-primary-cta text-primary-black [a&]:hover:bg-primary-cta/90",
				secondary: "border-transparent bg-secondary-darkest text-primary-text [a&]:hover:bg-primary-black/90",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
)

export function Tab({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof tabVariants> & {asChild?: boolean}) {
	const Comp = asChild ? Slot : "span"

	return <Comp data-slot="badge" className={cn(tabVariants({variant}), className)} {...props} />
}
