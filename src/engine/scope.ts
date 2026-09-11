import { PALETTE } from '../lib/palette.ts'
import { familyColor, type Family } from '../lib/programs.ts'

export type ContactSpec = {
  family: Family
  sig: string | null
  failed: boolean
}

type Blip = {
  bearing: number
  range: number
  family: Family
  failed: boolean
  born: number
  lastPaint: number
}

const TAU = Math.PI * 2
const SLOTS_PER_REV = 48
const RAD_PER_SLOT = TAU / SLOTS_PER_REV

export function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function polar(
  sig: string | null,
  family: Family,
  salt: number,
  sweep: number,
): { bearing: number; range: number } {
  const h = sig ? hash32(sig) : (Math.imul(salt, 2654435761) >>> 0)
  const spread = (((h & 0xffff) / 0xffff) - 0.5) * 0.28
  const bearing = (sweep + spread + TAU) % TAU
  const band: Record<Family, number> = {
    SYS: 0.3,
    JUP: 0.44,
    RAY: 0.56,
    TKN: 0.68,
    STK: 0.8,
    '???': 0.9,
  }
  const jitter = (((h >>> 16) % 1000) / 1000) * 0.08 - 0.025
  return { bearing, range: Math.min(0.94, Math.max(0.16, band[family] + jitter)) }
}

