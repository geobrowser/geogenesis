#!/usr/bin/env python3
"""Builds project/tokens.json and project/tokens.css from the geogenesis web app's Tailwind v4 theme.

Usage: python3 -I tools/build-tokens.py <geogenesis checkout at the synced ref> <short sha>

Values are read from apps/web/styles/styles.css (the @theme block and the @custom-variant lines),
never typed in. Usage notes live below, keyed by token name: a token the CSS gains later gets the
source comment above it as its note (or "Defined in styles.css") until someone writes one here.
"""
import json
import os
import re
import sys
from datetime import date

checkout, sha = sys.argv[1], sys.argv[2]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
css = open(os.path.join(checkout, 'apps/web/styles/styles.css')).read()
theme = re.search(r'@theme \{(.*?)\n\}', css, re.S).group(1)

# ---- declarations in @theme, each with the comment block right above it (if any) ----
decls = []  # (name, value, comment)
pending_comment = None
for m in re.finditer(r'/\*(.*?)\*/|--([A-Za-z0-9_.-]+)\s*:\s*([^;]+);', theme, re.S):
    if m.group(1) is not None:
        pending_comment = ' '.join(m.group(1).split())
    else:
        decls.append((m.group(2), m.group(3).strip(), pending_comment))
        pending_comment = None

COLOR_USAGE = {
    'white': 'The app ground: body, cards, menus, popovers, inputs (bg-white, 576 uses). White text on text, ctaPrimary and purple fills.',
    'text': 'Ink. Body copy and headings on white, bg, grey-01 and divider (16.3:1 on white). Also the black fill of primary pills (HubPillButton primary, dialog actions), toasts and dark tooltips, and the 1px hover border on outlined controls.',
    'ctaPrimary': 'Brand blue. The classic Button primary fill, links that act (TextButton ctaPrimary), the Dropdown chevron. White on it is 4.78:1. Debates surfaces do not use it: their primary is a text-black pill.',
    'ctaHover': 'Hover/pressed state of ctaPrimary fills and text; the focus ring of a primary Button (shadow-inner-ctaHover).',
    'ctaTertiary': 'Faint blue wash: a focused chip (LinkableChip focus:bg-ctaTertiary) and bg-gradient-grey.',
    'purple': 'Secondary accent: needs-you markers, the person-pick focus outline, the triangle-up-circle badge. White on it is 5.99:1.',
    'purple-tint': 'Wash behind purple: needs-you rows, shared slots and the no-times nudge (GEO-3463).',
    'black': 'Pure black, used sparingly: TabGroup Badge fill, media and video backdrops.',
    'pink': 'Avatar and Spinner gradient hue only. Not a UI colour (3.25:1 on white: never text).',
    'bg': 'Off-white hover ground for outlined Buttons, SquareButton and Dropdown rows.',
    'grey-01': 'Quiet fill: menu item hover/active, claim summary band, RequestParties strip, avatar fallbacks, skeleton-like wells (bg-grey-01, 437 uses). Text on it stays text or grey-04.',
    'grey-02': 'The hairline. Default border colour of every element (base layer), card and pill outlines, input inner shadow, Tag fill, avatar +N chip.',
    'grey-03': 'Placeholder, disabled and dashed-outline grey: input placeholder, unpicked PositionButton dashed border, unchecked filled checkbox edge. 2.03:1 on white: never body text.',
    'grey-04': 'Secondary text: metadata, footnotes, icon ink at rest, inactive tabs (text-grey-04, 839 uses). 6.29:1 on white, 5.82:1 on grey-01.',
    'grey-05': 'Dark grey for editor glyphs (editor-* icons draw in #35363A).',
    'link': 'Muted link grey #8b8b8b. Rare (2 uses); 3.41:1 on white, so only for 24px+ or non-essential text.',
    'divider': 'Lightest line and fill: Divider, the summary band top border, selected PositionButton fill, disabled Button fill, the challenge dialog ground.',
    'orange': 'Warm accent in avatars and gradients; occasional warning marks. 2.02:1 on white: never text.',
    'green': 'Agree / success: the agree half of the split bar, OnlineDot, success and done Buttons. 2.02:1 on white: never text on white, and white on green fails too (source pair, kept exact).',
    'successTertiary': 'Pale green ground behind success states and agree tallies.',
    'errorTertiary': 'Pale red ground behind error states.',
    'red-01': 'Disagree / error: the disagree half of the split bar, error footnotes, ControversialTag, error Button. 3.22:1 on white: error copy at footnote size misses 4.5:1 (source pair, kept exact).',
    'red-02': 'Faint red wash behind destructive rows.',
    'red-03': 'Light red border or wash for error states.',
    'deleted': 'Diff colour: removed values in proposal review (bg-deleted).',
    'added': 'Diff colour: added values in proposal review (bg-added).',
}

