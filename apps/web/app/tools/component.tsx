'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import * as Tabs from '@radix-ui/react-tabs';
import cx from 'classnames';
import { Effect } from 'effect';
import { useAtom } from 'jotai';

import * as React from 'react';

import { fromGeoFilterString } from '~/core/blocks/data/filters';
import { filterStateToWhere } from '~/core/blocks/data/use-data-block';
import { useEntity } from '~/core/database/entities';
import { ID } from '~/core/id';
import { convertWhereConditionToEntityFilter } from '~/core/io/converters';
import { getAllEntities, getEntity } from '~/core/io/queries';
import { cloneEntity } from '~/core/utils/contracts/clone-entity';

import { cloneOpsAtom, cloneSpaceIdAtom, cloneSpaceNameAtom } from './atoms';

export const Tools = () => {
  return (
    <div className="focus:!outline-none *:focus:!outline-none">
      <h3 className="mb-8 font-mono text-3xl">Geo editor tools</h3>
      <Tabs.Root defaultValue="fetchEntity" className="min-h-[100svh] focus:!outline-none">
        <Tabs.List className="flex border-b border-black bg-white px-2">
          <Trigger value="fetchEntity">fetch entity by ID</Trigger>
          <Trigger value="generateEntityIds">generate entity IDs</Trigger>
          <Trigger value="findEntities">find entities by space/type</Trigger>
          <Trigger value="cloneEntity">clone entity into space</Trigger>
          <Trigger value="convertFilter">convert filter</Trigger>
        </Tabs.List>
        <div className="mt-8 px-2">
          <Tabs.Content value="fetchEntity">
            <FetchEntity />
          </Tabs.Content>
          <Tabs.Content value="generateEntityIds">
            <GenerateEntityIds />
          </Tabs.Content>
          <Tabs.Content value="findEntities">
            <FindEntities />
          </Tabs.Content>
          <Tabs.Content value="cloneEntity">
            <CloneEntity />
          </Tabs.Content>
          <Tabs.Content value="convertFilter">
            <ConvertFilter />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
};

const Trigger = ({ value, className = '', ...rest }: any) => {
  return (
    <Tabs.Trigger
      value={value}
      className={cx(
        `relative z-10 -mb-px border border-transparent px-2 py-1 text-text data-[state=active]:border-black data-[state=active]:!border-b-white`,
        className
      )}
      {...rest}
    />
  );
};

const Input = ({ label, className = '', ...rest }: any) => {
  return (
    <label className="flex max-w-xs flex-col">
      <span>{label}</span>
      <input
        type="text"
        placeholder={`enter ${label}...`}
        className={cx(
          'appearance-none border border-black bg-grey-01/50 px-2 py-1 font-mono text-xs placeholder:text-grey-04 focus:outline-none',
          className
        )}
        {...rest}
      />
    </label>
  );
};

const Textarea = ({ label, rows = 6, className = '', ...rest }: any) => {
  return (
    <label className="flex max-w-lg flex-col">
      <span>{label}</span>
      <textarea
        rows={rows}
        placeholder={`enter ${label}...`}
        className={cx(
          'appearance-none border border-black bg-grey-01/50 px-2 py-1 font-mono text-xs placeholder:text-grey-04 focus:outline-none',
          className
        )}
        {...rest}
      />
    </label>
  );
};

const Button = ({ type = 'button', className = '', ...rest }: any) => {
  return (
    <button
      type={type}
      className={cx('mt-2 appearance-none bg-black px-2 py-1 text-white focus:outline-none', className)}
      {...rest}
    />
  );
};

const Block = ({ format = true, className = '', children, ...rest }: any) => {
  return (
    <pre className={cx('mt-2 overflow-clip bg-grey-01 p-2 text-[11px]', className)} {...rest}>
      {format ? JSON.stringify(children, null, 2) : children}
    </pre>
  );
};

const FetchEntity = () => {
  const [entity, setEntity] = React.useState<any>('');
  const [entityId, setEntityId] = React.useState<string>('');

  const handleFetchEntityId = async (event: any) => {
    event.preventDefault();

    const newEntity = await Effect.runPromise(getEntity(entityId.trim()));

    if (newEntity) {
      setEntity(newEntity);
    }
  };

  return (
    <form onSubmit={handleFetchEntityId}>
      <Input
        label="entity ID"
        value={entityId}
        onChange={({ currentTarget: { value } }: React.ChangeEvent<HTMLInputElement>) => setEntityId(value)}
      />
      <Button type="submit">fetch</Button>

      <div className="mt-4 flex w-full gap-4">
        {entity && (
          <div className="w-1/2 overflow-clip">
            <div>fetchEntity:</div>
            <Block>{entity}</Block>
          </div>
        )}
        {entity && (
          <div className="w-1/2 overflow-clip">
            <div>useEntity:</div>
            <Entity entityId={entityId} />
          </div>
        )}
      </div>
    </form>
  );
};

const Entity = ({ entityId }: any) => {
  const entity = useEntity({ id: entityId as any });

  return <Block>{entity ?? ''}</Block>;
};

const GenerateEntityIds = () => {
  const [entityIds, setEntityIds] = React.useState<any>('');
  const [quantity, setQuantity] = React.useState<string>('');

  const handleGenerateEntityIds = async (event: any) => {
    event.preventDefault();

    if (!quantity) return;

    const newEntityIds = new Array(parseInt(quantity.trim().replaceAll(',', ''), 10))
      .fill(null)
      .map(() => ID.createEntityId())
      .join('\n');

    setEntityIds(newEntityIds);
  };

  const handleCopyEntityIds = async () => {
    try {
      await navigator.clipboard.write([
        // eslint-disable-next-line no-undef
        new ClipboardItem({
          'text/plain': new Blob([entityIds], { type: 'text/plain' }),
        }),
      ]);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <form onSubmit={handleGenerateEntityIds}>
      <Input
        label="number of IDs"
        value={quantity}
        onChange={({ currentTarget: { value } }: React.ChangeEvent<HTMLInputElement>) => setQuantity(value)}
      />
      <div className="flex gap-4">
        <Button type="submit">generate</Button>
        {entityIds && <Button onClick={handleCopyEntityIds}>copy</Button>}
      </div>
      {entityIds && <Block format={false}>{entityIds}</Block>}
    </form>
  );
};

const FindEntities = () => {
  const [entities, setEntities] = React.useState<any>('');
  const [spaceId, setSpaceId] = React.useState<string>('');
  const [typeId, setTypeId] = React.useState<string>('');

  const handleFindEntities = async (event: any) => {
    event.preventDefault();

    const allEntities = (await Effect.runPromise(getAllEntities({ spaceId }))) as any[];

    if (allEntities) {
      const newEntities: any = allEntities
        .map(entity => {
          return {
            name: entity.name,
            id: entity.id,
          };
        })
        .sort((a: any, b: any) => (a?.name < b?.name ? -1 : 1));

      setEntities(newEntities);
    }
  };

  return (
    <form onSubmit={handleFindEntities} className="space-y-4">
      <Input
        label="space ID"
        value={spaceId}
        onChange={({ currentTarget: { value } }: React.ChangeEvent<HTMLInputElement>) => setSpaceId(value)}
      />
      <Input
        label="type ID"
        value={typeId}
        onChange={({ currentTarget: { value } }: React.ChangeEvent<HTMLInputElement>) => setTypeId(value)}
      />
      <div className="flex items-center gap-4">
        <Button type="submit">find</Button>
        {entities && <div>found {entities.length < 1_000 ? entities.length : '1,000+'} matching entities</div>}
      </div>
      {entities && <Block>{entities}</Block>}
    </form>
  );
};

const CloneEntity = () => {
  const [spaceName, setSpaceName] = useAtom(cloneSpaceNameAtom);
  const [spaceId, setSpaceId] = useAtom(cloneSpaceIdAtom);
  const [ops, setOps] = useAtom(cloneOpsAtom);

  const handleCloneEntity = async () => {
    const [newOps] = await cloneEntity({
      oldEntityId: SystemIds.COMPANY_TEMPLATE,
      entityName: spaceName,
    });
    setOps(newOps);
  };

  return (
    <div className="space-y-4">
      <Input
        label="space name"
        value={spaceName}
        onChange={({ currentTarget: { value } }: React.ChangeEvent<HTMLInputElement>) => setSpaceName(value)}
      />
      <Input
        label="space ID"
        value={spaceId}
        onChange={({ currentTarget: { value } }: React.ChangeEvent<HTMLInputElement>) => setSpaceId(value)}
      />
      <div className="flex gap-4">
        <Button onClick={handleCloneEntity}>clone entity</Button>
      </div>
      <div className="flex gap-4">
        <Block className="aspect-[21/9] w-full overflow-y-scroll">{ops}</Block>
      </div>
    </div>
  );
};

const ConvertFilter = () => {
  const [filterString, setFilterString] = React.useState<string>('');

  const [filterState, setFilterState] = React.useState<any>(null);
  const [where, setWhere] = React.useState<any>(null);
  const [spaceId, setSpaceId] = React.useState<any>(null);
  const [entityFilter, setEntityFilter] = React.useState<any>(null);

  const handleConvertFilter = async (event: any) => {
    event.preventDefault();

    const newFilterState = await fromGeoFilterString(filterString.trim());
    setFilterState(newFilterState);

    const newWhere = filterStateToWhere(newFilterState);
    setWhere(newWhere);

    const newEntityFilter = convertWhereConditionToEntityFilter(newWhere);
    setEntityFilter(newEntityFilter);
  };

  const handleReset = () => {
    // setFilterString('');
    setSpaceId(null);
    setFilterState(null);
    setWhere(null);
    setEntityFilter(null);
  };

  return (
    <form onSubmit={handleConvertFilter} className="space-y-4">
      <div className="uppercase">raw filter string → filter state → where condition → entity GraphQL filter</div>
      <Textarea
        label="filter string"
        value={filterString}
        onChange={({ currentTarget: { value } }: React.ChangeEvent<HTMLInputElement>) => setFilterString(value)}
      />

      <div className="flex items-center gap-4">
        <Button type="submit">convert</Button>
        <Button onClick={handleReset} className="bg-grey-03">
          reset
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {filterState && (
          <div>
            <div>filter state</div>
            <Block>{filterState}</Block>
          </div>
        )}
        {where && (
          <div>
            <div>where condition</div>
            <Block>{where}</Block>
          </div>
        )}
        {spaceId || entityFilter ? (
          <div className="space-y-4">
            {entityFilter && (
              <div>
                <div>entity filter</div>
                <Block>{entityFilter}</Block>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </form>
  );
};
