(function () {
  "use strict";

  const BASE = "/pawbook_static/pawbook-panel-v640.js";

  function loadBase() {
    if (customElements.get("pawbook-panel-v640")) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = BASE;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error("PawBook: impossibile caricare il frontend base"));
      document.head.appendChild(script);
    });
  }

  function register() {
    if (customElements.get("pawbook-panel-v650")) return;
    const Base = customElements.get("pawbook-panel-v640");
    if (!Base) throw new Error("PawBook: frontend base non disponibile");

    class PawBookPanelV650 extends Base {
      applyActiveView() {
        super.applyActiveView();
        const active = this._activeSection || "overview";
        const grouped = new Set([
          "health-section", "vaccines-section", "visits-section",
          "treatments-section", "heat-section", "genealogy-section",
          "statistics-section", "documents-section", "report-section",
          "backup-section"
        ]);
        this.shadowRoot?.querySelector(".nav-more")?.classList.toggle("contains-active", grouped.has(active));
      }

      render() {
        super.render();
        this._applyNavigation650();
        this._applyPolish650();
        this.applyActiveView();
      }

      _applyNavigation650() {
        const nav = this.shadowRoot?.querySelector(".dashboard-nav");
        if (!nav) return;
        nav.classList.add("primary-nav");
        nav.innerHTML = `
          <button data-nav-target="overview"><ha-icon icon="mdi:paw"></ha-icon><span>Panoramica</span></button>
          <button data-nav-target="smart-section"><ha-icon icon="mdi:heart-pulse"></ha-icon><span>Smart Health</span></button>
          <button data-nav-target="calendar-section"><ha-icon icon="mdi:calendar-heart"></ha-icon><span>Agenda</span></button>
          <button data-nav-target="timeline-section"><ha-icon icon="mdi:timeline-clock-outline"></ha-icon><span>Salute</span></button>
          <button data-nav-target="enci-section"><ha-icon icon="mdi:medal-outline"></ha-icon><span>ENCI</span></button>
          <details class="nav-more">
            <summary><ha-icon icon="mdi:view-grid-plus-outline"></ha-icon><span>Gestione</span><ha-icon icon="mdi:chevron-down"></ha-icon></summary>
            <div class="nav-more-menu">
              <button data-nav-target="health-section"><ha-icon icon="mdi:scale-bathroom"></ha-icon><span>Peso</span></button>
              <button data-nav-target="vaccines-section"><ha-icon icon="mdi:needle"></ha-icon><span>Vaccini</span></button>
              <button data-nav-target="visits-section"><ha-icon icon="mdi:stethoscope"></ha-icon><span>Visite</span></button>
              <button data-nav-target="treatments-section"><ha-icon icon="mdi:pill"></ha-icon><span>Terapie</span></button>
              <button data-nav-target="heat-section"><ha-icon icon="mdi:flower-pollen"></ha-icon><span>Calori</span></button>
              <button data-nav-target="genealogy-section"><ha-icon icon="mdi:family-tree"></ha-icon><span>Genealogia</span></button>
              <button data-nav-target="statistics-section"><ha-icon icon="mdi:chart-box-outline"></ha-icon><span>Statistiche</span></button>
              <button data-nav-target="documents-section"><ha-icon icon="mdi:paperclip"></ha-icon><span>Documenti</span></button>
              <button data-nav-target="report-section"><ha-icon icon="mdi:file-document-outline"></ha-icon><span>Report</span></button>
              <button data-nav-target="backup-section"><ha-icon icon="mdi:backup-restore"></ha-icon><span>Backup</span></button>
            </div>
          </details>`;
        nav.querySelectorAll("[data-nav-target]").forEach((button) => {
          button.addEventListener("click", () => {
            this._activeSection = button.dataset.navTarget || "overview";
            const details = button.closest("details");
            if (details) details.open = false;
            this.applyActiveView();
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
        });
      }

      _applyPolish650() {
        const root = this.shadowRoot;
        if (!root || root.querySelector("style[data-pawbook-hotfix]")) return;
        const style = document.createElement("style");
        style.dataset.pawbookHotfix = "true";
        style.textContent = `
          .page{max-width:1440px!important;margin:0 auto!important;padding:18px 24px 54px!important}
          .topbar.inverter-shell{margin-bottom:28px!important}
          .card.v2-section::before,.heat-center::before,.health-calendar-card::before,.health-timeline-card::before,.reminders-center::before,.grid>article::before{display:none!important;content:none!important}
          .grid>article{max-width:1320px!important;margin:0 auto!important;padding:26px 30px 40px!important}
          .grid>article>.card-head,.scene-heading{padding:0 0 20px!important;margin:0 0 24px!important;border-bottom:1px solid var(--divider-color)!important}
          .grid>article>.card-head h3,.scene-heading h2{font-size:30px!important;line-height:1.08!important;margin:6px 0!important}
          .primary-nav{position:relative!important;display:flex!important;align-items:center!important;gap:6px!important;overflow:visible!important;padding:3px 0 7px!important;border-bottom:1px solid var(--divider-color)!important}
          .primary-nav>button,.nav-more>summary{min-height:42px!important;display:inline-flex!important;align-items:center!important;gap:7px!important;padding:0 13px!important;border-radius:12px!important;border:1px solid transparent!important;background:transparent!important;color:var(--secondary-text-color)!important;font-size:12px!important;font-weight:750!important;cursor:pointer;white-space:nowrap;list-style:none}
          .primary-nav>button.active,.nav-more.contains-active>summary,.nav-more[open]>summary{color:var(--primary-color)!important;background:color-mix(in srgb,var(--primary-color) 10%,transparent)!important;border-color:color-mix(in srgb,var(--primary-color) 18%,transparent)!important}
          .nav-more{position:relative;margin-left:auto}.nav-more>summary::-webkit-details-marker{display:none}
          .nav-more-menu{position:absolute;z-index:70;right:0;top:calc(100% + 9px);width:340px;display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:10px;border:1px solid var(--divider-color);border-radius:18px;background:var(--card-background-color);box-shadow:0 22px 70px rgba(0,0,0,.18)}
          .nav-more-menu>button{min-height:46px!important;display:flex!important;align-items:center!important;gap:8px!important;padding:9px 10px!important;border:0!important;border-radius:11px!important;background:transparent!important;color:var(--primary-text-color)!important;text-align:left!important}
          .nav-more-menu>button:hover,.nav-more-menu>button.active{background:var(--secondary-background-color)!important;color:var(--primary-color)!important}
          #smart-section .smart-list{display:grid!important;gap:10px!important}
          #smart-section .smart-item{border-left:0!important;border-radius:14px!important;padding:15px 18px!important;background:var(--secondary-background-color)!important}
          @media(max-width:760px){.page{padding:10px 12px 42px!important}.topbar.inverter-shell{margin-bottom:18px!important}.primary-nav{overflow-x:auto!important;gap:4px!important;scrollbar-width:none}.primary-nav::-webkit-scrollbar{display:none}.primary-nav>button,.nav-more>summary{min-height:40px!important;padding:0 11px!important;font-size:11px!important}.nav-more{margin-left:0}.nav-more-menu{position:fixed;left:12px;right:12px;top:auto;bottom:16px;width:auto;max-height:68vh;overflow:auto;grid-template-columns:1fr;border-radius:22px;padding:12px}.grid>article{padding:20px 8px 34px!important}.grid>article>.card-head,.scene-heading{padding:0 4px 16px!important;margin-bottom:18px!important}.grid>article>.card-head h3,.scene-heading h2{font-size:26px!important}}
        `;
        root.appendChild(style);
      }
    }

    customElements.define("pawbook-panel-v650", PawBookPanelV650);
  }

  loadBase().then(register).catch((error) => console.error("PawBook 6.5.1 frontend error", error));
})();