TEXT_USAGE = {
    'mainPage': ('Titles', 'Section and landing page titles (Explore, debates home).', 'Debates today'),
    'entityTitle': ('Titles', 'Entity, space and topic page titles. Responsive: 44/46 at >=768px, 36/38 at 410-767px, 26/30 at <=409px.', 'Remote work is here to stay'),
    'largeTitle': ('Titles', 'Notice and empty-state titles, large dialog headings.', 'Nothing here yet'),
    'mediumTitle': ('Titles', 'Panel and card group headings.', 'People online'),
    'cardEntityTitle': ('Titles', 'Entity names on cards.', 'Climate policy'),
    'smallTitle': ('Titles', 'Small section headings, block titles.', 'Related claims'),
    'recordingLabel': ('Titles', 'The debate recording overlay phrase.', 'Wrap it up!'),
    'body': ('Body', 'Long-form body copy and notice descriptions.', 'Browse and organize the world’s public knowledge.'),
    'bodySemibold': ('Body', 'Emphasised body copy.', 'Your vote is saved'),
    'listItem': ('Body', 'Editor list items.', 'A point in a list'),
    'listSemibold': ('Body', 'Emphasised list items.', 'A bold point'),
    'quote': ('Body', 'Quotes and short pulled text.', 'Cities should ban cars downtown.'),
    'quoteMedium': ('Body', 'TabGroup tab labels; medium-weight headings in panels.', 'Overview'),
    'textLink': ('Body', 'Underlined inline links in body copy.', 'Read the guidelines'),
    'textLinkSemibold': ('Body', 'Underlined semibold links.', 'See all'),
    'tableCell': ('Body', 'Table cell values.', 'Value'),
    'tableProperty': ('Body', 'Table property names.', 'Property'),
    'button': ('UI', 'Button labels, menu items, PositionButton (Agree/Disagree) labels, Dropdown rows.', 'Agree'),
    'smallButton': ('UI', 'TextButton labels and small inline actions.', 'Clear'),
    'input': ('UI', 'Input text.', 'Search claims'),
    'inputMedium': ('UI', 'Emphasised input text.', 'Selected value'),
    'metadata': ('UI', 'The debates UI workhorse: HubPillButton labels, dialog actions, card meta, light tooltips.', 'Debate now'),
    'metadataMedium': ('UI', 'Person names in PersonRow, claim text in cards (claim-card-panel-title), LinkableChip.', 'Cities should ban cars downtown.'),
    'chat': ('UI', 'Lobby and debate chat messages.', 'Good point, but…'),
    'chatMedium': ('UI', 'Chat author names.', 'Ava'),
    'breadcrumb': ('UI', 'Breadcrumbs, dark tooltips, compact hub pills, helper lines under panel headings.', 'Debates / Claims'),
    'browseMenu': ('UI', 'Browse sidebar menu items (Figma: Calibre Regular 16 / 13 cap, -0.35 tracking).', 'Explore'),
    'browseSection': ('UI', 'Browse sidebar section headers and PersonRow stat line (Figma: 13/13, -0.35 tracking).', '12 debates'),
    'resultTitle': ('UI', 'Search result titles.', 'Result title'),
    'resultLink': ('UI', 'Search result links.', 'geobrowser.io'),
    'errorMessage': ('UI', 'Inline form error messages.', 'Something went wrong'),
    'tag': ('Small', 'Tiny labels: VS marker in dialogs, tags.', 'VS'),
    'footnote': ('Small', 'Footnotes: request countdowns, party names, Away, helper text.', 'Expires in 4m'),
    'footnoteMedium': ('Small', 'Space names on claim cards (SpaceChip), VS marker in RequestParties.', 'Urbanism'),
    'navlink': ('Small', 'Tiny nav links.', 'Home'),
}
GROUP_ORDER = ['Titles', 'Body', 'UI', 'Small']

