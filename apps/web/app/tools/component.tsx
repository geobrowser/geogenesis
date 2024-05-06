'use client';

import * as Tabs from '@radix-ui/react-tabs';
import cx from 'classnames';

import * as React from 'react';

import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { FetchEntitiesOptions } from '~/core/io/subgraph';

export const Tools = () => {
  return (
    <div>
      <h3 className="mb-8 font-mono text-3xl">Geo editor tools</h3>
      <Tabs.Root defaultValue="fetchEntity" className="min-h-[100svh]">
        <Tabs.List className="flex border-b border-black bg-white px-2">
          <Trigger value="fetchEntity">fetch entity by ID</Trigger>
          <Trigger value="generateEntityIds">generate entity IDs</Trigger>
          <Trigger value="findEntities">find entities by space/type</Trigger>
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
    <pre className={cx('mt-2 bg-grey-01 p-2 text-xs', className)} {...rest}>
      {format ? JSON.stringify(children, null, 2) : children}
    </pre>
  );
};

const FetchEntity = () => {
  const [entity, setEntity] = React.useState<any>('');
  const [entityId, setEntityId] = React.useState<string>('');

  const handleFetchEntityId = async (event: any) => {
    event.preventDefault();

    const newEntity = await Subgraph.fetchEntity({ id: entityId.trim() });

    if (newEntity) {
      setEntity(newEntity);
    }
  };

  return (
    <form onSubmit={handleFetchEntityId}>
      <Input label="entity ID" value={entityId} onChange={({ currentTarget: { value } }: any) => setEntityId(value)} />
      <Button type="submit">fetch</Button>
      {entity && <Block>{entity}</Block>}
    </form>
  );
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
        onChange={({ currentTarget: { value } }: any) => setQuantity(value)}
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

    const fetchEntitiesOptions: FetchEntitiesOptions = {
      filter: [],
      first: 1_000,
    };

    if (spaceId) {
      fetchEntitiesOptions.spaceId = spaceId;
    }

    if (typeId) {
      fetchEntitiesOptions.typeIds = [typeId];
    }

    const allEntities = await Subgraph.fetchEntities(fetchEntitiesOptions);

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
      <Input label="space ID" value={spaceId} onChange={({ currentTarget: { value } }: any) => setSpaceId(value)} />
      <Input label="type ID" value={typeId} onChange={({ currentTarget: { value } }: any) => setTypeId(value)} />
      <div className="flex items-center gap-4">
        <Button type="submit">find</Button>
        {entities && <div>found {entities.length < 1_000 ? entities.length : '1,000+'} matching entities</div>}
      </div>
      {entities && <Block>{entities}</Block>}
    </form>
  );
};
