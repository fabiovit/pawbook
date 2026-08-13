from pathlib import Path
import re, json, py_compile, subprocess

root=Path('.')
cc=root/'custom_components/pawbook'
fd=cc/'frontend'
old=fd/'pawbook-panel-v630.js'
new=fd/'pawbook-panel-v640.js'
asset=Path('scripts/pawbook640_assets')
js=old.read_text(encoding='utf-8')

# Active app view state
js=js.replace('''    this._calendarOffset = 0;\n  }''','''    this._calendarOffset = 0;\n    this._activeSection = "overview";\n  }''',1)

# Calendar data for compact agenda
old_ret='''    return {\n      label:new Intl.DateTimeFormat("it-IT",{month:"long",year:"numeric"}).format(first),\n      days,\n      upcoming:events.filter(item=>item.date >= iso(now)).slice(0,6),\n    };'''
new_ret='''    const monthKey = `${year}-${String(month+1).padStart(2,"0")}`;\n    return {\n      label:new Intl.DateTimeFormat("it-IT",{month:"long",year:"numeric"}).format(first),\n      days,\n      monthKey,\n      monthEvents:events.filter(item=>String(item.date).startsWith(monthKey)),\n      upcoming:events.filter(item=>item.date >= iso(now)).slice(0,8),\n    };'''
if old_ret not in js: raise SystemExit('calendar return anchor missing')
js=js.replace(old_ret,new_ret,1)

# Switch views instead of scrolling a giant page
helper=r'''  applyActiveView() {
    const active = this._activeSection || "overview";
    const hero = this.shadowRoot.querySelector("#overview");
    const overview = this.shadowRoot.querySelector(".overview-dashboard");
    const family = this.shadowRoot.querySelector("#family-hub");
    const grid = this.shadowRoot.querySelector(".grid");
    if (!grid) return;
    const detailSections = [...grid.querySelectorAll(":scope > article[id]")];
    const isOverview = active === "overview";
    if (hero) hero.hidden = !isOverview;
    if (overview) overview.hidden = !isOverview;
    if (family) family.hidden = !isOverview;
    grid.hidden = isOverview;
    detailSections.forEach(section => { section.hidden = isOverview || section.id !== active; });
    this.shadowRoot.querySelectorAll(".dashboard-nav [data-nav-target]").forEach(button => {
      button.classList.toggle("active", button.dataset.navTarget === active);
    });
  }

'''
js=js.replace('  render() {',helper+'  render() {',1)

# Native MDI nav, Inverter-like
nav_start=js.index('          <nav class="dashboard-nav tabs" aria-label="Sezioni PawBook">')
nav_end=js.index('\n          </nav>',nav_start)+len('\n          </nav>')
nav='''          <nav class="dashboard-nav tabs" aria-label="Sezioni PawBook">
            <button class="active" data-nav-target="overview"><ha-icon icon="mdi:paw"></ha-icon><span>Panoramica</span></button>
            <button data-nav-target="smart-section"><ha-icon icon="mdi:heart-pulse"></ha-icon><span>Smart Health</span></button>
            <button data-nav-target="health-section"><ha-icon icon="mdi:scale-bathroom"></ha-icon><span>Peso</span></button>
            <button data-nav-target="vaccines-section"><ha-icon icon="mdi:needle"></ha-icon><span>Vaccini</span></button>
            <button data-nav-target="visits-section"><ha-icon icon="mdi:stethoscope"></ha-icon><span>Visite</span></button>
            <button data-nav-target="treatments-section"><ha-icon icon="mdi:pill"></ha-icon><span>Terapie</span></button>
            <button data-nav-target="heat-section"><ha-icon icon="mdi:flower-pollen"></ha-icon><span>Calori</span></button>
            <button data-nav-target="calendar-section"><ha-icon icon="mdi:calendar-heart"></ha-icon><span>Agenda</span></button>
            <button data-nav-target="timeline-section"><ha-icon icon="mdi:timeline-clock-outline"></ha-icon><span>Salute</span></button>
            <button data-nav-target="genealogy-section"><ha-icon icon="mdi:family-tree"></ha-icon><span>Genealogia</span></button>
            <button data-nav-target="enci-section"><ha-icon icon="mdi:medal-outline"></ha-icon><span>ENCI</span></button>
            <button data-nav-target="statistics-section"><ha-icon icon="mdi:chart-box-outline"></ha-icon><span>Statistiche</span></button>
            <button data-nav-target="documents-section"><ha-icon icon="mdi:paperclip"></ha-icon><span>Documenti</span></button>
            <button data-nav-target="report-section"><ha-icon icon="mdi:file-document-outline"></ha-icon><span>Report</span></button>
            <button data-nav-target="backup-section"><ha-icon icon="mdi:backup-restore"></ha-icon><span>Backup</span></button>
          </nav>'''
