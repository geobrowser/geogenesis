import { HistoryItem } from '~/modules/components/history';

const item = {
  name: 'Amended the title',
  createdBy: {
    id: '0x66703c058795B9Cb215fbcc7c6b07aee7D216F24',
    name: 'Yaniv Tal',
  },
  createdAt: Date.now(),
  actions: [],
};

export default function HistoryPage() {
  return (
    <div className="w-[360px]">
      <HistoryItem {...item} />
    </div>
  );
}
