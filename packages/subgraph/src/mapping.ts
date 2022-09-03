import { Statement } from '../generated/schema'
import { StatementAdded } from '../generated/StatementHistory/StatementHistory'

export function handleStatementAdded(event: StatementAdded): void {
  let statement = new Statement(event.params.index.toHex())
  statement.author = event.params.author
  statement.uri = event.params.uri
  statement.save()
}
