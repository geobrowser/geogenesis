export type Props = {
	className?: string
}

export function Discover({className}: Props) {
	return (
		<svg
			width="17"
			height="17"
			viewBox="0 0 17 17"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<circle className="stroke-current" cx="8.85742" cy="8.5" r="7.5" />
			<path
				className="fill-current"
				d="M8.3028 7.99874L4.64308 13.4883C4.11282 14.2837 4.5672 15.3623 5.50676 15.5384L8.73464 16.1437C8.81584 16.1589 8.89916 16.1589 8.98036 16.1437L12.2082 15.5384C13.1478 15.3623 13.6022 14.2837 13.0719 13.4883L9.4122 7.99874C9.14832 7.60292 8.56668 7.60291 8.3028 7.99874Z"
			/>
		</svg>
	)
}
