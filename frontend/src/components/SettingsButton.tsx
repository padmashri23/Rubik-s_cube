/**
 * SettingsButton — header gear that opens a compact settings dropdown.
 *
 * The panel is anchored directly under the gear rather than taking over the
 * screen: these are quick preference flips, not a destination. Closes on
 * Escape, on outside click, and on Tab-out; focus returns to the gear only
 * when the panel was actually open.
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
  onChange: (next: boolean) => void;
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
        onClick={() => onChange(!checked)}
      >
        <span className="settings__switch-thumb" aria-hidden />
      </button>
    </div>
  );
}

const panelVariants: Variants = {
  hidden: { opacity: 0, y: -8, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
};

export default function SettingsButton() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Guards the focus-restore effect so it can't fire on first mount and steal
  // focus from the page the moment the app loads.
  const wasOpen = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  // Escape and outside clicks close the dropdown.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, close]);

  // Move focus into the panel on open; restore it to the gear on close.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      panelRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const toggle = (key: keyof Settings) => (next: boolean) =>
    update({ [key]: next } as Partial<Settings>);

  // When motion is reduced, collapse animations to an instant cross-fade.
  const duration = settings.reducedMotion ? 0 : 0.16;

  return (
    <div className="settings" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={'settings__trigger' + (open ? ' is-open' : '')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Settings"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="settings__gear" aria-hidden>
          ⚙
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            className="settings__panel"
            role="dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration, ease: 'easeOut' }}
          >
            <header className="settings__header">
              <h2 className="settings__title" id={titleId}>
                Settings
              </h2>
              <button
                type="button"
                className="settings__close"
                aria-label="Close settings"
                onClick={close}
              >
                ✕
              </button>
            </header>

            <div className="settings__body">
              <section className="settings__section" aria-label="Accessibility">
                <h3 className="settings__section-title">Accessibility</h3>

                <ToggleRow
                  id="settings-colorblind"
                  label="Colorblind palette"
                  description="High-contrast facelet colors."
                  checked={settings.colorblind}
                  onChange={toggle('colorblind')}
                />

                <ToggleRow
                  id="settings-large-text"
                  label="Large text"
                  description="Increase the base font size."
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
                  label="Speak each step"
                  description="Read moves aloud while you solve."
                  checked={settings.voiceEnabled}
                  onChange={toggle('voiceEnabled')}
                />

                <div className="settings__row settings__row--stack">
                  <label className="settings__row-label" htmlFor="settings-voice-rate">
                    Voice speed
                  </label>
                  <div className="settings__range">
                    <input
                      id="settings-voice-rate"
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={settings.voiceRate}
                      aria-valuetext={`${settings.voiceRate.toFixed(1)} times`}
                      disabled={!settings.voiceEnabled}
                      onChange={(e) => update({ voiceRate: Number(e.target.value) })}
                    />
                    <span className="settings__range-value">
                      {settings.voiceRate.toFixed(1)}×
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <p className="settings__hint">
              Hands-free? Turn on the voice coach, then hit 🎤 on the Solve page.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
