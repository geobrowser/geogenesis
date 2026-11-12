#!/usr/bin/env python3
"""Expands tools/previews/<Comp>.html into project/components/<Comp>/preview.html.

Usage: python3 -I tools/build-previews.py

A template's first line is the @dsCard marker; the rest is the body. Class strings in the templates
are copied from the component sources (each README names the file). Placeholders:
  {{icon:<name>}} or {{icon:<name>:<px>}}  the app icon's SVG (project/assets/Icons or Logos), inline
  {{thumb:up|down:filled}}                 ThumbUp/ThumbDown with filled=true (body filled, no handle)
  {{avatar:<seed>:<px>}}                   the app's generated BoringAvatar beam (tools/avatars.json)
"""
import json
import os
import re

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'tools', 'previews')
avatars = json.load(open(os.path.join(root, 'tools', 'avatars.json')))
counter = [0]


def icon(name, px=None):
    for group in ('Icons', 'Logos'):
        p = os.path.join(root, 'project', 'assets', group, f'{name}.svg')
        if os.path.exists(p):
            svg = open(p).read().strip()
            break
    else:
        raise SystemExit(f'unknown icon {name}')
    if px:
        svg = re.sub(r'width="[^"]*"', f'width="{px}"', svg, count=1)
        svg = re.sub(r'height="[^"]*"', f'height="{px}"', svg, count=1)
    return svg


def thumb(direction):
    svg = icon(f'thumb-{direction}')
    svg = svg.replace('stroke="currentColor" fill="none"', 'stroke="currentColor" fill="currentColor"', 1)
    return re.sub(r'<path d="M[0-9.]+ [0-9.]+V[0-9.]+" stroke="currentColor"></path>', '', svg)


def avatar(seed, px):
    svg = avatars[f'{seed}:{px}']
    counter[0] += 1
    uid = f'av{counter[0]}'
    return re.sub(r'_R_[A-Za-z0-9]*_', uid, svg)


def expand(body):
    body = re.sub(r'\{\{icon:([a-z0-9-]+)(?::(\d+))?\}\}', lambda m: icon(m.group(1), m.group(2)), body)
    body = re.sub(r'\{\{thumb:(up|down):filled\}\}', lambda m: thumb(m.group(1)), body)
    return re.sub(r'\{\{avatar:([a-z]+):(\d+)\}\}', lambda m: avatar(m.group(1), m.group(2)), body)


for file in sorted(os.listdir(src)):
    if not file.endswith('.html'):
        continue
    comp = file[:-5]
    marker, _, body = open(os.path.join(src, file)).read().partition('\n')
    html = (f'{marker}\n<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            f'<title>{comp} — static rendition</title>\n</head>\n<body class="bg-white p-4 text-text">\n'
            f'{expand(body).rstrip()}\n</body>\n</html>\n')
    out = os.path.join(root, 'project', 'components', comp)
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'preview.html'), 'w').write(html)
    print(comp, len(html))
