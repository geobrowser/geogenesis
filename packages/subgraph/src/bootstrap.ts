import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import { handleAction } from './actions'

export function bootstrap(): void {
  handleAction(new CreateEntityAction('type'))
  handleAction(new CreateEntityAction('name'))

  handleAction(new CreateTripleAction('type', 'name', new StringValue('Is a')))
  handleAction(
    new CreateTripleAction('person', 'type', new EntityValue('type'))
  )
  handleAction(
    new CreateTripleAction('person', 'name', new StringValue('Person'))
  )
  handleAction(
    new CreateTripleAction('devin', 'type', new EntityValue('person'))
  )
  handleAction(
    new CreateTripleAction('devin', 'name', new StringValue('Devin'))
  )

  // handleAction(
  //   new DeleteTripleAction('devin', 'name', new StringValue('Devin'))
  // )
}
