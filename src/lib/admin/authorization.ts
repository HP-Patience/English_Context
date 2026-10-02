import { NextResponse } from 'next/server'

import {
  AdministratorRequiredError,
  AuthenticationRequiredError,
} from '@/lib/auth/current-user'

export function adminErrorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (error instanceof AdministratorRequiredError) {
    return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
    return NextResponse.json({ error: '用户名已存在' }, { status: 409 })
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ error: '操作失败' }, { status: 500 })
}
