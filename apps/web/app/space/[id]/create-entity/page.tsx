import CreateEntityPageClient from './create-entity-page';

interface Props {
  params: { id: string };
}

export default function CreateEntity({ params }: Props) {
  return <CreateEntityPageClient spaceId={params.id} />;
}
