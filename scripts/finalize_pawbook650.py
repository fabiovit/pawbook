from pathlib import Path

panel = Path('custom_components/pawbook/panel.py')
text = panel.read_text(encoding='utf-8')

text = text.replace('PANEL_ELEMENT = "pawbook-panel-v640"', 'PANEL_ELEMENT = "pawbook-panel-v650"')

old = '''    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"{STATIC_URL}/pawbook-panel-v640.js",
                str(frontend_path / "pawbook-panel-v640.js"),
                False,
            )
        ]
    )'''
new = '''    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"{STATIC_URL}/pawbook-panel-v640.js",
                str(frontend_path / "pawbook-panel-v640.js"),
                False,
            ),
            StaticPathConfig(
                f"{STATIC_URL}/pawbook-panel-v650.js",
                str(frontend_path / "pawbook-panel-v650.js"),
                False,
            ),
        ]
    )'''
if old not in text:
    raise RuntimeError('Static path block not found')
text = text.replace(old, new, 1)
text = text.replace('"js_url": f"{STATIC_URL}/pawbook-panel-v640.js"', '"js_url": f"{STATIC_URL}/pawbook-panel-v650.js"', 1)

if 'PANEL_ELEMENT = "pawbook-panel-v650"' not in text:
    raise RuntimeError('Panel element was not updated')
if 'pawbook-panel-v650.js' not in text:
    raise RuntimeError('v650 asset was not registered')

panel.write_text(text, encoding='utf-8')
