/**
 * LearnPage — a friendly, no-AI primer on the beginner Layer-By-Layer (LBL)
 * method. Seven lessons live inside an accordion of glass cards; each can be
 * marked as learned and completion is persisted to localStorage so a returning
 * beginner picks up where they left off.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Cube3D from '../components/Cube3D';
import { SOLVED_STATE } from '../core/cube';
import { useStore } from '../state/store';
import './LearnPage.css';
interface Lesson {
  id: string;
  title: string;
  /** rendered into the explanation paragraph; the cube embeds in 'basics' */
  explanation: string;
  keyIdea: string;
  tips: string[];
}
const LESSONS: Lesson[] = [
  {
    id: 'basics',
    title: 'Cube Basics',
    explanation:
      'A 3x3 cube is made of three kinds of pieces. A center piece sits in the middle of each face, never moves relative to the others, and tells you that face’s true color. An edge piece has two colored stickers and lives between two centers, while a corner piece has three stickers and sits on the corners. The whole solve is just about moving edges and corners home around those fixed centers.',
    keyIdea:
      'Centers are fixed reference points. Solve everything else relative to them — white center on top means the white face is always “up”.',
    tips: [
      'Hold the cube so one center faces you; that color is the face you are working on.',
      'Learn the letters U, D, L, R, F, B (Up, Down, Left, Right, Front, Back) — each is one face you can turn.',
      'A plain letter is a clockwise quarter turn; an apostrophe (R′) means counter-clockwise.',
    ],
  },
  {
    id: 'white-cross',
    title: 'The White Cross',
    explanation:
      'Start by making a plus sign of white edges on the white face. The trick beginners miss: each white edge must also match the center next to it, so the green-white edge has to sit above the green center. This is called solving the cross “with correct side colors”. Take your time — a correct cross makes every later step easier.',
    keyIdea:
      'A white edge is solved only when both stickers match: white on top and the side sticker lined up with its neighboring center.',
    tips: [
      'Find a white edge in the bottom or middle layers, line its side color under the matching center, then turn that face twice to flip it up.',
      'Work one edge at a time and avoid disturbing edges you already placed.',
      'Check around the whole white face — all four side colors should form a matching ring.',
    ],
  },
  {
    id: 'white-corners',
    title: 'White Corners',
    explanation:
      'Now finish the first layer by dropping the four white corners into place beneath the cross. Find a white corner in the top layer, position it directly above the spot it belongs (between its two matching centers), then use a simple right-hand sequence to insert it. Repeat until the entire white face and the first ring of side colors are complete.',
    keyIdea:
      'Put the corner above its target, then repeat R U R′ U′ until the white sticker pops down into the bottom layer correctly.',
    tips: [
      'A corner belongs where its three colors meet — e.g. the white-green-red corner goes between the green and red centers.',
      'If a white corner is stuck in the bottom layer facing wrong, do the sequence once to kick it out, then re-insert it.',
      'When this layer is done, the whole bottom is solid white and the side stickers form three matching rows on each face.',
    ],
  },
  {
    id: 'middle-layer',
    title: 'Middle Layer',
    explanation:
      'Flip the cube so white is on the bottom and you work on the four middle-layer edges (the ones with no yellow sticker). Find a top-layer edge whose front color matches a center, then send it left or right using a short algorithm. Done correctly, two of the cube’s three horizontal layers end up fully solved.',
    keyIdea:
      'Match the edge’s front sticker to a center, then run the “right” or “left” insert depending on which way it needs to go.',
    tips: [
      'Right insert: U R U′ R′ U′ F′ U F. Left insert: U′ L′ U L U F U′ F′.',
      'Edges with a yellow sticker do not belong in the middle — ignore them for now.',
      'If a middle slot holds the wrong edge, insert any edge into it to push the wrong one up, then place it properly.',
    ],
  },
  {
    id: 'yellow-cross',
    title: 'Yellow Cross',
    explanation:
      'With two layers done, turn attention to the yellow (last) layer and make a yellow plus on top. Ignore the corners for now — you only care about the four yellow edges. One algorithm, repeated, walks you through the dot, the L-shape, and the line until the cross appears.',
    keyIdea:
      'Repeat F R U R′ U′ F′. It promotes a dot → L-shape → line → full cross each time you apply it.',
    tips: [
      'Hold an L-shape so its two yellow edges point up-and-left; hold a line so it lies horizontally.',
      'You may need the algorithm two or three times — that is normal.',
      'Only the yellow edge stickers matter here; corner orientation comes next.',
    ],
  },
  {
    id: 'oll',
    title: 'Orient Last Layer (OLL)',
    explanation:
      'Orienting the last layer means making the entire top face yellow by twisting the corners up — without caring yet about where each corner sits. You repeat one corner algorithm, rotating only the top face between applications, until all yellow corner stickers face upward. Pieces will look scrambled on the sides; that is fine and gets fixed in the final step.',
    keyIdea:
      'Repeat R U R′ U R U2 R′ from the same held position, turning U between rounds, until the top is solid yellow.',
    tips: [
      'Keep one already-correct or partially-twisted corner in the front-right slot as your anchor.',
      'Turn only the top (U) face to bring the next unsolved corner into position — never reposition the whole cube.',
      'Do not panic when the sides scramble; only the yellow top matters during OLL.',
    ],
  },
  {
    id: 'pll',
    title: 'Permute Last Layer (PLL)',
    explanation:
      'The last step slides the yellow pieces into their correct positions without disturbing the solid yellow top. First cycle the corners until each corner sits between its two matching side colors, then cycle the edges to finish. When the side colors line up all the way around, the cube is solved.',
    keyIdea:
      'Corners first, then edges: position the three-corner cycle, then run the edge cycle to drop the last pieces home.',
    tips: [
      'Corner cycle: U R U′ L′ U R′ U′ L — repeat until every corner is between matching colors.',
      'Edge cycle: F2 U L R′ F2 L′ R U F2 to rotate the three remaining edges.',
      'If everything is placed but one U turn is needed, just turn the top face — the cube is solved.',
    ],
  },
];

