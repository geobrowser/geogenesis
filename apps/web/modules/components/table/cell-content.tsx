import Link from 'next/link';
import { Text } from '../../design-system/text';
import { Truncate } from '../../design-system/truncate';

interface Props {
  value: string;
  isExpanded?: boolean;
  isEntity?: boolean;
  href?: string;
}

export function CellContent({ isExpanded, value, isEntity, href }: Props) {
  const content = href ? (
    <Link href={href} passHref>
      <a className="inline-block text-tableCell text-ctaPrimary transition-colors duration-150 ease-in-out hover:text-ctaHover hover:underline hover:decoration-ctaHover">
        {value}
      </a>
    </Link>
  ) : (
    <Text variant="tableCell">{value}</Text>
  );

  return (
    <Truncate maxLines={isEntity ? 1 : 3} shouldTruncate={!isExpanded}>
      {content}
    </Truncate>
  );
}
