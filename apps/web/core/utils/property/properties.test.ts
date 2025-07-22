import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SystemIds } from '@graphprotocol/grc-20';
import { RENDERABLE_TYPE_PROPERTY, DATA_TYPE_PROPERTY } from '~/core/constants';
import { 
  mapPropertyType,
  reconstructFromStore,
  mapRenderableTypeToSwitchable,
  isUnpublished,
  constructDataType,
  getCurrentRenderableType
} from './properties';
import { SwitchableRenderableType, Property, Relation } from '~/core/v2.types';

// Mock the constants to ensure they're available in tests
vi.mock('~/core/constants', () => ({
  RENDERABLE_TYPE_PROPERTY: 'RENDERABLE_TYPE_PROPERTY_ID',
  DATA_TYPE_PROPERTY: 'DATA_TYPE_PROPERTY_ID',
  GEO_LOCATION: 'GEO_LOCATION_ID',
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

    it('should map NUMBER property type correctly', () => {
      const result = mapPropertyType('NUMBER');
      expect(result).toEqual({
        baseDataType: 'NUMBER',
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

    it('should map CHECKBOX property type correctly', () => {
      const result = mapPropertyType('CHECKBOX');
      expect(result).toEqual({
        baseDataType: 'CHECKBOX',
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
        renderableType: null,
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
        renderableType: SystemIds.URL,
      });
    });
  });

  describe('mapRenderableTypeToSwitchable', () => {
    it('should map SystemIds.IMAGE to IMAGE', () => {
      const result = mapRenderableTypeToSwitchable('Image', SystemIds.IMAGE, 'TEXT');
      expect(result).toBe('IMAGE');
    });

    it('should map SystemIds.URL to URL', () => {
      const result = mapRenderableTypeToSwitchable('Url', SystemIds.URL, 'TEXT');
      expect(result).toBe('URL');
    });

    it('should map SystemIds.GEO_LOCATION to GEO_LOCATION', () => {
      const result = mapRenderableTypeToSwitchable('Geo Location', 'GEO_LOCATION_ID', 'TEXT');
      expect(result).toBe('GEO_LOCATION');
    });

    it('should return TEXT for unknown renderableType', () => {
      const result = mapRenderableTypeToSwitchable('Unknown', 'UNKNOWN_ID', 'TEXT');
      expect(result).toBe('TEXT');
    });

    it('should handle null/undefined renderableType', () => {
      expect(mapRenderableTypeToSwitchable(null as any, 'id', 'TEXT')).toBe('TEXT');
      expect(mapRenderableTypeToSwitchable(undefined as any, 'id', 'TEXT')).toBe('TEXT');
    });
  });

  describe('isUnpublished', () => {
    it('should return false for property with no propertyData', () => {
      const mockTypeRelation: Relation = {
        id: 'rel-1',
        entityId: 'entity-1',
        fromEntity: { id: 'prop-1', name: 'Test Property' },
        type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
        toEntity: { id: SystemIds.PROPERTY, name: 'Property' },
        spaceId: 'space-1',
        position: { x: 0, y: 0 },
        verified: false,
        renderableType: 'RELATION',
      };

      const result = isUnpublished(null, mockTypeRelation);
      expect(result).toBe(false);
    });

    it('should return false for property with propertyData and no type relation', () => {
      const mockPropertyData: Property = {
        id: 'prop-1',
        name: 'Test Property',
        dataType: 'TEXT',
        renderableType: 'TEXT',
      };

      const result = isUnpublished(mockPropertyData, null);
      expect(result).toBe(false);
    });

    it('should return false for property with both propertyData and type relation', () => {
      const mockPropertyData: Property = {
        id: 'prop-1',
        name: 'Test Property',
        dataType: 'TEXT',
        renderableType: 'TEXT',
      };

      const mockTypeRelation: Relation = {
        id: 'rel-1',
        entityId: 'entity-1',
        fromEntity: { id: 'prop-1', name: 'Test Property' },
        type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
        toEntity: { id: SystemIds.PROPERTY, name: 'Property' },
        spaceId: 'space-1',
        position: { x: 0, y: 0 },
        verified: false,
        renderableType: 'RELATION',
      };

      const result = isUnpublished(mockPropertyData, mockTypeRelation);
      expect(result).toBe(false);
    });

    it('should return false when neither propertyData nor type relation exists', () => {
      const result = isUnpublished(null, null);
      expect(result).toBe(false);
    });

    it('should return true for property with local type relation', () => {
      const mockPropertyData: Property = {
        id: 'prop-1',
        name: 'Test Property',
        dataType: 'TEXT',
        renderableType: null,
      };

      const mockTypeRelation: Relation = {
        id: 'rel-1',
        entityId: 'entity-1',
        fromEntity: { id: 'prop-1', name: 'Test Property' },
        type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
        toEntity: { id: SystemIds.PROPERTY, name: 'Property' },
        spaceId: 'space-1',
        position: { x: 0, y: 0 },
        verified: false,
        renderableType: 'RELATION',
        isLocal: true,
        hasBeenPublished: false,
      };

      const result = isUnpublished(mockPropertyData, mockTypeRelation);
      expect(result).toBe(true);
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

      const result = constructDataType(
        mockPropertyData,
        null,
        null,
        'prop-1',
        false
      );

      expect(result).toEqual({
        id: 'prop-1',
        dataType: 'TEXT',
        renderableType: null,
      });
    });

    it('should construct from renderableTypeEntity when no property data', () => {
      const mockRenderableTypeEntity = {
        id: SystemIds.URL,
        name: 'Url',
      };

      const result = constructDataType(
        null,
        mockRenderableTypeEntity,
        null,
        'prop-1',
        true
      );

      expect(result).toEqual({
        id: 'prop-1',
        dataType: 'TEXT',
        renderableType: null,
      });
    });

    it('should construct from renderableTypeRelation when no entity', () => {
      const mockRenderableTypeRelation: Relation = {
        id: 'rel-1',
        entityId: 'entity-1',
        fromEntity: { id: 'prop-1', name: 'Test Property' },
        type: { id: RENDERABLE_TYPE_PROPERTY, name: 'Renderable Type' },
        toEntity: { id: SystemIds.IMAGE, name: 'Image' },
        spaceId: 'space-1',
        position: { x: 0, y: 0 },
        verified: false,
        renderableType: 'RELATION',
      };

      const result = constructDataType(
        null,
        null,
        mockRenderableTypeRelation,
        'prop-1',
        true
      );

      expect(result).toEqual({
        id: 'prop-1',
        dataType: 'TEXT',
        renderableType: {
          id: SystemIds.IMAGE,
          name: 'Image',
        },
      });
    });

    it('should return null when no data sources available', () => {
      const result = constructDataType(null, null, null, 'prop-1', false);
      expect(result).toBeNull();
    });
  });

  describe('getCurrentRenderableType', () => {
    it('should return renderableType from property data', () => {
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

    it('should map known renderableType to switchable type', () => {
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