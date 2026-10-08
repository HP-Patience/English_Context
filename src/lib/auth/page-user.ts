import { redirect } from 'next/navigation'
import { getLocalUserId } from '@/lib/prisma'
import { AuthenticationRequiredError } from './errors'

/** Page-only guard: API handlers keep their 401 error contract. */
export async function requirePageUserId(): Promise<string> {
  try {
    return await getLocalUserId()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
  }
  redirect('/login')
}