RADIUS_USAGE = {
    'radius-none': 'Square corners.',
    'radius-xs': 'Hairline rounding (rounded-xs).',
    'radius-sm': 'Tag, CheckboxVisual filled box, SpaceChip thumbnail (rounded-sm).',
    'radius': 'The classic control radius: Button, SquareButton, Input, Dropdown, Toast, dark Tooltip, MenuItem hover plate (rounded). Checkbox is a literal 4px.',
    'radius-md': 'rounded-md: mid-size wells.',
    'radius-lg': 'Cards and floating surfaces: claim card, incoming request card, Menu, Dialog, modal cards, RequestParties strip (rounded-lg).',
    'radius-xl': 'Large wells: the Panel-Empty card (rounded-xl).',
    'radius-full': 'Pills and faces: HubPillButton, PositionButton, filter and space pills, avatars, OnlineDot, VS marker.',
}
SHADOW_USAGE = {
    'shadow-none': 'No shadow.',
    'shadow-onboarding': 'Onboarding glow (no colour in the token; the class pairs it with a shadow colour).',
    'shadow-dropdown': 'Legacy dropdown lift.',
    'shadow-button': 'The secondary Button and Dropdown trigger rest shadow: a 1px divider-coloured drop.',
    'shadow-panel': 'Side panels.',
    'shadow-card': 'Toasts and modal cards (debate request dialog).',
    'shadow-light': 'The base Button shadow.',
    'shadow-big': 'Large floating surfaces.',
    'shadow-lg': 'Menu, Dropdown content and light Tooltip.',
    'shadow-popover': 'The debates panel Filters popover: shadow-lg a touch darker.',
    'shadow-inner': 'Inset 1px outline in the current shadow colour: Input rest (with shadow-grey-02).',
    'shadow-inner-transparent': 'Inset 1px, invisible: reserves the outline.',
    'shadow-inner-grey-02': 'Inset 1px grey-02 outline: Dropdown trigger rest.',
    'shadow-inner-ctaHover': 'Inset 1px ctaHover: primary Button focus-visible.',
    'shadow-inner-text': 'Inset 1px text: secondary/ghost Button focus-visible, Dropdown trigger hover.',
    'shadow-inner-green': 'Inset 1px green outline.',
    'shadow-inner-lg': 'Inset 2px outline in the current shadow colour: Input focus, chip focus.',
    'shadow-inner-lg-transparent': 'Inset 2px, invisible.',
    'shadow-inner-lg-grey-02': 'Inset 2px grey-02.',
    'shadow-inner-lg-ctaHover': 'Inset 2px ctaHover.',
    'shadow-inner-lg-text': 'Inset 2px text: Dropdown trigger focus.',
    'shadow-inner-lg-green': 'Inset 2px green.',
}

