export type DialogStep = 'collect' | 'organize' | 'empower' | 'solve';

export const DIALOG_CONTENT: Record<DialogStep, { title: string; description: string }> = {
  collect: {
    title: 'We are here',
    description: `Geo is built on the principle that data should be owned and created by its users in a decentralized and
    verifiable way. The first and most crucial step is to collect data for a wide range of spaces as
    triples/facts, which can then be used to structure meaningful content.`,
  },
  organize: {
    title: 'Organize the world’s data',
    description: `Geo is built on the principle that data should be owned and created by its users in a decentralized and
    verifiable way. The first and most crucial step is to collect data for a wide range of spaces as
    triples/facts, which can then be used to structure meaningful content.`,
  },
  empower: {
    title: 'Empower our communities',
    description: `Geo is built on the principle that data should be owned and created by its users in a decentralized and
    verifiable way. The first and most crucial step is to collect data for a wide range of spaces as
    triples/facts, which can then be used to structure meaningful content.`,
  },
  solve: {
    title: 'Solve the world’s biggest challenges',
    description: `Geo is built on the principle that data should be owned and created by its users in a decentralized and
    verifiable way. The first and most crucial step is to collect data for a wide range of spaces as
    triples/facts, which can then be used to structure meaningful content.`,
  },
};