function hexAlpha(hex: string, a: number): string {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const n = Number.parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`
}

/** bearing 0 = north, clockwise → canvas radians. */
function canvasAngle(bearing: number): number {
  return bearing - Math.PI / 2
}

function inArc(b: number, a0: number, a1: number): boolean {
  if (a1 >= a0) return b >= a0 && b <= a1
  return b >= a0 || b <= a1
}

function swept(prev: number, next: number): [number, number][] {
  const d = (next - prev + TAU) % TAU
  if (d === 0 || d > Math.PI) return []
  if (next >= prev) return [[prev, next]]
  return [
    [prev, TAU],
    [0, next],
  ]
}

export class RadarScope {
  blips: Blip[] = []
  sweep = 0
  prevSweep = 0
  slot: number | null = null
  lastSlotAt = 0
  slotMs = 400
  fee = 0.1
  frozen = false
  reduced = false
  tps: number | null = null
  private salt = 1
  private phosphor: HTMLCanvasElement
  private pctx: CanvasRenderingContext2D
  private pw = 0
  private ph = 0

  constructor() {
    this.phosphor = document.createElement('canvas')
    const ctx = this.phosphor.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('phosphor ctx missing')
    this.pctx = ctx
  }

  ingest(spec: ContactSpec | null, now: number) {
    if (!spec) return
    const { bearing, range } = polar(spec.sig, spec.family, this.salt++, this.sweep)
    this.blips.push({
      bearing,
      range,
      family: spec.family,
      failed: spec.failed,
      born: now,
      lastPaint: -1e12,
    })
    if (this.blips.length > 160) this.blips.splice(0, this.blips.length - 160)
  }

  setSlot(slot: number, now: number) {
    if (this.slot == null) {
      this.slot = slot
      this.sweep = (slot * RAD_PER_SLOT) % TAU
      this.prevSweep = this.sweep
      this.lastSlotAt = now
      return
    }
    if (slot === this.slot) return
    const dt = now - this.lastSlotAt
    if (dt > 80 && dt < 5000) this.slotMs = this.slotMs * 0.65 + dt * 0.35
    this.slot = slot
    this.lastSlotAt = now
  }

  step(dt: number, now: number, pull: () => ContactSpec | null) {
    if (this.frozen) return
    const budget = this.reduced ? 8 : 6
    for (let i = 0; i < budget; i++) {
      const spec = pull()
      if (!spec) break
      this.ingest(spec, now)
    }
    this.blips = this.blips.filter((b) => now - b.born < 32000)

    if (this.reduced) {
      if (this.slot != null) this.sweep = (this.slot * RAD_PER_SLOT) % TAU
      this.prevSweep = this.sweep
      return
    }

    if (this.slot != null) {
      const frac = Math.min(1, (now - this.lastSlotAt) / Math.max(140, this.slotMs))
      this.prevSweep = this.sweep
      this.sweep = ((this.slot + frac) * RAD_PER_SLOT) % TAU
    }
    void dt
  }

  private fitPhosphor(cssW: number, cssH: number, dpr: number) {
    const pw = Math.max(2, Math.floor(cssW * dpr))
    const ph = Math.max(2, Math.floor(cssH * dpr))
    if (this.pw === pw && this.ph === ph) {
      this.pctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      return
    }
    this.pw = pw
    this.ph = ph
    this.phosphor.width = pw
    this.phosphor.height = ph
    this.pctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  draw(ctx: CanvasRenderingContext2D, cssW: number, cssH: number, dpr: number, now: number) {
    const cx = cssW * 0.5
    const cy = cssH * 0.5
    const R = Math.max(40, Math.min(cssW, cssH) * 0.42)

    this.fitPhosphor(cssW, cssH, dpr)
    this.paintPhosphor(cx, cy, R, now)

    ctx.clearRect(0, 0, cssW, cssH)
    drawHousing(ctx, cx, cy, R)
    drawGlass(ctx, cx, cy, R)
    drawReticule(ctx, cx, cy, R)

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R - 0.8, 0, TAU)
    ctx.clip()
    ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(this.phosphor, 0, 0, cssW, cssH)

    if (this.reduced) {
      for (const b of this.blips) stamp(ctx, cx, cy, R, b, b.failed ? 0.95 : 0.8)
    } else {
      for (const b of this.blips) {
        if (!b.failed) continue
        const age = now - b.lastPaint
        if (age < 0 || age > 2600) continue
        stamp(ctx, cx, cy, R, b, (1 - age / 2600) * 0.7)
      }
    }

    if (!this.reduced) drawSweep(ctx, cx, cy, R, this.sweep, this.fee, this.frozen)
    else drawParkedArm(ctx, cx, cy, R, this.sweep)

    drawClutterSnow(ctx, cx, cy, R, this.fee, this.frozen || this.reduced)
    drawScanlines(ctx, cx, cy, R)
    ctx.restore()

    drawBezelMarks(ctx, cx, cy, R, this.sweep)
    drawCenterPip(ctx, cx, cy)
  }

  private paintPhosphor(cx: number, cy: number, R: number, now: number) {
    const p = this.pctx
    if (this.reduced) {
      p.setTransform(1, 0, 0, 1, 0, 0)
      p.clearRect(0, 0, this.phosphor.width, this.phosphor.height)
      return
    }

    if (!this.frozen) {
      const fade = 0.012 + (1 - this.fee) * 0.028
      p.save()
      p.globalCompositeOperation = 'source-over'
      p.fillStyle = hexAlpha(PALETTE.pitch, fade)
      p.beginPath()
      p.arc(cx, cy, R, 0, TAU)
      p.fill()
      p.restore()

      const arcs = swept(this.prevSweep, this.sweep)
      for (const [a0, a1] of arcs) {
        clearSector(p, cx, cy, R, a0, a1)
        washSector(p, cx, cy, R, a0, a1, this.fee)
        sprinkle(p, cx, cy, R, a0, a1, this.fee)
        for (const b of this.blips) {
          if (!inArc(b.bearing, a0, a1)) continue
          stamp(p, cx, cy, R, b, b.failed ? 1 : 0.95)
          b.lastPaint = now
        }
      }
      const trailW = 0.4 + this.fee * 0.18
      const trail0 = (this.sweep - trailW + TAU) % TAU
      for (const [a0, a1] of swept(trail0, this.sweep)) {
        washSector(p, cx, cy, R, a0, a1, this.fee * 0.55)
      }
      for (const b of this.blips) {
        if (b.lastPaint > 0) continue
        stamp(p, cx, cy, R, b, b.failed ? 1 : 0.88)
        b.lastPaint = now
      }
    }
  }
}

function clearSector(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  a0: number,
  a1: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, R, canvasAngle(a0), canvasAngle(a1), false)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function washSector(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  a0: number,
  a1: number,
  fee: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = hexAlpha(PALETTE.phosphor, 0.16 + fee * 0.18)
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, R, canvasAngle(a0), canvasAngle(a1), false)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function sprinkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  a0: number,
  a1: number,
  fee: number,
) {
  const span = (a1 - a0 + TAU) % TAU || 0.01
  const n = Math.floor(6 + fee * 36 + span * 14)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < n; i++) {
    const a = a0 + Math.random() * span
    const r = (0.12 + Math.random() * 0.82) * R
    const x = cx + Math.sin(a) * r
    const y = cy - Math.cos(a) * r
    ctx.fillStyle = hexAlpha(PALETTE.phosphor, 0.08 + Math.random() * 0.14 * (0.5 + fee))
    ctx.fillRect(x, y, 1.35, 1.35)
  }
  ctx.restore()
}

function stamp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  b: Blip,
  alpha: number,
) {
  const x = cx + Math.sin(b.bearing) * b.range * R
  const y = cy - Math.cos(b.bearing) * b.range * R
  const color = b.failed ? PALETTE.ghost : familyColor(b.family)
  const rad = b.failed ? 7.4 : 5.2
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 3.4)
  g.addColorStop(0, hexAlpha(color, alpha))
  g.addColorStop(0.35, hexAlpha(color, alpha * 0.62))
  g.addColorStop(1, hexAlpha(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, rad * 3.4, 0, TAU)
  ctx.fill()
  ctx.fillStyle = hexAlpha('#f6ffe8', alpha)
  ctx.beginPath()
  ctx.arc(x, y, b.failed ? 2 : 1.55, 0, TAU)
  ctx.fill()
}

function drawHousing(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  const outer = R + Math.max(22, R * 0.14)
  const ring = ctx.createRadialGradient(cx - outer * 0.15, cy - outer * 0.2, R, cx, cy, outer)
  ring.addColorStop(0, '#243328')
  ring.addColorStop(0.4, '#151f18')
  ring.addColorStop(0.78, '#1c281f')
  ring.addColorStop(1, '#0c120e')
  ctx.beginPath()
  ctx.arc(cx, cy, outer, 0, TAU)
  ctx.fillStyle = ring
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, outer - 1.5, 0, TAU)
  ctx.strokeStyle = hexAlpha(PALETTE.amber, 0.32)
  ctx.lineWidth = 1.4
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, R + 4.5, 0, TAU)
  ctx.strokeStyle = hexAlpha(PALETTE.phosphor, 0.28)
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, R + 1.2, 0, TAU)
  ctx.strokeStyle = hexAlpha(PALETTE.reticule, 0.95)
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawGlass(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, TAU)
  const glass = ctx.createRadialGradient(cx - R * 0.22, cy - R * 0.28, R * 0.08, cx, cy, R)
  glass.addColorStop(0, '#101a12')
  glass.addColorStop(0.55, '#080e09')
  glass.addColorStop(1, '#050806')
  ctx.fillStyle = glass
  ctx.fill()
}

function drawReticule(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, TAU)
  ctx.clip()
  ctx.strokeStyle = hexAlpha(PALETTE.reticule, 0.88)
  ctx.lineWidth = 1.15
  for (const f of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath()
    ctx.arc(cx, cy, R * f, 0, TAU)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(cx - R, cy)
  ctx.lineTo(cx + R, cy)
  ctx.moveTo(cx, cy - R)
  ctx.lineTo(cx, cy + R)
  ctx.stroke()
  ctx.restore()
}

function drawSweep(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  sweep: number,
  fee: number,
  frozen: boolean,
) {
  const width = 0.42 + fee * 0.22
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, R, canvasAngle(sweep - width), canvasAngle(sweep), false)
  ctx.closePath()
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
  g.addColorStop(0, hexAlpha(PALETTE.phosphor, frozen ? 0.12 : 0.32 + fee * 0.18))
  g.addColorStop(0.55, hexAlpha(PALETTE.phosphor, frozen ? 0.06 : 0.16 + fee * 0.1))
  g.addColorStop(1, hexAlpha(PALETTE.phosphor, frozen ? 0.03 : 0.07))
  ctx.fillStyle = g
  ctx.fill()

  const x = cx + Math.sin(sweep) * R
  const y = cy - Math.cos(sweep) * R
  ctx.strokeStyle = hexAlpha(PALETTE.phosphor, frozen ? 0.55 : 1)
  ctx.lineWidth = frozen ? 1.6 : 2.8
  ctx.shadowColor = PALETTE.phosphor
  ctx.shadowBlur = frozen ? 6 : 18 + fee * 14
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(x, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, 3.2, 0, TAU)
  ctx.fillStyle = hexAlpha('#f3ffe6', frozen ? 0.45 : 0.95)
  ctx.fill()
  ctx.restore()
}

function drawParkedArm(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, sweep: number) {
  const x = cx + Math.sin(sweep) * R
  const y = cy - Math.cos(sweep) * R
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = hexAlpha(PALETTE.phosphor, 0.55)
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(x, y)
  ctx.stroke()
  ctx.restore()
}

function drawClutterSnow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  fee: number,
  still: boolean,
) {
  if (still || fee < 0.18) return
  const n = Math.floor((fee - 0.18) * 28)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU
    const r = Math.random() * R
    ctx.fillStyle = hexAlpha(PALETTE.phosphor, 0.03 + Math.random() * 0.05)
    ctx.fillRect(cx + Math.sin(a) * r, cy - Math.cos(a) * r, 1, 1)
  }
  ctx.restore()
}

function drawScanlines(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, TAU)
  ctx.clip()
  ctx.globalAlpha = 0.07
  ctx.fillStyle = '#000'
  const top = cy - R
  for (let y = top; y < cy + R; y += 3) {
    ctx.fillRect(cx - R, y, R * 2, 1)
  }
  const vig = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.globalAlpha = 1
  ctx.fillStyle = vig
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
  ctx.restore()
}

function drawBezelMarks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  sweep: number,
) {
  ctx.save()
  ctx.strokeStyle = hexAlpha(PALETTE.reticule, 0.85)
  ctx.fillStyle = hexAlpha(PALETTE.amber, 0.72)
  ctx.lineWidth = 1.2
  ctx.font = '600 12px "Share Tech Mono", ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 360; i += 10) {
    const a = (i * Math.PI) / 180
    const long = i % 30 === 0
    const r0 = R + (long ? 5 : 3)
    const r1 = R + (long ? 11 : 7)
    ctx.beginPath()
    ctx.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0)
    ctx.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1)
    ctx.stroke()
  }
  const labels: [number, string][] = [
    [0, '000'],
    [Math.PI / 2, '090'],
    [Math.PI, '180'],
    [Math.PI * 1.5, '270'],
  ]
  for (const [a, t] of labels) {
    const r = R + 20
    ctx.fillText(t, cx + Math.sin(a) * r, cy - Math.cos(a) * r)
  }

  const hx = cx + Math.sin(sweep) * (R + 8)
  const hy = cy - Math.cos(sweep) * (R + 8)
  ctx.fillStyle = PALETTE.phosphor
  ctx.beginPath()
  ctx.arc(hx, hy, 2.2, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function drawCenterPip(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = hexAlpha(PALETTE.phosphor, 0.85)
  ctx.beginPath()
  ctx.arc(cx, cy, 2.4, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = hexAlpha(PALETTE.phosphor, 0.4)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, 5.5, 0, TAU)
  ctx.stroke()
  ctx.restore()
}
