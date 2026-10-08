// Checklist dashboard: the characters with their completion, then the server/account items (shared by all
// characters); a character's own list on its page. Entries, charges and owners are tiles in the shared anatomy:
// icon / ring column left, name, two-line sub, bar + footer, −/+ column at the right edge.
import { useState } from 'react'
import { CheckCheck, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Server, Trash2, UserCheck } from 'lucide-react'
import { S, V, bump, useApp } from '@/core/state'
import { t, hm } from '@/core/i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CHECK, CHECK_ICON, CHECK_ICON_DEFAULT, TIER, TIER_TONE, resetIn, checkCount, checkSet, characters, nextReset, progressOf, removeChar, setAll, addChar, renameChar, selectChar, type Kind, type Per } from './checklist'
import { AppSelect } from '@/components/AppSelect'
import { ACCENT, BOX, Bar, BarInfo, BarRight, Columns, Foot, Note, Page, SECT_BTN, Sect, StepCol, T_BODY, T_FOOT, T_META, T_PORTRAIT, T_SUB, T_TITLE, TILE, TILE_CLICK, TILE_P, TONE, TextEntry, TileIcon, grid } from '@/components/kit'
import { alerts, ownerAlertsOf, ownerLevel } from './alerts'
import { AlertList, Charges, LIGHT_DOT } from './ChargeRows'
import { link, profileOf, sourceTip, type Hit } from './plaync'
import { CharSearch, LinkButton, PncAvatar, PncBlock, PncLines } from './PncParts'

const pct = (f: number) => Math.round(f * 100) + ' %'
const GRID = grid('row')

/** One entry: icon in the priority colour, name, tip, bar, count + badges, −/+ column. */
function Entry({ id, max, per, kind, char }: { id: string; max: number; per: Per; kind: Kind; char?: string }) {
  const c = checkCount(id, per, kind, char), full = c >= max, tier = TIER[id] ?? 2
  const tip = t('progress.item.' + id) + ' – ' + t('progress.tip.' + id) + (per === 'server' ? t('progress.perServer') : '')
  return (
    <div data-check={id} data-done={full || undefined} data-tip={tip} className={cn(TILE, TILE_P, 'pr-0', full && 'border-green/30')}>
      <TileIcon icon={CHECK_ICON[id] || CHECK_ICON_DEFAULT} tone={full ? 'green' : TIER_TONE[tier]} tip={t('chk.tier.' + tier)} />
      <div className={T_BODY}>
        <span className={cn(T_TITLE, full && TONE.ok)}>{t('progress.item.' + id)}</span>
        <div className={T_SUB}>{t('progress.tip.' + id)}</div>
        <div className={T_FOOT}>
          <Bar frac={c / max} />
          <div className={T_META}>
            <b className={cn('font-semibold', full ? TONE.ok : 'text-foreground')}>{full ? '✓ ' : ''}{c}/{max}</b>
            <span className={cn('truncate', full ? TONE.off : tier === 1 ? TONE.warn : tier === 2 ? TONE.info : TONE.off)}>{t('chk.tier.' + tier)}</span>
          </div>
        </div>
      </div>
      <StepCol onStep={d => checkSet(id, per, kind, max, c + d, char)} minus={c > 0} plus={!full} tips={['−1', '+1']} />
    </div>
  )
}

/** Daily + weekly blocks of one owner (one <Columns> cell each), each a section line with progress and an "all done" / "reset" action. */
function Lists({ per, char }: { per: Per; char?: string }) {
  return <>
    {CHECK.map(([kind, all]) => {
      const items = all.filter(i => i[2] === per)
      if (!items.length) return null
      const done = items.filter(([id, max]) => checkCount(id, per, kind, char) >= max).length, allDone = done === items.length
      return (
        <div key={kind}>
          <Sect sub={<span className={cn(allDone && TONE.ok)}>{t('progress.doneOf', { n: done, total: items.length })}</span>} right={
            <button className={SECT_BTN} onClick={() => setAll(per, kind, !allDone, char)} data-tip={allDone ? t('chk.resetTip') : t('chk.allDoneTip')}>
              {allDone ? <><RotateCcw />{t('chk.reset')}</> : <><CheckCheck />{t('chk.allDone')}</>}
            </button>}>{t('progress.sect.' + kind)}</Sect>
          <div className={GRID}>{items.map(([id, max]) => <Entry key={id} id={id} max={max} per={per} kind={kind} char={char} />)}</div>
        </div>
      )
    })}
  </>
}

