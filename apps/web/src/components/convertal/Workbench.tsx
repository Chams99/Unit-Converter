'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  ArrowDownUp,
  ArrowLeftRight,
  AspectRatio,
  Bank,
  BoundingBox,
  BoxSeam,
  Braces,
  Calculator,
  CalendarEvent,
  CarFront,
  Check,
  CheckCircle,
  ChevronDown,
  CircleHalf,
  ClockFill,
  CloudArrowUp,
  Copy,
  CurrencyExchange,
  Digits,
  Download,
  Droplet,
  ExclamationCircle,
  ExclamationTriangle,
  FileBinary,
  FileEarmarkArrowDown,
  FileEarmarkImage,
  FileImage,
  Fingerprint,
  Globe2,
  Hdd,
  History,
  ImageFill,
  Info,
  Keyboard,
  Laptop,
  LightningCharge,
  LinkIcon,
  Moon,
  PieChart,
  Plug,
  RefreshCw,
  Rulers,
  Search,
  ShieldCheck,
  Sparkles,
  Speedometer,
  Stopwatch,
  Sun,
  Thermometer,
  Trash2,
  Undo,
  Upload,
  Wrench,
  X,
  Zap,
} from './FlatIcon'
import { ConversionError, convertValue, Decimal, developer, formatSignificant, units, type DisplayNumber, type UnitDefinition } from '@conversion'
import { cn } from '@/lib/utils'

type ToolId = 'units' | 'currency' | 'developer' | 'images'
type DeveloperMode = 'json' | 'base64' | 'url' | 'uuid' | 'timestamp'

type HistoryEntry = {
  id: string
  tool: ToolId
  title: string
  detail: string
  timestamp: number
  payload?: { amount: string; from: string; to: string; category: string }
}

type AddHistory = (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
type ReplayRequest = { entry: HistoryEntry; nonce: number }

type CurrencyQuote = {
  base: string
  quote: string
  rate: string
  provider: string
  sourceTimestamp: string | null
  fetchedAt: string
  stale?: boolean
}

type Icon = typeof Zap

const toolLinks: { id: ToolId; href: string; label: string; description: string; icon: Icon }[] = [
  { id: 'units', href: '/', label: 'Units', description: 'Physical quantities', icon: Calculator },
  { id: 'currency', href: '/currency', label: 'Currency', description: 'Reference rates', icon: CurrencyExchange },
  { id: 'developer', href: '/developer', label: 'Developer', description: 'Text and data tools', icon: Braces },
  { id: 'images', href: '/images', label: 'Images', description: 'Bounded image conversion', icon: ImageFill },
]
const toolIcons = Object.fromEntries(toolLinks.map((tool) => [tool.id, tool.icon])) as Record<ToolId, Icon>

const categoryIcons: Record<string, Icon> = {
  length: Rulers,
  mass: BoxSeam,
  temperature: Thermometer,
  volume: Droplet,
  area: BoundingBox,
  speed: CarFront,
  time: Stopwatch,
  data: Hdd,
  energy: LightningCharge,
  pressure: Speedometer,
  power: Plug,
  angle: PieChart,
}

const unitDimensionKey = (unit: UnitDefinition) => Object.entries(unit.dimension)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, exponent]) => `${name}:${exponent}`)
  .join('|')

const dimensionGroups: Record<string, { id: string; label: string }> = {
  'length:1': { id: 'length', label: 'Length' },
  'length:2': { id: 'area', label: 'Area' },
  'volume:1': { id: 'volume', label: 'Volume' },
  'mass:1': { id: 'mass', label: 'Mass' },
  'time:1': { id: 'time', label: 'Time' },
  'length:1|time:-1': { id: 'speed', label: 'Speed' },
  'length:-1|mass:1|time:-2': { id: 'pressure', label: 'Pressure' },
  'length:2|mass:1|time:-2': { id: 'energy', label: 'Energy' },
  'length:2|mass:1|time:-3': { id: 'power', label: 'Power' },
  'angle:1': { id: 'angle', label: 'Angle' },
  'data:1': { id: 'data', label: 'Data' },
  'temperature:1': { id: 'temperature', label: 'Temperature' },
}

// Presentation order and starting pairs; the registry stays the source of units.
const categoryOrder = ['length', 'mass', 'temperature', 'volume', 'area', 'speed', 'time', 'data', 'energy', 'pressure', 'power', 'angle']
const defaultPairs: Record<string, readonly [string, string]> = {
  length: ['kilometer', 'mile'],
  mass: ['kilogram', 'pound'],
  temperature: ['celsius', 'fahrenheit'],
  volume: ['liter', 'gallon-us'],
  area: ['square-meter', 'square-foot'],
  speed: ['kilometer-per-hour', 'mile-per-hour'],
  time: ['hour', 'minute'],
  data: ['megabyte', 'mebibyte'],
  energy: ['kilocalorie', 'kilojoule'],
  pressure: ['bar', 'psi'],
  power: ['kilowatt', 'horsepower'],
  angle: ['degree', 'radian'],
}

type UnitCategory = { id: string; label: string; units: UnitDefinition[] }

const unitCategories: UnitCategory[] = Array.from(units.reduce((groups, unit) => {
  const key = unitDimensionKey(unit)
  const group = dimensionGroups[key] ?? { id: key, label: key }
  const existing = groups.get(group.id)
  if (existing) existing.units.push(unit)
  else groups.set(group.id, { ...group, units: [unit] })
  return groups
}, new Map<string, UnitCategory>()).values()).sort((left, right) => {
  const rank = (id: string) => { const index = categoryOrder.indexOf(id); return index === -1 ? categoryOrder.length : index }
  return rank(left.id) - rank(right.id)
})

const DEFAULT_CATEGORY = 'length'
const DEFAULT_AMOUNT = '1'
const MAX_URL_AMOUNT_LENGTH = 64
const DISPLAY_DIGITS = 12
const FULL_DIGITS = 40

type UnitState = { category: string; from: string; to: string; amount: string }

function findCategory(id: string | null | undefined): UnitCategory {
  return unitCategories.find((category) => category.id === id) ?? unitCategories.find((category) => category.id === DEFAULT_CATEGORY) ?? unitCategories[0]
}

/** Repairs any requested state into a valid same-category, same-kind pair. */
function resolveUnitState(input: { category?: string | null; from?: string | null; to?: string | null; amount?: string | null }): UnitState {
  const category = findCategory(input.category)
  const preferred = defaultPairs[category.id]
  const unitIn = (id: string | null | undefined) => category.units.find((unit) => unit.id === id)
  const from = unitIn(input.from) ?? unitIn(preferred?.[0]) ?? category.units[0]
  const sameKind = (unit: UnitDefinition | undefined) => unit && unit.kind === from.kind ? unit : undefined
  const to = sameKind(unitIn(input.to)) ?? sameKind(unitIn(preferred?.[1])) ?? category.units.find((unit) => unit.kind === from.kind && unit.id !== from.id) ?? from
  const amount = typeof input.amount === 'string' && input.amount.length <= MAX_URL_AMOUNT_LENGTH ? input.amount : DEFAULT_AMOUNT
  return { category: category.id, from: from.id, to: to.id, amount }
}

const defaultUnitState = resolveUnitState({})

function unitSearch(state: UnitState): string {
  const isDefault = state.category === defaultUnitState.category && state.from === defaultUnitState.from && state.to === defaultUnitState.to && state.amount === defaultUnitState.amount
  return isDefault ? '' : `?${new URLSearchParams({ category: state.category, from: state.from, to: state.to, amount: state.amount })}`
}

