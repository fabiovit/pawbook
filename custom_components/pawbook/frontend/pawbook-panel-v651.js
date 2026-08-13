(function () {
  "use strict";

  const BASE_PANEL_URL = "/pawbook_static/pawbook-panel-v640.js";

  function loadBasePanel() {
    if (customElements.get("pawbook-panel-v640")) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-pawbook-base="v640"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = BASE_PANEL_URL;
      script.async = false;
      script.dataset.pawbookBase = "v640";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("PawBook 6.5.1: impossibile caricare il pannello base v640")), { once: true });
      document.head.appendChild(script);
    });
  }

  function registerPawBook651() {
    if (customElements.get("pawbook-panel-v651")) return;

    const PawBookPanelV640 = customElements.get("pawbook-panel-v640");
    if (!PawBookPanelV640) {
      throw new Error("PawBook 6.5.1: pannello base v640 non disponibile");
    }

    class PawBookPanelV651 extends PawBookPanelV640 {
      applyActiveView() {
        super.applyActiveView();
        const active = this._activeSection || "overview";
        const managementTargets = new Set([
          "health-section",
          "vaccines-section",
          "visits-section",
          "treatments-section",
          "heat-section",
          "genealogy-section",
          "statistics-section",
          "documents-section",
          "report-section",
          "backup-section",
        ]);
        this.shadowRoot?.querySelector(".nav-more")?.classList.toggle(
          "contains-active",
          managementTargets.has(active),
        );
      }

      render() {
        super.render();
        this._applyNavigation651();
        this._applyVisualPolish651();
        this.applyActiveView();
      }

      _applyNavigation651() {
        const root = this.shadowRoot;
        const nav = root?.querySelector(".dashboard-nav");
        if (!nav) return;

        nav.classList.add("primary-nav");
        nav.innerHTML = `
          <button data-nav-target="overview"><ha-icon icon="mdi:paw"></ha-icon><span>Panoramica</span></button>
          <button data-nav-target="smart-section"><ha-icon icon="mdi:heart-pulse"></ha-icon><span>Smart Health</span></button>
          <button data-nav-target="calendar-section"><ha-icon icon="mdi:calendar-heart"></ha-icon><span>Agenda</span></button>
          <button data-nav-target="timeline-section"><ha-icon icon="mdi:timeline-clock-outline"></ha-icon><span>Salute</span></button>
          <button data-nav-target="enci-section"><ha-icon icon="mdi:medal-outline"></ha-icon><span>ENCI</span></button>
          <details class="nav-more">
            <summary>
              <ha-icon icon="mdi:view-grid-plus-outline"></ha-icon>
              <span>Gestione</span>
              <ha-icon class="nav-chevron" icon="mdi:chevron-down"></ha-icon>
            </summary>
            <div class="nav-more-menu">
              <div class="nav-more-head">
                <span>GESTIONE SANITARIA</span>
                <small>Registri e strumenti PawBook</small>
              </div>
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
          </details>`;

        nav.querySelectorAll("[data-nav-target]").forEach((button) => {
          button.addEventListener("click", () => {
            this._activeSection = button.dataset.navTarget || "overview";
            const parentMenu = button.closest("details.nav-more");
            if (parentMenu) parentMenu.open = false;
            this.applyActiveView();
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
        });
      }

      _applyVisualPolish651() {
        const root = this.shadowRoot;
        if (!root || root.querySelector("style[data-pawbook-651]")) return;

        const style = document.createElement("style");
        style.dataset.pawbook651 = "true";
        style.textContent = `
          .page {
            max-width: 1440px !important;
            margin: 0 auto !important;
            padding: 18px 24px 54px !important;
          }
          .topbar.inverter-shell { margin-bottom: 28px !important; }

          .card.v2-section::before,
          .heat-center::before,
          .health-calendar-card::before,
          .health-timeline-card::before,
          .reminders-center::before,
          .grid > article::before,
          #smart-section::before,
          #health-section::before,
          #vaccines-section::before,
          #visits-section::before,
          #treatments-section::before,
          #heat-section::before,
          #timeline-section::before,
          #statistics-section::before,
          #documents-section::before,
          #report-section::before,
          #backup-section::before {
            display: none !important;
            content: none !important;
          }

          .grid > article {
            max-width: 1320px !important;
            margin: 0 auto !important;
            padding: 26px 30px 40px !important;
          }
          .grid > article > .card-head,
          .scene-heading {
            padding: 0 0 20px !important;
            margin: 0 0 24px !important;
            border-bottom: 1px solid color-mix(in srgb, var(--divider-color) 82%, transparent) !important;
          }
          .grid > article > .card-head h3,
          .scene-heading h2 {
            font-size: 30px !important;
            line-height: 1.08 !important;
            margin: 6px 0 !important;
          }
          .grid > article > .card-head .muted,
          .scene-heading p {
            margin-top: 6px !important;
            line-height: 1.45 !important;
          }

          .dashboard-nav.tabs.primary-nav {
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            overflow: visible !important;
            padding: 3px 0 7px !important;
            border-bottom: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent) !important;
          }
          .dashboard-nav.tabs.primary-nav > button,
          .nav-more > summary {
            min-height: 42px !important;
            display: inline-flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 7px !important;
            padding: 0 13px !important;
            border-radius: 12px !important;
            color: var(--secondary-text-color) !important;
            font-size: 12px !important;
            font-weight: 750 !important;
            cursor: pointer;
            border: 1px solid transparent !important;
            background: transparent !important;
            white-space: nowrap;
            list-style: none;
          }
          .nav-more > summary::-webkit-details-marker { display: none; }
          .dashboard-nav.tabs.primary-nav > button:hover,
          .nav-more > summary:hover {
            color: var(--primary-text-color) !important;
            background: var(--secondary-background-color) !important;
          }
          .dashboard-nav.tabs.primary-nav > button.active,
          .nav-more.contains-active > summary,
          .nav-more[open] > summary {
            color: var(--primary-color) !important;
            background: color-mix(in srgb, var(--primary-color) 10%, transparent) !important;
            border-color: color-mix(in srgb, var(--primary-color) 16%, transparent) !important;
          }
          .dashboard-nav.tabs.primary-nav ha-icon { --mdc-icon-size: 18px !important; }

          .nav-more {
            position: relative;
            margin-left: auto;
            flex: 0 0 auto;
          }
          .nav-chevron {
            --mdc-icon-size: 15px !important;
            transition: transform .18s ease;
          }
          .nav-more[open] .nav-chevron { transform: rotate(180deg); }
          .nav-more-menu {
            position: absolute;
            z-index: 70;
            right: 0;
            top: calc(100% + 9px);
            width: min(390px, calc(100vw - 32px));
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            padding: 10px;
            border: 1px solid color-mix(in srgb, var(--divider-color) 82%, transparent);
            border-radius: 18px;
            background: var(--card-background-color);
            box-shadow: 0 22px 70px rgba(0,0,0,.18);
          }
          .nav-more-head {
            grid-column: 1 / -1;
            padding: 9px 10px 12px;
            border-bottom: 1px solid var(--divider-color);
            margin-bottom: 3px;
          }
          .nav-more-head span,
          .nav-more-head small { display: block; }
          .nav-more-head span {
            font-size: 9px;
            font-weight: 900;
            letter-spacing: .15em;
            color: var(--primary-color);
          }
          .nav-more-head small {
            font-size: 10px;
            color: var(--secondary-text-color);
            margin-top: 3px;
          }
          .nav-more-menu > button {
            min-height: 58px !important;
            display: grid !important;
            grid-template-columns: 30px 1fr !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 9px 10px !important;
            text-align: left !important;
            border: 0 !important;
            border-radius: 12px !important;
            background: transparent !important;
            color: var(--primary-text-color) !important;
          }
          .nav-more-menu > button:hover,
          .nav-more-menu > button.active {
            background: var(--secondary-background-color) !important;
          }
          .nav-more-menu > button.active { color: var(--primary-color) !important; }
          .nav-more-menu > button > span strong,
          .nav-more-menu > button > span small { display: block; }
          .nav-more-menu > button > span strong { font-size: 11px; }
          .nav-more-menu > button > span small {
            font-size: 9px;
            color: var(--secondary-text-color);
            margin-top: 2px;
            font-weight: 500;
          }
          .nav-more-menu ha-icon {
            --mdc-icon-size: 19px !important;
            color: var(--primary-color);
          }
          .nav-more-separator {
            grid-column: 1 / -1;
            border-top: 1px solid var(--divider-color);
            margin: 4px 2px;
          }

          #smart-section .smart-list {
            display: grid !important;
            gap: 10px !important;
          }
          #smart-section .smart-item {
            border-left: 0 !important;
            border-radius: 14px !important;
            padding: 15px 18px !important;
            background: color-mix(in srgb, var(--secondary-background-color) 88%, transparent) !important;
          }
          #smart-section .smart-item.ok { box-shadow: inset 3px 0 #48d58b !important; }
          #smart-section .smart-item.warn { box-shadow: inset 3px 0 #ffb74d !important; }
          #smart-section .smart-item.danger { box-shadow: inset 3px 0 #ff6b6b !important; }
          #smart-section .smart-item.info { box-shadow: inset 3px 0 var(--primary-color) !important; }

          @media (max-width: 760px) {
            .page { padding: 10px 12px 42px !important; }
            .topbar.inverter-shell { margin-bottom: 18px !important; }
            .dashboard-nav.tabs.primary-nav {
              overflow-x: auto !important;
              overflow-y: visible !important;
              gap: 4px !important;
              padding-bottom: 7px !important;
              scrollbar-width: none;
            }
            .dashboard-nav.tabs.primary-nav::-webkit-scrollbar { display: none; }
            .dashboard-nav.tabs.primary-nav > button,
            .nav-more > summary {
              min-height: 40px !important;
              padding: 0 11px !important;
              font-size: 11px !important;
            }
            .nav-more { margin-left: 0; }
            .nav-more-menu {
              position: fixed;
              left: 12px;
              right: 12px;
              top: auto;
              bottom: 16px;
              width: auto;
              max-height: min(68vh, 560px);
              overflow: auto;
              grid-template-columns: 1fr;
              border-radius: 22px;
              padding: 12px;
              box-shadow: 0 24px 90px rgba(0,0,0,.30);
            }
            .nav-more-head,
            .nav-more-separator { grid-column: 1; }
            .grid > article { padding: 20px 8px 34px !important; }
            .grid > article > .card-head,
            .scene-heading {
              padding: 0 4px 16px !important;
              margin-bottom: 18px !important;
            }
            .grid > article > .card-head h3,
            .scene-heading h2 { font-size: 26px !important; }
          }
        `;
        root.appendChild(style);
      }
    }

    customElements.define("pawbook-panel-v651", PawBookPanelV651);
  }

  loadBasePanel()
    .then(registerPawBook651)
    .catch((error) => console.error("PawBook 6.5.1 frontend load error", error));
})();
