# Geo Design System: how to rebuild it

This is the source for the claude.ai Design System artifact https://claude.ai/artifact/12jebYC4oHrL47Rurx8PhQ.
It was built from geobrowser/geogenesis master@e66ee751a (2026-11-12). Everything under `project/` is published as-is; `tools/` holds the generators.

## Refresh from a newer master

1. Make a throwaway worktree, without touching the main checkout's working tree:
   `git -C <geogenesis> fetch origin master && git -C <geogenesis> worktree add /tmp/geo-ds-wt origin/master --detach`
   Symlink node_modules in, so no install is needed:
   `ln -s <geogenesis>/node_modules /tmp/geo-ds-wt/node_modules; ln -s <geogenesis>/apps/web/node_modules /tmp/geo-ds-wt/apps/web/node_modules`
2. Icons and avatars. Bun has to run these from inside the worktree, so its `~/` paths and React resolve:
   `cp tools/render-icons.tsx /tmp/geo-ds-wt/apps/web/ri.tmp.tsx && (cd /tmp/geo-ds-wt/apps/web && bun ri.tmp.tsx $PWD/design-system/icons <this>/tools/icons-out)`. Then copy `geo-mark.svg` and `geo-logo-large.svg` to `project/assets/Logos/` and the rest to `project/assets/Icons/`.
   `tools/render-avatars.tsx` (same way, writing `tools/avatars.json`) does the same for the avatar fallbacks the previews inline.
3. Tokens: `python3 -I tools/build-tokens.py /tmp/geo-ds-wt <sha>` writes `project/tokens.json` and `project/tokens.css` from `apps/web/styles/styles.css`. Usage notes live in the script.
4. Component READMEs: `python3 -I tools/component-readmes.py`. Previews: `python3 -I tools/build-previews.py`, which expands `tools/previews/*.html` (class strings copied by hand from each component's source; re-check them against the source when a component changes).
5. bundle.css: `node tools/build-css.cjs /tmp/geo-ds-wt <geogenesis>/node_modules`. This is a real Tailwind v4 compile of the app's `styles.css` plus `tools/preview-extras.css`, scanning only the previews.
6. Optional check: `node tools/render-check.cjs <geogenesis>/node_modules /tmp/shots` screenshots every preview with tokens.css and bundle.css loaded.
7. Fonts: copy `apps/web/app/fonts/calibre-*.woff2`, `apps/web/app/fonts/Geist-Medium-v1.ttf` and `apps/web/public/fonts/Geist-Bold.ttf` to `project/fonts/`.
8. Publish (Claude Code, Artifact tool). Upload any new or changed SVGs as assets (`asset: true`, at most 25 per call), and add their ids to `tools/asset-ids.txt` (path, id, uploaded size). Read `project/design-system.json` from the artifact, then run `python3 -I tools/build-index.py <sha> <that file>` so its other keys are kept. Then publish with `root` = this folder, `file_path` = `project/design-system.json`, and `files` = only the changed `project/...` paths (`tools/publish-files.json` lists them all).
9. Remove the worktree: `git -C <geogenesis> worktree remove --force /tmp/geo-ds-wt`.
