import cors from 'cors'
import express from 'express'
import { readFileSync } from 'fs'
import path from 'path'

const app = express()
const port = 3111

app.use(cors())

app.get<unknown, unknown, unknown, { chain?: string; name?: string }>(
  '/contract/address',
  async (req, res) => {
    const { chain, name } = req.query

    if (!chain) return res.status(404).send('Missing chain id')
    if (!name) return res.status(404).send('Missing contract name')

    let address: string

    try {
      const packagePath = path.dirname(require.resolve('@geogenesis/contracts'))
      const addressesPath = path.join(packagePath, 'addresses', `${chain}.json`)

      console.info(`Loading ${addressesPath}`)
      const addresses = JSON.parse(readFileSync(addressesPath, 'utf8'))
      address = addresses[name].address
    } catch (e) {
      return res.status(404).send((e as Error).message)
    }

    res.send(address)
  }
)

app.listen(port, () => {
  console.log(`Geo dev server listening on port ${port}`)
})
