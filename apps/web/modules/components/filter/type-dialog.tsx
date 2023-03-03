import { SYSTEM_IDS } from '@geogenesis/ids';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import { useAccessControl } from '~/modules/auth/use-access-control';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Input } from '~/modules/design-system/input';
import { TextButton } from '~/modules/design-system/text-button';
import { useEntityTable } from '~/modules/entity';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { useEditable } from '~/modules/stores/use-editable';
import { Entity, Triple as TripleType } from '~/modules/types';
import { Spacer } from '../../design-system/spacer';
import { Text } from '../../design-system/text';
import { ResultContent, ResultItem, ResultsList } from '../entity/autocomplete/results-list';

const MotionContent = motion(PopoverPrimitive.Content);

interface Props {
  inputContainerWidth: number;
  spaceId: string;
}

type TypeDialogMode = 'current-space' | 'foreign-space';

export function TypeDialog({ inputContainerWidth, spaceId }: Props) {
  const autocomplete = useAutocomplete({
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      { field: 'not-space-id', value: spaceId },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.SCHEMA_TYPE,
      },
    ],
  });
  const entityTableStore = useEntityTable();
  const { isEditor } = useAccessControl(spaceId);
  const { editable } = useEditable();
  const { spaces } = useSpaces();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [mode, setMode] = useState<TypeDialogMode>('current-space');

  const filteredTypes = entityTableStore.types.filter(type =>
    (type.entityName || '').toLowerCase().includes(entityName.toLowerCase())
  );

  const handleSearchChange = (value: string) => {
    if (mode === 'foreign-space') {
      autocomplete.onQueryChange(value);
    }
    setEntityName(value);
  };

  const updateMode = (mode: TypeDialogMode) => {
    setMode(mode);
    if (mode === 'foreign-space') {
      autocomplete.onQueryChange(entityName);
    }
  };

  const handleSelect = (type: TripleType) => {
    entityTableStore.setType(type);
    setOpen(false);
  };

  const createForeignType = (typeEntity: Entity) => {
    const foreignTypeTriple = typeEntity.triples.find(
      triple => triple.attributeId === SYSTEM_IDS.TYPES && triple.value.id === SYSTEM_IDS.SCHEMA_TYPE
    );

    if (!foreignTypeTriple) return;

    entityTableStore.createForeignType(foreignTypeTriple);
    entityTableStore.setType(foreignTypeTriple);
    setEntityName('');
    setOpen(false);
  };

  const createType = () => {
    if (entityName.length === 0) {
      return;
    }
    const newType = entityTableStore.createType(entityName);
    entityTableStore.setType(newType);
    setEntityName('');
    setOpen(false);
  };

  const spaceTypeIds = entityTableStore.types.map(type => type.entityId);

  // Prevent non-types or current space types from showing up in the autocomplete results
  const filteredAutocompleteResults = autocomplete.results.filter(result => {
    const typeIds = result.triples.map(triple => triple.value.id);
    return !spaceTypeIds.includes(result.id) && typeIds.includes(SYSTEM_IDS.SCHEMA_TYPE);
  });

  const resultCount = mode === 'current-space' ? filteredTypes.length : filteredAutocompleteResults.length;

  const noResultsFound =
    (mode === 'current-space' && filteredTypes.length === 0) ||
    (mode === 'foreign-space' && filteredAutocompleteResults.length === 0);

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
            <div className="flex items-center justify-between p-2">
              <Text variant="smallButton">
                {mode === 'current-space' ? 'All types' : 'Add type from another space'}
              </Text>
              {mode === 'foreign-space' ? (
                <TextButton onClick={() => updateMode('current-space')}>Back</TextButton>
              ) : null}
            </div>
            <motion.div layout="position" className="px-2">
              <Input value={entityName} onChange={e => handleSearchChange(e.currentTarget.value)} />
            </motion.div>
            <ResultsList className="max-h-96 overflow-y-auto px-0">
              {mode === 'current-space'
                ? filteredTypes.map(type => (
                    <ResultItem onClick={() => handleSelect(type)} key={type.id}>
                      {type.entityName}
                    </ResultItem>
                  ))
                : filteredAutocompleteResults.map((result, i) => (
                    <ResultContent
                      key={result.id}
                      onClick={() => {
                        createForeignType(result);
                      }}
                      alreadySelected={filteredTypes.some(type => type.id === result.id)}
                      result={result}
                      spaces={spaces}
                    />
                  ))}
            </ResultsList>
            {noResultsFound && <Spacer height={8} />}
            <div className="flex justify-between border-t border-grey-02 px-2 pt-2 pb-2">
              <Text variant="smallButton" color="grey-04">
                {resultCount} Types
              </Text>
              {isEditor && editable && (
                <div className="flex gap-2">
                  <TextButton onClick={() => updateMode('foreign-space')} className="cursor-pointer">
                    Add from space
                  </TextButton>
                  <TextButton className="cursor-pointer" onClick={createType}>
                    Create type
                  </TextButton>
                </div>
              )}
            </div>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
