import AccessControlClient from './access-control-page';

interface Props {
  params: { id: string };
}

export default function AccessControl({ params }: Props) {
  return <AccessControlClient spaceId={params.id} />;
}
