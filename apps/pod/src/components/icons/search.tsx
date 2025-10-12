type Props = {
	className?: string
}

export function Search({className}: Props) {
	return (
		<svg
			width="20"
			height="21"
			viewBox="0 0 20 21"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path d="M12.4583 12.9583L19.1666 19.6666" stroke="#E1DCCE" strokeLinecap="round" />
			<circle cx="7.28335" cy="7.78335" r="6.78335" stroke="#E1DCCE" />
		</svg>
	)
}
