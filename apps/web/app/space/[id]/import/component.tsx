'use client';

import { parse } from 'csv/sync';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import * as React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { ID } from '~/core/id';
import { Entity as EntityType, Triple as TripleType } from '~/core/types';
import { Triple } from '~/core/utils/triple';
import { GeoDate } from '~/core/utils/utils';

import { Accordion } from '~/design-system/accordion';
import { EntitySearchAutocomplete } from '~/design-system/autocomplete/entity-search-autocomplete';
import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Date } from '~/design-system/icons/date';
import { Image } from '~/design-system/icons/image';
import { Relation } from '~/design-system/icons/relation';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { Text } from '~/design-system/icons/text';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { Url } from '~/design-system/icons/url';
import { Select } from '~/design-system/select';

dayjs.extend(utc);

type Props = {
  spaceId: string;
};

type SupportedValueType = 'string' | 'date' | 'url';

type EntityAttribute = {
  index: number;
  type: SupportedValueType;
  name: string;
};

type EntityAttributesType = Record<string, EntityAttribute>;

export const Component = ({ spaceId }: Props) => {
  const pathname = usePathname();
  const spacePath = pathname?.split('/import')[0] ?? '/spaces';
  const { create } = useActionsStore(spaceId);

  const [step, setStep] = useState<string>('step1');
  const [entityType, setEntityType] = useState<EntityType | undefined>(undefined);
  const { supportedAttributes, unsupportedAttributes } = useMemo(() => getAttributes(entityType), [entityType]);

  const [entityNameIndex, setEntityNameIndex] = useState<number | undefined>(undefined);
  const [entityAttributes, setEntityAttributes] = useState<EntityAttributesType>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const [file, setFile] = useState<string | undefined>(undefined);
  const [records, setRecords] = useState<Array<Array<string>>>([]);
  const headers = useMemo(() => records?.[0] ?? [], [records]);
  const examples = useMemo(() => records?.[1] ?? [], [records]);

  const handleProcessFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.currentTarget?.files?.[0]?.name);

    const reader = new FileReader();

    reader.onload = event => {
      if (!event?.target?.result) {
        return;
      }

      const { result } = event.target;

      const newRecords = parse(result as string, {
        delimiter: ',',
        skip_empty_lines: true,
        trim: true,
      });

      setRecords(newRecords);
    };

    if (event.currentTarget?.files?.[0]) {
      reader.readAsBinaryString(event.currentTarget?.files?.[0]);
    }

    setStep('step3');
  }, []);

  const handleReset = useCallback(() => {
    setEntityType(undefined);
    setEntityNameIndex(undefined);
    setEntityAttributes({});
    setFile(undefined);
    setRecords([]);
  }, []);

  const handleGenerateActions = useCallback(() => {
    const [, ...entities] = records;

    const generateActions = () => {
      entities.forEach(entity => {
        const newEntityId = ID.createEntityId();

        if (!entityNameIndex || !entityType) return;

        // Create new entity + set entity name
        create(
          Triple.withId({
            space: spaceId,
            entityId: newEntityId,
            entityName: entity[entityNameIndex] ?? '',
            attributeId: 'name',
            attributeName: 'Name',
            value: {
              type: 'string',
              id: ID.createValueId(),
              value: entity[entityNameIndex] ?? '',
            },
          })
        );

        // Create entity type
        create(
          Triple.withId({
            space: spaceId,
            entityId: newEntityId,
            entityName: entity[entityNameIndex] ?? '',
            attributeId: 'type',
            attributeName: 'Types',
            value: {
              type: 'entity',
              id: entityType.id,
              name: entityType.name,
            },
          })
        );

        // Create entity attribute values
        Object.keys(entityAttributes).forEach(attributeId => {
          if (entityAttributes[attributeId]?.type === 'date') {
            const attribute = entityAttributes[attributeId];

            if (!attribute) {
              return null;
            }

            const date = dayjs.utc(entity[attribute.index], 'MM/DD/YYYY');

            if (!date.isValid()) {
              return null;
            }

            const dateValue = GeoDate.toISOStringUTC({
              day: date.date().toString(),
              month: (date.month() + 1).toString(),
              year: date.year().toString(),
              hour: '0',
              minute: '0',
            });

            create(
              Triple.withId({
                space: spaceId,
                entityId: newEntityId,
                entityName: entity[entityNameIndex] ?? '',
                attributeId,
                attributeName: entityAttributes[attributeId]?.name ?? '',
                value: {
                  type: 'date' as SupportedValueType,
                  id: ID.createValueId(),
                  value: dateValue,
                },
              })
            );
          } else {
            const attribute = entityAttributes[attributeId];

            if (!attribute) {
              return null;
            }

            create(
              Triple.withId({
                space: spaceId,
                entityId: newEntityId,
                entityName: entity[entityNameIndex] ?? '',
                attributeId,
                attributeName: entityAttributes[attributeId]?.name ?? '',
                value: {
                  type: (entityAttributes[attributeId]?.type ?? 'string') as SupportedValueType,
                  id: ID.createValueId(),
                  value: entity[attribute.index] ?? '',
                },
              })
            );
          }
        });
      });
    };

    generateActions();
  }, [create, spaceId, records, entityNameIndex, entityType, entityAttributes]);

  const isGenerationReady = !!entityType?.id && records.length > 0 && typeof entityNameIndex === 'number';

  return (
    <div className="mx-auto max-w-3xl space-y-16 overflow-visible">
      <div className="space-y-4">
        <Link href={spacePath}>
          <SquareButton icon={<ArrowLeft />} />
        </Link>
        <div className="flex w-full items-center justify-between">
          <div className="text-mediumTitle">Import CSV data</div>
          <div className="inline-flex items-center gap-3">
            <Button onClick={handleReset} variant="ghost" icon={<RetrySmall />}>
              Reset form
            </Button>
            <Button onClick={handleGenerateActions} variant="primary" disabled={!isGenerationReady}>
              Generate
            </Button>
          </div>
        </div>
      </div>
      <Accordion type="single" value={step} onValueChange={setStep}>
        <Accordion.Item value="step1">
          <Accordion.Trigger>
            <div className="text-smallTitle">Step 1</div>

            <div className="mt-1 text-metadata">
              {!entityType ? `Choose a type to add data to` : `Type: ${entityType.name}`}
            </div>
          </Accordion.Trigger>
          <Accordion.Content>
            <div className="inline-flex items-center gap-1.5">
              {entityType ? (
                <>
                  <div className="text-smallButton">{entityType.name}</div>
                  <SquareButton onClick={() => setEntityType(undefined)} icon={<Trash />} />
                </>
              ) : (
                <EntitySearchAutocomplete
                  spaceId={spaceId}
                  placeholder="Select entity type..."
                  onDone={result => {
                    setEntityType(result as EntityType);
                    setStep('step2');
                  }}
                  itemIds={[]}
                />
              )}
            </div>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="step2" disabled={!entityType}>
          <Accordion.Trigger>
            <div className="text-smallTitle">Step 2</div>
            <div className="mt-1 text-metadata">{!file ? `Upload your CSV to add the data` : `Uploaded: ${file}`}</div>
          </Accordion.Trigger>
          <Accordion.Content>
            <div className="inline-flex items-center gap-3">
              <label htmlFor="csv-file">
                <SmallButton onClick={handleFileInputClick} icon={<Upload />}>
                  Upload CSV
                </SmallButton>
              </label>
              {file ? (
                <div className="inline-flex items-center gap-1.5">
                  <div className="text-smallButton text-grey-04">{file}</div>
                  <SquareButton onClick={() => setFile(undefined)} icon={<Trash />} />
                </div>
              ) : (
                <div>
                  <span className="px-1.5 text-smallButton text-grey-04">No file selected</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                id="csv-file"
                type="file"
                accept="*.csv"
                onChange={handleProcessFile}
                className="hidden"
              />
            </div>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="step3" disabled={!file}>
          <Accordion.Trigger>
            <div className="text-smallTitle">Step 3</div>
            <div className="mt-1 text-metadata">
              Match the type attributes with the corresponding columns in your csv and specify their data types
            </div>
          </Accordion.Trigger>
          <Accordion.Content>
            <div className="grid grid-cols-3 gap-8">
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-metadataMedium">Name</div>
                  <div className="text-footnoteMedium">Required</div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <Select
                    value={entityNameIndex?.toString()}
                    onChange={(value: string) => setEntityNameIndex(parseInt(value, 10))}
                    placeholder="Select column..."
                    options={headers.map((header: string, index: number) => {
                      return {
                        value: index.toString(),
                        label: `${header} (e.g., ${examples[index]?.substring(0, 16)})`,
                      };
                    })}
                    className="max-w-full overflow-clip"
                    position="popper"
                  />
                </div>
              </div>
              {supportedAttributes.map((attribute: TripleType) => (
                <div key={attribute.id}>
                  <div className="flex items-center justify-between">
                    <div className="text-metadataMedium">
                      {attribute.value.type === 'entity' && attribute.value.name}
                    </div>
                    <div className="text-footnoteMedium">Optional</div>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <Select
                      value={entityAttributes?.[attribute.id]?.type ?? 'string'}
                      onChange={(value: string) => {
                        const newEntityAttributes = {
                          ...entityAttributes,
                        };

                        if (value) {
                          newEntityAttributes[attribute.id] = {
                            ...newEntityAttributes[attribute.id],
                            type: value as SupportedValueType,
                          } as EntityAttribute;
                        } else {
                          newEntityAttributes[attribute.id] = {
                            ...newEntityAttributes[attribute.id],
                            type: 'string' as const,
                          } as EntityAttribute;
                        }

                        setEntityAttributes(newEntityAttributes);
                      }}
                      options={[
                        { value: 'string', label: 'Text', render: <Text /> },
                        { value: 'date', label: 'Date', render: <Date /> },
                        { value: 'url', label: 'Web URL', render: <Url /> },
                        { value: 'image', label: 'Image', render: <Image />, disabled: true },
                        { value: 'relation', label: 'Relation', render: <Relation />, disabled: true },
                      ]}
                      className="!flex-[0]"
                      position="popper"
                    />
                    <Select
                      value={entityAttributes?.[attribute.id]?.index?.toString() ?? ''}
                      onChange={(value: string) => {
                        const newEntityAttributes = {
                          ...entityAttributes,
                        };

                        if (value) {
                          newEntityAttributes[attribute.id] = {
                            ...newEntityAttributes[attribute.id],
                            index: parseInt(value, 10),
                            name: attribute.value.type === 'entity' ? attribute.value.name ?? '' : '',
                          } as EntityAttribute;
                        } else {
                          delete newEntityAttributes[attribute.id];
                        }

                        setEntityAttributes(newEntityAttributes);
                      }}
                      options={[
                        { value: '', label: 'Select column...' },
                        ...headers.map((header: string, index: number) => {
                          return {
                            value: index.toString(),
                            label: `${header} (e.g., ${examples[index]?.substring(0, 16)})`,
                          };
                        }),
                      ]}
                      className="max-w-full overflow-clip"
                      position="popper"
                    />
                  </div>
                </div>
              ))}
            </div>
            {unsupportedAttributes.length > 0 && (
              <div className="pt-16">
                <div className="text-breadcrumb">
                  Geo does not currently support data uploads to these type attribute data types
                </div>
                <div className="mt-4 grid grid-cols-3 gap-8">
                  {unsupportedAttributes.map((attribute: TripleType) => (
                    <div key={attribute.id}>
                      <div className="flex items-center justify-between">
                        <div className="text-metadataMedium">
                          {attribute.value.type === 'entity' && attribute.value.name}
                        </div>
                        <div className="text-footnoteMedium">Optional</div>
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        <Select
                          value={entityAttributes?.[attribute.id]?.type ?? 'string'}
                          onChange={() => null}
                          options={[
                            { value: 'string', label: 'Text', render: <Text /> },
                            { value: 'date', label: 'Date', render: <Date /> },
                            { value: 'url', label: 'Web URL', render: <Url /> },
                            { value: 'image', label: 'Image', render: <Image />, disabled: true },
                            { value: 'relation', label: 'Relation', render: <Relation />, disabled: true },
                          ]}
                          className="!flex-[0]"
                          disabled
                        />
                        <Select
                          value=""
                          onChange={() => null}
                          placeholder="Select column..."
                          options={[{ value: '', label: 'Select column...' }]}
                          className="max-w-full overflow-clip"
                          disabled
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </div>
  );
};

const getAttributes = (entityType: EntityType | undefined) => {
  const supportedAttributes: TripleType[] = [];
  const unsupportedAttributes: TripleType[] = [];

  if (entityType) {
    entityType?.triples.forEach((triple: TripleType) => {
      if (triple.attributeName === 'Attributes') {
        if (triple.value.type === 'entity' && triple.value.name && UNSUPPORTED_ATTRIBUTES.includes(triple.value.name)) {
          unsupportedAttributes.push(triple);
        } else {
          supportedAttributes.push(triple);
        }
      }
    });
  }

  return { supportedAttributes, unsupportedAttributes };
};

const UNSUPPORTED_ATTRIBUTES = ['Avatar', 'Cover'];
