/**
 * LandingPage — the front door for CubeGuide AI.
 *
 * A friendly, beginner-first pitch: scan your cube with the camera, get a
 * turn-by-turn plan in plain language, and follow a voice coach until it's
 * solved. The hero shows the real 3D cube (scrambled, auto-spinning) so the
 * promise is visible the moment the page loads.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import Cube3D from '../components/Cube3D';
import { scramble } from '../core/cube';
import { useStore } from '../state/store';
import './LandingPage.css';
interface Feature {
  icon: string;
  title: string;
  body: string;
  status?: string;
}
const FEATURES: Feature[] = [
  {
    icon: '📷',
    title: 'Camera scanner',
    body: 'Point your phone at each side and CubeGuide reads all six faces for you — no typing colors.',
  },
  {
    icon: '💬',
    title: 'Plain-language steps',
    body: 'No cryptic notation like “R U R’”. Just “turn the top row to the left”, one step at a time.',
  },
  {
    icon: '🧊',
    title: '3D animated guidance',
    body: 'Watch a live 3D cube perform each move so you always know exactly which way to turn.',
  },
  {
    icon: '🎙️',
    title: 'Voice coach',
    body: 'Hands stay on the cube. The coach reads each move aloud and listens for “next” and “back”.',
  },
  {
    icon: '✅',
    title: 'Move verification',
    body: 'Re-scan to confirm you turned the right face — gentle nudges if something looks off.',
    status: 'coming online',
  },
  {
    icon: '🎓',
    title: 'Learn mode',
    body: 'Curious how it works? Learn the beginner method as you go, at whatever pace feels good.',
  },
];
interface Step {
  n: number;
  title: string;
  body: string;
}
const STEPS: Step[] = [
  {
    n: 1,
    title: 'Scan all six sides',
    body: 'Hold up your cube and let the camera capture each face. We check it’s a real, solvable cube.',
  },
  {
    n: 2,
    title: 'Get your turn-by-turn plan',
    body: 'CubeGuide builds the shortest beginner-friendly route and translates it into plain English.',
  },
  {
    n: 3,
    title: 'Follow the coach until solved',
    body: 'Watch the 3D cube, listen to the voice, and turn move by move. You’ll get there — guaranteed.',
  },
];
const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};
const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};
function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      className={className}
      variants={sectionVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.section>
  );
}

export default function LandingPage() {
  const colorblind = useStore((s) => s.settings.colorblind);
  const hero = useMemo(() => scramble(18, 7).state, []);

  return (
    <div className="land">
      {/* ---- Hero ---------------------------------------------------------- */}
      <section className="land__hero">
        <div className="container land__hero-inner">
          <motion.div
            className="land__hero-copy"
            initial="hidden"
            animate="show"
            variants={staggerParent}
          >
            <motion.span className="chip land__eyebrow" variants={sectionVariants}>
              <span aria-hidden="true">✨</span> AI cube coach for total beginners
            </motion.span>

            <motion.h1 className="land__headline" variants={sectionVariants}>
              <span className="gradient-text">Solve any Rubik&apos;s Cube.</span>
              <br />
              No experience needed.
            </motion.h1>

            <motion.p className="land__subhead" variants={sectionVariants}>
              It&apos;s like Google Maps for solving a cube — turn by turn, in plain
              language, with a voice coach.
            </motion.p>

            <motion.div className="land__cta-row" variants={sectionVariants}>
              <Link to="/scan" className="btn btn-primary">
                <span aria-hidden="true">📷</span> Scan my cube
              </Link>
              <Link to="/solve" className="btn btn-ghost">
                <span aria-hidden="true">▶</span> Try a demo
              </Link>
            </motion.div>

            <motion.ul className="land__trust" variants={sectionVariants}>
              <li>No notation to memorize</li>
              <li>Hands-free voice coach</li>
              <li>Works on any cube</li>
            </motion.ul>
          </motion.div>

          <motion.div
            className="land__hero-cube glass"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <Cube3D state={hero} autoSpin height={420} colorblind={colorblind} />
            <span className="chip land__hero-tag">
              <span aria-hidden="true">🟢</span> Live 3D preview
            </span>
          </motion.div>
        </div>
      </section>

      <div className="container">
        {/* ---- Features --------------------------------------------------- */}
        <Section className="land__block">
          <h2 className="page-title land__section-title">
            Built for <span className="gradient-text">total beginners</span>
          </h2>
          <p className="land__section-sub">
            Every feature exists to remove the “I&apos;ll never figure this out”
            feeling. No jargon, no prior knowledge — just clear guidance.
          </p>

          <motion.div
            className="land__grid"
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            {FEATURES.map((f) => (
              <motion.article
                key={f.title}
                className="glass land__card"
                variants={cardVariants}
              >
                <span className="land__card-icon" aria-hidden="true">
                  {f.icon}
                </span>
                <h3 className="land__card-title">
                  {f.title}
                  {f.status && <span className="chip land__card-badge">{f.status}</span>}
                </h3>
                <p className="land__card-body">{f.body}</p>
              </motion.article>
            ))}
          </motion.div>
        </Section>

        {/* ---- How it works ----------------------------------------------- */}
        <Section className="land__block">
          <h2 className="page-title land__section-title">
            How it <span className="gradient-text">works</span>
          </h2>
          <p className="land__section-sub">Three steps from scrambled to solved.</p>

          <motion.ol
            className="land__steps"
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
          >
            {STEPS.map((s) => (
              <motion.li key={s.n} className="glass land__step" variants={cardVariants}>
                <span className="land__step-num" aria-hidden="true">
                  {s.n}
                </span>
                <h3 className="land__step-title">{s.title}</h3>
                <p className="land__step-body">{s.body}</p>
              </motion.li>
            ))}
          </motion.ol>
        </Section>

        {/* ---- Footer CTA ------------------------------------------------- */}
        <Section className="land__block">
          <div className="glass land__cta-band">
            <div className="land__cta-band-copy">
              <h2 className="land__cta-title">
                Ready to <span className="gradient-text">solve it</span>?
              </h2>
              <p className="land__cta-text">
                Grab your cube, point your camera, and let the coach take it from
                here. Your first solve is closer than you think.
              </p>
            </div>
            <Link to="/scan" className="btn btn-primary land__cta-btn">
              <span aria-hidden="true">📷</span> Scan my cube
            </Link>
          </div>
        </Section>
      </div>
    </div>
  );
}
