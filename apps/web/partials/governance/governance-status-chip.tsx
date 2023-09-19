import { GeoDate } from '~/core/utils/utils';

interface Props {
  status: 'ACCEPTED' | 'REJECTED';
  date: number; // UNIX timestamp
}

export function GovernanceStatusChip({ status, date }: Props) {
  const formattedDate = GeoDate.fromGeoTime(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  switch (status) {
    case 'ACCEPTED':
      return (
        <span className="rounded-sm bg-green px-2 py-1.5 text-smallButton text-white">Accepted · {formattedDate}</span>
      );
    case 'REJECTED':
      throw new Error('Rejected proposal not implemented yet');
  }
}
