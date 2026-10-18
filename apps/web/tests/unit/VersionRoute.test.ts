/** /api/version reports Render's deploy commit so the staging E2E workflow knows when a build is live. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { GET } from '@/app/api/version/route'

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/version', () => {
  it('returns the RENDER_GIT_COMMIT, uncached', async () => {
    vi.stubEnv('RENDER_GIT_COMMIT', 'abc123')
    const res = GET()
    expect(await res.json()).toEqual({ commit: 'abc123' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
  it('returns null where Render did not set it (dev)', async () => {
    vi.stubEnv('RENDER_GIT_COMMIT', '')
    expect(await GET().json()).toEqual({ commit: null })
  })
})