js=js[:nav_start]+nav+js[nav_end:]

# Health stage inside hero
anchor='''            </div>\n          </div>\n\n          <div class="hero-kpi-rail">'''
stage='''            </div>\n          </div>\n          <div class="hero-health-stage">\n            <span class="stage-kicker">HEALTH STATUS</span>\n            <div class="health-orbit ${smart.some(x=>x.level === "danger") ? "danger" : smart.some(x=>x.level === "warn") ? "warn" : "good"}">\n              <div class="health-orbit-core"><ha-icon icon="mdi:heart-pulse"></ha-icon></div>\n              <div class="health-orbit-copy">\n                <strong>${smart.some(x=>x.level === "danger") ? "Da controllare" : smart.some(x=>x.level === "warn") ? "Attenzione" : "Tutto regolare"}</strong>\n                <small>${reminders[0] ? this.esc(reminders[0].title) : "Nessun avviso prioritario"}</small>\n              </div>\n            </div>\n            <button class="next-care" data-nav-target="${reminders[0]?.target || (nextVax ? "vaccines-section" : "calendar-section")}">\n              <span>PROSSIMA AZIONE</span>\n              <strong>${reminders[0] ? this.esc(reminders[0].detail) : nextVax ? `Vaccino · ${this.formatDate(nextVax.expires_on)}` : "Apri agenda salute"}</strong>\n              <ha-icon icon="mdi:arrow-right"></ha-icon>\n            </button>\n          </div>\n\n          <div class="hero-kpi-rail">'''
if anchor not in js: raise SystemExit('hero anchor missing')
js=js.replace(anchor,stage,1)
for old_icon,new_icon in [
('<div class="stat-icon">⚖️</div>','<div class="stat-icon"><ha-icon icon="mdi:scale-bathroom"></ha-icon></div>'),
('<div class="stat-icon">💉</div>','<div class="stat-icon"><ha-icon icon="mdi:needle"></ha-icon></div>'),
('<div class="stat-icon">🩺</div>','<div class="stat-icon"><ha-icon icon="mdi:stethoscope"></ha-icon></div>'),
('<div class="stat-icon">🎂</div>','<div class="stat-icon"><ha-icon icon="mdi:cake-variant-outline"></ha-icon></div>')]: js=js.replace(old_icon,new_icon,1)
js=js.replace('''            <button data-form="weight" title="Registra peso">⚖️ <span>Peso</span></button>\n            <button data-form="vaccination" title="Aggiungi vaccino">💉 <span>Vaccino</span></button>\n            <button data-form="visit" title="Aggiungi visita">🩺 <span>Visita</span></button>\n            <button class="secondary" id="profile-config" title="Modifica profilo">⚙️ <span>Profilo</span></button>''','''            <button data-form="weight" title="Registra peso"><ha-icon icon="mdi:scale-bathroom"></ha-icon><span>Peso</span></button>\n            <button data-form="vaccination" title="Aggiungi vaccino"><ha-icon icon="mdi:needle"></ha-icon><span>Vaccino</span></button>\n            <button data-form="visit" title="Aggiungi visita"><ha-icon icon="mdi:stethoscope"></ha-icon><span>Visita</span></button>\n            <button class="secondary" id="profile-config" title="Modifica profilo"><ha-icon icon="mdi:cog-outline"></ha-icon><span>Profilo</span></button>''',1)

