interface Props {
  onClick: () => void
  className?: string
  isActive: boolean
  children: React.ReactNode
}

export function MenuItem({ onClick, className, children, isActive }: Props) {
  return (
    <button
      onClick={onClick}
      className={`p-1 rounded ${className} ${isActive && 'bg-blue-200'}`}
    >
      {children}
    </button>
  )
}