/** Completion ring with the percentage inside, in a portrait-sized box (the "portrait" of an owner tile). */
function RingBox({ frac, level, live, icon: I }: { frac: number; level: 'red' | 'yellow' | null; live?: boolean; icon?: typeof Server }) {
  const size = 44, r = size / 2 - 3, c = 2 * Math.PI * r, col = frac >= 1 ? 'var(--green)' : frac > 0 ? 'var(--gold)' : 'var(--dim)'
  return (
    <span className={cn(T_PORTRAIT, 'relative grid flex-none place-items-center rounded-sm border', frac >= 1 ? BOX.green : level === 'red' ? BOX.red : level === 'yellow' ? BOX.gold : live ? BOX.cyan : BOX.dim)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff14" strokeWidth="3.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-foreground tabular-nums">
        {I ? <I className="size-4 text-muted-foreground" strokeWidth={1.75} /> : Math.round(frac * 100)}
      </span>
    </span>
  )
}

/** Owner tile body: name (live dot, alert dot), daily/weekly split, open entries. */
function OwnerBody({ name, live, level, per, char, sub, right, avatar }: { name: string; live?: boolean; level: 'red' | 'yellow' | null; per: Per; char?: string; sub?: React.ReactNode; right?: React.ReactNode; avatar?: React.ReactNode }) {
  const d = progressOf(per, char, 'd'), w = progressOf(per, char, 'w'), open = openList(per, char)
  return (
    <div className={T_BODY}>
      <span className="flex min-w-0 items-center gap-1.5">
        {live && <i className="size-1.5 flex-none rounded-full bg-green shadow-[0_0_5px_var(--green)]" data-tip={t('chk.active')} />}
        {avatar}
        <span className={cn(T_TITLE, 'text-[13px]')}>{name}</span>
        {level && <i className={cn('size-2 flex-none rounded-full', LIGHT_DOT[level])} data-tip={t('alert.' + level)} />}
        {right && <span className="ml-auto flex flex-none items-center gap-1">{right}</span>}
      </span>
      <div className={T_SUB}>{sub ?? t(live ? 'chk.activeSub' : 'chk.inactiveSub')}</div>
      <div className={T_FOOT}>
        <Bar frac={progressOf(per, char)} />
        <div className={T_META}>
          <span className="truncate">{t('progress.sect.d')} {pct(d)} · {t('progress.sect.w')} {pct(w)}</span>
          <span className={cn('flex-none', open.length ? TONE.warn : TONE.ok)}>{open.length ? t('chk.openN', { n: open.length }) : '✓ ' + t('chk.complete')}</span>
        </div>
      </div>
    </div>
  )
}

/** What an owner still needs, for the tooltip. */
const openList = (per: Per, char?: string) => CHECK.flatMap(([kind, items]) => items.filter(([id, max, p]) => p === per && checkCount(id, p, kind, char) < max)
  .map(([id, max, p]) => `${t('progress.item.' + id)} ${checkCount(id, p, kind, char)}/${max}`))

const charName = (name: string) => (name === 'Standard' ? t('chk.unknownChar') : name)

/** Website portrait of a linked character (title line of its tile). */
const avatarOf = (name: string) => { const p = profileOf(name); return p ? <PncAvatar src={p.img} tip={sourceTip(p)} /> : undefined }
/** Sub text of a character tile: the website info line (linked characters) above the open entries. */
function charSub(name: string, open: string[]) {
  const p = profileOf(name), rest = open.length ? open.join(' · ') : '✓ ' + t('chk.everything')
  return p ? <><PncLines p={p} /><span className="block truncate">{rest}</span></> : rest
}

/** Add a character picked in the website search (or link it if a character of that name exists). */
function addPicked(h: Hit) {
  if (!addChar(h.name) && !characters().includes(h.name)) return false
  void link(h.name, h)
  return true
}

// Character tile on the dashboard: completion ring, name + status, split, open entries. Opens the character's page.
function CharTile({ name, live }: { name: string; live: boolean }) {
  const open = openList('char', name), lvl = ownerLevel('char', name)
  return (
    <button data-char={name} data-tip={open.length ? `${t('chk.open')}: ${open.join(', ')}` : t('chk.everything')} onClick={() => { V.chkPage = name; bump(); document.querySelector('[data-list]')?.scrollTo(0, 0) }}
      className={cn('group', TILE, TILE_P, TILE_CLICK, 'pr-1', live && 'border-green/30', lvl && ACCENT[lvl])}>
      <RingBox frac={progressOf('char', name)} level={lvl} live={live} />
      <OwnerBody name={charName(name)} live={live} level={lvl} per="char" char={name} sub={charSub(name, open)} avatar={avatarOf(name)} />
      <ChevronRight className="size-4 flex-none self-center text-dim transition-colors group-hover:text-gold" />
    </button>
  )
}

// Two clicks instead of a confirm() dialog (dialogs need an activated window, the overlay never takes focus).
function RemoveButton({ name }: { name: string }) {
  const [armed, setArmed] = useState(false)
  return (
    <Button variant={armed ? 'destructive' : 'ghost'} size="xs" className={cn('h-6 text-[11px]', !armed && 'text-muted-foreground hover:text-red')}
      data-tip={t('chk.remove')} onMouseLeave={() => setArmed(false)} onClick={() => (armed ? removeChar(name) : setArmed(true))}>
      <Trash2 />{armed && t('chk.removeAsk')}
    </Button>
  )
}

/** Name field for adding / renaming a character. */
function NameEntry({ init = '', onDone, onCancel }: { init?: string; onDone: (name: string) => boolean; onCancel: () => void }) {
  const [v, setV] = useState(init), [bad, setBad] = useState(false)
  const ok = () => { if (onDone(v)) onCancel(); else setBad(true) }
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1" onClick={e => e.stopPropagation()}>
      <TextEntry value={v} onChange={x => { setV(x); setBad(false) }} onSubmit={ok} onCancel={onCancel} placeholder={t('chk.addPh')} className={cn('w-40 flex-1', bad && 'border-red')} />
      <Button size="xs" variant="outline" disabled={!v.trim()} onClick={ok}>{t('chk.ok')}</Button>
      <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={onCancel}>{t('chk.cancel')}</Button>
      {bad && <span className="w-full text-[11px] text-red">{t('chk.exists')}</span>}
    </span>
  )
}

