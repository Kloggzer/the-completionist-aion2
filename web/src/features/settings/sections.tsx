// Contents of the settings categories.
import { useEffect, useReducer } from 'react'
import { Box } from 'lucide-react'
import { DEF_UI, G, S, U, V, saveUi, bump, type Any } from '@/core/state'
import { host, onHost } from '@/core/host'
import { emit } from '@/core/bus'
import { t, osLang } from '@/core/i18n'
import { HK_IDS, hkText, keyText, modText, syncLang } from '@/core/session'
import { TTS_KINDS, say, voices } from '@/core/tts'
import { AppSelect } from '@/components/AppSelect'
import { loadMapArt } from '@/core/data'
import { Button } from '@/components/ui/button'
import { Group, Row, Toggle, Stepper } from './parts'
import { RegionSelect } from '@/features/progress/PncParts'
import { cn } from '@/lib/utils'

const pct = (v: number) => Math.round(v * 100) + ' %'

/** Generic stepper rule: snap to step, clamp, 2 decimals. */
function stepVal(cur: number, d: number, step: number, min: number, max: number) {
  const v = Math.round((cur + step * d) / step) * step
  return Math.min(max, Math.max(min, Math.round(v * 100) / 100))
}

const close = () => { V.settingsOpen = false; bump() }
// soundTimer/startChime default to on (undefined = on).
const DEF_ON = ['soundTimer', 'startChime']
const isOn = (k: string) => (DEF_ON.includes(k) ? U[k] !== false : !!U[k])
function flip(k: string) {
  U[k] = DEF_ON.includes(k) ? U[k] === false : !U[k]
  saveUi([k]); emit('recompute'); bump()
}
const UToggle = ({ k, sub }: { k: string; sub?: React.ReactNode }) =>
  <Toggle label={t('set.' + k)} sub={sub ?? (t('set.' + k + '.sub') !== 'set.' + k + '.sub' ? t('set.' + k + '.sub') : undefined)} on={isOn(k)} onChange={() => flip(k)} />

// ---------------------------------------------------------------- general

export function General() {
  const st = S.settings
  const langs = [
    { value: 'auto', label: t('set.lang.auto', { lang: t('set.lang.' + osLang()) }) },
    { value: 'de', label: t('set.lang.de') }, { value: 'en', label: t('set.lang.en') },
  ]
  const setOpacity = (d: number) => { const v = stepVal(st.opacity, d, 0.05, 0.3, 1); st.opacity = v; host({ type: 'opacity', v }); bump() }
  const setZoom = (d: number) => { const v = stepVal(st.zoom, d, 0.05, 0.7, 1.6); st.zoom = v; host({ type: 'zoom', v }); bump() }
  return <>
    <Group title={t('set.g.display')}>
      <Row label={t('set.lang')}>
        <AppSelect value={U.lang === 'de' || U.lang === 'en' ? U.lang : 'auto'} options={langs} className="w-52 max-w-full"
          onChange={v => { U.lang = v; saveUi(['lang']); syncLang(); bump() }} />
      </Row>
      <Stepper label={t('set.opacity')} value={pct(st.opacity)} onStep={setOpacity} minus={st.opacity > 0.3} plus={st.opacity < 1} />
      <Stepper label={t('set.zoom')} value={pct(st.zoom)} onStep={setZoom} minus={st.zoom > 0.7} plus={st.zoom < 1.6} />
      <UToggle k="toasts" />
    </Group>
    <Group title={t('set.g.window')}>
      <Row label={t('set.windowMode')} sub={t('set.windowMode.sub')}>
        <AppSelect value={S.settings.dock || 'auto'} onChange={v => { S.settings.dock = v; host({ type: 'dock', dock: v }); bump() }}
          options={['auto', 'overlay', 'window'].map(v => ({ value: v, label: t('dock.opt.' + v) }))} className="w-44" />
      </Row>
      <Row label={t('set.click')} sub={t('set.click.sub', { key: hkText('click') })}>
        <Button size="sm" variant="outline" onClick={() => { close(); host({ type: 'clickThrough' }) }}>{t('set.click.btn')}</Button>
      </Row>
      <Row label={t('set.site')} sub={hkText('site') || undefined}>
        <Button size="sm" variant="outline" onClick={() => { close(); host({ type: 'site', on: true, map: U.map }) }}>{t('set.site.btn')}</Button>
      </Row>
    </Group>
    <Group title={t('set.g.app')}>
      <Row label={t('set.quit')}>
        <Button size="sm" variant="destructive" onClick={() => host({ type: 'quit' })}>{t('set.quit.btn')}</Button>
      </Row>
    </Group>
  </>
}

// ---------------------------------------------------------------- map

