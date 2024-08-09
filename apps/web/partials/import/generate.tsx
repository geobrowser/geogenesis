'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { parse } from 'csv/sync';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { Entity } from '~/core/io/dto/entities';
import { Space } from '~/core/io/dto/spaces';
import { EntityId } from '~/core/io/schema';
import { Triple as TripleType } from '~/core/types';
import type { Value } from '~/core/types';
import { GeoDate, uuidValidateV4 } from '~/core/utils/utils';

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

import { examplesAtom, headersAtom, loadingAtom, publishAtom, recordsAtom, stepAtom, triplesAtom } from './atoms';

dayjs.extend(utc);

type GenerateProps = {
  spaceId: string;
  space: Space;
};

export type SupportedValueType = 'TEXT' | 'TIME' | 'URI' | 'ENTITY';

export type UnsupportedValueType = 'number' | 'image';

type EntityAttributesType = Record<string, { index: number; type: SupportedValueType; name: string }>;

export const Generate = ({ spaceId }: GenerateProps) => {
  const { isEditor } = useAccessControl(spaceId);

  const [actions, setActions] = useAtom(triplesAtom);
  const [isLoading, setIsLoading] = useAtom(loadingAtom);
  const [step, setStep] = useAtom(stepAtom);
  const setIsPublishOpen = useSetAtom(publishAtom);

  const pathname = usePathname();
  const spacePath = pathname?.split('/import')[0] ?? '/spaces';

  const [entityType, setEntityType] = useState<Entity | undefined>(undefined);
  const { supportedAttributes, unsupportedAttributes } = useMemo(() => getAttributes(entityType), [entityType]);

  const [entityNameIndex, setEntityNameIndex] = useState<number | undefined>(undefined);
  const [entityIdIndex, setEntityIdIndex] = useState<number | undefined>(undefined);
  const [entityAttributes, setEntityAttributes] = useState<EntityAttributesType>({});

  const [records, setRecords] = useAtom(recordsAtom);
  const headers = useAtomValue(headersAtom);
  const examples = useAtomValue(examplesAtom);

  const [file, setFile] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleProcessFile = (event: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleReset = useCallback(() => {
    setStep('step1');
    setEntityType(undefined);
    setEntityNameIndex(undefined);
    setEntityAttributes({});
    setFile(undefined);
    setRecords([]);
    setActions([]);
  }, [setActions, setRecords, setStep]);

  const handleGenerateActions = useCallback(async () => {
    setIsLoading(true);

    const [, ...entities] = records;

    const generateActions = async () => {
      const attributes = Object.keys(entityAttributes);

      // @TODO(relations)
      const relationAttributes = Object.values(entityAttributes).filter(({ type }) => type === 'ENTITY');
      const relatedEntityIdsSet: Set<string> = new Set();

      entities.forEach(entity => {
        relationAttributes.forEach(relation => {
          const values = entity[relation.index].split(',');
          values.forEach(value => {
            if (!relatedEntityIdsSet.has(value)) {
              relatedEntityIdsSet.add(value);
            }
          });
        });
      });

      const relatedEntityIds: Array<string> = [...relatedEntityIdsSet.values()];
      const relatedEntities = await Promise.all(
        relatedEntityIds.map((entityId: string) => {
          return Subgraph.fetchEntity({ id: entityId });
        })
      );

      const filteredRelatedEntities: Array<Entity> = relatedEntities.filter(entity => entity !== null);

      const relatedEntitiesMap = new Map(filteredRelatedEntities.map(entity => [entity.id, entity.name ?? '']));

      if (typeof entityNameIndex === 'number' && typeof entityIdIndex === 'number') {
        entities.forEach(entity => {
          relatedEntitiesMap.set(EntityId(entity[entityIdIndex]), entity[entityNameIndex]);
        });
      }

      // @TODO: Use actual type
      const newTriples: Array<TripleType> = [];

      entities.forEach(entity => {
        const newEntityId = typeof entityIdIndex === 'number' ? entity[entityIdIndex] : ID.createEntityId();

        if (typeof entityNameIndex !== 'number' || !entityType) return;

        // Create new entity + set entity name
        newTriples.push({
          space: spaceId,
          entityId: newEntityId,
          entityName: entity[entityNameIndex],
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: {
            type: 'TEXT',
            value: entity[entityNameIndex],
          },
        });

        // Create entity type
        newTriples.push({
          space: spaceId,
          entityId: newEntityId,
          entityName: entity[entityNameIndex],
          attributeId: 'type',
          attributeName: 'Types',
          value: {
            type: 'ENTITY',
            value: entityType.id,
            name: entityType.name,
          },
        });

        // Create entity attribute values
        attributes.forEach(attributeId => {
          if (entityAttributes[attributeId]?.type === 'TIME') {
            const date = dayjs.utc(entity[entityAttributes[attributeId].index], 'MM/DD/YYYY');

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

            newTriples.push({
              space: spaceId,
              entityId: newEntityId,
              entityName: entity[entityNameIndex],
              attributeId,
              attributeName: entityAttributes[attributeId]?.name ?? '',
              value: {
                type: 'TIME',
                value: dateValue,
              },
            });
          } else if (entityAttributes[attributeId]?.type === 'ENTITY') {
            const values = entity[entityAttributes[attributeId].index].split(',');

            values.forEach(value => {
              newTriples.push({
                space: spaceId,
                entityId: newEntityId,
                entityName: entity[entityNameIndex],
                attributeId,
                attributeName: entityAttributes[attributeId]?.name ?? '',
                value: {
                  type: 'ENTITY',
                  value: value,
                  name: relatedEntitiesMap.get(EntityId(value)) ?? null,
                },
              });
            });
          } else {
            newTriples.push({
              space: spaceId,
              entityId: newEntityId,
              entityName: entity[entityNameIndex],
              attributeId,
              attributeName: entityAttributes[attributeId]?.name ?? '',
              value: {
                type: entityAttributes[attributeId]?.type ?? 'TEXT',
                value: entity[entityAttributes[attributeId].index],
              } as Value,
            });
          }
        });
      });

      setActions(newTriples);
    };

    try {
      await generateActions();
    } catch (error) {
      console.error(error);
    }

    setIsLoading(false);
    setStep('step4');
  }, [
    entityAttributes,
    entityIdIndex,
    entityNameIndex,
    entityType,
    records,
    setActions,
    setIsLoading,
    setStep,
    spaceId,
  ]);

  const handlePublishActions = () => {
    setIsPublishOpen(true);
  };

  const isGenerationReady =
    !!entityType?.id && records.length > 0 && typeof entityNameIndex === 'number' && step !== 'step4';

  useEffect(() => {
    if (step === 'done') {
      handleReset();
    }
  }, [step, handleReset]);

  if (!isEditor) {
    return null;
  }

  return (
    <div className="overflow-visible">
      <div className="space-y-4">
        <Link href={spacePath}>
          <SquareButton icon={<ArrowLeft />} />
        </Link>
        <div className="flex w-full items-center justify-between">
          <div className="text-mediumTitle">Import CSV data</div>
          <SmallButton onClick={handleReset} variant="secondary" icon={<RetrySmall />}>
            Reset form
          </SmallButton>
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
                    setEntityType(result as Entity);
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
              Match the attributes with the corresponding columns in your csv and specify their value types
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
                        label: `${header} (e.g., ${examples[index].substring(0, 16)})`,
                      };
                    })}
                    className="max-w-full overflow-clip"
                    position="popper"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-metadataMedium">Entity ID</div>
                  <div className="text-footnoteMedium">Optional (advanced)</div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <Select
                    value={entityIdIndex?.toString() ?? ''}
                    onChange={(value: string) => {
                      if (value) {
                        setEntityIdIndex(parseInt(value, 10));
                      } else {
                        setEntityIdIndex(undefined);
                      }
                    }}
                    placeholder="Select column..."
                    options={[
                      { value: '', label: 'Select column...' },
                      ...headers.map((header: string, index: number) => {
                        return {
                          value: index.toString(),
                          label: `${header} (e.g., ${examples[index].substring(0, 16)})`,
                          disabled: !uuidValidateV4(examples[index]),
                        };
                      }),
                    ]}
                    className="max-w-full overflow-clip"
                    position="popper"
                  />
                </div>
              </div>
              {supportedAttributes.map((attribute: TripleType) => (
                <div key={attribute.value.value}>
                  <div className="flex items-center justify-between">
                    <div className="text-metadataMedium">
                      {attribute.value.type === 'ENTITY' ? attribute.value.name : null}
                    </div>
                    <div className="text-footnoteMedium">Optional</div>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <Select
                      value={entityAttributes?.[attribute.value.value]?.type ?? 'string'}
                      onChange={(value: string) => {
                        const newEntityAttributes = {
                          ...entityAttributes,
                        };

                        if (value) {
                          newEntityAttributes[attribute.value.value] = {
                            ...newEntityAttributes[attribute.value.value],
                            type: value as SupportedValueType,
                          };
                        } else {
                          newEntityAttributes[attribute.value.value] = {
                            ...newEntityAttributes[attribute.value.value],
                            type: 'string' as SupportedValueType,
                          };
                        }

                        setEntityAttributes(newEntityAttributes);
                      }}
                      options={[
                        { value: 'string', label: 'Text', render: <Text />, className: `items-center` },
                        { value: 'date', label: 'Date', render: <Date />, className: `items-center` },
                        { value: 'url', label: 'Web URL', render: <Url />, className: `items-center` },
                        {
                          value: 'image',
                          label: 'Image',
                          render: <Image />,
                          disabled: true,
                          className: `items-center`,
                        },
                        { value: 'entity', label: 'Relation', render: <Relation />, className: `items-center` },
                      ]}
                      className="!flex-[0]"
                      position="popper"
                    />
                    <Select
                      value={entityAttributes?.[attribute.value.value]?.index?.toString() ?? ''}
                      onChange={(value: string) => {
                        const newEntityAttributes = {
                          ...entityAttributes,
                        };

                        if (value) {
                          newEntityAttributes[attribute.value.value] = {
                            ...newEntityAttributes[attribute.value.value],
                            index: parseInt(value, 10),
                            name: attribute.value.type === 'ENTITY' ? attribute.value.name ?? '' : '',
                          };
                        } else {
                          delete newEntityAttributes[attribute.value.value];
                        }

                        setEntityAttributes(newEntityAttributes);
                      }}
                      options={[
                        { value: '', label: 'Select column...' },
                        ...headers.map((header: string, index: number) => {
                          return {
                            value: index.toString(),
                            label: `${header} (e.g., ${examples[index].substring(0, 16)})`,
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
                    <div key={attribute.value.value}>
                      <div className="flex items-center justify-between">
                        <div className="text-metadataMedium">
                          {attribute.value.type === 'ENTITY' && attribute.value.name}
                        </div>
                        <div className="text-footnoteMedium">Optional</div>
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        <Select
                          value={entityAttributes?.[attribute.value.value]?.type ?? 'TEXT'}
                          onChange={() => null}
                          options={[
                            { value: 'TEXT', label: 'Text', render: <Text />, className: `items-center` },
                            { value: 'TIME', label: 'Date', render: <Date />, className: `items-center` },
                            { value: 'URL', label: 'Web URL', render: <Url />, className: `items-center` },
                            {
                              value: 'IMAGE',
                              label: 'Image',
                              render: <Image />,
                              disabled: true,
                              className: `items-center`,
                            },
                            { value: 'RELATION', label: 'Relation', render: <Relation />, className: `items-center` },
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
            <div className="mt-8">
              <Button
                onClick={handleGenerateActions}
                variant="primary"
                disabled={!isGenerationReady || actions.length > 0 || isLoading}
              >
                {!isLoading ? 'Generate' : 'Generating...'}
              </Button>
            </div>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="step4" disabled={step !== 'step4' && actions.length === 0}>
          <Accordion.Trigger>
            <div className="text-smallTitle">Step 4</div>
            <div className="mt-1 text-metadata">Publish generated actions</div>
          </Accordion.Trigger>
          <Accordion.Content>
            <Button onClick={handlePublishActions} variant="primary" disabled={actions.length === 0}>
              Review and publish
            </Button>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </div>
  );
};

const getAttributes = (entityType: Entity | undefined) => {
  const supportedAttributes: TripleType[] = [];
  const unsupportedAttributes: TripleType[] = [];

  if (entityType) {
    entityType?.triples.forEach((triple: TripleType) => {
      if (triple.attributeName === 'Attributes') {
        if (triple.value.type === 'ENTITY' && triple.value.name && UNSUPPORTED_ATTRIBUTES.includes(triple.value.name)) {
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
