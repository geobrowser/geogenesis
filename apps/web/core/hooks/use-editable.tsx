import { EditableStoreActions } from '../state/editable-store';
import { useGeoDispatch } from './use-dispatch';
import { useGeoSelector } from './use-selector';

export function useEditable() {
  const isEditing = useGeoSelector(state => state.isEditing);
  const dispatch = useGeoDispatch();

  return {
    editable: isEditing,
    setEditable: (value: boolean) => dispatch(EditableStoreActions.setEditable(value)),
  };
}
