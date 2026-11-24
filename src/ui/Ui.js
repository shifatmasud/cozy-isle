// Cozy UI: a soft loading veil until window.__cozy.ready, then a small paper card with place buttons.
// Mobile first (412 x 800: bottom sheet, 3 x 2 place grid, collapsible) and roomy at 1366 x 625 (bottom-left card).
import { createElement as h, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { VIEW_LIST } from '../world/views.js';

const CAPTIONS = {
  overview: 'The whole island, from over the bay',
  forest: 'Pine and oak woods under the mountain',
  meadow: 'Grass and wildflowers in the breeze',
  tropics: 'Palms and bananas by the lagoon',
  desert: 'Warm mesas and cactus on the west coast',
  reef: 'Under the lagoon, among the coral',
  kelp: 'Drift through a giant kelp forest',
};

const MESSAGES = ['Mixing the greens', 'Fluffing the clouds', 'Filling the lagoon', 'Planting the meadow', 'Warming up the sun'];
const VEIL_LIMIT_MS = 30000;

// Keep other query flags (debug, lab) when switching tier.
function tierHref(t) {
  const p = new URLSearchParams(location.search);
  p.set('q', t);
  return '?' + p.toString();
}

// Poll the probe flag; give up waiting after VEIL_LIMIT_MS so a slow device is never stuck behind the veil.
function useCozyReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return undefined;
    const t0 = Date.now();
    const id = setInterval(() => {
      const c = window.__cozy;
      if ((c && c.ready) || Date.now() - t0 > VEIL_LIMIT_MS) setReady(true);
    }, 150);
    return () => clearInterval(id);
  }, [ready]);
  return ready;
}

function Veil({ reduce }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((k) => (k + 1) % MESSAGES.length), 1700);
    return () => clearInterval(id);
  }, []);
  const float = reduce ? {} : { y: [0, -6, 0] };
  return h(
    motion.div,
    {
      key: 'veil',
      className: 'veil',
      role: 'status',
      'aria-live': 'polite',
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: { duration: reduce ? 0.2 : 1.1, ease: 'easeInOut' } },
    },
    h(
      'div',
      { className: 'veil-inner' },
      h(
        motion.div,
        { className: 'veil-cloud', 'aria-hidden': true, animate: float, transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } },
        h('span', { className: 'puff p1' }),
        h('span', { className: 'puff p2' }),
        h('span', { className: 'puff p3' })
      ),
      h('div', { className: 'veil-title' }, 'Cozy Isle'),
      h(
        'div',
        { className: 'veil-msg' },
        h(
          AnimatePresence,
          { mode: 'wait', initial: false },
          h(
            motion.span,
            { key: i, initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.35 } },
            MESSAGES[i] + '\u2026'
          )
        )
      ),
      h(
        'div',
        { className: 'veil-dots', 'aria-hidden': true },
        [0, 1, 2].map((k) =>
          h(motion.span, {
            key: k,
            animate: reduce ? { opacity: 0.7 } : { opacity: [0.25, 1, 0.25] },
            transition: { duration: 1.4, repeat: Infinity, delay: k * 0.22, ease: 'easeInOut' },
          })
        )
      )
    )
  );
}

export default function Ui({ tier }) {
  const reduce = useReducedMotion();
  const ready = useCozyReady();
  const [active, setActive] = useState('overview');
  const [open, setOpen] = useState(true);
  const pending = useRef(null);

  const go = (id) => {
    setActive(id);
    const c = window.__cozy;
    if (c && c.view) c.view(id);
    else pending.current = id;
  };
  // If a place was picked before the camera rig registered, fly there once it exists.
  useEffect(() => {
    if (!ready || !pending.current) return;
    const c = window.__cozy;
    if (c && c.view) {
      c.view(pending.current);
      pending.current = null;
    }
  }, [ready]);

  const spring = reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 };
  const caption = CAPTIONS[active] || '';

  return h(
    'div',
    { className: 'ui' },
    h(AnimatePresence, null, ready ? null : h(Veil, { key: 'veil', reduce })),
    h(
      motion.section,
      {
        className: open ? 'card' : 'card closed',
        'aria-label': 'Places on the island',
        initial: { opacity: 0, y: 24 },
        animate: ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
        transition: { duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1], delay: ready && !reduce ? 0.35 : 0 },
      },
      h(
        'button',
        { className: 'card-head', type: 'button', 'aria-expanded': open, onClick: () => setOpen((o) => !o) },
        h('span', { className: 'leaf', 'aria-hidden': true }),
        h('h1', null, 'Cozy Isle'),
        h('span', { className: open ? 'chev' : 'chev up', 'aria-hidden': true })
      ),
      h(
        AnimatePresence,
        { initial: false },
        open
          ? h(
              motion.div,
              {
                key: 'body',
                className: 'card-body',
                initial: { height: 0, opacity: 0 },
                animate: { height: 'auto', opacity: 1 },
                exit: { height: 0, opacity: 0 },
                transition: { duration: reduce ? 0 : 0.32, ease: 'easeOut' },
              },
              h(
                'p',
                { className: 'caption' },
                h(
                  AnimatePresence,
                  { mode: 'wait', initial: false },
                  h(
                    motion.span,
                    { key: active, initial: { opacity: 0, y: 3 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -3 }, transition: { duration: reduce ? 0 : 0.25 } },
                    caption
                  )
                )
              ),
              h(
                'div',
                { className: 'views', role: 'group', 'aria-label': 'Fly to' },
                VIEW_LIST.map((v) =>
                  h(
                    motion.button,
                    {
                      key: v.id,
                      type: 'button',
                      className: v.id === active ? 'on' : '',
                      'aria-pressed': v.id === active,
                      whileTap: reduce ? undefined : { scale: 0.94 },
                      whileHover: reduce ? undefined : { y: -1 },
                      onClick: () => go(v.id),
                    },
                    v.id === active ? h(motion.span, { className: 'pill', layoutId: 'cozy-pill', transition: spring }) : null,
                    h('span', { className: 'label' }, v.label)
                  )
                )
              ),
              h('p', { className: 'hint' }, 'Drag to look around \u00b7 pinch or scroll to zoom')
            )
          : null
      )
    ),
    h(
      motion.nav,
      {
        className: 'tier',
        'aria-label': 'Quality',
        initial: { opacity: 0 },
        animate: { opacity: ready ? 1 : 0 },
        transition: { duration: reduce ? 0 : 0.5, delay: ready && !reduce ? 0.6 : 0 },
      },
      ['low', 'medium', 'high'].map((t) =>
        h('a', { key: t, href: tierHref(t), className: t === tier ? 'on' : '', 'aria-current': t === tier ? 'true' : undefined }, t)
      )
    )
  );
}
