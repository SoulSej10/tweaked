import { describe, expect, it } from 'vitest'
import { errorFromAddress, friendlyAuthError, isEmail, passwordProblem } from './authErrors'

describe('friendlyAuthError', () => {
  it('explains the common sign-in failures', () => {
    expect(friendlyAuthError('Invalid login credentials')).toMatch(/don't match/)
    expect(friendlyAuthError('Email not confirmed')).toMatch(/confirm your email/i)
    expect(friendlyAuthError('User already registered')).toMatch(/already has an account/)
    expect(friendlyAuthError('email rate limit exceeded')).toMatch(/Too many/)
    expect(friendlyAuthError('Failed to fetch')).toMatch(/internet/)
    expect(friendlyAuthError('New password should be different from the old password.')).toMatch(/not used/)
  })
  it('passes unknown messages through instead of hiding them', () => {
    expect(friendlyAuthError('Something unusual')).toBe('Something unusual')
  })
})

describe('passwordProblem', () => {
  it('asks for length, letters and numbers', () => {
    expect(passwordProblem('short1')).toMatch(/8 characters/)
    expect(passwordProblem('onlyletters')).toMatch(/letters and numbers/)
    expect(passwordProblem('12345678')).toMatch(/letters and numbers/)
    expect(passwordProblem('goodpass123')).toBeNull()
  })
})

describe('isEmail', () => {
  it('accepts normal addresses and rejects obvious mistakes', () => {
    expect(isEmail('a@b.co')).toBe(true)
    expect(isEmail(' jess@example.com ')).toBe(true)
    expect(isEmail('no-at-sign.com')).toBe(false)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('a b@c.com')).toBe(false)
  })
})

describe('errorFromAddress', () => {
  it('reads an expired email link from the address', () => {
    expect(errorFromAddress('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', '')).toMatch(/expired/)
  })
  it('reads a cancelled sign-in from the query string', () => {
    expect(errorFromAddress('', '?error=access_denied')).toMatch(/cancelled/)
  })
  it('returns null when there is no error', () => {
    expect(errorFromAddress('', '')).toBeNull()
    expect(errorFromAddress('#access_token=abc&type=recovery', '')).toBeNull()
  })
})
