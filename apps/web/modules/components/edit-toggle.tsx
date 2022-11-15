import { Select } from '../design-system/select';

const OPTIONS = [
  {
    label: 'Browse mode',
    value: 'browse-mode',
  },
  {
    label: 'Edit mode',
    value: 'edit-mode',
  },
];

export function EditToggle() {
  return <Select value={OPTIONS[0].value} options={OPTIONS} onChange={() => {}} />;
}
