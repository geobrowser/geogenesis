import {Slot} from "@radix-ui/react-slot"
import {cva, type VariantProps} from "class-variance-authority"
import * as React from "react"

import {cn} from "@/lib/utils"

export const tagVariants = cva(
	"text-caption font-medium inline-flex items-center justify-center rounded-full border px-3 h-[30px] w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none gap-2 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
	{
		variants: {
			variant: {
				default: "border-transparent bg-secondary-dark text-secondary-light [a&]:hover:bg-secondary-light/90",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
)

export function Tag({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof tagVariants> & {asChild?: boolean}) {
	const Comp = asChild ? Slot : "span"

	return <Comp data-slot="badge" className={cn(tagVariants({variant}), className)} {...props} />
}
