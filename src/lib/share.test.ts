import { describe, expect, it } from 'vitest'
import { claimToken, describeShare, type ShareRow } from './share'

const row = (over: Partial<ShareRow> = {}): ShareRow => ({
  id: '1', recipe_id: 'r', kind: 'once', created_at: '2026-11-01T00:00:00Z', expires_at: '2026-11-08T00:00:00Z',
  claimed_at: null, views: 0, revoked_at: null, ...over,
})
const NOW = new Date('2026-11-03T00:00:00Z').getTime()

describe('describeShare', () => {
  it('says a fresh one-person link is waiting, and stays live', () => {
    expect(describeShare(row(), NOW)).toEqual({ label: 'Waiting to be opened', live: true })
  })
  it('says a claimed one-person link is kept by one person', () => {
    expect(describeShare(row({ claimed_at: '2026-11-02T00:00:00Z' }), NOW).label).toMatch(/kept by one person/)
  })
  it('counts views on an open link', () => {
    expect(describeShare(row({ kind: 'open', views: 0 }), NOW).label).toMatch(/not viewed yet/)
    expect(describeShare(row({ kind: 'open', views: 1 }), NOW).label).toMatch(/viewed 1 time$/)
    expect(describeShare(row({ kind: 'open', views: 4 }), NOW).label).toMatch(/viewed 4 times$/)
  })
  it('marks expired and stopped links as no longer live (stopped wins)', () => {
    expect(describeShare(row({ expires_at: '2026-11-02T00:00:00Z' }), NOW)).toEqual({ label: 'Expired', live: false })
    expect(describeShare(row({ revoked_at: '2026-11-02T00:00:00Z', expires_at: '2026-11-02T00:00:00Z' }), NOW)).toEqual({ label: 'Stopped by you', live: false })
  })
})

describe('claimToken', () => {
  it('is long enough for the server to accept and stays the same for this browser', () => {
    const a = claimToken()
    expect(a.length).toBeGreaterThanOrEqual(16)
    expect(claimToken()).toBe(a)
  })
})
