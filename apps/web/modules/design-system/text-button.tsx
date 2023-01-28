import { cva, VariantProps } from 'class-variance-authority';

const buttonStyles = cva(
  'flex items-center bg-transparent outline-none hover:text-ctaHover hover:outline-none focus:outline-none',
  {
    variants: {
      disabled: {
        true: 'cursor-not-allowed text-grey-04',
      },
    },
  }
);

interface Props extends VariantProps<typeof buttonStyles> {
  children: React.ReactNode;
}

export function TextButton({ children, disabled = false }: Props) {
  return <button className={buttonStyles({ disabled })}>{children}</button>;
}
