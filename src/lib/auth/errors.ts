export class AuthenticationRequiredError extends Error {
  readonly status = 401

  constructor() {
    super('Authentication required')
    this.name = 'AuthenticationRequiredError'
  }
}