const PARTIAL_NUMBER = /^[+-]?\.?$|^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?$/

/** Accepts pasted English digit grouping (1,250 or 1 250) without guessing decimal commas. */
function normalizeAmount(raw: string): string {
  const compact = raw.trim().replace(/[\s_  ]/g, '')
  return /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(compact) ? compact.replace(/,/g, '') : compact
}

function NumberText({ value }: { value: DisplayNumber }) {
  if (value.exponent === null) return <>{value.significand}</>
  const exponent = String(value.exponent).replace('-', '−')
  return <><span aria-hidden="true">{value.significand} <span className="times-ten">×{' '}10<sup>{exponent}</sup></span></span><span className="sr-only">{value.significand} times 10 to the power {value.exponent}</span></>
}

const currencyOptions = [
  ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'Pound sterling'], ['TND', 'Tunisian dinar'],
  ['JPY', 'Japanese yen'], ['CAD', 'Canadian dollar'], ['AUD', 'Australian dollar'],
  ['CHF', 'Swiss franc'], ['MAD', 'Moroccan dirham'], ['AED', 'UAE dirham'],
] as const

const MAX_CURRENCY_AMOUNT = new Decimal('1000000000000')

function parseCurrencyAmount(value: string): InstanceType<typeof Decimal> {
  const trimmed = value.trim()
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) throw new Error('Enter a non-negative decimal amount, without a sign or exponent.')
  const amount = new Decimal(trimmed)
  if (!amount.isFinite() || amount.gt(MAX_CURRENCY_AMOUNT)) throw new Error('Amount must be between 0 and 1,000,000,000,000.')
  return amount
}

function formatCurrencyAmount(amount: InstanceType<typeof Decimal>, currency: string): string {
  const resolved = new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions()
  const fractionDigits = resolved.maximumFractionDigits
  const rounded = amount.toDecimalPlaces(fractionDigits)
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(Number(rounded.toFixed(fractionDigits)))
}

function toolFromPath(pathname: string | null): ToolId {
  if (pathname?.startsWith('/currency')) return 'currency'
  if (pathname?.startsWith('/developer')) return 'developer'
  if (pathname?.startsWith('/images')) return 'images'
  return 'units'
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<HistoryEntry>
  const payload = entry.payload
  return typeof entry.id === 'string' && typeof entry.tool === 'string' && typeof entry.title === 'string' && typeof entry.detail === 'string' && typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp) && Number.isFinite(new Date(entry.timestamp).getTime()) && (payload === undefined || (typeof payload === 'object' && payload !== null && typeof payload.amount === 'string' && typeof payload.from === 'string' && typeof payload.to === 'string' && typeof payload.category === 'string'))
}

// Keep the shared local history bounded across every tool.
const MAX_HISTORY = 30
const HISTORY_PER_TOOL = 8

function usePersistedHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [ready, setReady] = useState(false)
  const [lastCleared, setLastCleared] = useState<{ tool: ToolId; entries: HistoryEntry[] } | null>(null)
  const historyRef = useRef(history)
  useEffect(() => { historyRef.current = history }, [history])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('convertal-history-v1')
      if (stored) {
        const parsed: unknown = JSON.parse(stored)
        if (Array.isArray(parsed)) setHistory(parsed.filter(isHistoryEntry).slice(0, MAX_HISTORY))
      }
    } catch {
      // A blocked or malformed local store should not prevent conversion.
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem('convertal-history-v1', JSON.stringify(history.slice(0, MAX_HISTORY)))
    } catch {
      // Quota or privacy settings must not block the active conversion.
    }
  }, [history, ready])

  const add = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setHistory((current) => [{ ...entry, id: crypto.randomUUID(), timestamp: Date.now() }, ...current.filter((item) => item.detail !== entry.detail)].slice(0, MAX_HISTORY))
  }, [])

  // Clearing only touches the visible tool and stays undoable for this session.
  const clear = useCallback((tool: ToolId) => {
    const removed = historyRef.current.filter((item) => item.tool === tool)
    if (removed.length === 0) return
    setLastCleared({ tool, entries: removed })
    setHistory((current) => current.filter((item) => item.tool !== tool))
  }, [])

  const undoClear = useCallback(() => {
    if (!lastCleared) return
    const restored = lastCleared.entries
    setHistory((current) => [...restored, ...current.filter((item) => !restored.some((entry) => entry.id === item.id || entry.detail === item.detail))]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, MAX_HISTORY))
    setLastCleared(null)
  }, [lastCleared])

  const remove = useCallback((id: string) => setHistory((current) => current.filter((item) => item.id !== id)), [])

  return { history, add, clear, undoClear, lastCleared, remove }
}

function CopyButton({ value, label = 'Copy result', variant = 'icon', onCopy }: { value: string | (() => string); label?: string; variant?: 'icon' | 'text'; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof value === 'function' ? value() : value)
      setCopied(true)
      setStatus('Copied to clipboard')
      onCopy?.()
      window.setTimeout(() => { setCopied(false); setStatus('') }, 1600)
    } catch {
      setCopied(false)
      setStatus('Copy failed. Select the text and copy it manually.')
    }
  }
  const icon = copied ? <Check key="copied" className="icon-pop" aria-hidden="true" /> : variant === 'text' ? <LinkIcon key="link" aria-hidden="true" /> : <Copy key="copy" aria-hidden="true" />
  return (
    <span className="copy-control">
      {variant === 'text'
        ? <button type="button" className="text-button icon-text-button" onClick={copy}>{icon}{copied ? 'Copied' : label}</button>
        : <button type="button" className={cn('icon-button', copied && 'icon-button-done')} onClick={copy} aria-label={label} title={label}>{icon}<span className="sr-only">{label}</span></button>}
      {status && !status.startsWith('Copied') && <span className="copy-status" role="status" aria-live="polite">{status}</span>}
      <span className="sr-only" role="status" aria-live="polite">{status.startsWith('Copied') ? status : ''}</span>
    </span>
  )
}

function SelectField({ label, value, onChange, children, hint, disabled = false, className }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; hint?: string; disabled?: boolean; className?: string }) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <label className={cn('field-group', className)} htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="select-wrap">
        <select id={id} name={id} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          {children}
        </select>
        <ChevronDown aria-hidden="true" />
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function ValueField({ label, value, onChange, placeholder, error, inputMode = 'decimal' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; error?: string; inputMode?: 'decimal' | 'text' }) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const errorId = `${id}-error`
  return (
    <label className="field-group" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input id={id} name={id} autoComplete="off" className={cn('control-input value-input', error && 'input-error')} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
      {error ? <span id={errorId} className="field-error message-with-icon" role="alert"><ExclamationCircle aria-hidden="true" />{error}</span> : null}
    </label>
  )
}

function StatusPill({ tone, children }: { tone: 'neutral' | 'success' | 'warning' | 'danger'; children: React.ReactNode }) {
  return <span className={cn('status-pill', `status-${tone}`)}>{children}</span>
}

function ToolHeader({ icon: ToolIcon, title, description, status }: { icon: Icon; title: string; description: string; status?: React.ReactNode }) {
  return (
    <div className="tool-heading">
      <div className="tool-title">
        <span className="tool-icon"><ToolIcon aria-hidden="true" /></span>
        <div>
          <h1>{title}</h1>
          <p className="tool-description">{description}</p>
        </div>
      </div>
      {status}
    </div>
  )
}

