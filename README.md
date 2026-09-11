# slotradar

Live Solana **mainnet** as a cold-war CRT radar scope. Not an explorer. Not a dashboard. Not a newspaper.

The chain is a PPI scope in a dim ops room — one circular instrument, not a product.
Phosphor is the only light: green-amber CRT, dark bezel, stencil callsigns.
The signature motion is the sweep arm clearing stale glow and painting fresh contacts as the slot clock advances.
Blips are recent txs, tinted by a short named callsign set; failed txs linger as red ghosts.
Kill the transmitter and the last sweep sample freezes; arm it again and live resumes.

Live: https://robertkodes.github.io/slotradar/

## How to read the scope

| Scope | Chain |
| --- | --- |
| Sweep arm | Confirmed slot clock (64 slots / revolution) |
| Blip | A recent transaction |
| Callsign tint | Program family: system, JUP, RAY, token, stake, unknown |
| Clutter / bloom / afterglow | `getRecentPrioritizationFees` pressure, log-scaled |
| Red ghost | Sampled signature with `err` — lingers a beat longer |
| **KILL XMTR** / Space | Freeze the current sweep sample |
| ARM XMTR / Space again | Resume the live feed |

No wallet. No keys. Browser talks JSON-RPC.

## Palette

Named hex, dim ops room, six dyes:

| Token | Hex | Use |
| --- | --- | --- |
| **pitch** | `#070B08` | Ops-room void |
| **phosphor** | `#8FE06A` | CRT green, system contacts, live digits |
| **amber** | `#E0B34A` | Instrument ticks, JUP, kicker |
| **ghost** | `#C94A38` | Failed-tx afterglow, killed lamp |
| **bezel** | `#141E16` | Housing, plate |
| **reticule** | `#2E4A30` | Range rings, ticks |

RAY rust (`#C86A3A`) is amber mixed toward ghost. Token pale (`#C8E8A8`) is phosphor mixed toward glass. Stake dim (`#B89440`) is amber into bezel. Unknown ash (`#5A7A52`) is reticule dimmed into pitch. None is a seventh brand color.

## Type

- **Chakra Petch** — condensed instrument mast. Angular, not Inter, not a SaaS geometric.
- **Share Tech Mono** — HUD figures, callsigns, the XMTR rocker. Reads as a scope plate, not a terminal theme.

## Tinkerer notes

```bash
npm i
npm run dev
```

Vite serves at `/slotradar/`. Open that path, not `/`.

```bash
npm run build
```

must pass. Static `dist/` is force-pushed to the `gh-pages` branch at root (`index.html`, `assets/`, `.nojekyll`). Repo Pages source should be **branch `gh-pages` / folder `/`**. If the live URL 404s: GitHub → Settings → Pages → source **`gh-pages` / root**.

Public RPC, rotating on failure (no API keys):

- `solana-rpc.publicnode.com`
- `solana.publicnode.com`
- `solana-mainnet.publicnode.com`
- `api.mainnet-beta.solana.com`
- `solana.drpc.org`

Override with `VITE_RPC_URL`. Methods: `getSlot`, `getRecentPerformanceSamples`, `getRecentPrioritizationFees`, rotating `getSignaturesForAddress` on a short program roster via `@solana/web3.js`. If RPC flakes, the scope keeps the last phosphor and the plate marks **degraded**.

`prefers-reduced-motion`: static scope + parked arm; slot / TPS / RTT still update until you kill the transmitter.

Space or the XMTR rocker freezes the sweep.