# Overview and agenda templates
ov_start=js.index('        <section class="smart-dashboard" aria-label="Smart Dashboard PawBook">')
ov_end=js.index('\n\n        <section class="grid">',ov_start)
js=js[:ov_start]+asset.joinpath('overview.html').read_text()+js[ov_end:]
cal_start=js.index('          <article class="card v2-section health-calendar-card app-panel span-2" id="calendar-section">')
cal_end=js.index('\n\n          <article class="card v2-section health-timeline-card',cal_start)
js=js[:cal_start]+asset.joinpath('calendar.html').read_text()+js[cal_end:]

# Navigation interactions
old_nav='''    this.shadowRoot.querySelectorAll("[data-nav-target]").forEach((button) => {\n      button.addEventListener("click", () => {\n        const target = this.shadowRoot.querySelector(`#${button.dataset.navTarget}`);\n        target?.scrollIntoView({ behavior: "smooth", block: "start" });\n        this.shadowRoot.querySelectorAll(".dashboard-nav button").forEach((item) => item.classList.remove("active"));\n        button.classList.add("active");\n      });\n    });'''
new_nav='''    this.shadowRoot.querySelectorAll("[data-nav-target]").forEach((button) => {\n      button.addEventListener("click", () => {\n        this._activeSection = button.dataset.navTarget || "overview";\n        this.applyActiveView();\n        window.scrollTo({ top:0, behavior:"smooth" });\n      });\n    });'''
if old_nav not in js: raise SystemExit('nav handler missing')
js=js.replace(old_nav,new_nav,1)
js=js.replace('''        const targetId = button.dataset.familyTarget || "overview";\n        this.render();\n        requestAnimationFrame(() => this.shadowRoot.querySelector(`#${targetId}`)?.scrollIntoView({behavior:"smooth",block:"start"}));''','''        const targetId = button.dataset.familyTarget || "overview";\n        this._activeSection = targetId;\n        this.render();''',1)
js=js.replace('''        this._calendarOffset = 0;\n        this.render();\n        requestAnimationFrame(() => this.shadowRoot.querySelector("#overview")?.scrollIntoView({behavior:"smooth",block:"start"}));''','''        this._calendarOffset = 0;\n        this._activeSection = "overview";\n        this.render();''',1)
for a,b in [
('''      this._calendarOffset = (this._calendarOffset || 0) - 1;\n      this.render();\n      requestAnimationFrame(() => this.shadowRoot.querySelector("#calendar-section")?.scrollIntoView({block:"start"}));''','''      this._calendarOffset = (this._calendarOffset || 0) - 1;\n      this._activeSection = "calendar-section";\n      this.render();'''),
('''      this._calendarOffset = (this._calendarOffset || 0) + 1;\n      this.render();\n      requestAnimationFrame(() => this.shadowRoot.querySelector("#calendar-section")?.scrollIntoView({block:"start"}));''','''      this._calendarOffset = (this._calendarOffset || 0) + 1;\n      this._activeSection = "calendar-section";\n      this.render();'''),
('''      this._calendarOffset = 0;\n      this.render();\n      requestAnimationFrame(() => this.shadowRoot.querySelector("#calendar-section")?.scrollIntoView({block:"start"}));''','''      this._calendarOffset = 0;\n      this._activeSection = "calendar-section";\n      this.render();''')]: js=js.replace(a,b,1)
# Last pet switch and render end
js=js.replace('''        this._calendarOffset = 0;\n        this.render();\n      })\n    );\n  }\n}''','''        this._calendarOffset = 0;\n        this._activeSection = "overview";\n        this.render();\n      })\n    );\n    this.applyActiveView();\n  }\n}''',1)