SPACING = [  # Tailwind v4's default --spacing (0.25rem) is not overridden by the app; these are the steps its components use.
    ('spacing-0.5', '0.125rem', 'gap-0.5: Dots, PersonRow name/meta stack.'),
    ('spacing-1', '0.25rem', 'p-1, gap-1: tight icon gaps, PopoverMenu padding.'),
    ('spacing-1.5', '0.375rem', 'gap-1.5: icon + label inside pills and chips; px-1.5 chips.'),
    ('spacing-2', '0.5rem', 'gap-2: between pills, grid gap in PositionRow and request actions; Menu sideOffset.'),
    ('spacing-2.5', '0.625rem', 'gap-x-2.5 and py-2.5 in PersonRow; px-2.5 pills; Input padding is literal 10px/9px.'),
    ('spacing-3', '0.75rem', 'p-3: claim card, request card and menu row padding; px-3 HubPillButton default and Button.'),
    ('spacing-4', '1rem', 'p-4: Dialog, toast container, Notice gaps.'),
    ('spacing-5', '1.25rem', 'p-5: modal cards (debate request dialog); gap-5 dialog footer.'),
    ('spacing-6', '1.5rem', 'gap-6: between TabGroup tabs; px-6 Notice.'),
    ('spacing-8', '2rem', 'size-8: the PersonRow face; ProseMirror bottom padding.'),
]

value_of = {n: v for n, v, _ in decls}

def note(name, table, comment):
    return table.get(name) or comment or 'Defined in apps/web/styles/styles.css.'

colors, text_styles, radius, shadow, zindex, tracking, widths = [], {}, [], [], [], [], []
skipped = []
for name, value, comment in decls:
    if name.startswith('color-'):
        n = name[len('color-'):]
        if n == '*':
            continue
        if not value.startswith('#'):
            skipped.append(f'--{name}: {value} (a named colour the format cannot hold)')
            continue
        colors.append({'name': n, 'value': value.lower(), 'usage': note(n, COLOR_USAGE, comment)})
    elif name.startswith('text-'):
        base, _, prop = name[len('text-'):].partition('--')
        text_styles.setdefault(base, {})[prop or 'fontSize'] = value
    elif name.startswith('radius-') and name != 'radius-*':
        radius.append({'name': name, 'value': value, 'usage': note(name, RADIUS_USAGE, comment)})
    elif name == 'radius':
        radius.append({'name': 'radius', 'value': value, 'usage': RADIUS_USAGE['radius']})
    elif name.startswith('shadow-') and name != 'shadow-*':
        shadow.append({'name': name, 'value': value, 'usage': note(name, SHADOW_USAGE, comment)})
    elif name.startswith('z-index-'):
        zu = {'z-index-flow-bar': 'The publish flow bar (Z_LAYERS.flowBar).',
              'z-index-slide-up': 'Slide-up sheets; comment and entity side panels open over them at 10001-10002.',
              'z-index-status-bar': 'The publish status bar: above panels (10001-10002) and elevated popovers (10003).',
              'z-index-toast': 'Toasts: above everything but the schedule dialog (10006-10007) and bottom sheets (10008-10009) in core/z-layers.ts.'}
        zindex.append({'name': name, 'value': value, 'usage': zu.get(name, comment or '') + f' Class z-{name[len("z-index-"):]}.'})
    elif name.startswith('tracking-'):
        tracking.append({'name': name, 'value': value, 'usage': comment or ''})
    elif name.startswith('width-'):
        widths.append({'name': name, 'value': value, 'usage': comment or ''})
    elif name.startswith(('animate-', 'breakpoint-')):
        pass  # motion has no family in the format; breakpoints come from @custom-variant below
    else:
        skipped.append(f'--{name}')

# Remaining z layers that live in core/z-layers.ts rather than the theme.
zindex[0:0] = []
for n, v, u in [('z-index-dialog', '100', 'Design-system Dialog overlay z-100 (content z-101); Menu shell z-100.'),
                ('z-index-tooltip', '1001', 'Tooltip content z-1001; elevated popovers default to 1001.'),
                ('z-index-elevated-popover', '10003', 'Popovers opened inside a side panel or slide-up (styles.css body[data-entity-side-panel-open]).')]:
    zindex.append({'name': n, 'value': v, 'usage': u})

