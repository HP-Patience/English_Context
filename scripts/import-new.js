/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Destructively reset vocabulary/story data and import from 2026考研英语词汇闪过.txt.
 * Format: #CategoryName + word list, optionally word<TAB>phonetic
 * Run: node scripts/import-new.js
 */
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')
const { importVocabularyData } = require('./lib/import-new-runner')

const LOCAL_USER_ID = process.env.LOCAL_USER_ID || 'local-user'

async function main() {
  const prisma = new PrismaClient()
  try {
    const txtPath = path.join(__dirname, '..', 'data', '2026考研英语词汇闪过.txt')
    const raw = fs.readFileSync(txtPath, 'utf-8')
    await importVocabularyData({ prisma, userId: LOCAL_USER_ID, raw })
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { main }
