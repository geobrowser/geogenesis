import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Content, Root, Trigger, Portal } from '@radix-ui/react-popover';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { TableBlockFilter } from './table-block-store';
import { TripleValueType, Entity } from '~/modules/types';
import { TextButton } from '~/modules/design-system/text-button';
import { Spacer } from '~/modules/design-system/spacer';
import { Select } from '~/modules/design-system/select';
import { Input } from '~/modules/design-system/input';
import { ResizableContainer } from '~/modules/design-system/resizable-container';
import { ResultContent, ResultsList } from '~/modules/components/entity/autocomplete/results-list';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';

interface TableBlockFilterPromptProps {
  trigger: React.ReactNode;
  options: (TableBlockFilter & { columnName: string })[];
  onCreate: (filter: { columnId: string; value: string; valueType: TripleValueType; valueName: string | null }) => void;
}

const TableBlockFilterPromptContent = motion(Content);

export function TableBlockFilterPrompt({ trigger, onCreate, options }: TableBlockFilterPromptProps) {
  const [open, setOpen] = React.useState(false);

  const [selectedColumn, setSelectedColumn] = React.useState<string>(SYSTEM_IDS.NAME);
  const [value, setValue] = React.useState<
    | string
    | {
        entityId: string;
        entityName: string | null;
      }
  >('');

  const onOpenChange = (open: boolean) => {
    setSelectedColumn(SYSTEM_IDS.NAME);
    setValue('');
    setOpen(open);
  };

  const onDone = () => {
    console.log('onDone', { selectedColumn, value });

    onCreate({
      columnId: selectedColumn,
      value: typeof value === 'string' ? value : value.entityId,
      valueType: options.find(o => o.columnId === selectedColumn)?.valueType ?? 'string',
      valueName: typeof value === 'string' ? null : value.entityName,
    });
    setOpen(false);
    setSelectedColumn(SYSTEM_IDS.NAME);
    setValue('');
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger>{trigger}</Trigger>
      <Portal>
        <AnimatePresence>
          {open && (
            <TableBlockFilterPromptContent
              forceMount={true}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: 0.1,
                ease: 'easeInOut',
              }}
              avoidCollisions={true}
              className="z-10 w-[472px] origin-top-left rounded border border-grey-02 bg-white p-2 shadow-lg"
              sideOffset={8}
              align="start"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-smallButton">New filter</span>
                  <TextButton onClick={onDone}>Done</TextButton>
                </div>

                <Spacer height={12} />

                <div className="flex items-center justify-center gap-3">
                  <div className="flex flex-1">
                    <Select
                      options={options.map(o => ({ value: o.columnId, label: o.columnName }))}
                      value={selectedColumn}
                      onChange={fieldId => {
                        setSelectedColumn(fieldId);
                        setValue('');
                      }}
                    />
                  </div>
                  <span className="rounded bg-divider px-3 py-[8.5px] text-button">Is</span>
                  <div className="relative flex flex-1">
                    {selectedColumn === SYSTEM_IDS.SPACE ? (
                      <TableBlockEntityFilterInput
                        selectedValue={typeof value === 'string' ? '' : value.entityName ?? ''}
                        onSelect={r => {
                          const selectedSpace = r.triples.find(t => t.attributeId === SYSTEM_IDS.SPACE);
                          if (!selectedSpace) return;

                          const spaceId = selectedSpace?.value.type === 'string' ? selectedSpace.value.value : '';

                          setValue({
                            entityId: spaceId,
                            entityName: r.name,
                          });
                        }}
                      />
                    ) : options.find(o => o.columnId === selectedColumn)?.valueType === 'entity' ? (
                      <TableBlockEntityFilterInput
                        selectedValue={typeof value === 'string' ? '' : value.entityName ?? ''}
                        onSelect={r =>
                          setValue({
                            entityId: r.id,
                            entityName: r.name,
                          })
                        }
                      />
                    ) : (
                      <Input
                        value={typeof value === 'string' ? value : ''}
                        onChange={e => setValue(e.currentTarget.value)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </TableBlockFilterPromptContent>
          )}
        </AnimatePresence>
      </Portal>
    </Root>
  );
}

interface TableBlockEntityFilterInputProps {
  onSelect: (result: Entity) => void;
  selectedValue: string;
}

function TableBlockEntityFilterInput({ onSelect, selectedValue }: TableBlockEntityFilterInputProps) {
  const autocomplete = useAutocomplete();
  const { spaces } = useSpaces();

  return (
    <div className="relative w-full">
      <Input
        value={autocomplete.query === '' ? selectedValue : autocomplete.query}
        onChange={e => autocomplete.onQueryChange(e.target.value)}
      />
      {autocomplete.query && (
        <div className="absolute top-[36px] z-[1] flex max-h-[340px] w-[254px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02">
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {autocomplete.results.map((result, i) => (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  key={result.id}
                >
                  <ResultContent
                    key={result.id}
                    onClick={() => {
                      autocomplete.onQueryChange('');
                      onSelect(result);
                    }}
                    spaces={spaces}
                    alreadySelected={false}
                    result={result}
                  />
                </motion.div>
              ))}
            </ResultsList>
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}
