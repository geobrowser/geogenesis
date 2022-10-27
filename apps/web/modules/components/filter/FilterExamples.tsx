import {Filter as FilterType, GeoValueType} from 'geo-schema';
import {nanoid} from 'nanoid';
import React, {useState} from 'react';
import {View} from 'react-native';
import {DesignSystemComponentExamples} from '../DesignSystem.ComponentGallery';
import {FilterBuilder} from './FilterBuilder';
import {FilterClauseOption} from './FilterClause';
import {FilterDropdown} from './FilterDropdown';

export const FilterComponentExamples: DesignSystemComponentExamples = ({
  ComponentDefinition,
  Example,
}) => {
  const [filter, setFilter] = useState<FilterType>({
    id: nanoid(),
    clauses: [],
  });
  const options: FilterClauseOption[] = [
    {path: ['name'], valueType: GeoValueType.STRING},
    {path: ['email'], valueType: GeoValueType.STRING},
    {path: ['age'], valueType: GeoValueType.NUMBER},
  ];

  return (
    <ComponentDefinition name="Filter">
      <Example direction="row" name="Filter Popover">
        <View
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
          }}>
          <FilterDropdown
            createElementId={nanoid}
            filter={filter}
            onChange={setFilter}
            options={options}
          />
        </View>
      </Example>
      <Example name="Filter Builder">
        <FilterBuilder
          createElementId={nanoid}
          filter={filter}
          onChange={setFilter}
          onClose={() => {
            //
          }}
          options={options}
          // eslint-disable-next-line react-native/no-color-literals
          style={{
            backgroundColor: '#f8f8f8',
          }}
        />
      </Example>
    </ComponentDefinition>
  );
};
