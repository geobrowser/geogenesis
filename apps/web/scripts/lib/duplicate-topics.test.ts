import { describe, expect, it } from 'vitest';

import {
  type TopicRecord,
  buildReport,
  formatReport,
  groupTopicsByName,
  isReportableGroup,
  topicNameKey,
} from './duplicate-topics';

function topic(partial: Partial<TopicRecord> & { id: string; name: string }): TopicRecord {
  return { curated: false, tagged: 0, spaceIds: [], ...partial };
}

describe('topicNameKey', () => {
  it('treats a name typed in two cases as one name', () => {
    expect(topicNameKey('AI Safety')).toBe(topicNameKey('AI safety'));
  });

  // The curly form arrives from editors and pasted copy, so the two spellings coexist in the graph.
  it('folds the typographic apostrophe onto the plain one', () => {
    expect(topicNameKey('Russia’s wartime governance')).toBe(topicNameKey("Russia's wartime governance"));
  });

  it('folds en and em dashes onto the hyphen', () => {
    expect(topicNameKey('Russia–Ukraine war')).toBe(topicNameKey('Russia-Ukraine war'));
  });

  it('collapses surrounding and repeated whitespace', () => {
    expect(topicNameKey('  Mental   health ')).toBe('mental health');
  });

  it('agrees on a composed and a decomposed accent', () => {
    expect(topicNameKey('Québec')).toBe(topicNameKey('Québec'));
  });

  it('leaves meaning alone — & is not and, and a qualifier is not noise', () => {
    expect(topicNameKey('AI safety & social impact')).not.toBe(topicNameKey('AI safety and social impact'));
    expect(topicNameKey('AI governance')).not.toBe(topicNameKey('AI governance & international coordination'));
  });
});

