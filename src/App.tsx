import { useCallback, useEffect, useRef, useState } from 'react'
import { RadarScope } from './engine/scope.ts'
import { useChainPulse } from './hooks/useChainPulse.ts'
import { FAMILIES, familyColor, familyLabel, type Family } from './lib/programs.ts'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scopeRef = useRef<RadarScope | null>(null)
  if (!scopeRef.current) scopeRef.current = new RadarScope()

  const reduced = usePrefersReducedMotion()
  const [killed, setKilled] = useState(false)
  const killedRef = useRef(false)
  const reducedRef = useRef(reduced)
  killedRef.current = killed
  reducedRef.current = reduced

  const { hud, pull } = useChainPulse(killed)
  const pullRef = useRef(pull)
  pullRef.current = pull
  const hudRef = useRef(hud)
  hudRef.current = hud

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    const scope = scopeRef.current!
    let raf = 0
    let last = performance.now()

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const parent = canvas.parentElement ?? canvas
      const rect = parent.getBoundingClientRect()
      const cssW = Math.max(1, rect.width)
      const cssH = Math.max(1, rect.height)
      const w = Math.max(1, Math.floor(cssW * dpr))
      const h = Math.max(1, Math.floor(cssH * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas.parentElement ?? canvas)

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const pulse = hudRef.current
      scope.frozen = killedRef.current
      scope.reduced = reducedRef.current
      scope.tps = pulse.tps
      scope.fee = pulse.fee
      if (pulse.slot != null) scope.setSlot(pulse.slot, now)
      scope.step(dt, now, () => pullRef.current())
      const parent = canvas.parentElement ?? canvas
      const rect = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      scope.draw(ctx, rect.width, rect.height, dpr, now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const toggleXmtr = useCallback(() => {
    setKilled((k) => !k)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return
      }
      e.preventDefault()
      toggleXmtr()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleXmtr])

  const slot = hud.slot != null ? hud.slot.toLocaleString('en-US') : '—'
  const tps = hud.tps != null ? Math.round(hud.tps).toLocaleString('en-US') : '—'
  const rtt = hud.rttMs != null ? `${Math.round(hud.rttMs)}` : '—'
  const live = hud.live && !killed

  return (
    <div className={killed ? 'ops killed' : 'ops'}>
      <header className="mast">
        <p className="kicker">PPI-1 · confirmed slot · mainnet</p>
        <h1>SLOTRADAR</h1>
        <p className="lede">the chain, as a CRT scope</p>
      </header>

      <main className="bay">
        <div className="well">
          <canvas
            ref={canvasRef}
            className="scope"
            role="img"
            aria-label="PPI radar scope of recent Solana transactions"
          />
        </div>

        <aside className="plate" aria-label="Scope instruments">
          <p className="plate-mark">RK · SCOPE 04 · OPS</p>
          <dl className="reads">
            <Readout k="slot" v={slot} live={live} />
            <Readout k="tps" v={tps} live={live} />
            <Readout k="rtt" v={rtt} unit="ms" live={live} />
            <Readout k="rpc" v={hud.degraded ? 'degraded' : hud.host} live={live} />
          </dl>
          <div className="bloom" aria-hidden="true">
            <span>clutter</span>
            <i>
              <b style={{ width: `${Math.round(hud.fee * 100)}%` }} />
            </i>
            <span>hot</span>
          </div>
          <button
            type="button"
            className={killed ? 'xmtr dead' : 'xmtr'}
            onClick={toggleXmtr}
            aria-pressed={killed}
            aria-label={killed ? 'Arm transmitter and resume live sweep' : 'Kill transmitter and freeze sweep'}
          >
            <span className="xmtr-lamp" />
            <span className="xmtr-copy">
              <em>{killed ? 'killed' : 'armed'}</em>
              {killed ? 'ARM XMTR' : 'KILL XMTR'}
            </span>
          </button>
          <ol className="legend">
            {FAMILIES.map((f) => (
              <li key={f}>
                <i style={{ background: familyColor(f as Family) }} />
                {familyLabel(f as Family)}
              </li>
            ))}
            <li>
              <i className="ghost" />
              fail ghost
            </li>
          </ol>
          <p className="hint">Space kills the transmitter. Arm again to resume the live sweep.</p>
        </aside>
      </main>
    </div>
  )
}

function Readout({
  k,
  v,
  unit,
  live,
}: {
  k: string
  v: string
  unit?: string
  live: boolean
}) {
  return (
    <div className={live ? 'read live' : 'read'}>
      <dt>{k}</dt>
      <dd>
        {v}
        {unit ? <em>{unit}</em> : null}
      </dd>
    </div>
  )
}
