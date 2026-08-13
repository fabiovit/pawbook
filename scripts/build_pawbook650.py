from pathlib import Path
import json,re

root=Path('.')
cc=root/'custom_components/pawbook'
fd=cc/'frontend'
src=fd/'pawbook-panel-v640.js'
dst=fd/'pawbook-panel-v650.js'
js=src.read_text(encoding='utf-8')

js=js.replace('6.4.0','6.5.0')
js=re.sub(r'customElements\.get\("pawbook-panel-v\d+"\)','customElements.get("pawbook-panel-v650")',js)
js=re.sub(r'customElements\.define\("pawbook-panel-v\d+"','customElements.define("pawbook-panel-v650"',js)

old='''          <nav class="dashboard-nav tabs" aria-label="Sezioni PawBook">
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
new='''          <nav class="dashboard-nav tabs primary-nav" aria-label="Sezioni PawBook">
            <button class="active" data-nav-target="overview"><ha-icon icon="mdi:paw"></ha-icon><span>Panoramica</span></button>
            <button data-nav-target="smart-section"><ha-icon icon="mdi:heart-pulse"></ha-icon><span>Smart Health</span></button>
            <button data-nav-target="calendar-section"><ha-icon icon="mdi:calendar-heart"></ha-icon><span>Agenda</span></button>
            <button data-nav-target="timeline-section"><ha-icon icon="mdi:timeline-clock-outline"></ha-icon><span>Salute</span></button>
            <button data-nav-target="enci-section"><ha-icon icon="mdi:medal-outline"></ha-icon><span>ENCI</span></button>
            <details class="nav-more">
              <summary><ha-icon icon="mdi:view-grid-plus-outline"></ha-icon><span>Gestione</span><ha-icon class="nav-chevron" icon="mdi:chevron-down"></ha-icon></summary>
              <div class="nav-more-menu">
                <div class="nav-more-head"><span>GESTIONE SANITARIA</span><small>Registri e strumenti PawBook</small></div>
                <button data-nav-target="health-section"><ha-icon icon="mdi:scale-bathroom"></ha-icon><span><strong>Peso</strong><small>Storico e andamento</small></span></button>
                <button data-nav-target="vaccines-section"><ha-icon icon="mdi:needle"></ha-icon><span><strong>Vaccini</strong><small>Richiami e storico</small></span></button>
                <button data-nav-target="visits-section"><ha-icon icon="mdi:stethoscope"></ha-icon><span><strong>Visite</strong><small>Controlli veterinari</small></span></button>
                <button data-nav-target="treatments-section"><ha-icon icon="mdi:pill"></ha-icon><span><strong>Terapie</strong><small>Farmaci e trattamenti</small></span></button>
                <button data-nav-target="heat-section"><ha-icon icon="mdi:flower-pollen"></ha-icon><span><strong>Calori</strong><small>Cicli e previsione</small></span></button>
                <div class="nav-more-separator"></div>
                <button data-nav-target="genealogy-section"><ha-icon icon="mdi:family-tree"></ha-icon><span><strong>Genealogia</strong><small>Albero genealogico</small></span></button>
                <button data-nav-target="statistics-section"><ha-icon icon="mdi:chart-box-outline"></ha-icon><span><strong>Statistiche</strong><small>Riepilogo dati</small></span></button>
                <button data-nav-target="documents-section"><ha-icon icon="mdi:paperclip"></ha-icon><span><strong>Documenti</strong><small>Allegati sanitari</small></span></button>
                <button data-nav-target="report-section"><ha-icon icon="mdi:file-document-outline"></ha-icon><span><strong>Report</strong><small>Scheda stampabile</small></span></button>
                <button data-nav-target="backup-section"><ha-icon icon="mdi:backup-restore"></ha-icon><span><strong>Backup</strong><small>Esporta e ripristina</small></span></button>
              </div>
            </details>
          </nav>'''
if old not in js: raise RuntimeError('navigation block not found')
js=js.replace(old,new,1)

old='''    this.shadowRoot.querySelectorAll(".dashboard-nav [data-nav-target]").forEach(button => {
      button.classList.toggle("active", button.dataset.navTarget === active);
    });'''
new='''    this.shadowRoot.querySelectorAll(".dashboard-nav [data-nav-target]").forEach(button => {
      button.classList.toggle("active", button.dataset.navTarget === active);
    });
    const managementTargets = new Set(["health-section","vaccines-section","visits-section","treatments-section","heat-section","genealogy-section","statistics-section","documents-section","report-section","backup-section"]);
    this.shadowRoot.querySelector(".nav-more")?.classList.toggle("contains-active", managementTargets.has(active));'''
js=js.replace(old,new,1)

old='''        this._activeSection = button.dataset.navTarget || "overview";
        this.applyActiveView();
        window.scrollTo({ top:0, behavior:"smooth" });'''
new='''        this._activeSection = button.dataset.navTarget || "overview";
        const parentMenu = button.closest("details.nav-more");
        if (parentMenu) parentMenu.open = false;
        this.applyActiveView();
        window.scrollTo({ top:0, behavior:"smooth" });'''
js=js.replace(old,new,1)

css='''
      /* PawBook 6.5.0 — Navigation & spacing polish */
      .page{max-width:1440px !important;margin:0 auto !important;padding:18px 24px 54px !important}.topbar.inverter-shell{margin-bottom:28px !important}
      .card.v2-section::before,.heat-center::before,.health-calendar-card::before,.health-timeline-card::before,.reminders-center::before,.grid>article::before,#smart-section::before,#health-section::before,#vaccines-section::before,#visits-section::before,#treatments-section::before,#heat-section::before,#timeline-section::before,#statistics-section::before,#documents-section::before,#report-section::before,#backup-section::before{display:none !important;content:none !important}
      .grid>article{max-width:1320px !important;margin:0 auto !important;padding:26px 30px 40px !important}.grid>article>.card-head,.scene-heading{padding:0 0 20px !important;margin:0 0 24px !important;border-bottom:1px solid color-mix(in srgb,var(--divider-color) 82%,transparent) !important}.grid>article>.card-head h3,.scene-heading h2{font-size:30px !important;line-height:1.08 !important;margin:6px 0 !important}.grid>article>.card-head .muted,.scene-heading p{margin-top:6px !important;line-height:1.45 !important}
      .dashboard-nav.tabs.primary-nav{position:relative !important;display:flex !important;align-items:center !important;gap:6px !important;overflow:visible !important;padding:3px 0 5px !important;border-bottom:1px solid color-mix(in srgb,var(--divider-color) 72%,transparent) !important}.dashboard-nav.tabs.primary-nav>button,.nav-more>summary{min-height:42px !important;display:inline-flex !important;flex-direction:row !important;align-items:center !important;gap:7px !important;padding:0 13px !important;border-radius:12px !important;color:var(--secondary-text-color) !important;font-size:12px !important;font-weight:750 !important;cursor:pointer;border:1px solid transparent !important;background:transparent !important;white-space:nowrap;list-style:none}.nav-more>summary::-webkit-details-marker{display:none}.dashboard-nav.tabs.primary-nav>button:hover,.nav-more>summary:hover{color:var(--primary-text-color) !important;background:var(--secondary-background-color) !important}.dashboard-nav.tabs.primary-nav>button.active,.nav-more.contains-active>summary,.nav-more[open]>summary{color:var(--primary-color) !important;background:color-mix(in srgb,var(--primary-color) 10%,transparent) !important;border-color:color-mix(in srgb,var(--primary-color) 16%,transparent) !important}.dashboard-nav.tabs.primary-nav ha-icon{--mdc-icon-size:18px !important}.nav-more{position:relative;margin-left:auto;flex:0 0 auto}.nav-chevron{--mdc-icon-size:15px !important;transition:transform .18s ease}.nav-more[open] .nav-chevron{transform:rotate(180deg)}
      .nav-more-menu{position:absolute;z-index:70;right:0;top:calc(100% + 9px);width:min(390px,calc(100vw - 32px));display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:10px;border:1px solid color-mix(in srgb,var(--divider-color) 82%,transparent);border-radius:18px;background:var(--card-background-color);box-shadow:0 22px 70px rgba(0,0,0,.18)}.nav-more-head{grid-column:1/-1;padding:9px 10px 12px;border-bottom:1px solid var(--divider-color);margin-bottom:3px}.nav-more-head span,.nav-more-head small{display:block}.nav-more-head span{font-size:9px;font-weight:900;letter-spacing:.15em;color:var(--primary-color)}.nav-more-head small{font-size:10px;color:var(--secondary-text-color);margin-top:3px}.nav-more-menu>button{min-height:58px !important;display:grid !important;grid-template-columns:30px 1fr !important;align-items:center !important;gap:8px !important;padding:9px 10px !important;text-align:left !important;border:0 !important;border-radius:12px !important;background:transparent !important;color:var(--primary-text-color) !important}.nav-more-menu>button:hover,.nav-more-menu>button.active{background:var(--secondary-background-color) !important}.nav-more-menu>button.active{color:var(--primary-color) !important}.nav-more-menu>button>span strong,.nav-more-menu>button>span small{display:block}.nav-more-menu>button>span strong{font-size:11px}.nav-more-menu>button>span small{font-size:9px;color:var(--secondary-text-color);margin-top:2px;font-weight:500}.nav-more-menu ha-icon{--mdc-icon-size:19px !important;color:var(--primary-color)}.nav-more-separator{grid-column:1/-1;border-top:1px solid var(--divider-color);margin:4px 2px}
      #smart-section .smart-list{display:grid !important;gap:10px !important}#smart-section .smart-item{border-left:0 !important;border-radius:14px !important;padding:15px 18px !important;background:color-mix(in srgb,var(--secondary-background-color) 88%,transparent) !important}#smart-section .smart-item.ok{box-shadow:inset 3px 0 #48d58b !important}#smart-section .smart-item.warn{box-shadow:inset 3px 0 #ffb74d !important}#smart-section .smart-item.danger{box-shadow:inset 3px 0 #ff6b6b !important}#smart-section .smart-item.info{box-shadow:inset 3px 0 var(--primary-color) !important}
      @media(max-width:760px){.page{padding:10px 12px 42px !important}.topbar.inverter-shell{margin-bottom:18px !important}.dashboard-nav.tabs.primary-nav{overflow-x:auto !important;overflow-y:visible !important;gap:4px !important;padding-bottom:7px !important;scrollbar-width:none}.dashboard-nav.tabs.primary-nav::-webkit-scrollbar{display:none}.dashboard-nav.tabs.primary-nav>button,.nav-more>summary{min-height:40px !important;padding:0 11px !important;font-size:11px !important}.nav-more{margin-left:0}.nav-more-menu{position:fixed;left:12px;right:12px;top:auto;bottom:16px;width:auto;max-height:min(68vh,560px);overflow:auto;grid-template-columns:1fr;border-radius:22px;padding:12px;box-shadow:0 24px 90px rgba(0,0,0,.30)}.nav-more-head,.nav-more-separator{grid-column:1}.grid>article{padding:20px 8px 34px !important}.grid>article>.card-head,.scene-heading{padding:0 4px 16px !important;margin-bottom:18px !important}.grid>article>.card-head h3,.scene-heading h2{font-size:26px !important}}
