import { Button, Dropdown, Input, Menu, Table, Tag } from 'antd'
import { motion } from 'framer-motion'
import React, { useEffect, useState } from 'react'

import { DataScriptStore } from '~/modules/datascript/store'

const schema = {
  name: {
    ':db/unique': ':db.unique/identity',
  },
}

const store = new DataScriptStore(schema)

function useStoreSnapshot() {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot)
}

export default function FactsPage() {
  const snapshot = useStoreSnapshot()

  useEffect(() => {
    store.update([
      { name: 'Devin', age: 31 },
      { name: 'Sam', age: 42 },
    ])
  }, [])

  const columns = [
    {
      title: 'Entity',
      dataIndex: 'e',
      key: 'e',
    },
    {
      title: 'Attribute',
      dataIndex: 'a',
      key: 'a',
    },
    {
      title: 'Value',
      dataIndex: 'v',
      key: 'v',
      render: (value: any) => {
        return (
          <span
            style={{
              color: typeof value === 'number' ? 'green' : 'dodgerblue',
            }}
          >
            {value}
            <Tag style={{ marginLeft: '8px' }}>{typeof value}</Tag>
          </span>
        )
      },
    },
  ]

  const [queryString, setQueryString] = useState(
    '[:find ?n ?a :where [?e "name" ?n] [?e "age" ?a]]'
  )
  const queryResult = snapshot.query(queryString)

  const [pullString, setPullString] = useState('["name", "age"]')
  const [pullArg, setPullArg] = useState('["name", "Devin"]')
  const pullResult = snapshot.pull(pullString, pullArg)

  const datoms = snapshot.datoms()

  console.log(datoms)

  return (
    <motion.div className="layout" layout="position">
      <h2 className="text-geo-title2 font-bold">Facts</h2>
      <hr />
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 items-center">
          <h2>Add Entity</h2>
          <Insert
            onSubmit={({ e, a, v }) => {
              store.update([[':db/add', Number(e), a, v.value]])
            }}
          />
        </div>
        <Table
          dataSource={datoms}
          columns={columns}
          rowKey={(item) => `${item.e}-${item.a}-${item.v}`}
          pagination={false}
        />
      </div>
      <hr />
      <div className="flex flex-col gap-4">
        <h2 className="text-geo-title2 font-bold">Query</h2>
        <Input
          style={{ fontFamily: 'monospace' }}
          placeholder="Query"
          value={queryString}
          onChange={(e) => setQueryString(e.target.value)}
        />
        <pre style={{ height: 400, background: '#222', color: '#ddd' }}>
          {JSON.stringify(queryResult, null, 2)}
        </pre>
      </div>
      <hr />
      <div className="flex flex-col gap-4">
        <h2 className="text-geo-title2 font-bold">Pull</h2>
        <p>
          Pull is a declarative way to make hierarchical (and possibly nested)
          selections of information about entities. Pull applies a pattern to a
          collection of entities, building a map for each entity.
        </p>
        <p>(Another interesting pull to try: [*] and 1)</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Input
            placeholder="Pull"
            value={pullString}
            onChange={(e) => setPullString(e.target.value)}
          />
          <Input
            placeholder="Arg"
            value={pullArg}
            onChange={(e) => setPullArg(e.target.value)}
          />
        </div>
        <pre style={{ height: 400, background: '#222', color: '#ddd' }}>
          {JSON.stringify(pullResult, null, 2)}
        </pre>
      </div>
    </motion.div>
  )
}

type ValueType = 'entity' | 'number' | 'string'
type Value =
  | { type: 'entity'; value: number }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }

export function Insert({
  onSubmit,
}: {
  onSubmit: (fact: { e: string; a: string; v: Value }) => void
}) {
  const [entityType, setEntityType] = useState<ValueType>('string')
  const [e, setE] = useState('1')
  const [a, setA] = useState('color')
  const [v, setV] = useState('blue')

  const menu = (
    <Menu
      selectedKeys={[entityType]}
      selectable
      onSelect={(e) => {
        setEntityType(e.selectedKeys[0] as ValueType)
        setV('')
      }}
      items={[
        // { key: 'entity', label: 'entity' },
        { key: 'number', label: 'number' },
        { key: 'string', label: 'string' },
      ]}
    />
  )

  return (
    <div style={{ display: 'flex', gap: 10, flex: 1 }}>
      <Input
        placeholder="Entity"
        value={e}
        onChange={(e) => setE(e.target.value)}
      />
      <Input
        placeholder="Attribute"
        value={a}
        onChange={(e) => setA(e.target.value)}
      />
      <Dropdown overlay={menu}>
        <Button onClick={(e) => e.preventDefault()}>{entityType} ▼</Button>
      </Dropdown>
      <Input
        placeholder="Value"
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      <Button
        onClick={() => {
          onSubmit({
            e,
            a,
            v:
              entityType === 'string'
                ? { type: entityType, value: v }
                : { type: entityType, value: Number(v) },
          })
          setE('')
          setA('')
          setV('')
        }}
      >
        Submit
      </Button>
    </div>
  )
}
