import { PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function normalizeBootstrapAccount({ userId, username, passwordHash }) {
  const id = String(userId ?? '').trim()
  const normalizedUsername = String(username ?? '').trim().toLowerCase()
  const normalizedHash = String(passwordHash ?? '').trim()
  if (!id || !normalizedUsername || !normalizedHash) {
    throw new Error('Bootstrap account requires a user ID, username, and password hash.')
  }
  return {
    id,
    username: normalizedUsername,
    passwordHash: normalizedHash,
    role: 'admin',
    status: 'active',
    statsSharingEnabled: true,
  }
}

export async function migrateSingleUserToAdmin({ prisma, env = process.env } = {}) {
  const client = prisma ?? new PrismaClient()
  const ownsClient = !prisma
  try {
    const account = normalizeBootstrapAccount({
      userId: env.LOCAL_USER_ID || 'local-user',
      username: env.APP_AUTH_USERNAME,
      passwordHash: env.APP_AUTH_PASSWORD_HASH,
    })
    return await client.user.upsert({
      where: { id: account.id },
      update: {
        username: account.username,
        passwordHash: account.passwordHash,
        role: account.role,
        status: account.status,
        statsSharingEnabled: account.statsSharingEnabled,
      },
      create: {
        id: account.id,
        username: account.username,
        passwordHash: account.passwordHash,
        role: account.role,
        status: account.status,
        statsSharingEnabled: account.statsSharingEnabled,
        email: 'local@contextvocab.app',
        name: account.username,
      },
    })
  } finally {
    if (ownsClient) await client.$disconnect()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await migrateSingleUserToAdmin()
  console.log('Single-user data was migrated to the administrator account.')
}