/** Make active / rename on a character's page. */
function CharActions({ name, live, onRename, onLink }: { name: string; live: boolean; onRename: () => void; onLink: () => void }) {
  return <>
    {!profileOf(name) && <LinkButton onClick={onLink} />}
    {!live && <Button size="xs" variant="outline" className="h-6 text-[11px]" data-tip={t('chk.selectTip')} onClick={() => selectChar(name)}><UserCheck />{t('chk.select')}</Button>}
    <Button size="xs" variant="ghost" className="h-6 text-muted-foreground" data-tip={t('chk.rename')} onClick={onRename}><Pencil /></Button>
  </>
}

/** One character's own page (reached from the dashboard): owner tile with remove, alerts, charges, lists. */
function CharPage({ name, live }: { name: string; live: boolean }) {
  const lvl = ownerLevel('char', name), [renaming, setRenaming] = useState(false), [linking, setLinking] = useState(false)
  const right = <><CharActions name={name} live={live} onRename={() => setRenaming(true)} onLink={() => setLinking(true)} />{!live && <RemoveButton name={name} />}</>
  return <>
    <div className="px-1.5 pt-1.5">
      <div className={cn(TILE, TILE_P, live && 'border-green/30', lvl && ACCENT[lvl])}>
        <RingBox frac={progressOf('char', name)} level={lvl} live={live} />
        {renaming
          ? <NameEntry init={name === 'Standard' ? '' : name} onCancel={() => setRenaming(false)}
            onDone={to => { const ok = renameChar(name, to); if (ok) { V.chkPage = to.trim(); bump() } return ok }} />
          : linking
            ? <CharSearch init={name === 'Standard' ? '' : name} onCancel={() => setLinking(false)} onPick={h => { void link(name, h); setLinking(false) }} />
            : <OwnerBody name={charName(name)} live={live} level={lvl} per="char" char={name} right={right} avatar={avatarOf(name)}
              sub={profileOf(name) ? <PncLines p={profileOf(name)!} /> : undefined} />}
      </div>
    </div>
    <PncBlock char={name} />
    <div className="pt-1"><AlertList alerts={ownerAlertsOf('char', name)} showChar={false} /></div>
    <Columns><Charges per="char" char={name} /><Lists per="char" char={name} /></Columns>
  </>
}

