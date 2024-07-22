import { Build, Context, Plugin } from 'postgraphile';
import { PluginHookFn } from 'postgraphile/build/postgraphile/pluginHook';

export function makeNonNullRelationsPlugin(builder: Build): PluginHookFn {
  return builder.hook('GraphQLObjectType:fields:field', (field: any, build: Build, context: Context<any>) => {
    if (
      !context.scope.isPgForwardRelationField ||
      !context.scope.pgFieldIntrospection?.keyAttributes?.every((attr: any) => attr.isNotNull)
    ) {
      return field;
    }
    return {
      ...field,
      type: new build.graphql.GraphQLNonNull(field.type),
    };
  });
}
