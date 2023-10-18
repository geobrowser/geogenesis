import { NextResponse } from 'next/server';

import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!params.id) {
    return NextResponse.json(
      {
        space: null,
        isPermissionlessSpace: false,
      },
      {
        status: 400,
      }
    );
  }

  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);
  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: params.id });
  let isPermissionlessSpace = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: params.id });
    if (space) isPermissionlessSpace = true;
  }

  return NextResponse.json(
    {
      space,
      isPermissionlessSpace,
    },
    {
      status: 400,
    }
  );
}
