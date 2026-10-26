/**
 * Finding topics that share a name, and deciding which of those collisions a human should look at.
 */

export type TopicRecord = {
  id: string;
  name: string;
  curated: boolean;
  tagged: number;
  spaceIds: string[];
};

export type TopicNameGroup = {
  key: string;
  spellings: string[];
  members: TopicRecord[];
  identical: boolean;
  totalTagged: number;
};

/**
 * The form two names have to share to count as the same name.
 */
export function topicNameKey(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u2010\u2011\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function groupTopicsByName(topics: readonly TopicRecord[]): TopicNameGroup[] {
  const byKey = new Map<string, TopicRecord[]>();

  for (const topic of topics) {
    const key = topicNameKey(topic.name ?? '');
    if (!key) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(topic);
    else byKey.set(key, [topic]);
  }

  const groups: TopicNameGroup[] = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const spellings = [...new Set(members.map(member => member.name))].sort();
    groups.push({
      key,
      spellings,
      members: [...members].sort((a, b) => b.tagged - a.tagged || a.id.localeCompare(b.id)),
      identical: spellings.length === 1,
      totalTagged: members.reduce((total, member) => total + member.tagged, 0),
    });
  }

  return groups.sort((a, b) => b.totalTagged - a.totalTagged || a.key.localeCompare(b.key));
}

export function isReportableGroup(group: TopicNameGroup, { minTagged, curatedOnly = false }: ReportOptions): boolean {
  if (curatedOnly) return group.members.some(member => member.curated);
  return group.members.some(member => member.curated || member.tagged >= minTagged);
}

export type ReportOptions = {
  minTagged: number;
  curatedOnly?: boolean;
};

export type DuplicateTopicReport = {
  reportable: TopicNameGroup[];
  suppressed: number;
  suppressedTopics: number;
  scanned: number;
};

export function buildReport(topics: readonly TopicRecord[], options: ReportOptions): DuplicateTopicReport {
  const groups = groupTopicsByName(topics);
  const reportable = groups.filter(group => isReportableGroup(group, options));
  const suppressedGroups = groups.filter(group => !isReportableGroup(group, options));

  return {
    reportable,
    suppressed: suppressedGroups.length,
    suppressedTopics: suppressedGroups.reduce((total, group) => total + group.members.length, 0),
    scanned: topics.length,
  };
}

export function formatReport(report: DuplicateTopicReport, options: ReportOptions): string {
  const lines: string[] = [];
  lines.push(`Scanned ${report.scanned.toLocaleString()} topics.`);
  lines.push(
    `${report.reportable.length} name collision${report.reportable.length === 1 ? '' : 's'} worth review ` +
      (options.curatedOnly
        ? '(a member is curated).'
        : `(a member is curated, or holds ${options.minTagged}+ tagged entities).`)
  );
  if (report.suppressed > 0) {
    lines.push(
      `${report.suppressed} further collision${report.suppressed === 1 ? '' : 's'} below the bar ` +
        `(${report.suppressedTopics.toLocaleString()} topics), not listed.`
    );
  }

  for (const group of report.reportable) {
    lines.push('');
    const heading = group.identical
      ? `${group.spellings[0]}  (${group.members.length} topics, identical names)`
      : `${group.spellings.join('  |  ')}  (${group.members.length} topics, same name, different spelling)`;
    lines.push(heading);
    for (const member of group.members) {
      lines.push(
        `    ${member.id}  ${member.curated ? 'curated    ' : 'not curated'}  ` +
          `tagged=${String(member.tagged).padStart(6)}  spaces=${member.spaceIds.join(',') || '-'}`
      );
    }
  }

  return lines.join('\n');
}