const STORAGE_KEY = 'cubeguide.learn';
type Completion = Record<string, true>;

function loadCompletion(): Completion {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return {};
    const out: Completion = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) out[id] = true;
    }
    return out;
  } catch {
    return {};
  }
}
function saveCompletion(value: Completion): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}
export default function LearnPage() {
  const colorblind = useStore((s) => s.settings.colorblind);
  const reducedMotion = useStore((s) => s.settings.reducedMotion);

  const [open, setOpen] = useState<string | null>(LESSONS[0].id);
  const [done, setDone] = useState<Completion>({});

  // Load persisted progress on mount.
  useEffect(() => {
    setDone(loadCompletion());
  }, []);
  const completedCount = useMemo(
    () => LESSONS.reduce((n, l) => n + (done[l.id] ? 1 : 0), 0),
    [done],
  );
  const progressPct = (completedCount / LESSONS.length) * 100;

  const toggleOpen = (id: string) => setOpen((cur) => (cur === id ? null : id));

  const toggleDone = (id: string) =>
    setDone((cur) => {
      const next: Completion = { ...cur };
      if (next[id]) delete next[id];
      else next[id] = true;
      saveCompletion(next);
      return next;
    });

  return (
    <div className="container learn">
      <header className="learn__head">
        <h1 className="page-title">
          Learn to solve, <span className="gradient-text">step by step</span>
        </h1>
        <p className="page-sub">
          The beginner Layer-By-Layer method in seven short lessons — no app, no AI,
          just you and the cube. Mark each lesson as learned to track your progress.
        </p>
      </header>

      <section className="learn__progress glass" aria-label="Learning progress">
        <div className="learn__progress-top">
          <span className="learn__progress-label">
            <strong>{completedCount}</strong> of {LESSONS.length} lessons complete
          </span>
          <span className="chip">{Math.round(progressPct)}%</span>
        </div>
        <div
          className="learn__progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={LESSONS.length}
          aria-valuenow={completedCount}
          aria-valuetext={`${completedCount} of ${LESSONS.length} lessons complete`}
        >
          <motion.div
            className="learn__progress-fill"
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: reducedMotion ? 0 : 0.4, ease: 'easeOut' }}
          />
        </div>
      </section>

      <ol className="learn__list">
        {LESSONS.map((lesson, index) => {
          const isOpen = open === lesson.id;
          const isDone = !!done[lesson.id];
          const headerId = `learn-header-${lesson.id}`;
          const panelId = `learn-panel-${lesson.id}`;
          return (
            <li key={lesson.id} className="learn__item glass" data-done={isDone}>
              <h2 className="learn__heading">
                <button
                  type="button"
                  id={headerId}
                  className="learn__trigger"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleOpen(lesson.id)}
                >
                  <span className="learn__index" aria-hidden>
                    {isDone ? '✓' : index + 1}
                  </span>
                  <span className="learn__title">{lesson.title}</span>
                  {isDone && <span className="chip learn__badge">Learned</span>}
                  <span className="learn__chevron" data-open={isOpen} aria-hidden>
                    ⌄
                  </span>
                </button>
              </h2>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.section
                    key="panel"
                    id={panelId}
                    role="region"
                    aria-labelledby={headerId}
                    className="learn__panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.3, ease: 'easeInOut' }}
                  >
                    <div className="learn__panel-inner">
                      <p className="learn__explain">{lesson.explanation}</p>

                      {lesson.id === 'basics' && (
                        <div className="learn__cube">
                          <Cube3D
                            state={SOLVED_STATE}
                            autoSpin
                            height={260}
                            colorblind={colorblind}
                            reducedMotion={reducedMotion}
                          />
                          <p className="learn__cube-cap">
                            A solved cube: six solid faces, each anchored by its fixed
                            center.
                          </p>
                        </div>
                      )}

                      <div className="learn__callout">
                        <span className="learn__callout-label">Key idea</span>
                        <p>{lesson.keyIdea}</p>
                      </div>

                      <ul className="learn__tips">
                        {lesson.tips.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>

                      <button
                        type="button"
                        className={isDone ? 'btn btn-ghost' : 'btn btn-primary'}
                        aria-pressed={isDone}
                        onClick={() => toggleDone(lesson.id)}
                      >
                        {isDone ? '✓ Learned — undo' : 'Mark as learned'}
                      </button>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
      <footer className="learn__cta glass">
        <div>
          <h2 className="learn__cta-title">Know the method? Put it to work.</h2>
          <p className="page-sub">
            Scan your real cube and let CubeGuide coach you through your own scramble.
          </p>
        </div>
        <Link to="/scan" className="btn btn-primary learn__cta-btn">
          Try it on your real cube
        </Link>
      </footer>
    </div>
  );
}
