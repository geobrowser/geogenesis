import * as React from 'react';

import { Text } from '~/modules/design-system/text';

interface State {
  hasError: boolean;
}

interface Props {
  typeId: string;
  spaceId: string;
  children: React.ReactNode;
}

export class EntityTableErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    // You can also log the error to an error reporting service
    console.error(
      `Error in EntityTableErrorBoundary in space: ${this.props.spaceId}, typeId: ${this.props.typeId}`,
      error,
      errorInfo
    );
  }

  render() {
    if (this.state.hasError) {
      return <Text variant="mediumTitle">Something went wrong. Try refreshing the page.</Text>;
    }

    return this.props.children;
  }
}
