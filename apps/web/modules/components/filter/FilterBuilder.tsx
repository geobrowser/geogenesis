import {Comparator, Filter as FilterType} from 'geo-schema';
import React, {memo, useCallback} from 'react';
import {StyleSheet, View, ViewProps} from 'react-native';
import {colors} from '@app/theme';
import {createEmptyGeoValue} from '@everest/react-native-slate';
import {Icon} from '../Icon';
import {Spacer} from '../Spacer';
import {Text} from '../Text';
import {PressableInternal} from '../internal/PressableInternal';
import {FilterClause, FilterClauseOption} from './FilterClause';
import {filterReducer} from './filterReducer';

export interface FilterBuilderProps {
  filter: FilterType;
  onChange: (value: FilterType) => void;
  options: FilterClauseOption[];
  createElementId: () => string;
  style?: ViewProps['style'];
  onClose: () => void;
}

export const FilterBuilder = memo(function FilterBuilder({
  style,
  filter,
  options,
  onChange,
  onClose,
  createElementId,
}: FilterBuilderProps) {
  return (
    <View style={style}>
      <View style={styles.header}>
        <Icon name="IconOutlineFilterIcon" />
        <Spacer.Horizontal size={16} />
        <Text variant="headline" weight="regular">
          Add filters
        </Text>
        <Spacer.Horizontal />
        <Spacer.Horizontal size={16} />
        <PressableInternal onPress={onClose}>
          <Text variant="headline" weight="regular">
            Cancel
          </Text>
        </PressableInternal>
        <Spacer.Horizontal size={16} />
        <PressableInternal onPress={onClose}>
          <Text variant="headline" weight="regular">
            Apply filters
          </Text>
        </PressableInternal>
      </View>
      <View>
        {filter.clauses.map((clause, index) => (
          <FilterClause
            createElementId={createElementId}
            filterClause={clause}
            key={clause.id}
            label={index === 0 ? 'Where' : 'And'}
            onChange={updated => {
              onChange(
                filterReducer(filter, {
                  type: 'setClause',
                  clause: updated,
                  index,
                })
              );
            }}
            onDelete={() => {
              onChange(filterReducer(filter, {type: 'deleteClause', index}));
            }}
            options={options}
          />
        ))}
      </View>
      <PressableInternal
        onPress={useCallback(() => {
          onChange(
            filterReducer(filter, {
              type: 'addClause',
              clause: {
                id: createElementId(),
                comparator: Comparator.IS_EQUAL_TO,
                path: options[0].path,
                value: createEmptyGeoValue(
                  createElementId(),
                  options[0].valueType
                ),
              },
            })
          );
        }, [createElementId, filter, onChange, options])}
        style={styles.footer}>
        <Icon name="IconOutlineCreateIcon" />
      </PressableInternal>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 46,
  },
  footer: {
    backgroundColor: colors.grey[4],
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
});
