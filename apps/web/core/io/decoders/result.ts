import { Either, Schema } from 'effect';

import { SearchResult } from '~/core/types';

import { SearchResultDto } from '../dto/search';
import { SearchResult as SearchResultSchema } from '../schema';

export class ResultDecoder {
  static decode(data: unknown): SearchResult | null {
    const decoded = Schema.decodeUnknownEither(SearchResultSchema)(data);

    if (Either.isLeft(decoded)) {
      // @TODO: Error handling when decoding

      return null;
    }

    return SearchResultDto(decoded.right);
  }
}
