from pathlib import Path
import ast

ROOT = Path(__file__).parent

def test_manifest_version():
    import json
    manifest = json.loads((ROOT / 'custom_components/pawbook/manifest.json').read_text())
    assert manifest['version'] == '0.7.0'

def test_python_sources_parse():
    for path in (ROOT / 'custom_components/pawbook').glob('*.py'):
        ast.parse(path.read_text(), filename=str(path))

def test_frontend_contains_enci_flow():
    js = (ROOT / 'custom_components/pawbook/frontend/pawbook-panel-v070.js').read_text()
    assert 'pawbook/enci_search' in js
    assert 'pawbook/enci_import' in js
    assert 'Importa / aggiorna' in js
