import styled from '@emotion/styled';
import debounce from 'lodash.debounce';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { FlowBar } from '~/modules/components/flow-bar';
import { Button } from '~/modules/design-system/button';
import { LeftArrowLong } from '~/modules/design-system/icons/left-arrow-long';
import { Input } from '~/modules/design-system/input';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { TextButton } from '~/modules/design-system/text-button';
import { ColorName } from '~/modules/design-system/theme/colors';
import { createEntityId, createTripleId } from '~/modules/services/create-id';
import { importCSVFile } from '~/modules/services/import';
import { TripleStoreProvider } from '~/modules/state/triple-store-provider';
import { useTriples } from '~/modules/state/use-triples';

// We're dynamically importing the TripleTable so we can disable SSR. There are ocassionally hydration
// mismatches in dev (maybe prod?) that happen when reloading a page when the table has optimistic data
// but the server does not have the data yet, e.g., we're waiting for blocks to sync or the transaction
// did not go through.
//
// I _think_ this only happens in dev as Next might be doing SSR/HMR under the hood for static pages,
// but could be happening in prod. Doing dynamic import for now until we can investigate more.
const TripleTable = dynamic(() => import('~/modules/components/triple-table'), {
  ssr: false,
});

const PageHeader = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
});

const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

const FileImport = styled.input({
  margin: '0',
  padding: '0',
  opacity: '0',
  position: 'absolute',
  inset: '0',
});

export default function TriplesPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  return (
    <TripleStoreProvider space={id}>
      <Triples space={id} />
    </TripleStoreProvider>
  );
}

const PageNumberContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  alignSelf: 'flex-end',
});

const PageNumberValue = styled.div(props => ({
  height: props.theme.space * 5,
  width: props.theme.space * 5,
  borderRadius: props.theme.radius,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  fontFeatureSettings: '"tnum" 1',

  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

function PageNumber({ number }: { number: number }) {
  return (
    <PageNumberValue>
      <Text variant="smallButton">{number}</Text>
    </PageNumberValue>
  );
}

interface PageButtonProps {
  onClick: () => void;
  isDisabled: boolean;
}

function PreviousButton({ onClick, isDisabled }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'ctaPrimary';

  return (
    <TextButton disabled={isDisabled} onClick={onClick}>
      <LeftArrowLong color={color} />
      <Spacer width={8} />
      <Text color={color} variant="smallButton">
        Previous
      </Text>
    </TextButton>
  );
}

function NextButton({ onClick, isDisabled }: PageButtonProps) {
  const color: ColorName = isDisabled ? 'grey-03' : 'ctaPrimary';

  return (
    <TextButton disabled={isDisabled} onClick={onClick}>
      <Text color={color} variant="smallButton">
        Next
      </Text>
      <Spacer width={8} />
      <span
        style={{
          transform: 'rotate(180deg)',
        }}
      >
        <LeftArrowLong color={color} />
      </span>
    </TextButton>
  );
}

function Triples({ space }: { space: string }) {
  const tripleStore = useTriples();

  const debouncedFilter = debounce(tripleStore.setQuery, 500);

  const onAddTriple = async () => {
    const entityId = createEntityId();
    const attributeId = '';
    const value = { type: 'string' as const, value: '' };

    tripleStore.create([
      {
        id: createTripleId(space, entityId, attributeId, value),
        entityId,
        attributeId,
        value,
        space,
      },
    ]);
  };

  const onImport = async (file: File) => {
    const triples = await importCSVFile(file, space);
    tripleStore.create(triples);
    console.log('triples', triples.length);
  };

  return (
    <PageContainer>
      <PageHeader>
        <Text variant="largeTitle" as="h1">
          Facts
        </Text>

        <div style={{ flex: 1 }} />
        <Button variant="secondary" icon="create" onClick={() => {}}>
          Import
          <FileImport
            type="file"
            accept=".csv"
            onChange={event => {
              for (let file of event.target.files ?? []) {
                onImport(file);
              }
            }}
          />
        </Button>
        <Spacer width={12} />
        <Button icon="create" onClick={onAddTriple}>
          Add
        </Button>
      </PageHeader>

      <Spacer height={12} />

      <Input placeholder="Search facts..." onChange={e => debouncedFilter(e.target.value)} />

      <Spacer height={12} />

      <TripleTable space={space} triples={tripleStore.triples} update={tripleStore.update} />

      <Spacer height={12} />

      <PageNumberContainer>
        <PageNumber number={tripleStore.pageNumber + 1} />
        <Spacer width={32} />
        <PreviousButton isDisabled={!tripleStore.hasPreviousPage} onClick={() => tripleStore.setPreviousPage()} />
        <Spacer width={12} />
        <NextButton isDisabled={!tripleStore.hasNextPage} onClick={() => tripleStore.setNextPage()} />
      </PageNumberContainer>

      <FlowBar actionsCount={tripleStore.actions.length} onPublish={tripleStore.publish} />
    </PageContainer>
  );
}
