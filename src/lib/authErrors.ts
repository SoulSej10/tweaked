/** Turn the auth service's technical messages into something a person can act on. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return "That email and password don't match. Check them, or reset your password."
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox, or resend the link below.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account. Try signing in.'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Too many tries. Wait a minute and try again.'
  if (m.includes('same password') || m.includes('different from the old')) return 'Choose a password you have not used on this account before.'
  if (m.includes('weak') || m.includes('pwned') || m.includes('known to be')) return 'That password is too easy to guess. Try a longer one.'
  if (m.includes('failed to fetch') || m.includes('network')) return "Can't reach the internet right now. Check your connection."
  if (m.includes('expired') || m.includes('invalid') && m.includes('token')) return 'That link has expired or was already used. Request a new one.'
  if (m.includes('signup') && m.includes('disabled')) return 'New sign-ups are switched off right now.'
  if (m.includes('provider') && m.includes('not enabled')) return 'Google sign-in is not switched on yet.'
  return message
}

/** Rules for a new password. Returns a message when it is not good enough, or null when it is fine. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Mix letters and numbers.'
  return null
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())
}

/** Read an error that a sign-in link put in the address (expired email link, cancelled Google sign-in...). */
export function errorFromAddress(hash: string, search: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, '') || search)
  const desc = params.get('error_description') ?? params.get('error')
  if (!desc) return null
  const code = params.get('error_code') ?? ''
  if (code === 'otp_expired' || /expired|invalid/i.test(desc)) return 'That link has expired or was already used. Request a new one.'
  if (/access_denied/i.test(params.get('error') ?? '')) return 'Sign-in was cancelled.'
  return desc.replace(/\+/g, ' ')
}