/** Server block header: the same owner tile, not clickable. */
function ServerHead() {
  const lvl = ownerLevel('server', null)
  return (
    <div className="px-1.5 pt-3">
      <div data-server className={cn(TILE, TILE_P, 'border-cyan/25', lvl && ACCENT[lvl])}>
        <RingBox frac={progressOf('server')} level={lvl} icon={Server} />
        <OwnerBody name={t('chk.server') + ' · ' + pct(progressOf('server'))} level={lvl} per="server" sub={t('chk.serverSub')} />
      </div>
    </div>
  )
}

export function CheckTab() {
  useApp()
  const [adding, setAdding] = useState(false)
  const chars = characters(), live = S.state.charName
  if (V.chkPage && !chars.includes(V.chkPage)) V.chkPage = null
  const warn = alerts()
  const bar = <>
    {V.chkPage
      ? <Button variant="ghost" size="xs" className="h-6 text-[12px] text-muted-foreground" onClick={() => { V.chkPage = null; bump() }}><ChevronLeft />{t('chk.back')}</Button>
      : <BarInfo>{t('chk.title')}</BarInfo>}
    {V.chkPage && <span data-drag className="h-6 min-w-2 flex-1 cursor-grab" />}
    <BarRight>{chars.length > 0 && <AppSelect value={live && chars.includes(live) ? live : ''} tip={t('chk.activeSel')} className="h-6 max-w-40 text-xs"
      options={[...(live && chars.includes(live) ? [] : [{ value: '', label: '–' }]), ...chars.map(c => ({ value: c, label: charName(c) }))]}
      onChange={c => c && selectChar(c)} />}<span className="px-1 text-[11.5px] tabular-nums">{t('progress.resetIn', { d: resetIn(nextReset('d')), w: resetIn(nextReset('w')) })}</span></BarRight>
  </>
  return (
    <Page w="rows" bar={bar}>
      {V.chkPage ? <CharPage name={V.chkPage} live={V.chkPage === live} /> : <>
        {warn.length > 0 && <><Sect sub={'· ' + t('alert.sub')}>{t('alert.title')}</Sect><AlertList alerts={warn} /></>}
        <Sect right={!adding && <button data-add-char className={SECT_BTN} data-tip={t('chk.addTip')} onClick={() => setAdding(true)}><Plus />{t('chk.add')}</button>}>{t('chk.chars')}</Sect>
        {adding && <div className="px-1.5 pb-1"><div className={cn(TILE, 'flex-row items-center gap-1.5 py-1')}><CharSearch onManual={addChar} onPick={h => { if (addPicked(h)) setAdding(false) }} onCancel={() => setAdding(false)} /></div></div>}
        {chars.length
          ? <div className={GRID}>{chars.map(c => <CharTile key={c} name={c} live={c === live} />)}</div>
          : !adding && <Note>{t('chk.noChars')}</Note>}
        <ServerHead />
        <Columns><Charges per="server" /><Lists per="server" /></Columns>
      </>}
      <Foot>{t('chk.hint', { hh: hm(nextReset('d')) })}</Foot>
    </Page>
  )
}
