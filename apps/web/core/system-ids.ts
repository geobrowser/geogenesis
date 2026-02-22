// Re-export Place constants from core/constants for backward compatibility
export {
  PLACE as PLACE_TYPE,
  ADDRESS as ADDRESS_TYPE,
  VENUE_PROPERTY,
  ADDRESS_PROPERTY,
  MAPBOX_PROPERTY,
} from '~/core/constants';

// Additional constants for Place functionality
export const SOURCES_TYPE = '49c5d5e1679a4dbdbfd33f618f227c94';
export const SOURCE_DATABASE_IDENTIFIER_PROPERTY = '5e92c8a417144ee79a09389ef4336aeb';
export const PROPERTIES_SOURCED = '198150d08f4e410a93299aab3ac3c1e3';
export const RELATIONS_SOURCED = '2596082ff4d34a619b6a831e253cb345';
