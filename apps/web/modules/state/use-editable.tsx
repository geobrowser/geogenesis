import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';

const editable$ = observable(false);

export const useEditable = () => {
  const editable = useSelector(editable$);

  return {
    editable,
    setEditable: (value: boolean) => editable$.set(value),
  };
};
