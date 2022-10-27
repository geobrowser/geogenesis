import {BlurView} from '@react-native-community/blur';
import React, {memo, useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useTheme} from '@app/theme';
import {Button} from '../Button';
import {Popover} from '../Popover';
import {FilterBuilder, FilterBuilderProps} from './FilterBuilder';

export const FilterDropdown = memo(function FilterDropdown({
  filter,
  options,
  onChange,
  createElementId,
}: Omit<FilterBuilderProps, 'style' | 'onClose'>) {
  const [open, setOpen] = useState(false);
  const {blur} = useTheme();

  return (
    <Popover
      from={
        <Button.Icon
          name="IconOutlineFilterIcon"
          onPress={useCallback(() => {
            setOpen(!open);
          }, [open])}
        />
      }
      isVisible={open}
      onRequestClose={useCallback(() => setOpen(false), [setOpen])}>
      <View style={styles.popoverContent}>
        <BlurView {...blur.ultra} style={StyleSheet.absoluteFill} />
        <FilterBuilder
          createElementId={createElementId}
          filter={filter}
          onChange={onChange}
          onClose={useCallback(() => setOpen(false), [])}
          options={options}
          style={styles.container}
        />
      </View>
    </Popover>
  );
});

const styles = StyleSheet.create({
  popoverContent: {borderRadius: 6, overflow: 'hidden'},
  container: {width: 617},
});
