import { Dropdown } from '../design-system/dropdown'
import { useAccessControl } from '../state/use-access-control'
import { useEditable } from '../state/use-editable'

interface Props {
	spaceId: string
}

export function EditToggle({ spaceId }: Props) {
	const { isEditor } = useAccessControl(spaceId)
	const { setEditable, editable } = useEditable()

	const options = [
		{
			label: 'Browse mode',
			value: 'browse-mode',
			disabled: false,
			onClick: () => setEditable(false),
		},
		{
			label: 'Edit mode',
			value: 'edit-mode',
			disabled: !isEditor,
			onClick: () => isEditor && setEditable(true),
		},
	]

	return <Dropdown value={editable ? 'Edit mode' : 'Browse mode'} options={options} />
}
