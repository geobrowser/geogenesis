import { Spaces } from '~/partials/spaces/spaces';

export default async function SpacesPage() {
  const spaces = await getSpaces();

  return <Spaces spaces={spaces} />;
}

const getSpaces = async () => {
  const spaces: Array<any> = [];

  return spaces;
};
