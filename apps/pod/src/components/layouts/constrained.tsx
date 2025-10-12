type Props = {
	children: React.ReactNode
}

/**
 * Not all screens in the app have the same width. Some span the
 * entire screen while others might have a max-width
 */
export function ConstrainedLayout({children}: Props) {
	return <div className="max-w-[1568px] mx-auto px-5 py-[70px]">{children}</div>
}
