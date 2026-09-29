"""Apply the reviewed Genesis action contract to a newly vendored analytics bundle.
Run from the repository root. Keeps the content hash, SRI, loader and manifest in sync.
The upstream collector must accept these same events before production rollout.
"""
import base64
import hashlib
import json
import pathlib
import re

root = pathlib.Path(__file__).resolve().parents[2]
public = root / 'apps/web/public'
manifest_path = public / 'geo-analytics-manifest.json'
manifest = json.loads(manifest_path.read_text())
old = public / f"geo-analytics-{manifest['shortHash']}.js"
bundle = old.read_text()
match = re.search(r'var registry=(\{.*?\});', bundle)
if not match:
    raise RuntimeError('Upstream registry format changed; review before patching')
registry = json.loads(match[1])
shared = ['component', 'page_path', 'page_type', 'page_view_id', 'target_id', 'target_type', 'action_context_version']
for name, extra in {'action_completed': ['operation_id', 'action_kind', 'outcome'],
                    'component_impression': ['presentation_instance_id']}.items():
    required = shared + extra
    registry['events'][name] = dict(name=name, apps=['genesis'], family='engagement', origin='browser',
                                   owner='product', required=required, runtimeSupport='generic', signal='log', status='draft')
    contract = dict(id=name, apps=['genesis'], source='browser', required_properties=required, integer_properties=[])
    registry['measurement']['contracts'] = [c for c in registry['measurement']['contracts'] if c['id'] != name] + [contract]
encoded = json.dumps(registry, separators=(',', ':'), sort_keys=True)
bundle = bundle[:match.start(1)] + encoded + bundle[match.end(1):]
digest = hashlib.sha256(bundle.encode()).digest()
hex_hash = digest.hex()
new = public / f'geo-analytics-{hex_hash[:12]}.js'
new.write_text(bundle)
if old != new:
    old.unlink()
loader_path = root / 'apps/web/core/analytics.ts'
loader = loader_path.read_text().replace(f"geo-analytics-{manifest['shortHash']}.js", new.name)
loader = loader.replace(manifest['integrity'], 'sha256-' + base64.b64encode(digest).decode())
loader_path.write_text(loader)
manifest.setdefault('upstreamSourceHash', manifest['sourceHash'])
manifest['localPatch'] = 'scripts/analytics/extend-action-registry.py'
manifest['eventRegistryHash'] = hashlib.sha256(encoded.encode()).hexdigest()
manifest.update(hash=hex_hash, shortHash=hex_hash[:12], integrity='sha256-' + base64.b64encode(digest).decode())
manifest['files']['hashed'] = f'ga-{hex_hash[:12]}.js'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print(new.name)
