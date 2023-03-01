import { SYSTEM_IDS } from '@geogenesis/ids';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import { useActionsStoreContext } from '~/modules/action';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Input } from '~/modules/design-system/input';
import { TextButton } from '~/modules/design-system/text-button';
import { useEntityTable } from '~/modules/entity';
import { ID } from '~/modules/id';
import { Triple } from '~/modules/triple';
import { FilterState, Triple as TripleType } from '~/modules/types';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { ResultItem, ResultsList } from '../entity/autocomplete/results-list';

const MotionContent = motion(PopoverPrimitive.Content);

interface Props {
  inputContainerWidth: number;
  filterState: FilterState;
  setFilterState: (filterState: FilterState) => void;
  spaceId: string;
}

export function TypeDialog({ inputContainerWidth, spaceId }: Props) {
  const entityTableStore = useEntityTable();
  const ActionStore = useActionsStoreContext();
  const { isEditor } = useAccessControl(spaceId);

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const filteredTypes = entityTableStore.types.filter(type =>
    (type.entityName || '').toLowerCase().includes(filter.toLowerCase())
  );

  const hasResults = filteredTypes.length >= 1;

  const handleSelect = (type: TripleType) => {
    entityTableStore.setType(type);
    setOpen(false);
  };

  const handleCreateType = () => {
    const newId = ID.createEntityId();
    const nameTriple = Triple.withId({
      space: spaceId,
      entityId: newId,
      entityName: filter,
      attributeId: 'name',
      attributeName: 'Name',
      value: { id: SYSTEM_IDS.NAME, type: 'string', value: filter },
    });
    const typeTriple = Triple.withId({
      space: spaceId,
      entityId: newId,
      entityName: filter,
      attributeId: SYSTEM_IDS.TYPES,
      attributeName: 'Types',
      value: {
        id: SYSTEM_IDS.SCHEMA_TYPE,
        type: 'entity',
        name: 'Type',
      },
    });
    ActionStore.create(nameTriple);
    ActionStore.create(typeTriple);
    setFilter('');
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className="flex w-[230px] flex-none items-center justify-between whitespace-pre rounded bg-white py-2 px-3 text-button text-text shadow-inner-grey-02 placeholder-shown:text-text hover:cursor-pointer hover:shadow-inner-text focus:shadow-inner-lg-text focus:outline-none"
          aria-label="type-filter-dropdown"
        >
          {entityTableStore.selectedType?.entityName || 'No Types Found'}
          <Spacer width={8} />
          <ChevronDownSmall color="ctaPrimary" />
        </button>
      </PopoverPrimitive.Trigger>
      <AnimatePresence mode="wait">
        {open ? (
          <MotionContent
            forceMount={true} // We force mounting so we can control exit animations through framer-motion
            initial={{ opacity: 0, y: -10 }}
            exit={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            className="z-100 w-full self-start rounded border border-grey-02 bg-white shadow-button md:mx-auto md:w-[98vw]"
            style={{ width: `calc(${inputContainerWidth}px / 2)` }}
            align="start"
            sideOffset={8}
          >
            {!hasResults && (
              <>
                <Spacer height={8} />
                <Text className="p-2" variant="smallButton">
                  Create new type
                </Text>
              </>
            )}
            <motion.div layout="position">
              <div className="flex flex-col p-2">
                <Input value={filter} onChange={e => setFilter(e.currentTarget.value)} />
              </div>
            </motion.div>
            {hasResults && (
              <Text className="p-2" variant="smallButton">
                All types
              </Text>
            )}
            <ResultsList>
              {filteredTypes.map(type => (
                <ResultItem onClick={() => handleSelect(type)} key={type.id}>
                  {type.entityName}
                </ResultItem>
              ))}
              <div className="flex justify-between pt-2">
                <Text variant="smallButton" color="grey-04">
                  {filteredTypes.length} Types
                </Text>
                <div className="flex gap-2">
                  <TextButton className="cursor-pointer">Add from space</TextButton>
                  <TextButton className="cursor-pointer">Create type</TextButton>
                </div>
              </div>
            </ResultsList>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