# Health OS CSS
css=asset.joinpath('health-os.css').read_text()
pos=js.rfind('</style>')
if pos<0: raise SystemExit('style close missing')
js=js[:pos]+css+js[pos:]

# Version / asset
js=js.replace('6.3.0','6.4.0')
js=re.sub(r'customElements\.get\("pawbook-panel-v\d+"\)', 'customElements.get("pawbook-panel-v640")', js)
js=re.sub(r'customElements\.define\("pawbook-panel-v\d+"', 'customElements.define("pawbook-panel-v640"', js)
new.write_text(js,encoding='utf-8')

panel=cc/'panel.py'; panel.write_text(panel.read_text().replace('pawbook-panel-v630','pawbook-panel-v640'))
manifest=cc/'manifest.json'; md=json.loads(manifest.read_text()); md['version']='6.4.0'; manifest.write_text(json.dumps(md,ensure_ascii=False,indent=2)+'\n')

ch=root/'CHANGELOG.md'; text=ch.read_text(); entry='''## 6.4.0 - Health OS Redesign\n\n- Rebuilt PawBook as an app-style multi-view interface instead of one long card stack.\n- Navigation now switches full views instead of scrolling through every section.\n- Redesigned the pet overview as a Health Command Center inspired by the Inverter Dashboard.\n- Added a dedicated health-status stage and next-action focus.\n- Replaced the old Smart Dashboard cards with a Care Focus stage and compact care ribbon.\n- Completely rebuilt the Health Calendar as a mini-month plus agenda stream.\n- Replaced menu emojis with native Home Assistant MDI icons.\n- Preserved all health, ENCI, genealogy, Multi-Pet, reminder and backup features.\n- Updated PawBook to version 6.4.0 and frontend asset v640.\n\n'''
if '## 6.4.0' not in text: ch.write_text(entry+text)
Path('RELEASE-6.4.0.md').write_text('''# PawBook v6.4.0 – Health OS Redesign\n\nPawBook 6.4.0 is a full interface rethink, not another cosmetic card refresh.\n\n## Health OS\n\n- App-style views: the top navigation switches between complete PawBook areas instead of scrolling a long page.\n- New Health Command Center with pet identity, health status, next action and key metrics.\n- New Care Focus overview for vaccinations, therapies, weight and predicted heat cycle.\n- Native Home Assistant MDI icons across the main navigation.\n\n## New Health Agenda\n\nThe old full monthly calendar grid has been removed. The new agenda combines a compact mini-month with event dots, a clean monthly event stream, visual categories and an upcoming-events rail.\n\n## Preserved\n\nAll existing PawBook data and features remain compatible, including Multi-Pet Hub, Vaccination Center, Veterinary Center, Treatments Center, Weight Center, Heat Cycle Center, ENCI Pro, genealogy, automatic reminders, documents, reports and backups.\n\n## Support PawBook\n\nhttps://ko-fi.com/fabvittori\n''')
Path('PUBBLICAZIONE_GITHUB.md').write_text('''# PawBook v6.4.0 – Pubblicazione GitHub\n\nCommit message:\nPawBook v6.4.0 - Health OS Redesign\n\nTag:\nv6.4.0\n\nRelease title:\nPawBook v6.4.0 – Health OS Redesign\n\nUse RELEASE-6.4.0.md as the release description.\n''')

for p in cc.rglob('*.py'): py_compile.compile(str(p),doraise=True)
r=subprocess.run(['node','--check',str(new)],capture_output=True,text=True)
if r.returncode: raise SystemExit(r.stderr)
assert 'applyActiveView()' in js and 'health-agenda-scene' in js and 'hero-health-stage' in js
print('PawBook 6.4.0 generated successfully')
