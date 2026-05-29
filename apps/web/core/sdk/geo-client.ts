import { GeoTestnetConfig, createGeoClient } from '@geoprotocol/geo-sdk';

export const geo = createGeoClient({ network: GeoTestnetConfig });
