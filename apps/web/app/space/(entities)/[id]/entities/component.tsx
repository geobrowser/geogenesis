import { InitialEntityTableStoreParams } from '~/core/state/entity-table-store/entity-table-store-params';
import { EntityTableStoreProvider } from '~/core/state/entity-table-store/entity-table-store-provider';
import { TypesStoreProvider } from '~/core/state/types-store/types-store';
import { Column, Row, Space, Triple } from '~/core/types';

import { Spacer } from '~/design-system/spacer';

import { EntityTableContainer } from '~/partials/entities-page/entity-table-container';
import { SpaceHeader } from '~/partials/space-page/space-header';
import { SpaceNavbar } from '~/partials/space-page/space-navbar';

interface Props {
  space: Space;
  spaceName: string | null;
  spaceImage: string | null;
  initialSelectedType: Triple | null;
  initialTypes: Triple[];
  initialColumns: Column[];
  initialRows: Row[];
  initialParams: InitialEntityTableStoreParams;
}

export function Component(props: Props) {
  return (
    <div>
      <SpaceHeader spaceId={props.space.id} spaceImage={props.spaceImage} spaceName={props.spaceName} />
      <Spacer height={34} />
      <SpaceNavbar spaceId={props.space.id} />
      <TypesStoreProvider initialTypes={props.initialTypes} space={props.space}>
        <EntityTableStoreProvider
          initialColumns={props.initialColumns}
          initialRows={props.initialRows}
          spaceId={props.space.id}
          initialSelectedType={props.initialSelectedType}
          initialParams={props.initialParams}
        >
          <EntityTableContainer spaceId={props.space.id} spaceName={props.spaceName} />
        </EntityTableStoreProvider>
      </TypesStoreProvider>
    </div>
  );
}
