import {
  Comparator,
  FilterClause as FilterClauseType,
  GeoValueType,
} from 'geo-schema';
import {isEqual} from 'lodash';
import React, {memo, useCallback, useMemo} from 'react';
import {StyleSheet, TextInput, View} from 'react-native';
import {SystemMenuItemConfig} from '@app/system';
import {colors, useTheme} from '@app/theme';
import {getGeoValueInputText} from '@everest/react-native-slate';
import {Button} from '../Button';
import {Dropdown} from '../Dropdown';
import {Spacer} from '../Spacer';
import {Text} from '../Text';
import {getComparatorDisplayName, getComparators} from './comparators';
import {filterClauseReducer} from './filterClauseReducer';

export type FilterClauseOption = {
  path: string[];
  valueType: GeoValueType;
};

interface Props {
  options: FilterClauseOption[];
  label: string;
  filterClause: FilterClauseType;
  onChange: (newClause: FilterClauseType) => void;
  onDelete: () => void;
  createElementId: () => string;
}

const PathDropdown = memo(function PathDropdown({
  options,
  filterClause,
  onChange,
  createElementId,
}: Pick<Props, 'options' | 'filterClause' | 'onChange' | 'createElementId'>) {
  return (
    <Dropdown
      activeIndex={useMemo(
        () =>
          options.findIndex(option => isEqual(option.path, filterClause.path)),
        [filterClause.path, options]
      )}
      items={useMemo(
        () =>
          options.map(
            ({path}): SystemMenuItemConfig => ({
              text: path[0],
            })
          ),
        [options]
      )}
      onChange={useCallback(
        (index: number): void =>
          onChange(
            filterClauseReducer(filterClause, {
              type: 'setPath',
              valueId: createElementId(),
              ...options[index],
            })
          ),
        [createElementId, filterClause, onChange, options]
      )}
    />
  );
});

const ComparatorDropdown = memo(function ComparatorDropdown({
  filterClause,
  onChange,
}: Pick<Props, 'filterClause' | 'onChange'>) {
  const comparatorItems: Comparator[] = useMemo(
    () => getComparators(filterClause.value.valueType),
    [filterClause.value.valueType]
  );

  return (
    <Dropdown
      activeIndex={useMemo(
        () =>
          comparatorItems.findIndex(
            comparator => comparator === filterClause.comparator
          ),
        [comparatorItems, filterClause.comparator]
      )}
      items={useMemo(
        () =>
          comparatorItems.map(
            (comparator): SystemMenuItemConfig => ({
              text: getComparatorDisplayName(comparator),
            })
          ),
        [comparatorItems]
      )}
      onChange={useCallback(
        (index: number): void =>
          onChange(
            filterClauseReducer(filterClause, {
              type: 'setComparator',
              comparator: comparatorItems[index],
            })
          ),
        [comparatorItems, filterClause, onChange]
      )}
    />
  );
});

export const FilterClause = memo(function FilterClause({
  options,
  filterClause,
  onChange,
  onDelete,
  label,
  createElementId,
}: Props) {
  const {textStyles} = useTheme();

  // Don't pass a line height to the TextInput, since it'll render off-center
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {lineHeight, ...inputStyle} = textStyles.headline;

  return (
    <View style={styles.row}>
      <Text
        color={colors.grey[70]}
        style={styles.label}
        variant="headline"
        weight="regular">
        {label}
      </Text>
      <Spacer.Horizontal size={16} />
      <PathDropdown
        createElementId={createElementId}
        filterClause={filterClause}
        onChange={onChange}
        options={options}
      />
      <Spacer.Horizontal size={8} />
      <ComparatorDropdown filterClause={filterClause} onChange={onChange} />
      <Spacer.Horizontal />
      <TextInput
        onChangeText={useCallback(
          (text: string): void =>
            onChange(
              filterClauseReducer(filterClause, {
                type: 'setText',
                text,
              })
            ),
          [filterClause, onChange]
        )}
        placeholder="Value"
        placeholderTextColor="rgba(28, 28, 28, 0.32)"
        style={[inputStyle, styles.valueInput]}
        value={getGeoValueInputText(filterClause.value)}
      />
      <Button.Icon
        name="IconOutlineTrashIcon"
        onPress={onDelete}
        variant="muted"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: colors.grey[8],
  },
  valueInput: {
    width: 160,
    backgroundColor: colors.white[100],
    borderRadius: 8,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
  },
  label: {
    width: 50,
  },
});