# Breakpoints: desktop-first max-width custom variants, and the claim-surface container queries.
bps = []
for m in re.finditer(r'@custom-variant ([A-Za-z0-9-]+) \(@(media|container) \(([^)]*)\)\);', css):
    name, kind, cond = m.groups()
    px = re.search(r'(\d+px)', cond)
    if not px:
        bps.append({'name': f'variant-{name}', 'value': cond.replace(':', '').strip(), 'usage': f'@custom-variant {name}: @media ({cond}).'})
        continue
    if kind == 'media':
        bps.append({'name': f'breakpoint-{name}', 'value': px.group(1),
                    'usage': f'`{name}:` applies at max-width {px.group(1)} (desktop-first: base classes are desktop, the variant is the narrow override).'})
    else:
        bps.append({'name': f'container-{name}', 'value': px.group(1),
                    'usage': f'`{name}:` container query ({cond}) on claim surfaces: Agree/Disagree row and claim card.'})
bps.append({'name': 'breakpoint-entityTitle-narrow', 'value': '409px', 'usage': 'entityTitle steps down to 26/30 at max-width 409px (36/38 at max-width 767px).'})

def style(name, props):
    group, usage, sample = TEXT_USAGE.get(name, ('UI', 'Defined in styles.css.', 'Sample'))
    s = {'name': name, 'fontSize': props['fontSize'], 'lineHeight': props.get('line-height', 'normal'),
         'fontWeight': int(props.get('font-weight', 400))}
    if 'letter-spacing' in props:
        s['letterSpacing'] = props['letter-spacing']
    s['usage'] = usage + f' Class text-{name}.'
    s['sample'] = sample
    return group, s

groups = {g: [] for g in GROUP_ORDER}
for name, props in text_styles.items():
    g, s = style(name, props)
    groups.setdefault(g, []).append(s)
type_groups = [{'name': g, 'family': 'calibre', 'styles': groups[g]} for g in GROUP_ORDER if groups[g]]
type_groups.append({'name': 'Geist', 'family': 'geist-medium', 'styles': [
    {'name': 'brandWordmark', 'fontSize': '26px', 'lineHeight': 1, 'fontWeight': 500,
     'usage': 'The "Geo" wordmark in the phone navbar (partials/navbar/mobile-navbar-brand.tsx: font-[family-name:var(--font-geist-medium)] text-[26px] leading-none). Geist is never UI copy.', 'sample': 'Geo'},
    {'name': 'stampLabel', 'family': 'geist-bold', 'fontSize': '16px', 'lineHeight': 1, 'fontWeight': 700,
     'usage': 'Open rounds playback stamps (core/debates/browse/stamp-styles.ts STAMP_FONT); sizes are set per stamp.', 'sample': 'AGREE'},
]})

fonts = [
    {'family': 'Calibre', 'file': 'fonts/calibre-regular.woff2', 'weight': '400', 'style': 'normal'},
    {'family': 'Calibre', 'file': 'fonts/calibre-medium.woff2', 'weight': '500', 'style': 'normal'},
    {'family': 'Calibre', 'file': 'fonts/calibre-semibold.woff2', 'weight': '600', 'style': 'normal'},
    {'family': 'Calibre', 'file': 'fonts/calibre-bold.woff2', 'weight': '700', 'style': 'normal'},
    {'family': 'Geist', 'file': 'fonts/Geist-Medium-v1.ttf', 'weight': '500', 'style': 'normal'},
    {'family': 'Geist', 'file': 'fonts/Geist-Bold.ttf', 'weight': '700', 'style': 'normal'},
]
families = {
    'calibre': '"Calibre", sans-serif',
    'geist-medium': '"Geist", "Calibre", system-ui, sans-serif',
    'geist-bold': '"Geist", "Calibre", system-ui, sans-serif',
}

