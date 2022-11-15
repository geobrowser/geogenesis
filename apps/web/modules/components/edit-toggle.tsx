import { useRouter } from 'next/router';
import { Dropdown } from '../design-system/dropdown';
import { useAccessControl } from '../state/use-access-control';
import { useEditable } from '../state/use-editable';

interface Props {
  spaceId: string;
}

export function EditToggle({ spaceId }: Props) {
  const { isEditor } = useAccessControl(spaceId);
  const { setEditable, editable } = useEditable();

  const options = [
    {
      label: 'Browse mode',
      value: 'browse-mode',
      disabled: false,
    },
    {
      label: 'Edit mode',
      value: 'edit-mode',
      disabled: !isEditor,
    },
  ];

  const onChange = (value: string) => setEditable(value === 'edit-mode');

  return <Dropdown value={editable ? 'edit-mode' : 'browse-mode'} options={options} onChange={onChange} />;
}
