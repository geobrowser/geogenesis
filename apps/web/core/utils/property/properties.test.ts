import { SystemIds } from '@geoprotocol/geo-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DATA_TYPE_PROPERTY, RENDERABLE_TYPE_PROPERTY } from '~/core/constants';
import { Property, Relation, SwitchableRenderableType } from '~/core/types';

import { constructDataType, getCurrentRenderableType, mapPropertyType, reconstructFromStore } from './properties';

// Mock the constants to ensure they're available in tests
vi.mock('~/core/constants', () => ({
  RENDERABLE_TYPE_PROPERTY: 'RENDERABLE_TYPE_PROPERTY_ID',
  DATA_TYPE_PROPERTY: 'DATA_TYPE_PROPERTY_ID',
  GEO_LOCATION: 'GEO_LOCATION_ID',
  FORMAT_PROPERTY: 'FORMAT_PROPERTY_ID',
  UNIT_PROPERTY: 'UNIT_PROPERTY_ID',
  VIDEO_RENDERABLE_TYPE: 'VIDEO_RENDERABLE_TYPE_ID',
  PLACE: 'PLACE_ID',
}));

describe('Properties', () => {
  describe('mapPropertyType', () => {
    it('should map TEXT property type correctly', () => {
      const result = mapPropertyType('TEXT');
      expect(result).toEqual({
        baseDataType: 'TEXT',
        renderableTypeId: null,
      });
    });

    it('should map IMAGE property type correctly', () => {
      const result = mapPropertyType('IMAGE');
      expect(result).toEqual({
        baseDataType: 'RELATION',
        renderableTypeId: SystemIds.IMAGE,
      });
    });

    it('should map URL property type correctly', () => {
      const result = mapPropertyType('URL');
      expect(result).toEqual({
        baseDataType: 'TEXT',
        renderableTypeId: SystemIds.URL,
      });
    });

    it('should map RELATION property type correctly', () => {
      const result = mapPropertyType('RELATION');
      expect(result).toEqual({
        baseDataType: 'RELATION',
        renderableTypeId: null,
      });
    });

    it('should map INT64 property type correctly', () => {
      const result = mapPropertyType('INT64');
      expect(result).toEqual({
        baseDataType: 'INT64',
        renderableTypeId: null,
      });
    });

    it('should map TIME property type correctly', () => {
      const result = mapPropertyType('TIME');
      expect(result).toEqual({
        baseDataType: 'TIME',
        renderableTypeId: null,
      });
    });

    it('should map BOOL property type correctly', () => {
      const result = mapPropertyType('BOOL');
      expect(result).toEqual({
        baseDataType: 'BOOL',
        renderableTypeId: null,
      });
    });

    it('should map POINT property type correctly', () => {
      const result = mapPropertyType('POINT');
      expect(result).toEqual({
        baseDataType: 'POINT',
        renderableTypeId: null,
      });
    });

    it('should map GEO_LOCATION property type correctly', () => {
      const result = mapPropertyType('GEO_LOCATION');
      expect(result).toEqual({
        baseDataType: 'POINT',
        renderableTypeId: 'GEO_LOCATION_ID',
      });
    });

    it('should handle unknown property type with exhaustive check', () => {
      // This test ensures our switch statement handles unknown types
      const unknownType = 'UNKNOWN_TYPE' as SwitchableRenderableType;
      const result = mapPropertyType(unknownType);
      expect(result).toEqual({
        baseDataType: 'TEXT',
        renderableTypeId: null,
      });
    });
  });

  describe('reconstructFromStore', () => {
    const mockGetValues = vi.fn();
    const mockGetRelations = vi.fn();

    beforeEach(() => {
      mockGetValues.mockClear();
      mockGetRelations.mockClear();
    });

    it('should reconstruct property from values and relations', () => {
      const propertyId = 'test-property-id';

      // Mock values based on selector
      mockGetValues.mockImplementation(({ selector }) => {
        const values = [
          {
            entity: { id: propertyId, name: 'Test Property' },
            property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
            value: 'Test Property',
          },
          {
            entity: { id: propertyId, name: 'Test Property' },
            property: { id: DATA_TYPE_PROPERTY, name: 'Data Type', dataType: 'TEXT' },
            value: 'TEXT',
          },
        ];
        return values.filter(selector);
      });

      // Mock relations based on selector
      mockGetRelations.mockImplementation(({ selector }) => {
        const relations = [
          {
            fromEntity: { id: propertyId, name: 'Test Property' },
            type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
            toEntity: { id: SystemIds.PROPERTY, name: 'Property' },
          },
        ];
        return relations.filter(selector);
      });

      const result = reconstructFromStore(propertyId, mockGetValues, mockGetRelations);

      expect(result).toEqual({
        id: propertyId,
        name: 'Test Property',
        dataType: 'TEXT',
        relationValueTypes: [],
        renderableType: null,
        renderableTypeStrict: undefined,
        isDataTypeEditable: true,
        format: null,
        unit: null,
      });
    });

    it('should return null if property is not found', () => {
      mockGetValues.mockReturnValue([]);
      mockGetRelations.mockReturnValue([]);

      const result = reconstructFromStore('non-existent', mockGetValues, mockGetRelations);
      expect(result).toBeNull();
    });

    it('should handle property with renderableType relation', () => {
      const propertyId = 'test-property-id';

      mockGetValues.mockImplementation(({ selector }) => {
        const values = [
          {
            entity: { id: propertyId, name: 'Test Property' },
            property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
            value: 'Test Property',
          },
          {
            entity: { id: propertyId, name: 'Test Property' },
            property: { id: DATA_TYPE_PROPERTY, name: 'Data Type', dataType: 'TEXT' },
            value: 'TEXT',
          },
        ];
        return values.filter(selector);
      });

      mockGetRelations.mockImplementation(({ selector }) => {
        const relations = [
          {
            fromEntity: { id: propertyId, name: 'Test Property' },
            type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
            toEntity: { id: SystemIds.PROPERTY, name: 'Property' },
          },
          {
            fromEntity: { id: propertyId, name: 'Test Property' },
            type: { id: RENDERABLE_TYPE_PROPERTY, name: 'Renderable Type' },
            toEntity: { id: SystemIds.URL, name: 'Url' },
          },
        ];
        return relations.filter(selector);
      });

      const result = reconstructFromStore(propertyId, mockGetValues, mockGetRelations);

      expect(result).toEqual({
        id: propertyId,
        name: 'Test Property',
        dataType: 'TEXT',
        relationValueTypes: [],
        renderableType: SystemIds.URL,
        renderableTypeStrict: 'URL',
        isDataTypeEditable: true,
        format: null,
        unit: null,
      });
    });
  });

  describe('constructDataType', () => {
    it('should return property data when available', () => {
      const mockPropertyData: Property = {
        id: 'prop-1',
        name: 'Test Property',
        dataType: 'TEXT',
        renderableType: 'URL',
      };

      const result = constructDataType(mockPropertyData, null, null);

      expect(result).toEqual({
        id: 'prop-1',
        dataType: 'TEXT',
        renderableType: null,
      });
    });

    it('should return null when no property data is available', () => {
      const mockRenderableTypeEntity = {
        id: SystemIds.URL,
        name: 'Url',
      };

      const result = constructDataType(null, mockRenderableTypeEntity, null);

      expect(result).toBeNull();
    });

    it('should return null when only renderableTypeRelation is available', () => {
      const mockRenderableTypeRelation: Relation = {
        id: 'rel-1',
        entityId: 'entity-1',
        fromEntity: { id: 'prop-1', name: 'Test Property' },
        type: { id: RENDERABLE_TYPE_PROPERTY, name: 'Renderable Type' },
        toEntity: { id: SystemIds.IMAGE, name: 'Image', value: SystemIds.IMAGE },
        spaceId: 'space-1',
        position: '0',
        verified: false,
        renderableType: 'RELATION',
      };

      const result = constructDataType(null, null, mockRenderableTypeRelation);

      expect(result).toBeNull();
    });

    it('should return null when no data sources available', () => {
      const result = constructDataType(null, null, null);
      expect(result).toBeNull();
    });
  });

  describe('getCurrentRenderableType', () => {
    it('should return URL when property has URL renderableType', () => {
      const mockPropertyDataType = {
        dataType: 'TEXT',
        renderableType: {
          id: SystemIds.URL,
          name: 'URL',
        },
      };

      const result = getCurrentRenderableType(mockPropertyDataType);
      expect(result).toBe('URL');
    });

    it('should return IMAGE when property has IMAGE renderableType', () => {
      const mockPropertyDataType = {
        dataType: 'RELATION',
        renderableType: {
          id: SystemIds.IMAGE,
          name: 'Image',
        },
      };

      const result = getCurrentRenderableType(mockPropertyDataType);
      expect(result).toBe('IMAGE');
    });

    it('should return undefined for null property', () => {
      const result = getCurrentRenderableType(null);
      expect(result).toBe(undefined);
    });

    it('should return dataType for property without renderableType', () => {
      const mockPropertyDataType = {
        dataType: 'TEXT',
        renderableType: null,
      };

      const result = getCurrentRenderableType(mockPropertyDataType);
      expect(result).toBe('TEXT');
    });
  });
});