export function MapSettings() {
  // The cube layer explains its symbol (same colour as on the map).
  const cubeSub = <span className="inline-flex items-center gap-1"><Box className="size-3 text-[#d9a8ff]" />{t('set.l.cubes.spot')}</span>
  const layer = (l: string) =>
    <Toggle key={l} label={t('set.l.' + l)} sub={l === 'cubes' ? cubeSub : undefined} on={!!U.layers[l]} onChange={() => { U.layers[l] = !U.layers[l]; saveUi(['layers']); emit('draw'); bump() }} />
  return <>
    <Group title={t('set.g.layers')}>
      <Row label={t('set.mapStyle')} sub={t('set.mapStyle.sub')}>
        <AppSelect value={U.mapStyle === 'relief' ? 'relief' : 'map'} options={['map', 'relief'].map(k => ({ value: k, label: t('set.mapStyle.' + k) }))} className="w-32"
          onChange={v => { U.mapStyle = v; saveUi(['mapStyle']); loadMapArt(U.map); emit('draw'); bump() }} />
      </Row>
      {['spawns', 'spots', 'cubes', 'labels'].map(layer)}
    </Group>
  </>
}

// ---------------------------------------------------------------- targets & filters

const SORT_KEYS = ['prio', 'near', 'spawns', 'name']

function stepLv(k: 'lvMin' | 'lvMax', d: number) {
  const cur = U[k]
  let v = stepVal(cur, d, 5, 1, 60)
  if (k === 'lvMin' && cur === 1 && v > 1) v = 5 // 1 → 5 → 10 …
  U[k] = Math.max(1, v)
  if (U.lvMin > U.lvMax) { if (k === 'lvMin') U.lvMax = U.lvMin; else U.lvMin = U.lvMax }
  saveUi(['lvMin', 'lvMax']); emit('recompute'); bump()
}

export function Filters() {
  return <>
    <Group title={t('set.g.list')}>
      <Row label={t('set.sort')}>
        <AppSelect value={U.sort} options={SORT_KEYS.map(k => ({ value: k, label: t('set.sort.' + k) }))} className="w-40"
          onChange={v => { U.sort = v; saveUi(['sort']); emit('recompute'); bump() }} />
      </Row>
      <UToggle k="hideNamed" />
      <UToggle k="showLv3" />
    </Group>
    <Group title={t('set.g.level')}>
      <Stepper label={t('set.lvMin')} value={U.lvMin} onStep={d => stepLv('lvMin', d)} minus={U.lvMin > 1} plus={U.lvMin < 60} />
      <Stepper label={t('set.lvMax')} value={U.lvMax} onStep={d => stepLv('lvMax', d)} minus={U.lvMax > 1} plus={U.lvMax < 60} />
    </Group>
    <Group>
      <Row label={t('set.reset')} sub={t('set.reset.sub')}>
        <Button size="sm" variant="outline" onClick={() => {
          Object.assign(U, { sort: DEF_UI.sort, hideNamed: DEF_UI.hideNamed, showLv3: DEF_UI.showLv3, lvMin: DEF_UI.lvMin, lvMax: DEF_UI.lvMax })
          saveUi(['sort', 'hideNamed', 'showLv3', 'lvMin', 'lvMax']); emit('recompute'); bump()
        }}>{t('set.reset.btn')}</Button>
      </Row>
    </Group>
  </>
}

// ---------------------------------------------------------------- notifications

/** Re-render when the Windows voices arrive (getVoices() is empty at first). */
function useVoices() {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    if (!window.speechSynthesis) return
    speechSynthesis.addEventListener('voiceschanged', force)
    return () => speechSynthesis.removeEventListener('voiceschanged', force)
  }, [])
  return voices()
}

export function Notify() {
  const vs = useVoices()
  const vol = U.ttsVol ?? 0.8, rate = U.ttsRate ?? 1.05, lead = U.timerLead ?? 10
  const voiceOpts = vs.map(v => ({ value: v.name, label: v.name.replace(/^Microsoft /, '').replace(/ - .*$/, '') }))
  const voice = vs.find(v => v.name === U.ttsVoice)?.name ?? vs[0]?.name ?? ''
  return <>
    <Group title={t('set.g.sound')}>
      <UToggle k="soundTimer" />
      <UToggle k="startChime" />
    </Group>
    <Group title={t('set.g.tts')}>
      <Toggle label={t('set.tts')} sub={t('set.tts.sub')} on={!!U.tts}
        onChange={() => { U.tts = !U.tts; saveUi(['tts']); bump(); if (U.tts) say('test', t('set.say.on')) }} />
      {U.tts && <>
        <Stepper label={t('set.ttsVol')} value={pct(vol)} minus={vol > 0.1} plus={vol < 1} onStep={d => {
          U.ttsVol = Math.min(1, Math.max(0.1, Math.round((vol + 0.1 * d) * 10) / 10)); saveUi(['ttsVol']); bump(); say('test', t('set.say.vol'))
        }} />
        {window.speechSynthesis && (
          <Row label={t('set.ttsVoice')} sub={vs.length ? undefined : t('set.ttsVoice.none')}>
            {vs.length > 0 && <AppSelect value={voice} options={voiceOpts} className="w-48 max-w-full"
              onChange={v => { U.ttsVoice = v; saveUi(['ttsVoice']); bump(); say('test', t('set.say.voice')) }} />}
          </Row>
        )}
        <Stepper label={t('set.ttsRate')} value={pct(rate)} minus={rate > 0.7} plus={rate < 1.6} onStep={d => {
          U.ttsRate = Math.min(1.6, Math.max(0.7, Math.round((rate + 0.05 * d) * 100) / 100)); saveUi(['ttsRate']); bump(); say('test', t('set.say.rate'))
        }} />
      </>}
    </Group>
    {U.tts && (
      <Group title={t('set.g.ttsKinds')}>
        {TTS_KINDS.map(k => (
          <Toggle key={k} label={t('set.tts.' + k)} on={!U.ttsOff?.[k]} onChange={() => {
            U.ttsOff ||= {}; U.ttsOff[k] = !U.ttsOff[k]; saveUi(['ttsOff']); bump(); if (!U.ttsOff[k]) say(k, t('set.say.test'))
          }} />
        ))}
      </Group>
    )}
    <Group title={t('set.g.timer')}>
      <Stepper label={t('set.timerLead')} sub={t('set.timerLead.sub')} value={lead + ' min'} minus={lead > 1} plus={lead < 30}
        onStep={d => { U.timerLead = Math.min(30, Math.max(1, lead + d)); saveUi(['timerLead']); bump() }} />
    </Group>
  </>
}

