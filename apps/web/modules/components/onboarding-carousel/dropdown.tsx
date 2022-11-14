import { Select } from '~/modules/design-system/select';

const SelectOptions = [
  {
    label: 'Collect data',
    value: 'collect-data',
  },
  {
    label: 'Organize data',
    value: 'organize-data',
  },
  {
    label: 'Empower communities',
    value: 'empower-communities',
  },
  {
    label: 'Solve real problem',
    value: 'solve-real-problem',
  },
];

export function OnboardingDropdown() {
  return <Select value="collect-data" options={SelectOptions} onChange={value => {}} />;
}
