/**
 * DashboardPage — the "Progress" gamification dashboard.
 *
 * Shows the user's level, XP, solve count and day streak, a level progress bar,
 * and the full achievements grid (earned vs locked). Friendly empty-state nudges
 * first-time users toward their first solve.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore, levelForXp, xpForLevel } from '../state/store';
import './DashboardPage.css';
interface StatCard {
  label: string;
  value: string;
  glyph: string;
  tone: 'accent' | 'good' | 'warn';
}
export default function DashboardPage() {
  const stats = useStore((s) => s.stats);
  // Select the stable action ref — calling it *inside* the selector would return
  // a fresh array each render and send zustand into an infinite update loop.
  const achievementsListFn = useStore((s) => s.achievementsList);
  const achievements = useMemo(
    () => achievementsListFn(),
    [achievementsListFn, stats],
  );
  const level = levelForXp(stats.xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const span = Math.max(1, ceil - floor);
  const percent = Math.max(0, Math.min(100, ((stats.xp - floor) / span) * 100));
  const xpToNext = Math.max(0, ceil - stats.xp);
  const cards = useMemo<StatCard[]>(
    () => [
      { label: 'Level', value: String(level), glyph: '⭐', tone: 'accent' },
      { label: 'XP', value: stats.xp.toLocaleString(), glyph: '✨', tone: 'accent' },
      { label: 'Cubes solved', value: String(stats.solves), glyph: '🧊', tone: 'good' },
      { label: 'Day streak', value: String(stats.streak), glyph: '🔥', tone: 'warn' },
    ],
    [level, stats.xp, stats.solves, stats.streak],
  );
  const earnedCount = achievements.filter((a) => a.earnedAt !== null).length;
  return (
    <main className="container dash">
      <motion.header
        className="dash__header"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <h1 className="page-title gradient-text">Your progress</h1>
        <p className="page-sub">
          Every solve earns XP and pushes you up the ranks. Keep your streak alive and
          unlock new achievements.
        </p>
      </motion.header>

      {stats.solves === 0 && (
        <motion.div
          className="glass dash__empty"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.05, ease: 'easeOut' }}
        >
          <div className="dash__empty-text">
            <h2 className="dash__empty-title">Ready to begin?</h2>
            <p className="dash__empty-sub">
              You haven&apos;t solved a cube yet. Scan one and let CubeGuide AI coach you
              through it — your first solve is worth a fresh achievement.
            </p>
          </div>
          <Link to="/scan" className="btn btn-primary dash__empty-cta">
            Solve your first cube
          </Link>
        </motion.div>
      )}
      <section className="dash__stats" aria-label="Your stats">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            className={`glass dash__stat dash__stat--${card.tone}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06 * i, ease: 'easeOut' }}
          >
            <span className="dash__stat-glyph" aria-hidden="true">
              {card.glyph}
            </span>
            <span className="dash__stat-value">{card.value}</span>
            <span className="dash__stat-label">{card.label}</span>
          </motion.div>
        ))}
      </section>
      <motion.section
        className="glass dash__level"
        aria-label="Level progress"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12, ease: 'easeOut' }}
      >
        <div className="dash__level-head">
          <div>
            <span className="chip">Level {level}</span>
            <h2 className="dash__level-title">
              {xpToNext > 0
                ? `${xpToNext.toLocaleString()} XP to level ${level + 1}`
                : `Maxed for now — keep solving!`}
            </h2>
          </div>
          <span className="dash__level-percent">{Math.round(percent)}%</span>
        </div>
        <div
          className="dash__bar"
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <motion.div
            className="dash__bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
          />
        </div>
        <div className="dash__bar-scale">
          <span>{floor.toLocaleString()} XP</span>
          <span>{ceil.toLocaleString()} XP</span>
        </div>
      </motion.section>

      <section className="dash__section" aria-label="Achievements">
        <div className="dash__section-head">
          <h2 className="dash__section-title">Achievements</h2>
          <span className="dash__section-count">
            {earnedCount} / {achievements.length} unlocked
          </span>
        </div>
        <div className="dash__grid">
          {achievements.map((a, i) => {
            const earned = a.earnedAt !== null;
            return (
              <motion.article
                key={a.id}
                className={`glass dash__ach ${earned ? 'dash__ach--earned' : 'dash__ach--locked'}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.04 * i, ease: 'easeOut' }}
              >
                <div className="dash__ach-top">
                  <span className="dash__ach-badge" aria-hidden="true">
                    {earned ? '✓' : '🔒'}
                  </span>
                  <h3 className="dash__ach-title">{a.title}</h3>
                </div>
                <p className="dash__ach-desc">{a.description}</p>
                <span className="dash__ach-meta">
                  {earned && a.earnedAt !== null
                    ? `Earned ${new Date(a.earnedAt).toLocaleDateString()}`
                    : 'Locked'}
                </span>
              </motion.article>
            );
          })}
        </div>
      </section>

      <motion.section
        className="glass dash__teaser"
        aria-label="Challenge mode"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: 'easeOut' }}
      >
        <div className="dash__teaser-text">
          <span className="chip dash__teaser-chip">Coming soon</span>
          <h2 className="dash__teaser-title">Challenge mode</h2>
          <p className="dash__teaser-sub">
            Timed solves, daily scrambles and a global leaderboard. Sharpen your speed and
            climb the ranks against other cubers.
          </p>
        </div>
        <span className="dash__teaser-glyph" aria-hidden="true">
          🏆
        </span>
      </motion.section>
    </main>
  );
}