tokens = {
    'name': 'Geo Design System',
    'version': 1,
    'meta': {
        'source': 'github', 'repo': 'geobrowser/geogenesis', 'ref': f'master@{sha}', 'package': 'apps/web',
        'paths': {
            'tokens': ['apps/web/styles/styles.css', 'apps/web/design-system/theme/colors.ts', 'apps/web/design-system/theme/typography.ts', 'apps/web/core/z-layers.ts'],
            'fonts': ['apps/web/app/fonts/calibre-regular.woff2', 'apps/web/app/fonts/calibre-medium.woff2', 'apps/web/app/fonts/calibre-semibold.woff2', 'apps/web/app/fonts/calibre-bold.woff2', 'apps/web/app/fonts/Geist-Medium-v1.ttf', 'apps/web/public/fonts/Geist-Bold.ttf', 'apps/web/app/layout.tsx'],
            'assets': ['apps/web/design-system/icons'],
            'docs': ['apps/web/styles/styles.css (comments)'],
        },
        'components': {},
        'synced': date.today().isoformat(),
        'notSynced': skipped,
    },
    'color': {'themes': [{'id': 'light', 'name': 'Light'}], 'tokens': colors},
    'type': {'fonts': fonts, 'families': families, 'groups': type_groups},
    'spacing': {'note': 'Tailwind v4 default scale: the app keeps --spacing: 0.25rem, so p-N = N x 4px. Listed: the steps its components use.',
                'tokens': [{'name': n, 'value': v, 'usage': u} for n, v, u in SPACING]},
    'radius': {'tokens': radius},
    'shadow': {'tokens': shadow},
    'zIndex': {'note': 'Stacking order, from styles.css @theme and core/z-layers.ts.', 'tokens': sorted(zindex, key=lambda t: int(t['value']))},
    'breakpoints': {'note': 'Desktop-first. Base classes are the desktop layout; md: means max-width 767px (phones). There is no working max-md:.', 'tokens': bps},
    'width': {'tokens': widths},
    'tracking': {'tokens': tracking},
}
components_path = os.path.join(root, 'tools', 'component-sources.json')
if os.path.exists(components_path):
    tokens['meta']['components'] = json.load(open(components_path))

json.dump(tokens, open(os.path.join(root, 'project/tokens.json'), 'w'), indent=2, ensure_ascii=False)

# ---- tokens.css, laid out as format.md "tokens.css as compiled" ----
def esc(n):
    return n.replace('.', '\\.')
out = ['/* Geo Design System — generated from tokens.json */']
out.append(':root, [data-theme="light"] {')
out += [f'  --{esc(c["name"])}: {c["value"]};' for c in colors]
out += [f'  --{esc(s["name"])}: {s["value"]};' for s in shadow]
out.append('}')
out.append(':root {')
for fam in ('spacing', 'radius', 'zIndex', 'breakpoints', 'width', 'tracking'):
    out += [f'  --{esc(t["name"])}: {t["value"]};' for t in tokens[fam]['tokens']]
out += [f'  --font-{k}: {v};' for k, v in families.items()]
out.append('}')
for g in type_groups:
    for s in g['styles']:
        fam = s.get('family', g['family'])
        decl = [f'font-family: var(--font-{fam})', f'font-size: {s["fontSize"]}', f'line-height: {s["lineHeight"]}', f'font-weight: {s["fontWeight"]}']
        if 'letterSpacing' in s:
            decl.append(f'letter-spacing: {s["letterSpacing"]}')
        out.append(f'.{s["name"]} {{ ' + '; '.join(decl) + '; }')
for f in fonts:
    fmt = 'woff2' if f['file'].endswith('woff2') else 'truetype'
    out.append(f'@font-face {{ font-family: "{f["family"]}"; src: url("{f["file"]}") format("{fmt}"); font-weight: {f["weight"]}; font-style: {f["style"]}; font-display: swap; }}')
open(os.path.join(root, 'project/tokens.css'), 'w').write('\n'.join(out) + '\n')

print(f'colors {len(colors)}, text styles {sum(len(g["styles"]) for g in type_groups)}, fonts {len(fonts)}, radius {len(radius)}, shadow {len(shadow)}, z {len(zindex)}, bps {len(bps)}; skipped {skipped}')
