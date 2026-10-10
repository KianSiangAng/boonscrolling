import { shuffle } from '../core/rng';
import type { CardInstance, CardModule, Sources } from '../core/types';
import { add, choiceButtons, h, packMeta, showFeedback, str } from './ui';

interface PortEntry {
  port: number;
  protocol: string;
  transport: string;
  note?: string;
}

interface PortProtocolData extends PortEntry {
  /** Which way round this card asks. */
  direction: 'port-to-protocol' | 'protocol-to-port';
}

function entries(sources: Sources): { entry: PortEntry; id: string; meta: ReturnType<typeof packMeta> }[] {
  const out = [];
  for (const pack of sources.packs) {
    for (const c of pack.cards) {
      if (c.type !== 'port-protocol') continue;
      const protocol = str(c.protocol);
      if (!protocol || typeof c.port !== 'number' || !Number.isInteger(c.port)) continue;
      out.push({
        entry: { port: c.port, protocol, transport: str(c.transport) ?? 'TCP', note: str(c.note) ?? undefined },
        id: `${pack.id}:${c.id}`,
        meta: packMeta(pack, c),
      });
    }
  }
  return out;
}

/** Each pack entry becomes two cards, one per direction, scheduled independently. */
const portProtocol: CardModule<PortProtocolData> = {
  type: 'port-protocol',
  label: 'Ports & protocols',
  icon: '🔌',

  build(sources) {
    return entries(sources).flatMap(({ entry, id, meta }): CardInstance<PortProtocolData>[] => [
      {
        id: `port-protocol:${id}:p2n`,
        type: 'port-protocol',
        ...meta,
        data: { ...entry, direction: 'port-to-protocol' },
      },
      {
        id: `port-protocol:${id}:n2p`,
        type: 'port-protocol',
        ...meta,
        data: { ...entry, direction: 'protocol-to-port' },
      },
    ]);
  },

  mount(root, card, ctx) {
    const { data } = card;
    const others = shuffle(
      entries(ctx.sources)
        .map((e) => e.entry)
        .filter((e) => e.port !== data.port && e.protocol !== data.protocol),
      ctx.rng,
    ).slice(0, 3);
    const toProtocol = data.direction === 'port-to-protocol';
    const answer = toProtocol ? data.protocol : String(data.port);
    const options = others.map((e) => (toProtocol ? e.protocol : String(e.port)));
    add(
      root,
      h(
        'h2',
        { class: 'card-question' },
        toProtocol
          ? h('span', null, 'Which protocol uses port ', h('span', { class: 'highlight mono' }, String(data.port)), '?')
          : h('span', null, 'Which port does ', h('span', { class: 'highlight' }, data.protocol), ' use by default?'),
      ),
      h('div', { class: 'port-badge', 'aria-hidden': 'true' }, toProtocol ? `:${data.port}` : data.protocol),
      choiceButtons(
        [answer, ...options],
        answer,
        ctx.rng,
        (correct) => {
          ctx.answer(correct);
          showFeedback(root, correct, [`${data.protocol} → port ${data.port} (${data.transport}).`, data.note]);
        },
        { className: toProtocol ? 'choices-grid' : 'choices-grid choices-code' },
      ),
    );
  },
};

export default portProtocol;
