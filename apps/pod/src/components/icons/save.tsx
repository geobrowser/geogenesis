type Props = {
	className?: string
}

export function Save({className}: Props) {
	return (
		<svg
			width="17"
			height="17"
			viewBox="0 0 17 17"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path
				className="stroke-current"
				d="M4.85718 0.833008H12.8572C14.5139 0.833008 15.857 2.1763 15.8572 3.83301V13.8818C15.857 14.699 14.9302 15.1711 14.2693 14.6904L9.44604 11.1826C9.09539 10.9276 8.61994 10.9276 8.26929 11.1826L3.44604 14.6904C2.78513 15.1711 1.85733 14.699 1.85718 13.8818V3.83301C1.85735 2.17641 3.20058 0.833184 4.85718 0.833008Z"
				strokeWidth="0.666667"
				strokeLinecap="round"
			/>
		</svg>
	)
}
