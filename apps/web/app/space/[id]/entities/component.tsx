import { EntityTableContainer } from '~/partials/entity-table/entity-table-container';
import { SpaceHeader } from '~/partials/space/space-header';
import { SpaceNavbar } from '~/partials/space/space-navbar';
import { Spacer } from '~/design-system/spacer';
import { EntityTableStoreProvider, InitialEntityTableStoreParams } from '~/core/utils/entity';
import { TypesStoreProvider } from '~/core/state/types-store/types-store';
import { Column, Row, Space, Triple } from '~/core/types';

interface Props {
  space: Space;
  spaceName?: string;
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
          <EntityTableContainer
            spaceId={props.space.id}
            spaceName={props.spaceName}
            initialColumns={props.initialColumns}
            initialRows={props.initialRows}
          />
        </EntityTableStoreProvider>
      </TypesStoreProvider>
    </div>
  );
}
