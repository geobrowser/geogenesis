import { Schema } from '@effect/schema';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { SearchResult } from '~/core/v2.types';

import { SearchResultDto } from '../dto/search';
import { SubstreamSearchResult } from '../schema';
import { getEntity } from '../v2/queries';
import { resultEntityFragment } from './fragments';
import { graphql } from './graphql';

function getFetchResultQuery(id: string) {
  return `query {
    entity(id: ${JSON.stringify(id)}) {
      id
      currentVersion {
        version {
          ${resultEntityFragment}
        }
      }
    }
  }`;
}

export interface FetchResultOptions {
  id: string;
  signal?: AbortController['signal'];
}

export async function fetchResult(options: FetchResultOptions): Promise<SearchResult | null> {
  const entity = await Effect.runPromise(getEntity(options.id));

  if (!entity) {
    return null;
  }

  const entityOrError = Schema.decodeEither(SubstreamSearchResult)(entity);

  const decodedResult = Either.match(entityOrError, {
    onLeft: error => {
      console.error(`Unable to decode search result: ${String(error)}`);
      return null;
    },
    onRight: result => {
      return SearchResultDto(result);
    },
  });

  if (decodedResult === null) {
    return null;
  }

  return decodedResult;
}
