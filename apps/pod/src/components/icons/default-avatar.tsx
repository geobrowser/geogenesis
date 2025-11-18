export type Props = {
	className?: string
}

export function DefaultAvatar({className}: Props) {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 20 20"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<circle cx="10" cy="5" r="3.5" stroke="#E1DCCE" />
			<path
				d="M17 19C17 15.134 13.866 12 10 12C6.13401 12 3 15.134 3 19"
				stroke="url(#paint0_linear_2585_14429)"
			/>
			<defs>
				<linearGradient
					id="paint0_linear_2585_14429"
					x1="10"
					y1="12"
					x2="10"
					y2="19"
					gradientUnits="userSpaceOnUse"
				>
					<stop stop-color="#F6F6F6" />
					<stop offset="1" stop-color="#F6F6F6" stop-opacity="0" />
				</linearGradient>
			</defs>
		</svg>
	)
}
