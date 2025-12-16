import { Either, Schema } from 'effect';

import { SearchResult } from '~/core/v2.types';

import { SearchResultDto } from '../../dto/search';
import { SearchResult as SearchResultSchema } from '../v2.schema';

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
