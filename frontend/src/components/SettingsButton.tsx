/**
 * SettingsButton — header gear button that opens a glassmorphism settings drawer.
 *
 * Reads and writes the accessibility settings slice of the global store. The
 * drawer is keyboard accessible (Escape to close, focusable controls) and
 * respects the user's "reduce motion" preference when animating.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useStore, type Settings } from '../state/store';
import './SettingsButton.css';

interface ToggleRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}

function ToggleRow({ id, label, description, checked, disabled, onChange }: ToggleRowProps) {
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className="settings__row">
      <div className="settings__row-text">
        <label className="settings__row-label" htmlFor={id}>
          {label}
        </label>
        {description ? (
          <p className="settings__row-note" id={descId}>
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        className={'settings__switch' + (checked ? ' is-on' : '')}
        onClick={onChange ? () => onChange(!checked) : undefined}
      >
        <span className="settings__switch-thumb" aria-hidden />
      </button>
    </div>
  );
}

const panelVariants: Variants = {
  hidden: { opacity: 0, x: 28, scale: 0.98 },
  visible: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 28, scale: 0.98 },
};

export default function SettingsButton() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Escape closes the drawer; lock body scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  // Move focus into the panel on open, and restore it to the trigger on close.
  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [open]);

  const toggle = (key: keyof Settings) => (next: boolean) => update({ [key]: next } as Partial<Settings>);

  // When motion is reduced, collapse animations to an instant cross-fade.
  const duration = settings.reducedMotion ? 0 : 0.22;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost settings__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open settings"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="settings__gear" aria-hidden>
          ⚙
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="settings__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
            onClick={close}
          >
            <motion.div
              ref={panelRef}
              className="glass settings__panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="settings__header">
                <h2 className="settings__title" id={titleId}>
                  Settings
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost settings__close"
                  aria-label="Close settings"
                  onClick={close}
                >
                  ✕
                </button>
              </header>

              <div className="settings__body">
                <section className="settings__section" aria-label="Appearance">
                  <h3 className="settings__section-title">Appearance</h3>

                  <ToggleRow
                    id="settings-dark"
                    label="Dark mode"
                    description="Dark theme is on by default"
                    checked
                    disabled
                  />

                  <ToggleRow
                    id="settings-colorblind"
                    label="Colorblind palette"
                    description="High-contrast facelet colors for easier identification."
                    checked={settings.colorblind}
                    onChange={toggle('colorblind')}
                  />

                  <ToggleRow
                    id="settings-large-text"
                    label="Large text"
                    description="Increase the base font size across the app."
                    checked={settings.largeText}
                    onChange={toggle('largeText')}
                  />

                  <ToggleRow
                    id="settings-reduced-motion"
                    label="Reduce motion"
                    description="Minimize animations and transitions."
                    checked={settings.reducedMotion}
                    onChange={toggle('reducedMotion')}
                  />
                </section>

                <section className="settings__section" aria-label="Voice coach">
                  <h3 className="settings__section-title">Voice coach</h3>

                  <ToggleRow
                    id="settings-voice"
                    label="Voice coach"
                    description="Speak each step aloud while you solve."
                    checked={settings.voiceEnabled}
                    onChange={toggle('voiceEnabled')}
                  />

                  <div className="settings__row settings__row--stack">
                    <div className="settings__row-text">
                      <label className="settings__row-label" htmlFor="settings-voice-rate">
                        Voice speed
                      </label>
                      <p className="settings__row-note" id="settings-voice-rate-desc">
                        How fast the coach speaks.
                      </p>
                    </div>
                    <div className="settings__range">
                      <input
                        id="settings-voice-rate"
                        type="range"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={settings.voiceRate}
                        aria-describedby="settings-voice-rate-desc"
                        aria-valuetext={`${settings.voiceRate.toFixed(1)} times`}
                        disabled={!settings.voiceEnabled}
                        onChange={(e) => update({ voiceRate: Number(e.target.value) })}
                      />
                      <span className="chip settings__range-value">
                        {settings.voiceRate.toFixed(1)}×
                      </span>
                    </div>
                  </div>

                  <p className="settings__hint">
                    Voice-only mode: enable Voice coach and use the 🎤 Hands-free button on the
                    Solve page.
                  </p>
                </section>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
