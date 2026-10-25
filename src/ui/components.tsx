import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react'
import { sfx } from '../core/audio'

export function Button({ children, onClick, kind = 'primary', disabled, small, title }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; small?: boolean; title?: string
}) {
  return (
    <button
      className={`btn btn-${kind}${small ? ' btn-sm' : ''}`}
      disabled={disabled}
      title={title}
      onClick={() => { sfx.click(); onClick?.() }}
    >
      {children}
    </button>
  )
}

export function Slider({ label, value, min = 0, max = 1, step = 0.05, onChange, format }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string
}) {
  const id = `sl-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="field">
      <label htmlFor={id}>{label}<span>{format ? format(value) : `${Math.round(value * 100)}%`}</span></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  )
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => { sfx.click(); onChange(o.id) }}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onClose])
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" ref={ref}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function Confirm({ title, text, confirmLabel, onConfirm, onCancel, danger }: {
  title: string; text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{text}</p>
      <div className="row end">
        <Button kind="ghost" onClick={onCancel}>Cancel</Button>
        <Button kind={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}

export function Stars({ n }: { n: number }) {
  return <span className="stars" aria-label={`Difficulty ${n} of 5`}>{'★'.repeat(n)}<i>{'★'.repeat(5 - n)}</i></span>
}

/** Catches render errors anywhere in the tree so players never see a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('ROADVANTA crashed', error, info.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="fatal">
        <h1>Something went wrong</h1>
        <p>The game hit an unexpected error. Your progress is saved on this device.</p>
        <code>{this.state.error.message}</code>
        <div className="row">
          <button className="btn btn-primary" onClick={() => location.reload()}>Reload game</button>
        </div>
      </div>
    )
  }
}