describe('groupTopicsByName', () => {
  it('groups only names carried more than once', () => {
    const groups = groupTopicsByName([
      topic({ id: 'a', name: 'Mental health' }),
      topic({ id: 'b', name: 'Mental health' }),
      topic({ id: 'c', name: 'Cloud security' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].members.map(m => m.id)).toEqual(['a', 'b']);
  });

  /*
   * The graph holds many topics whose name was never written. Keyed on the empty string they would
   * form one vast collision that is not a naming problem at all.
   */
  it('drops unnamed topics rather than grouping them together', () => {
    const groups = groupTopicsByName([
      topic({ id: 'a', name: '' }),
      topic({ id: 'b', name: '   ' }),
      topic({ id: 'c', name: '' }),
    ]);

    expect(groups).toEqual([]);
  });

  it('orders groups by what a merge would reunite, and members by who holds it', () => {
    const groups = groupTopicsByName([
      topic({ id: 'small-1', name: 'Tokenization', tagged: 5 }),
      topic({ id: 'small-2', name: 'Tokenization', tagged: 4 }),
      topic({ id: 'big-thin', name: 'Russia-Ukraine war', tagged: 1457 }),
      topic({ id: 'big-fat', name: 'Russia-Ukraine war', tagged: 2554 }),
    ]);

    expect(groups.map(g => g.key)).toEqual(['russia-ukraine war', 'tokenization']);
    expect(groups[0].members.map(m => m.id)).toEqual(['big-fat', 'big-thin']);
  });

  // Two runs over unchanged data must print the same lines, or the report cannot be diffed to see
  // what is new — which is the whole point of a repeatable check.
  it('breaks a tie on tagged count by id, so output is stable', () => {
    const [first] = groupTopicsByName([
      topic({ id: 'zzz', name: 'Cybercrime', tagged: 9 }),
      topic({ id: 'aaa', name: 'Cybercrime', tagged: 9 }),
    ]);

    expect(first.members.map(m => m.id)).toEqual(['aaa', 'zzz']);
  });

  it('records every spelling, and says whether they were identical', () => {
    const [identical] = groupTopicsByName([
      topic({ id: 'a', name: 'Mental health' }),
      topic({ id: 'b', name: 'Mental health' }),
    ]);
    expect(identical.identical).toBe(true);
    expect(identical.spellings).toEqual(['Mental health']);

    const [varied] = groupTopicsByName([topic({ id: 'a', name: 'AI Safety' }), topic({ id: 'b', name: 'AI safety' })]);
    expect(varied.identical).toBe(false);
    expect(varied.spellings).toEqual(['AI Safety', 'AI safety']);
  });
});

describe('isReportableGroup', () => {
  /*
   * The bar that makes the output readable. Testnet's largest collisions are machine-made
   * per-source topics repeated up to eighteen times
   */
  it('passes over a collision of thin, uncurated topics', () => {
    const [group] = groupTopicsByName([
      topic({ id: 'a', name: 'Why Clarity Act passage would be a market surprise', tagged: 3 }),
      topic({ id: 'b', name: 'Why Clarity Act passage would be a market surprise', tagged: 3 }),
    ]);

    expect(isReportableGroup(group, { minTagged: 10 })).toBe(false);
  });

  it('reports a collision the moment one member is curated, however little it holds', () => {
    const [group] = groupTopicsByName([
      topic({ id: 'a', name: 'Tokenization', curated: true, tagged: 0 }),
      topic({ id: 'b', name: 'Tokenization', tagged: 1 }),
    ]);

    expect(isReportableGroup(group, { minTagged: 10 })).toBe(true);
  });

  it('reports a collision where only one member holds anything', () => {
    const [group] = groupTopicsByName([
      topic({ id: 'a', name: 'AI Safety', tagged: 262 }),
      topic({ id: 'b', name: 'AI Safety', tagged: 1 }),
      topic({ id: 'c', name: 'AI Safety', tagged: 0 }),
    ]);

    expect(isReportableGroup(group, { minTagged: 10 })).toBe(true);
  });
});

describe('buildReport', () => {
  const topics = [
    topic({ id: 'ru-big', name: 'Russia-Ukraine war', curated: true, tagged: 2554, spaceIds: ['world'] }),
    topic({ id: 'ru-crypto', name: 'Russia-Ukraine war', tagged: 1457, spaceIds: ['crypto'] }),
    topic({ id: 'noise-1', name: 'A sentence a machine wrote', tagged: 3 }),
    topic({ id: 'noise-2', name: 'A sentence a machine wrote', tagged: 3 }),
    topic({ id: 'alone', name: 'Cloud security', curated: true, tagged: 400 }),
  ];

  it('lists what matters and counts the rest instead of hiding it', () => {
    const report = buildReport(topics, { minTagged: 10 });

    expect(report.reportable.map(g => g.key)).toEqual(['russia-ukraine war']);
    expect(report.suppressed).toBe(1);
    expect(report.suppressedTopics).toBe(2);
    expect(report.scanned).toBe(5);
  });

  /*
   * The narrower question this project asks: which collisions cost a follower content today. Only a
   * curated topic is offered to be followed
   */
  it('narrows to collisions a curated topic is part of', () => {
    const report = buildReport(
      [
        ...topics,
        topic({ id: 'ai-safety-big', name: 'AI Safety', tagged: 262 }),
        topic({ id: 'ai-safety-thin', name: 'AI Safety', tagged: 1 }),
      ],
      { minTagged: 10, curatedOnly: true }
    );

    expect(report.reportable.map(g => g.key)).toEqual(['russia-ukraine war']);
    // Counted rather than dropped, so the narrowing is visible instead of silent.
    expect(report.suppressed).toBe(2);
  });

  it('names the collision, both twins and the spaces a merge would have to be published in', () => {
    const text = formatReport(buildReport(topics, { minTagged: 10 }), { minTagged: 10 });

    expect(text).toContain('Russia-Ukraine war');
    expect(text).toContain('ru-crypto');
    expect(text).toContain('spaces=crypto');
    expect(text).toContain('curated');
    // The suppressed ones are accounted for, but not listed.
    expect(text).toContain('1 further collision below the bar');
    expect(text).not.toContain('noise-1');
  });
});
