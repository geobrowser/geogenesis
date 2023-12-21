'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Services } from '../services';

type SpacesAccounts = Record<string, string[]>;

export const useSpaces = () => {
  const { subgraph } = Services.useServices();

  const { data: spaces } = useQuery({
    queryKey: ['spaces'],
    queryFn: () => subgraph.fetchSpaces(),
  });

  const editorControllers = React.useMemo(() => {
    return spaces?.reduce((editorControllers, space) => {
      editorControllers[space.id] = space.editorControllers;
      return editorControllers;
    }, {} as SpacesAccounts);
  }, [spaces]);

  const editors = React.useMemo(() => {
    return spaces?.reduce((editors, space) => {
      editors[space.id] = space.editors;
      return editors;
    }, {} as SpacesAccounts);
  }, [spaces]);

  const admins = React.useMemo(() => {
    return spaces?.reduce((admins, space) => {
      admins[space.id] = space.admins;
      return admins;
    }, {} as SpacesAccounts);
  }, [spaces]);

  return {
    spaces: spaces ?? [],
    admins: admins ?? [],
    editors: editors ?? [],
    editorControllers: editorControllers ?? [],
  };
};
