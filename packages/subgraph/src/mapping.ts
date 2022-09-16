import { DataURI } from '@geogenesis/data-uri/assembly'
import { CreateCommand, Root } from '@geogenesis/fact-schema/assembly'
import { BigDecimal, Bytes, log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { GeoEntity, Statement, Triple } from '../generated/schema'
import { StatementAdded } from '../generated/StatementHistory/StatementHistory'

function bootstrap(): void {
  const type = new GeoEntity('e:type')
  type.save()

  const name = new GeoEntity('e:name')
  name.save()

  const person = new GeoEntity('e:person')
  person.save()

  const devin = new GeoEntity('e:devin')
  devin.save()

  const devinTypeTriple = new Triple('t:devin-type')
  devinTypeTriple.entity = devin.id
  devinTypeTriple.attribute = type.id
  devinTypeTriple.valueType = 'ENTITY'
  devinTypeTriple.entityValue = person.id
  devinTypeTriple.save()

  const devinNameTriple = new Triple('t:devin-name')
  devinNameTriple.entity = devin.id
  devinNameTriple.attribute = name.id
  devinNameTriple.valueType = 'STRING'
  devinNameTriple.stringValue = 'Devin'
  devinNameTriple.save()

  const personTypeTriple = new Triple('t:person-type')
  personTypeTriple.entity = person.id
  personTypeTriple.attribute = type.id
  personTypeTriple.valueType = 'ENTITY'
  personTypeTriple.entityValue = personTypeTriple.id
  personTypeTriple.save()
}

bootstrap()

function handleCreateCommand(createCommand: CreateCommand): void {
  const fact = createCommand.value

  const entity = (GeoEntity.load(fact.entityId) ||
    new GeoEntity(fact.entityId))!
  entity.save()

  const attribute = (GeoEntity.load(fact.attributeId) ||
    new GeoEntity(fact.attributeId))!
  attribute.save()

  const triple = (Triple.load(fact.id) || new Triple(fact.id))!
  triple.entity = entity.id
  triple.attribute = attribute.id
  triple.valueType = fact.value.type

  const stringValue = fact.value.asStringValue()
  if (stringValue) {
    triple.stringValue = stringValue.value
    triple.valueType = 'STRING'
  }

  const numberValue = fact.value.asNumberValue()
  if (numberValue) {
    triple.numberValue = BigDecimal.fromString(numberValue.value)
    triple.valueType = 'NUMBER'
  }

  const entityValue = fact.value.asRefValue()
  if (entityValue) {
    triple.entityValue = entityValue.value
    triple.valueType = 'ENTITY'
  }

  triple.save()
}

export function handleStatementAdded(event: StatementAdded): void {
  let statement = new Statement(event.params.index.toHex())

  const author = event.params.author
  const uri = event.params.uri

  statement.author = author
  statement.uri = uri

  if (uri.startsWith('data:')) {
    const dataURI = DataURI.parse(uri)

    if (dataURI) {
      const bytes = Bytes.fromUint8Array(dataURI.data)

      statement.mimeType = dataURI.mimeType
      statement.decoded = bytes

      if (statement.mimeType == 'application/json') {
        const json = JSON.parse(bytes)
        // const result = json.fromBytes(bytes)
        // log.debug(`Testing: ${result.toObject().mustGet('id').toString()}`, [])
        const root = Root.fromJSON(json)
        if (root) {
          log.debug(`XXX Decoded Root`, [])
          const encoded = root.toJSON()
          log.debug(`XXX Encoded Root`, [])
          const out = encoded.stringify()
          log.debug(`XXX Encoded JSON ${out}`, [])

          for (let i = 0; i < root.commands.length; i++) {
            const command = root.commands[i]
            const createCommand = command.asCreateCommand()
            if (createCommand) {
              handleCreateCommand(createCommand)
            }
          }
        }
      }
    }
  }

  statement.save()

  log.debug(`Indexed: ${statement.uri}`, [])
}
