'use client'

/**
 * One load for the whole professional app: `/counsel/me` (the seat) and
 * `/flags` (the tenant's effective flags), read once at the layout and shared
 * by the nav, the gate and the pages. The api is the real gate — every
 * `/counsel/*` route answers 404 when counsel_surfaces is dark and 403 when
 * the seat is gone — so this context only decides what to render.
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { getCounselMe } from '@/lib/api'
import { DARK, useFlags, type FlagMap } from '@/lib/flags'
import type { CounselMe } from '@/lib/counsel'

export type SeatState = 'loading' | 'ok' | 'gone' | 'dark' | 'error'

export interface CounselContextValue {
  me: CounselMe | null
  flags: FlagMap
  /** `loading` until both loads land; `gone` = 403 (the seat was removed); `dark` = 404 (the surface is off for this tenant). */
  seat: SeatState
  reload: () => void
}

const Ctx = createContext<CounselContextValue>({ me: null, flags: { ...DARK }, seat: 'loading', reload: () => {} })

export function CounselProvider({ children }: { children: React.ReactNode }) {
  const { flags, loaded } = useFlags()
  const [me, setMe] = useState<CounselMe | null>(null)
  const [state, setState] = useState<SeatState>('loading')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    getCounselMe()
      .then(async (r) => {
        if (!alive) return
        if (r.ok) {
          setMe((await r.json()) as CounselMe)
          setState('ok')
        } else if (r.status === 403) setState('gone')
        else if (r.status === 404) setState('dark')
        else setState('error')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [tick])

  const seat: SeatState = !loaded || state === 'loading' ? 'loading' : state
  return <Ctx.Provider value={{ me, flags, seat, reload: () => setTick((t) => t + 1) }}>{children}</Ctx.Provider>
}

export function useCounsel(): CounselContextValue {
  return useContext(Ctx)
}