// ---------------------------------------------------------------- hotkeys

const KEYS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'0123456789'.split('').map(d => 'D' + d), ...Array.from({ length: 12 }, (_, i) => 'F' + (i + 1)), 'PageUp', 'PageDown', 'Home', 'End', 'Insert', 'Delete', 'Oemplus', 'OemMinus']
const MODS = ['Alt', 'Ctrl', 'Shift', 'Ctrl+Alt', 'Ctrl+Shift', 'Alt+Shift', '']

function HotkeyRow({ id }: { id: string }) {
  const st = S.settings
  const combo: string = st.hotkeys?.[id] || '', parts = combo.split('+'), key = parts.pop() || '', mod = parts.join('+')
  const bad = !!combo && st.hotkeyOk?.[id] === false
  const send = (m: string, k: string) => host({ type: 'hotkey', action: id, combo: k ? (m ? m + '+' : '') + k : '' })
  return (
    <Row label={t('hk.' + id)} sub={bad ? t('hk.taken') : undefined} subClass="text-red">
      <AppSelect value={mod} tip={t('set.hk.mod')} options={MODS.map(m => ({ value: m, label: modText(m) }))} onChange={m => send(m, key)}
        className={cn('w-28', bad && 'border-red')} />
      <AppSelect value={key} tip={t('set.hk.key')} options={[{ value: '', label: '–' }, ...KEYS.map(k => ({ value: k, label: keyText(k) }))]} onChange={k => send(mod, k)}
        className={cn('w-20', bad && 'border-red')} />
    </Row>
  )
}

export function Hotkeys() {
  return <Group>{HK_IDS.map(id => <HotkeyRow key={id} id={id} />)}</Group>
}

// ---------------------------------------------------------------- data

// "Lädt …" on the refresh button until the host reports the data again.
let refreshing = false
onHost('dataReady', () => { refreshing = false; bump() })

export function Data() {
  const st = S.settings
  return <>
    <Group>
      <Toggle label={t('set.online')} sub={t('set.online.sub')} on={!!st.onlineUpdates}
        onChange={() => { st.onlineUpdates = !st.onlineUpdates; host({ type: 'online', on: st.onlineUpdates }); bump() }} />
      <Row label={t('set.refresh')} sub={t('set.refresh.sub')}>
        <Button size="sm" variant="outline" disabled={!st.onlineUpdates}
          onClick={() => { refreshing = true; host({ type: 'refresh' }); G.md = {} as Any; bump() }}>
          {refreshing ? t('set.refresh.busy') : t('set.refresh.btn')}
        </Button>
      </Row>
      <Row label={t('set.statePath')} sub={<span className="font-mono text-[11px] break-all">{st.statePath}</span>}>
        <Button size="sm" variant="outline" onClick={() => host({ type: 'pickState' })}>{t('set.statePath.btn')}</Button>
      </Row>
    </Group>
    <Group title={t('set.g.pnc')}>
      <Row label={t('set.pncRegion')} sub={t('set.pncRegion.sub')}><RegionSelect className="w-36" /></Row>
    </Group>
    <Group title={t('set.g.about')}>
      <Row label={t('set.version')} sub={`The Completionist ${st.version || '–'}`} />
    </Group>
    <Group title={t('set.credit.title')}>
      <div className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {t('set.credit.data')} <a href="https://aion2maps.com/" target="_blank" rel="noreferrer" className="text-gold hover:underline">aion2maps.com</a> {t('set.credit.thanks')}<br />
        {t('set.credit.safe')}
      </div>
    </Group>
  </>
}