'''
pos=js.rfind('</style>')
if pos<0: raise RuntimeError('style close not found')
js=js[:pos]+css+js[pos:]
dst.write_text(js,encoding='utf-8')

panel=cc/'panel.py'; txt=panel.read_text(encoding='utf-8').replace('pawbook-panel-v640.js','pawbook-panel-v650.js').replace('pawbook-panel-v640','pawbook-panel-v650'); panel.write_text(txt,encoding='utf-8')
manifest=cc/'manifest.json'; data=json.loads(manifest.read_text(encoding='utf-8')); data['version']='6.5.0'; manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

ch=root/'CHANGELOG.md'; existing=ch.read_text(encoding='utf-8'); entry='''## 6.5.0 - Navigation & Layout Polish\n\n- Removed the decorative cyan section rails.\n- Added consistent breathing room around section headings and content.\n- Rebuilt the top navigation around five primary destinations and a dedicated Gestione hub.\n- Grouped weight, vaccinations, visits, treatments, heat cycles, genealogy, statistics, documents, reports and backups under Gestione.\n- Added a clear two-column management popover on desktop and a mobile bottom sheet layout.\n- Improved active-state feedback for grouped navigation.\n- Preserved Health OS, Health Agenda, Multi-Pet, ENCI and all health records.\n\n'''; ch.write_text(entry+existing if '## 6.5.0' not in existing else existing,encoding='utf-8')
(root/'RELEASE-6.5.0.md').write_text('''# PawBook v6.5.0 – Navigation & Layout Polish\n\nPawBook 6.5.0 refines Health OS with clearer navigation and better spacing.\n\n## Navigation\n\nThe top bar now keeps only Panoramica, Smart Health, Agenda, Salute and ENCI visible. A new **Gestione** hub groups Peso, Vaccini, Visite, Terapie, Calori, Genealogia, Statistiche, Documenti, Report and Backup.\n\nOn desktop Gestione opens as a structured panel; on mobile it becomes a compact bottom sheet.\n\n## Visual polish\n\n- Removed the cyan vertical rails from section pages.\n- Added more breathing room around headings and content.\n- Improved section hierarchy without adding more card decoration.\n- Refined Smart Health rows and grouped-navigation active states.\n\n## Preserved\n\nHealth Command Center, Health Agenda, Multi-Pet Hub, ENCI Pro, genealogy, reports, documents, backups and all existing health records remain available.\n\n## Support PawBook\n\nhttps://ko-fi.com/fabvittori\n''',encoding='utf-8')
(root/'PUBBLICAZIONE_GITHUB.md').write_text('''# PawBook v6.5.0 – Pubblicazione GitHub\n\nCommit message:\nPawBook v6.5.0 - Navigation and Layout Polish\n\nTag:\nv6.5.0\n\nRelease title:\nPawBook v6.5.0 – Navigation & Layout Polish\n\nUse RELEASE-6.5.0.md as the release description.\n''',encoding='utf-8')
print('generated')
