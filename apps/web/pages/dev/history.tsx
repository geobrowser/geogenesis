import { HistoryItem } from '~/modules/components/history';
import { HistoryPanel } from '~/modules/components/history/history-panel';
import { makeStubTriple } from '~/modules/services/mock-network';

const items = [
  {
    id: 'alksjdalkj',
    name: 'Amended the title',
    createdBy: {
      id: '0x66703c058795B9Cb215fbcc7c6b07aee7D216F24',
      name: 'Yaniv Tal',
    },
    createdAt: Date.now(),
    actions: [
      {
        type: 'createTriple' as const,
        ...makeStubTriple('Alice'),
      },
    ],
  },
  {
    id: 'a0s7dakjhds',
    name: 'Created a page for ending homelessness',
    createdBy: {
      id: '0x66703c058795B9Cb215fbcc7c6b07aee7D216F30',
      name: 'Nate Walpole',
    },
    createdAt: Date.now() - 2348395873,
    actions: [
      {
        type: 'createTriple' as const,
        ...makeStubTriple('Alice'),
      },
    ],
  },
];

export default function HistoryPage() {
  // @TODO: Fetch versions when we load EntityPage? Or when the user clicks the history button?

  return (
    <div>
      <HistoryPanel>
        {items.map(item => (
          <HistoryItem key={item.id} version={item} />
        ))}
      </HistoryPanel>
    </div>
  );
}
