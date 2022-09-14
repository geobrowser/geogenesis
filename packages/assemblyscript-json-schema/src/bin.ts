#!/usr/bin/env node

let { cli } = require('./cli')

cli({ argv: process.argv.slice(2) })