/** Rotates half a turn per press so the motion confirms the action without encoding state. */
function SwapButton({ label, onSwap, direction, className }: { label: string; onSwap: () => void; direction: 'vertical' | 'horizontal'; className?: string }) {
  const [turns, setTurns] = useState(0)
  const SwapIcon = direction === 'vertical' ? ArrowDownUp : ArrowLeftRight
  return (
    <button type="button" className={cn('swap-button', className)} onClick={() => { setTurns((current) => current + 1); onSwap() }} aria-label={label} title={label}>
      <SwapIcon aria-hidden="true" style={{ transform: `rotate(${turns * 180}deg)` }} />
    </button>
  )
}

type UnitResult =
  | { state: 'empty' | 'partial' }
  | { state: 'error'; message: string }
  | { state: 'ready'; input: string; value: string }

function UnitsTool({ addHistory, replay }: { addHistory: AddHistory; replay: ReplayRequest | null }) {
  const [state, setState] = useState<UnitState>(defaultUnitState)
  const [urlLoaded, setUrlLoaded] = useState(false)
  const [fullPrecision, setFullPrecision] = useState(false)
  // Result motion starts only after the first edit so server-rendered content is never hidden.
  const [animateResult, setAnimateResult] = useState(false)
  const [animateList, setAnimateList] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)
  const chipScrollerRef = useRef<HTMLDivElement>(null)

  const category = findCategory(state.category)
  const fromUnit = category.units.find((unit) => unit.id === state.from) ?? category.units[0]
  const toUnit = category.units.find((unit) => unit.id === state.to) ?? fromUnit
  const targetUnits = useMemo(() => category.units.filter((unit) => unit.kind === fromUnit.kind), [category, fromUnit.kind])

  // Read the shareable state once; writing waits until it has been applied.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('category') || params.has('from') || params.has('to') || params.has('amount')) {
      setState(resolveUnitState({ category: params.get('category'), from: params.get('from'), to: params.get('to'), amount: params.get('amount') }))
    }
    setUrlLoaded(true)
  }, [])

  useEffect(() => {
    if (!urlLoaded) return
    const timer = window.setTimeout(() => {
      const next = `${window.location.pathname}${unitSearch(state)}`
      if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [state, urlLoaded])

  useEffect(() => {
    if (!replay?.entry.payload || replay.entry.tool !== 'units') return
    setState(resolveUnitState(replay.entry.payload))
    setSaveStatus('')
    amountRef.current?.focus()
  }, [replay])

  // Keep the selected chip visible in the narrow horizontal scroller.
  useEffect(() => {
    const scroller = chipScrollerRef.current
    const chip = scroller?.querySelector<HTMLElement>('input:checked')?.parentElement
    if (!scroller || !chip || scroller.scrollWidth <= scroller.clientWidth) return
    const left = chip.offsetLeft - scroller.offsetLeft
    if (left < scroller.scrollLeft || left + chip.offsetWidth > scroller.scrollLeft + scroller.clientWidth) scroller.scrollTo({ left: left - 16 })
  }, [state.category])

  const result = useMemo((): UnitResult => {
    if (!state.amount.trim()) return { state: 'empty' }
    const input = normalizeAmount(state.amount)
    if (PARTIAL_NUMBER.test(input)) return { state: 'partial' }
    try {
      return { state: 'ready', input, value: convertValue(input, state.from, state.to).value }
    } catch (error) {
      if (error instanceof ConversionError && error.code === 'invalid_value') return { state: 'error', message: 'Enter a number such as 12.5, 1,250, or 3e8.' }
      return { state: 'error', message: error instanceof Error ? error.message : 'Enter a valid number.' }
    }
  }, [state.amount, state.from, state.to])

  // Reuse formatted values until the result or displayed precision changes.
  const rounded = useMemo(() => result.state === 'ready' ? formatSignificant(result.value, { maximumSignificantDigits: DISPLAY_DIGITS }) : null, [result])
  const full = useMemo(() => result.state === 'ready' && fullPrecision ? formatSignificant(result.value, { maximumSignificantDigits: FULL_DIGITS }) : null, [result, fullPrecision])
  const display = full ?? rounded
  const inputDisplay = useMemo(() => result.state === 'ready' ? formatSignificant(result.input, { maximumSignificantDigits: FULL_DIGITS }) : null, [result])

  const relation = useMemo(() => {
    if (fromUnit.id === toUnit.id) return []
    const affine = fromUnit.offset !== undefined || toUnit.offset !== undefined
    const pairs: [string, UnitDefinition, UnitDefinition][] = affine
      ? [['0', fromUnit, toUnit], ['100', fromUnit, toUnit]]
      : [['1', fromUnit, toUnit], ['1', toUnit, fromUnit]]
    return pairs.flatMap(([amount, source, target]) => {
      try {
        return [{ amount, source, target, value: formatSignificant(convertValue(amount, source.id, target.id).value, { maximumSignificantDigits: 10 }) }]
      } catch {
        return []
      }
    })
  }, [fromUnit, toUnit])

  const otherUnits = useMemo(() => targetUnits.filter((unit) => unit.id !== fromUnit.id).map((unit) => {
    if (result.state !== 'ready') return { unit, value: null }
    try {
      return { unit, value: formatSignificant(convertValue(result.input, fromUnit.id, unit.id).value, { maximumSignificantDigits: DISPLAY_DIGITS }) }
    } catch {
      return { unit, value: null }
    }
  }), [targetUnits, fromUnit, result])

  const historyEntry = useMemo(() => {
    if (!rounded || !inputDisplay) return null
    const text = (value: DisplayNumber) => value.exponent === null ? value.significand : value.plain
    return {
      tool: 'units' as const,
      title: category.label,
      detail: `${text(inputDisplay)} ${fromUnit.symbol} → ${text(rounded)} ${toUnit.symbol}`,
      payload: { amount: state.amount, from: fromUnit.id, to: toUnit.id, category: category.id },
    }
  }, [rounded, inputDisplay, category, fromUnit, toUnit, state.amount])

  const save = () => {
    if (!historyEntry) return
    addHistory(historyEntry)
    setSaveStatus(`Saved to history: ${historyEntry.detail}`)
  }

  const update = (next: (current: UnitState) => UnitState) => {
    setSaveStatus('')
    setAnimateResult(true)
    setState(next)
  }
  const selectCategory = (id: string) => { setAnimateList(true); update(() => resolveUnitState({ category: id, amount: state.amount })) }
  const changeFrom = (id: string) => { setAnimateList(true); update((current) => resolveUnitState({ ...current, from: id })) }
  const changeTo = (id: string) => update((current) => ({ ...current, to: id }))
  const swap = () => update((current) => ({ ...current, from: current.to, to: current.from }))
  const shareUrl = () => `${window.location.origin}${window.location.pathname}${unitSearch(state)}`

  const unitOptions = (options: readonly UnitDefinition[]) => {
    const render = (unit: UnitDefinition) => <option key={unit.id} value={unit.id}>{unit.label} · {unit.symbol}</option>
    const absolute = options.filter((unit) => unit.kind === 'absolute')
    const delta = options.filter((unit) => unit.kind === 'delta')
    if (absolute.length === 0 || delta.length === 0) return options.map(render)
    return <><optgroup label={category.label}>{absolute.map(render)}</optgroup><optgroup label={`${category.label} difference`}>{delta.map(render)}</optgroup></>
  }

  const CategoryIcon = categoryIcons[category.id] ?? Calculator
  const placeholder = result.state === 'partial' ? 'Keep typing…' : result.state === 'error' ? 'No result' : 'Enter an amount'
  const precisionNote = fullPrecision
    ? `Showing up to ${FULL_DIGITS} significant digits, the calculation precision.`
    : display?.rounded ? `Rounded to ${DISPLAY_DIGITS} significant digits; calculated to ${FULL_DIGITS}.` : `Calculated to ${FULL_DIGITS} significant digits on this device.`

  return (
    <>
      <ToolHeader icon={Calculator} title="Unit converter" description="Length, mass, temperature, and more. Results update as you type and never leave this device." />
      <section className="workspace-panel unit-panel" aria-labelledby="unit-converter-title">
        <h2 id="unit-converter-title" className="sr-only">Convert a value</h2>
        <fieldset className="category-picker">
          <legend className="field-label">Category</legend>
          <div className="chip-scroller" ref={chipScrollerRef}>
            {unitCategories.map((option) => {
              const ChipIcon = categoryIcons[option.id] ?? Calculator
              return (
                <label key={option.id} className="category-chip">
                  <input type="radio" name="unit-category" value={option.id} checked={category.id === option.id} onChange={() => selectCategory(option.id)} />
                  <span><ChipIcon aria-hidden="true" />{option.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
        <div className="converter-row">
          <div className="field-group">
            <label className="field-label" htmlFor="field-amount">Amount</label>
            <input ref={amountRef} id="field-amount" name="amount" autoComplete="off" spellCheck={false} enterKeyHint="done" inputMode="decimal" placeholder="12.5" className={cn('control-input value-input', result.state === 'error' && 'input-error')} value={state.amount} onChange={(event) => update((current) => ({ ...current, amount: event.target.value }))} aria-invalid={result.state === 'error'} aria-describedby="field-amount-message" />
            <p id="field-amount-message" className={cn('field-message', result.state === 'error' && 'field-error message-with-icon')} aria-live="polite">{result.state === 'error' && <><ExclamationCircle aria-hidden="true" />{result.message}</>}</p>
          </div>
          <SelectField label="From" value={fromUnit.id} onChange={changeFrom}>{unitOptions(category.units)}</SelectField>
        </div>
        <div className="swap-divider">
          <SwapButton direction="vertical" label="Swap source and target units" onSwap={swap} />
        </div>
        <div className="converter-row">
          <div className="field-group">
            <span className="field-label" id="field-result-label">Result</span>
            <div className={cn('result-output', display && 'result-ready')}>
              <output id="field-result" htmlFor="field-amount field-from field-to" aria-labelledby="field-result-label">
                {display ? <><strong key={`${display.plain}-${toUnit.id}`} className={cn('result-value', animateResult && 'value-enter')}><NumberText value={display} /></strong><span className="result-unit">{toUnit.symbol}</span></> : <span className="placeholder-result">{placeholder}</span>}
              </output>
              {display && <CopyButton value={display.plain} label="Copy result" />}
            </div>
          </div>
          <SelectField label="To" value={toUnit.id} onChange={changeTo}>{unitOptions(targetUnits)}</SelectField>
        </div>
        <div className="converter-meta">
          {relation.length > 0 && (
            <ul className="relation" aria-label="Unit relationship">
              {relation.map(({ amount, source, target, value }) => <li key={`${amount}-${source.id}`}>{amount} {source.symbol} = <NumberText value={value} /> {target.symbol}</li>)}
            </ul>
          )}
          <div className="meta-row">
            <p className="result-meta">{precisionNote}</p>
            <div className="meta-actions">
              {display && (display.rounded || fullPrecision) && <button type="button" className="text-button icon-text-button" aria-pressed={fullPrecision} onClick={() => setFullPrecision((current) => !current)}><Digits aria-hidden="true" />{fullPrecision ? 'Show rounded' : 'Show full precision'}</button>}
              <CopyButton value={shareUrl} label="Copy link" variant="text" />
              <button type="button" className="button button-secondary" onClick={save} disabled={!historyEntry}><History aria-hidden="true" />Save to history</button>
            </div>
            <span className="sr-only" role="status">{saveStatus}</span>
          </div>
        </div>
      </section>
      {otherUnits.length > 0 && (
        <section className="unit-table" aria-labelledby="unit-table-title">
          <h2 id="unit-table-title" className="heading-with-icon"><CategoryIcon aria-hidden="true" /><span>{inputDisplay ? <><NumberText value={inputDisplay} /> {fromUnit.symbol} in other {category.label.toLowerCase()} units</> : `Other ${category.label.toLowerCase()} units`}</span></h2>
          {/* Keyed by category so the list eases in when the category changes, not on every keystroke. */}
          <ul key={`${category.id}-${fromUnit.kind}`} className={cn(animateList && 'list-enter')}>
            {otherUnits.map(({ unit, value }, index) => (
              <li key={unit.id} style={{ '--i': Math.min(index, 8) } as React.CSSProperties}>
                <button type="button" aria-pressed={unit.id === toUnit.id} onClick={() => changeTo(unit.id)} title={`Use ${unit.label} as the target unit`}>
                  <span className="unit-name">{unit.label}</span>
                  <span className="unit-amount">{value ? <NumberText value={value} /> : '—'} {unit.symbol}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function CurrencyTool({ addHistory, replay }: { addHistory: AddHistory; replay: ReplayRequest | null }) {
  const [amount, setAmount] = useState('100')
  const [base, setBase] = useState('USD')
  const [quote, setQuote] = useState('TND')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [amountError, setAmountError] = useState('')
  const [quoteData, setQuoteData] = useState<CurrencyQuote | null>(null)
  const requestSequence = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const queryAmount = params.get('amount')
    const queryBase = params.get('from')
    const queryQuote = params.get('to')
    if (queryAmount) setAmount(queryAmount)
    if (queryBase && currencyOptions.some(([code]) => code === queryBase)) setBase(queryBase)
    if (queryQuote && currencyOptions.some(([code]) => code === queryQuote)) setQuote(queryQuote)
    return () => { abortRef.current?.abort() }
  }, [])
  useEffect(() => {
    const payload = replay?.entry.tool === 'currency' ? replay.entry.payload : undefined
    if (!payload) return
    requestSequence.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setQuoteData(null)
    setStatus('idle')
    setMessage('')
    setAmountError('')
    setAmount(payload.amount)
    if (currencyOptions.some(([code]) => code === payload.from)) setBase(payload.from)
    if (currencyOptions.some(([code]) => code === payload.to)) setQuote(payload.to)
  }, [replay])
  const output = useMemo(() => {
    if (!quoteData || quoteData.base !== base || quoteData.quote !== quote) return null
    try { return formatCurrencyAmount(parseCurrencyAmount(amount).times(quoteData.rate), quote) } catch { return null }
  }, [amount, base, quote, quoteData])
  const invalidateQuote = () => {
    requestSequence.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setQuoteData(null)
    setStatus('idle')
    setMessage('')
  }
  const loadRate = async () => {
    try { parseCurrencyAmount(amount) } catch (error) { setAmountError(error instanceof Error ? error.message : 'Enter a valid amount.'); setStatus('error'); setMessage(''); return }
    setAmountError('')
    const sequence = ++requestSequence.current
    abortRef.current?.abort()
    if (base === quote) { const now = new Date().toISOString(); setQuoteData({ base, quote, rate: '1', provider: 'Local identity', sourceTimestamp: now, fetchedAt: now, stale: false }); setStatus('ready'); return }
    setStatus('loading'); setMessage('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const requestedBase = base
      const requestedQuote = quote
      const response = await fetch(`/api/v1/currency/rates?base=${encodeURIComponent(requestedBase)}&quote=${encodeURIComponent(requestedQuote)}`, { headers: { accept: 'application/json' }, signal: controller.signal })
      const body = await response.json().catch(() => null) as { base?: string; quote?: string; rate?: string | number; provider?: string; sourceTimestamp?: string | null; fetchedAt?: string; stale?: boolean; message?: string } | null
      if (!response.ok || !body?.rate) throw new Error(body?.message ?? 'The rate provider is unavailable right now.')
      if (sequence !== requestSequence.current || requestedBase !== base || requestedQuote !== quote) return
      if (body.base?.toUpperCase() !== requestedBase || body.quote?.toUpperCase() !== requestedQuote) throw new Error('The provider returned a quote for a different currency pair.')
      setQuoteData({ base: requestedBase, quote: requestedQuote, rate: String(body.rate), provider: body.provider ?? 'Reference provider', sourceTimestamp: body.sourceTimestamp ?? null, fetchedAt: body.fetchedAt ?? new Date().toISOString(), stale: body.stale })
      setStatus('ready')
    } catch (error) {
      if (controller.signal.aborted || sequence !== requestSequence.current) return
      setStatus('error'); setMessage(error instanceof Error ? error.message : 'The rate provider is unavailable right now.')
    } finally { if (abortRef.current === controller) abortRef.current = null }
  }
  const save = () => { if (output && quoteData && quoteData.base === base && quoteData.quote === quote) addHistory({ tool: 'currency', title: 'Currency conversion', detail: `${amount} ${base} → ${output}`, payload: { amount, from: base, to: quote, category: 'currency' } }) }
  const updateBase = (value: string) => { invalidateQuote(); setBase(value) }
  const updateQuote = (value: string) => { invalidateQuote(); setQuote(value) }
  const swap = () => { invalidateQuote(); setBase(quote); setQuote(base) }
  return (
    <>
      <ToolHeader icon={CurrencyExchange} title="Currency converter" description="Reference exchange rates, shown with their source and how fresh they are." status={status === 'ready' ? <StatusPill tone={quoteData?.stale ? 'warning' : 'success'}>{quoteData?.stale ? <ExclamationTriangle aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}{quoteData?.stale ? 'Stale cached rate' : 'Rate ready'}</StatusPill> : <StatusPill tone="neutral"><Globe2 aria-hidden="true" />Provider-backed</StatusPill>} />
      <section className="workspace-panel" aria-labelledby="currency-workspace-title"><div className="panel-topline"><div><h2 id="currency-workspace-title">Build a quote</h2></div><span className="shortcut-hint">Reference data · transparent</span></div>
        <div className="currency-grid"><ValueField label="Amount" value={amount} onChange={(value) => { setAmount(value); setAmountError(''); if (status === 'error') { setStatus('idle'); setMessage('') } }} placeholder="e.g. 100" error={amountError} /><SelectField label="From" value={base} onChange={updateBase}>{currencyOptions.map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}</SelectField><SwapButton direction="horizontal" className="currency-swap" label="Swap currencies" onSwap={swap} /><SelectField label="To" value={quote} onChange={updateQuote}>{currencyOptions.map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}</SelectField></div>
        <div className="action-row"><button type="button" className="button button-primary" onClick={loadRate} disabled={status === 'loading'}>{status === 'loading' ? <><RefreshCw className="spin" aria-hidden="true" />Requesting rate</> : <><Zap aria-hidden="true" />Get reference rate</>}</button>{status === 'ready' && output && <button type="button" className="button button-secondary" onClick={save}><History aria-hidden="true" />Save quote</button>}</div>
        {status === 'error' && message && <div className="inline-note note-danger" role="alert" aria-live="polite"><ExclamationCircle aria-hidden="true" /><span>{message}</span><button type="button" className="text-button icon-text-button" onClick={loadRate}><RefreshCw aria-hidden="true" />Retry</button></div>}
        {status === 'ready' && quoteData && output && <div className="result-summary currency-result" aria-live="polite"><div><span className="result-label">Converted amount</span><p><strong>{output}</strong></p><span className="result-meta meta-with-icon"><Bank aria-hidden="true" />1 {quoteData.base} = {quoteData.rate} {quoteData.quote} · {quoteData.provider}</span><span className="result-meta meta-with-icon"><ClockFill aria-hidden="true" />Source updated {quoteData.sourceTimestamp ? new Date(quoteData.sourceTimestamp).toLocaleString() : 'time unavailable'} · fetched {new Date(quoteData.fetchedAt).toLocaleTimeString()}</span></div><div className="result-actions"><CopyButton value={`${output} (${quoteData.rate} ${quoteData.quote} per ${quoteData.base})`} /><button type="button" className="icon-button" onClick={loadRate} aria-label="Refresh reference rate" title="Refresh reference rate"><RefreshCw aria-hidden="true" /></button></div></div>}
        {status === 'idle' && <div className="inline-note"><ShieldCheck aria-hidden="true" /><span>Only the selected currency codes are sent to request a rate; the amount stays on this device.</span></div>}
      </section>
    </>
  )
}

function DeveloperTool({ addHistory }: { addHistory: AddHistory }) {
  const [mode, setMode] = useState<DeveloperMode>('json')
  const [input, setInput] = useState('{"hello":"world","count":2}')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const modes: { id: DeveloperMode; label: string; icon: Icon }[] = [
    { id: 'json', label: 'JSON', icon: Braces },
    { id: 'base64', label: 'Base64', icon: FileBinary },
    { id: 'url', label: 'URL', icon: LinkIcon },
    { id: 'uuid', label: 'UUID', icon: Fingerprint },
    { id: 'timestamp', label: 'Timestamp', icon: CalendarEvent },
  ]
  const run = () => {
    setError(''); setOutput('')
    try {
      if (mode === 'json') setOutput(developer.jsonPretty(input))
      if (mode === 'base64') setOutput(developer.base64Encode(input))
      if (mode === 'url') setOutput(developer.urlEncode(input))
      if (mode === 'uuid') setOutput(crypto.randomUUID())
      if (mode === 'timestamp') { const raw = input.trim(); const numeric = /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN; const date = Number.isFinite(numeric) ? new Date(Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric) : new Date(raw); if (Number.isNaN(date.getTime())) throw new Error('Enter an ISO date or Unix timestamp such as 2026-10-03T12:00:00Z.'); setOutput(`${date.toISOString()}\nUnix seconds: ${Math.floor(date.getTime() / 1000)}\nUnix milliseconds: ${date.getTime()}`) }
    } catch (transformError) { setError(transformError instanceof Error ? transformError.message : 'This input could not be transformed.') }
  }
  const decode = () => { setError(''); setOutput(''); try { if (mode === 'base64') setOutput(developer.base64Decode(input)); else if (mode === 'url') setOutput(developer.urlDecode(input)); else run() } catch (transformError) { setError(transformError instanceof Error ? transformError.message : 'This input could not be decoded.') } }
  const save = () => { if (output) addHistory({ tool: 'developer', title: `${modes.find((item) => item.id === mode)?.label} transform`, detail: `${input.slice(0, 28)}${input.length > 28 ? '…' : ''} → ${output.slice(0, 28)}${output.length > 28 ? '…' : ''}` }) }
  return (
    <>
      <ToolHeader icon={Braces} title="Developer tools" description="Format JSON, encode and decode text, and convert timestamps without the input leaving your browser." status={<StatusPill tone="success"><ShieldCheck aria-hidden="true" />Local only</StatusPill>} />
      <section className="workspace-panel developer-panel" aria-labelledby="developer-workspace-title"><div className="panel-topline"><div><h2 id="developer-workspace-title">Pick a transformation</h2></div><span className="shortcut-hint">Bounded input · no telemetry</span></div>
        <fieldset className="category-picker mode-picker">
          <legend className="field-label">Transformation</legend>
          <div className="chip-scroller">
            {modes.map(({ id, label, icon: ModeIcon }) => (
              <label key={id} className="category-chip">
                <input type="radio" name="developer-mode" value={id} checked={mode === id} onChange={() => { setMode(id); setOutput(''); setError('') }} />
                <span><ModeIcon aria-hidden="true" />{label}</span>
              </label>
            ))}
          </div>
          <p className="field-hint">Choose a local transformation; the input is never uploaded.</p>
        </fieldset>
        <div className="editor-grid"><label className="editor-field"><span className="field-label">Input</span><textarea name="developer-input" autoComplete="off" value={input} onChange={(event) => setInput(event.target.value)} rows={11} spellCheck={false} aria-describedby="developer-help" /></label><div className="editor-field"><div className="field-label-row"><span className="field-label">Output</span>{output && <CopyButton value={output} label="Copy output" />}</div><pre className={cn('output-box', error && 'output-error')} aria-live="polite">{error || output || 'Run a transform to see output.'}</pre></div></div>
        <p id="developer-help" className="field-hint">{mode === 'json' ? 'Formats JSON and reports malformed input without clearing it.' : mode === 'timestamp' ? 'Use an ISO date or Unix timestamp.' : 'Your text is processed locally and never sent to a server.'}</p>
        <div className="action-row"><button type="button" className="button button-primary" onClick={run}>{mode === 'uuid' ? <><Sparkles aria-hidden="true" />Generate UUID</> : <><Wrench aria-hidden="true" />Run transform</>}</button>{(mode === 'base64' || mode === 'url') && <button type="button" className="button button-secondary" onClick={decode}><ArrowLeftRight aria-hidden="true" />Decode instead</button>}{output && <button type="button" className="button button-secondary" onClick={save}><History aria-hidden="true" />Save summary</button>}</div>
      </section>
    </>
  )
}

function ImagesTool({ addHistory }: { addHistory: AddHistory }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [outputUrl, setOutputUrl] = useState('')
  const [outputName, setOutputName] = useState('')
  const [outputBytes, setOutputBytes] = useState<number | null>(null)
  const [outputDimensions, setOutputDimensions] = useState<{ width: number; height: number } | null>(null)
  const [format, setFormat] = useState<'webp' | 'jpeg' | 'png'>('webp')
  const [quality, setQuality] = useState('0.82')
  const [mode, setMode] = useState<'server' | 'local'>('server')
  const [status, setStatus] = useState<'empty' | 'ready' | 'processing' | 'complete' | 'error'>('empty')
  const [message, setMessage] = useState('')
  const [dragging, setDragging] = useState(false)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const operationSequence = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  useEffect(() => {
    if (!outputUrl) return
    return () => URL.revokeObjectURL(outputUrl)
  }, [outputUrl])

  useEffect(() => () => {
    operationSequence.current += 1
    abortRef.current?.abort()
  }, [])

  const acceptFile = (next: File | undefined) => {
    if (!next || status === 'processing') return
    operationSequence.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    if (!next.type.startsWith('image/')) { setStatus('error'); setMessage('Choose an image file such as PNG, JPEG, or WebP.'); return }
    if (next.size > 10 * 1024 * 1024) { setStatus('error'); setMessage('The server accepts images up to 10 MB.'); return }
    const url = URL.createObjectURL(next)
    setFile(next)
    setPreview(url)
    setOutputUrl('')
    setOutputName('')
    setOutputBytes(null)
    setOutputDimensions(null)
    setStatus('ready')
    setMessage('')
    const selectionId = operationSequence.current
    const image = new Image()
    image.onload = () => { if (selectionId === operationSequence.current) setDimensions({ width: image.naturalWidth, height: image.naturalHeight }) }
    image.onerror = () => { if (selectionId === operationSequence.current) { setDimensions(null); setStatus('error'); setMessage('The image could not be decoded in this browser.') } }
    image.src = url
  }

  const convertLocal = async (sourceFile: File, sourcePreview: string, sourceFormat: 'webp' | 'jpeg' | 'png', sourceQuality: string) => {
    const image = new Image()
    image.src = sourcePreview
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The image could not be decoded.')) })
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Decoded image exceeds the 40 megapixel limit.')
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas processing is unavailable in this browser.')
    context.drawImage(image, 0, 0)
    const mimeType = `image/${sourceFormat}`
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('This browser cannot export the selected format.')), mimeType, Number(sourceQuality)))
    if (blob.type !== mimeType) throw new Error('This browser returned a different image format than requested.')
    if (blob.size > 25 * 1024 * 1024) throw new Error('Converted image exceeds the 25 MB output limit.')
    return { blob, name: `${sourceFile.name.replace(/\.[^/.]+$/, '')}.${sourceFormat}`, width: image.naturalWidth, height: image.naturalHeight }
  }

  const convertServer = async (sourceFile: File, sourceFormat: 'webp' | 'jpeg' | 'png', sourceQuality: string, signal: AbortSignal) => {
    const formData = new FormData()
    formData.append('outputFormat', sourceFormat)
    formData.append('quality', String(Math.round(Number(sourceQuality) * 100)))
    formData.append('file', sourceFile, sourceFile.name)
    const response = await fetch('/api/v1/image/convert', { method: 'POST', body: formData, headers: { accept: 'image/*, application/json' }, signal })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null
      throw new Error(body?.message ?? 'The image service could not complete this conversion.')
    }
    const blob = await response.blob()
    if (blob.type !== `image/${sourceFormat}`) throw new Error('The image service returned a different format than requested.')
    const disposition = response.headers.get('content-disposition') ?? ''
    const filename = /filename="([^"\\]+)"/i.exec(disposition)?.[1] ?? `converted.${sourceFormat}`
    const width = Number(response.headers.get('x-image-width'))
    const height = Number(response.headers.get('x-image-height'))
    return { blob, name: filename, width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 }
  }

  const convert = async () => {
    if (!file) return
    const operationId = ++operationSequence.current
    const sourceFile = file
    const sourcePreview = preview
    const sourceFormat = format
    const sourceQuality = quality
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('processing')
    setMessage('')
    try {
      const artifact = mode === 'server'
        ? await convertServer(sourceFile, sourceFormat, sourceQuality, controller.signal)
        : await convertLocal(sourceFile, sourcePreview, sourceFormat, sourceQuality)
      if (operationId !== operationSequence.current) return
      if (outputUrl) URL.revokeObjectURL(outputUrl)
      setOutputUrl(URL.createObjectURL(artifact.blob))
      setOutputName(artifact.name)
      setOutputBytes(artifact.blob.size)
      setOutputDimensions(artifact.width && artifact.height ? { width: artifact.width, height: artifact.height } : null)
      setStatus('complete')
      addHistory({ tool: 'images', title: mode === 'server' ? 'Server conversion' : 'On-device conversion', detail: `${sourceFile.name} → ${artifact.name} · ${(sourceFile.size / 1024).toFixed(0)} KB → ${(artifact.blob.size / 1024).toFixed(0)} KB` })
    } catch (error) {
      if (controller.signal.aborted || operationId !== operationSequence.current) return
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Image conversion failed.')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const clear = () => {
    operationSequence.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setFile(null)
    setPreview('')
    setOutputUrl('')
    setOutputName('')
    setOutputBytes(null)
    setOutputDimensions(null)
    setDimensions(null)
    setStatus('empty')
    setMessage('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const formatLabel = format === 'webp' ? 'WebP' : format === 'jpeg' ? 'JPEG' : 'PNG'
  const modeDescription = mode === 'server'
    ? 'Sends this file to the configured conversion service only after you press Convert.'
    : 'Processes this file on your device; it does not leave the browser.'

  return (
    <>
      <ToolHeader icon={ImageFill} title="Image converter" description="Convert one image to WebP, JPEG, or PNG on the server or on this device, then download the result." status={<StatusPill tone={mode === 'server' ? 'success' : 'neutral'}>{mode === 'server' ? <CloudArrowUp aria-hidden="true" /> : <Laptop aria-hidden="true" />}{mode === 'server' ? 'Server conversion' : 'On this device'}</StatusPill>} />
      <section className="workspace-panel" aria-labelledby="images-workspace-title"><div className="panel-topline"><div><h2 id="images-workspace-title">Drop an image to begin</h2></div><span className="shortcut-hint">Max 10 MB · bounded</span></div>
        <div className="image-mode-control" role="group" aria-label="Image processing mode"><button type="button" disabled={status === 'processing'} className={cn(mode === 'server' && 'selected')} aria-pressed={mode === 'server'} onClick={() => { setMode('server'); if (status === 'error') setStatus(file ? 'ready' : 'empty') }}><CloudArrowUp aria-hidden="true" />Server conversion</button><button type="button" disabled={status === 'processing'} className={cn(mode === 'local' && 'selected')} aria-pressed={mode === 'local'} onClick={() => { setMode('local'); if (status === 'error') setStatus(file ? 'ready' : 'empty') }}><Laptop aria-hidden="true" />On this device</button></div>
        <p className="field-hint image-mode-hint">{modeDescription}</p>
        <div className={cn('dropzone', dragging && 'dropzone-active', status === 'error' && 'dropzone-error')} role="group" aria-label="Image input. Drop or paste an image, or choose a file." onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files?.[0]) }} onPaste={(event) => acceptFile(event.clipboardData.files?.[0])}><input ref={fileInputRef} id="image-file-input" aria-label="Choose an image file" disabled={status === 'processing'} type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => acceptFile(event.target.files?.[0])} /><span className="dropzone-icon">{file ? <FileEarmarkImage aria-hidden="true" /> : <Upload aria-hidden="true" />}</span><strong>{file ? file.name : 'Drop, paste, or choose an image'}</strong><span>{file ? `${(file.size / 1024).toFixed(0)} KB · ${dimensions ? `${dimensions.width} × ${dimensions.height}px` : 'reading dimensions'}` : 'PNG, JPEG, WebP, or AVIF · up to 10 MB'}</span><button type="button" className="button button-secondary" disabled={status === 'processing'} onClick={() => fileInputRef.current?.click()}><FileImage aria-hidden="true" />Choose file</button></div>
        {message && <div className="inline-note note-danger" role="alert" aria-live="polite"><ExclamationCircle aria-hidden="true" /><span>{message}</span>{file && <button type="button" className="text-button icon-text-button" onClick={convert}><RefreshCw aria-hidden="true" />Retry</button>}{mode === 'server' && file && <button type="button" className="text-button icon-text-button" onClick={() => { setMode('local'); setStatus('ready'); setMessage('') }}><Laptop aria-hidden="true" />Use on-device mode</button>}</div>}
        {file && <><div className="image-controls"><SelectField disabled={status === 'processing'} label="Output format" value={format} onChange={(value) => { setFormat(value as 'webp' | 'jpeg' | 'png'); if (status === 'complete') setStatus('ready') }}><option value="webp">WebP · smaller web images</option><option value="jpeg">JPEG · photos</option><option value="png">PNG · lossless</option></SelectField><label className="field-group"><span className="field-label">Quality <span className="mono-value">{Math.round(Number(quality) * 100)}%</span></span><input name="image-quality" autoComplete="off" aria-label="Image quality" disabled={status === 'processing'} type="range" min="0.4" max="1" step="0.01" value={quality} onChange={(event) => { setQuality(event.target.value); if (status === 'complete') setStatus('ready') }} /></label></div><div className="image-preview-grid"><div className="preview-frame"><img src={preview} width={dimensions?.width ?? 1} height={dimensions?.height ?? 1} alt={`Preview of ${file.name}`} /></div><div className="image-facts"><div><span><FileEarmarkImage aria-hidden="true" />Original</span><strong>{(file.size / 1024).toFixed(0)} KB</strong></div><div><span><AspectRatio aria-hidden="true" />Dimensions</span><strong>{dimensions ? `${dimensions.width} × ${dimensions.height}` : '—'}</strong></div><div><span><FileEarmarkArrowDown aria-hidden="true" />Output</span><strong>{status === 'complete' ? `${formatLabel} · ${outputBytes ? `${(outputBytes / 1024).toFixed(0)} KB` : 'ready'}` : 'Not processed'}</strong></div>{status === 'complete' && outputUrl && <a className="button button-primary" href={outputUrl} download={outputName}><Download aria-hidden="true" />Download {outputName}</a>}</div></div><div className="action-row"><button type="button" className="button button-primary" onClick={convert} disabled={status === 'processing'}>{status === 'processing' ? <><RefreshCw className="spin" aria-hidden="true" />Converting {mode === 'server' ? 'on server' : 'on this device'}</> : <><Zap aria-hidden="true" />Convert to {formatLabel}</>}</button><button type="button" className="button button-secondary" onClick={clear}><Trash2 aria-hidden="true" />Clear</button></div>{status === 'complete' && <p className="field-hint image-output-note message-with-icon" aria-live="polite"><CheckCircle aria-hidden="true" /><span>Output: {outputName} · {outputDimensions ? `${outputDimensions.width} × ${outputDimensions.height}px` : 'dimensions reported by service'}</span></p>}</>}
        {!file && status === 'empty' && <div className="inline-note"><ShieldCheck aria-hidden="true" /><span>{mode === 'server' ? 'Server mode sends the selected file only when you press Convert. The service applies byte, pixel, and output limits.' : 'On-device mode keeps the image on this device and creates a downloadable file only after you start conversion.'}</span></div>}
      </section>
    </>
  )
}

const emptyHistoryCopy: Record<ToolId, { title: string; body: string }> = {
  units: { title: 'Saved conversions appear here', body: 'Use “Save to history” to keep a result. History stays on this device.' },
  currency: { title: 'Saved quotes appear here', body: 'Save a quote to compare it later. History stays on this device.' },
  developer: { title: 'Saved transforms appear here', body: 'Save a transform summary to find it later. History stays on this device.' },
  images: { title: 'Converted images are listed here', body: 'Only file names and sizes are kept, on this device.' },
}

function HistoryPanel({ tool, entries, clear, undoClear, canUndo, remove, onReplay }: { tool: ToolId; entries: HistoryEntry[]; clear: () => void; undoClear: () => void; canUndo: boolean; remove: (id: string) => void; onReplay: (entry: HistoryEntry) => void }) {
  const empty = emptyHistoryCopy[tool]
  const content = (entry: HistoryEntry) => {
    const EntryIcon = (entry.tool === 'units' && entry.payload ? categoryIcons[entry.payload.category] : undefined) ?? toolIcons[entry.tool] ?? History
    return <><span className="history-icon"><EntryIcon aria-hidden="true" /></span><span className="history-text"><strong>{entry.title}</strong><span>{entry.detail}</span><time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></span></>
  }
  return (
    <aside className="context-panel" aria-labelledby="recent-title">
      <div className="context-heading"><h2 id="recent-title" className="heading-with-icon"><History aria-hidden="true" />Recent</h2>{entries.length > 0 && <button type="button" className="text-button icon-text-button" onClick={clear}><Trash2 aria-hidden="true" />Clear all</button>}</div>
      {canUndo && <div className="inline-note history-undo" role="status"><span>History cleared.</span><button type="button" className="text-button icon-text-button" onClick={undoClear}><Undo aria-hidden="true" />Undo</button></div>}
      {entries.length === 0
        ? <div className="empty-history"><span className="empty-icon"><History aria-hidden="true" /></span><p>{empty.title}</p><span>{empty.body}</span></div>
        : (
          <ul className="history-list">
            {entries.slice(0, HISTORY_PER_TOOL).map((entry) => (
              <li className="history-item" key={entry.id}>
                {entry.payload
                  ? <button type="button" className="history-main" onClick={() => onReplay(entry)}><span className="sr-only">Restore </span>{content(entry)}</button>
                  : <div className="history-main">{content(entry)}</div>}
                <button type="button" className="history-remove" onClick={() => remove(entry.id)} aria-label={`Remove ${entry.title}: ${entry.detail}`}><X aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      <div className="context-divider" />
      <div className="privacy-card"><ShieldCheck aria-hidden="true" /><div><strong>Privacy by mode</strong><p>Units and developer tools run locally. Images are uploaded only in server mode, after you press Convert. Currency requests send only the two currency codes.</p></div></div>
    </aside>
  )
}

const themeOrder = ['system', 'light', 'dark'] as const
type ThemeChoice = (typeof themeOrder)[number]
const themeLabels: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' }

export function Workbench({ defaultTool }: { defaultTool?: ToolId }) {
  const pathname = usePathname()
  const router = useRouter()
  const activeTool = defaultTool ?? toolFromPath(pathname)
  const { theme, setTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)
  const [themeChanged, setThemeChanged] = useState(false)
  const [shortcutKey, setShortcutKey] = useState('Ctrl K')
  useEffect(() => {
    setThemeReady(true)
    if (/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)) setShortcutKey('⌘K')
  }, [])
  const currentTheme: ThemeChoice = themeReady && (theme === 'light' || theme === 'dark') ? theme : 'system'
  const nextTheme = themeOrder[(themeOrder.indexOf(currentTheme) + 1) % themeOrder.length]
  const ThemeIcon = currentTheme === 'dark' ? Moon : currentTheme === 'light' ? Sun : CircleHalf
  const themeLabel = themeReady ? `Theme: ${themeLabels[currentTheme]}. Switch to ${themeLabels[nextTheme].toLowerCase()}.` : 'Change theme'
  const { history, add, clear, undoClear, lastCleared, remove } = usePersistedHistory()
  const [replayRequest, setReplayRequest] = useState<ReplayRequest | null>(null)
  // Child effects apply a request before this runs, so it is consumed exactly once.
  useEffect(() => { if (replayRequest) setReplayRequest(null) }, [replayRequest])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const openSearch = () => { setSearchOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0) }
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0) } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener) }, [])
  useEffect(() => {
    if (!searchOpen) return
    const listener = (event: PointerEvent) => { if (!searchBoxRef.current?.contains(event.target as Node)) setSearchOpen(false) }
    document.addEventListener('pointerdown', listener)
    return () => document.removeEventListener('pointerdown', listener)
  }, [searchOpen])
  const activeEntries = history.filter((entry) => entry.tool === activeTool)
  const filteredTools = toolLinks.filter((tool) => `${tool.label} ${tool.description}`.toLowerCase().includes(query.toLowerCase()))
  const closeSearch = () => { setSearchOpen(false); setQuery('') }
  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (query) setQuery('')
      else { setSearchOpen(false); searchRef.current?.blur() }
    } else if (event.key === 'Enter' && query && filteredTools[0]) {
      event.preventDefault()
      router.push(filteredTools[0].href)
      closeSearch()
    }
  }
  const replay = (entry: HistoryEntry) => { if (entry.payload) setReplayRequest({ entry, nonce: Date.now() }) }
  return (
    <div className="app-shell">
      <noscript className="noscript-note">Enable JavaScript to use conversion tools. Headings and guidance remain available without scripts.</noscript>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="app-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Universal Convertal home"><span className="brand-mark">UC</span><span><strong>Universal</strong><small>Convertal</small></span></Link>
          <div ref={searchBoxRef} className={cn('header-search', searchOpen && 'search-visible-mobile')}>
            <Search aria-hidden="true" />
            <input ref={searchRef} name="tool-search" autoComplete="off" value={query} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true) }} onFocus={() => setSearchOpen(true)} onKeyDown={onSearchKeyDown} placeholder="Search tools…" aria-label="Search tools" aria-keyshortcuts="Control+K Meta+K" />
            <kbd>{shortcutKey}</kbd>
            {searchOpen && query && <div className="search-results">{filteredTools.map((tool) => <Link key={tool.id} href={tool.href} onClick={closeSearch}><tool.icon aria-hidden="true" /><span><strong>{tool.label}</strong><small>{tool.description}</small></span></Link>)}{filteredTools.length === 0 && <span className="search-empty">No matching tools</span>}</div>}
          </div>
          <nav className="top-nav" aria-label="Primary navigation">{toolLinks.map((tool) => <Link key={tool.id} href={tool.href} className={cn(activeTool === tool.id && 'active')} aria-current={activeTool === tool.id ? 'page' : undefined}><tool.icon aria-hidden="true" /><span>{tool.label}</span></Link>)}</nav>
          <div className="header-actions">
            <button type="button" className="icon-button mobile-search-toggle" onClick={openSearch} aria-label="Search tools" title="Search tools"><Search aria-hidden="true" /></button>
            <button type="button" className="icon-button" onClick={() => { setThemeChanged(true); setTheme(nextTheme) }} aria-label={themeLabel} title={themeLabel}><ThemeIcon key={currentTheme} className={themeChanged ? 'icon-turn-in' : undefined} aria-hidden="true" /></button>
            <Link href="/about" className="about-link"><Info aria-hidden="true" /><span>About</span></Link>
          </div>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Workflows">{toolLinks.map((tool) => <Link key={tool.id} href={tool.href} className={cn(activeTool === tool.id && 'active')} aria-current={activeTool === tool.id ? 'page' : undefined}><tool.icon aria-hidden="true" /><span>{tool.label}</span></Link>)}</nav>
      <main id="main-content" tabIndex={-1} className="main-layout">
        <section className="active-column">
          {activeTool === 'units' && <UnitsTool addHistory={add} replay={replayRequest} />}
          {activeTool === 'currency' && <CurrencyTool addHistory={add} replay={replayRequest} />}
          {activeTool === 'developer' && <DeveloperTool addHistory={add} />}
          {activeTool === 'images' && <ImagesTool addHistory={add} />}
        </section>
        <HistoryPanel tool={activeTool} entries={activeEntries} clear={() => clear(activeTool)} undoClear={undoClear} canUndo={lastCleared?.tool === activeTool} remove={remove} onReplay={replay} />
      </main>
      <footer className="app-footer"><span>Universal Convertal · precise tools for everyday work</span><span className="footer-shortcut"><Keyboard aria-hidden="true" /><span className="desktop-shortcut">{shortcutKey} to search tools</span><span className="mobile-shortcut">Use Search tools above</span></span></footer>
    </div>
  )
}
