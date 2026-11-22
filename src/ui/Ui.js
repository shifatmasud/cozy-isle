import { createElement as h, useState } from 'react';
import { motion } from 'framer-motion';
import { VIEW_LIST } from '../world/views.js';

export default function Ui({ tier }) {
  const [active, setActive] = useState('overview');
  const go = (id) => {
    setActive(id);
    if (window.__cozy && window.__cozy.view) window.__cozy.view(id);
  };
  return h(
    'div',
    { className: 'ui' },
    h(
      motion.div,
      { className: 'card', initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: 'easeOut' } },
      h('h1', null, 'Cozy Isle'),
      h('p', null, 'Drag to look around. Pick a place to fly there.'),
      h(
        'div',
        { className: 'views' },
        VIEW_LIST.map((v) =>
          h(motion.button, { key: v.id, className: v.id === active ? 'on' : '', whileTap: { scale: 0.94 }, onClick: () => go(v.id) }, v.label)
        )
      )
    ),
    h(
      'div',
      { className: 'tier' },
      ['low', 'medium', 'high'].map((t) => h('a', { key: t, href: `?q=${t}`, className: t === tier ? 'on' : '' }, t))
    )
  );
}
