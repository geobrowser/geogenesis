#!/usr/bin/env python3
"""Writes project/design-system.json from tools/asset-ids.txt (group/file id size per line).
Usage: python3 -I tools/build-index.py <short sha> [existing index json to merge into]"""
import json, os, sys
from datetime import datetime, timezone
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sha = sys.argv[1]
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
idx = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {
    'v': 3, 'layout': 'files', 'createdOnFiles': {'v': 1, 'at': now}, 'title': 'Geo Design System',
    'namespace': 'GeoDS', 'libraries': [], 'sections': {}, 'groups': [], 'assetGroups': {}, 'blobs': {},
    'docs': {'readme': 'project/README.md', 'sections': []}}
groups = {}
for line in open(os.path.join(root, 'tools', 'asset-ids.txt')):
    path, blob, size = line.split()
    g, name = path.split('/', 1)
    groups.setdefault(g, []).append((name, blob, int(size)))
idx['groups'] = ['Logos', 'Icons']
for g, items in groups.items():
    ag = idx['assetGroups'].get(g, {'name': g})
    ag['tile'] = 'l' if g == 'Logos' else 's'
    ag['order'] = [n for n, _, _ in items]
    ag['files'] = {n: {'name': n, 'blob': b, 'size': s, 'type': 'image/svg+xml'} for n, b, s in items}
    idx['assetGroups'][g] = ag
# The repo is the source of truth: keep the artifact page read-only ("synced from code").
idx['editing'] = 'code'
idx['lastChange'] = {'by': 'Preston Mantel', 'at': now, 'via': f'Claude Code · geogenesis@{sha}',
                     'note': f'Built from geobrowser/geogenesis master@{sha}: tokens, fonts, 150 icons + 2 marks, 31 static component cards, cover.'}
json.dump(idx, open(os.path.join(root, 'project', 'design-system.json'), 'w'), indent=2, ensure_ascii=False)
print('groups', {g: len(v) for g, v in groups.items()})
