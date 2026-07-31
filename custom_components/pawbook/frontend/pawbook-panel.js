class PawBookPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._books = [];
    this._selected = 0;
    this._loading = true;
    this._error = "";
  }

  set hass(value) {
    const first = !this._hass;
    this._hass = value;
    if (first) this.loadBooks();
  }

  set panel(value) {
    this._panel = value;
  }

  connectedCallback() {
    this.render();
  }

  async loadBooks() {
    if (!this._hass) return;
    this._loading = true;
    this.render();
    try {
      this._books = await this._hass.callWS({ type: "pawbook/get_books" });
      if (this._selected >= this._books.length) this._selected = 0;
      this._error = "";
    } catch (err) {
      this._error = String(err?.message || err);
    } finally {
      this._loading = false;
      this.render();
    }
  }

  esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  formatDate(value) {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric"
      }).format(new Date(`${value}T12:00:00`));
    } catch (_) {
      return value;
    }
  }

  latest(list, key) {
    if (!Array.isArray(list) || !list.length) return null;
    return [...list].sort((a, b) =>
      String(a[key] || "").localeCompare(String(b[key] || ""))
    ).at(-1);
  }

  nextVaccination(book) {
    const today = new Date().toISOString().slice(0, 10);
    return [...(book.vaccinations || [])]
      .filter((item) => item.expires_on && item.expires_on >= today)
      .sort((a, b) => a.expires_on.localeCompare(b.expires_on))[0] || null;
  }

  activeTreatments(book) {
    const today = new Date().toISOString().slice(0, 10);
    return (book.treatments || []).filter((item) =>
      item.starts_on && item.starts_on <= today &&
      (!item.ends_on || item.ends_on >= today)
    );
  }

  openConfig() {
    history.pushState(null, "", "/config/integrations/integration/pawbook");
    window.dispatchEvent(new Event("location-changed"));
  }

  showForm(kind) {
    const book = this._books[this._selected];
    if (!book) return;

    const forms = {
      weight: {
        title: "Registra peso",
        fields: [
          ["weight", "number", "Peso (kg)", "", "0.1"],
          ["date", "date", "Data", new Date().toISOString().slice(0, 10)],
          ["notes", "textarea", "Note", ""],
        ],
      },
      vaccination: {
        title: "Aggiungi vaccinazione",
        fields: [
          ["name", "text", "Vaccino", ""],
          ["administered_on", "date", "Somministrato il", new Date().toISOString().slice(0, 10)],
          ["expires_on", "date", "Richiamo / scadenza", ""],
          ["veterinarian", "text", "Veterinario", book.profile.veterinarian || ""],
          ["batch", "text", "Lotto", ""],
          ["notes", "textarea", "Note", ""],
        ],
      },
      visit: {
        title: "Aggiungi visita",
        fields: [
          ["date", "date", "Data", new Date().toISOString().slice(0, 10)],
          ["reason", "text", "Motivo", ""],
          ["veterinarian", "text", "Veterinario", book.profile.veterinarian || ""],
          ["outcome", "textarea", "Esito", ""],
          ["notes", "textarea", "Note", ""],
        ],
      },
      treatment: {
        title: "Aggiungi terapia",
        fields: [
          ["name", "text", "Farmaco o terapia", ""],
          ["starts_on", "date", "Inizio", new Date().toISOString().slice(0, 10)],
          ["ends_on", "date", "Fine", ""],
          ["dosage", "text", "Dosaggio", ""],
          ["frequency", "text", "Frequenza", ""],
          ["notes", "textarea", "Note", ""],
        ],
      },
      heat: {
        title: "Aggiungi ciclo di calore",
        fields: [
          ["starts_on", "date", "Inizio", new Date().toISOString().slice(0, 10)],
          ["ends_on", "date", "Fine", ""],
          ["notes", "textarea", "Note", ""],
        ],
      },
      genealogy: {
        title: "Importa genealogia",
        fields: [
          ["genealogy_json", "textarea", "JSON genealogia", JSON.stringify(book.genealogy || {}, null, 2)],
        ],
      },
    };

    const spec = forms[kind];
    const dialog = this.shadowRoot.querySelector("#dialog");
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-card">
          <div class="modal-head">
            <h2>${this.esc(spec.title)}</h2>
            <button class="icon-btn" data-close aria-label="Chiudi">✕</button>
          </div>
          <form id="entry-form">
            ${spec.fields.map(([name, type, label, value, step]) => `
              <label>
                <span>${this.esc(label)}</span>
                ${type === "textarea"
                  ? `<textarea name="${name}" rows="${name === "genealogy_json" ? 16 : 4}">${this.esc(value)}</textarea>`
                  : `<input name="${name}" type="${type}" value="${this.esc(value)}" ${step ? `step="${step}"` : ""}>`
                }
              </label>
            `).join("")}
            <div class="modal-actions">
              <button type="button" class="secondary" data-close>Annulla</button>
              <button type="submit">Salva</button>
            </div>
          </form>
        </div>
      </div>`;

    dialog.querySelectorAll("[data-close]").forEach((button) =>
      button.addEventListener("click", () => { dialog.innerHTML = ""; })
    );

    dialog.querySelector("#entry-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      const data = Object.fromEntries(new FormData(event.target).entries());
      Object.keys(data).forEach((key) => {
        if (data[key] === "") delete data[key];
      });
      data.dog_id = book.entry_id;

      const serviceMap = {
        weight: "add_weight",
        vaccination: "add_vaccination",
        visit: "add_visit",
        treatment: "add_treatment",
        heat: "add_heat_cycle",
        genealogy: "import_genealogy",
      };

      try {
        if (data.weight) data.weight = Number(data.weight);
        await this._hass.callService("pawbook", serviceMap[kind], data);
        dialog.innerHTML = "";
        await this.loadBooks();
      } catch (err) {
        alert(`Errore: ${err?.message || err}`);
        button.disabled = false;
      }
    });
  }

  renderGenealogyNode(node, label = "") {
    if (!node || typeof node !== "object" || !node.name) return "";
    return `
      <div class="tree-node">
        ${label ? `<small>${this.esc(label)}</small>` : ""}
        <strong>${this.esc(node.name)}</strong>
        ${node.roi ? `<span>${this.esc(node.roi)}</span>` : ""}
        ${(node.father || node.mother) ? `
          <div class="tree-children">
            ${this.renderGenealogyNode(node.father, "Padre")}
            ${this.renderGenealogyNode(node.mother, "Madre")}
          </div>` : ""}
      </div>`;
  }

  render() {
    if (!this.shadowRoot) return;

    const styles = `
      :host {
        display: block;
        min-height: 100vh;
        color: var(--primary-text-color);
        background: var(--primary-background-color);
        font-family: var(--paper-font-body1_-_font-family, sans-serif);
      }
      * { box-sizing: border-box; }
      .page { max-width: 1320px; margin: 0 auto; padding: 24px; }
      .topbar {
        display: flex; justify-content: space-between; align-items: center;
        gap: 16px; margin-bottom: 22px;
      }
      .brand { display: flex; align-items: center; gap: 14px; }
      .brand img { width: 54px; height: 54px; border-radius: 16px; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { margin-bottom: 3px; font-size: 30px; }
      .muted { color: var(--secondary-text-color); }
      button, .button {
        border: none; border-radius: 12px; padding: 11px 16px;
        background: var(--primary-color); color: var(--text-primary-color, white);
        font: inherit; font-weight: 600; cursor: pointer;
      }
      button.secondary, .button.secondary {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }
      button:disabled { opacity: .55; cursor: wait; }
      .pet-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
      .pet-tab {
        background: var(--card-background-color); color: var(--primary-text-color);
        border: 1px solid var(--divider-color); padding: 10px 14px;
      }
      .pet-tab.active { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color); }
      .hero {
        display: grid; grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px; padding: 24px; border-radius: 22px;
        background: var(--card-background-color);
        box-shadow: var(--ha-card-box-shadow, 0 2px 12px rgba(0,0,0,.08));
        margin-bottom: 20px;
      }
      .profile { display: flex; gap: 20px; align-items: center; }
      .pet-photo {
        width: 112px; height: 112px; border-radius: 24px;
        object-fit: cover; background: var(--secondary-background-color);
      }
      .placeholder {
        display: grid; place-items: center; font-size: 48px;
      }
      .identity h2 { font-size: 28px; margin-bottom: 5px; }
      .identity-grid { display: flex; flex-wrap: wrap; gap: 8px 16px; color: var(--secondary-text-color); }
      .actions { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .stats {
        display: grid; grid-template-columns: repeat(4, minmax(0,1fr));
        gap: 14px; margin-bottom: 20px;
      }
      .stat, .card {
        padding: 18px; border-radius: 18px; background: var(--card-background-color);
        box-shadow: var(--ha-card-box-shadow, 0 2px 12px rgba(0,0,0,.06));
      }
      .stat span { display:block; color:var(--secondary-text-color); font-size:13px; margin-bottom:7px; }
      .stat strong { font-size: 21px; }
      .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
      .card-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:14px; }
      .card-head h3 { margin:0; }
      .small-btn { padding:8px 11px; font-size:13px; }
      .record { padding:11px 0; border-top:1px solid var(--divider-color); }
      .record:first-of-type { border-top:none; }
      .record strong { display:block; margin-bottom:4px; }
      .record small { color:var(--secondary-text-color); }
      .empty { padding:18px 0; text-align:center; color:var(--secondary-text-color); }
      .wide { grid-column:1/-1; }
      .tree { overflow:auto; padding:10px 0; }
      .tree-node {
        min-width:160px; padding:12px; border:1px solid var(--divider-color);
        border-radius:14px; background:var(--secondary-background-color);
      }
      .tree-node small,.tree-node span { display:block; color:var(--secondary-text-color); font-size:12px; }
      .tree-children { display:grid; grid-template-columns:repeat(2,minmax(160px,1fr)); gap:12px; margin-top:12px; }
      .modal {
        position:fixed; inset:0; z-index:1000; display:grid; place-items:center;
        padding:20px; background:rgba(0,0,0,.58);
      }
      .modal-card {
        width:min(650px,100%); max-height:90vh; overflow:auto;
        padding:22px; border-radius:20px; background:var(--card-background-color);
      }
      .modal-head { display:flex; justify-content:space-between; align-items:center; gap:12px; }
      .modal-head h2 { margin:0; }
      .icon-btn { padding:8px 11px; background:transparent; color:var(--primary-text-color); }
      form { display:grid; gap:14px; margin-top:20px; }
      label span { display:block; margin-bottom:6px; font-weight:600; }
      input, textarea {
        width:100%; border:1px solid var(--divider-color); border-radius:11px;
        padding:11px 12px; background:var(--primary-background-color);
        color:var(--primary-text-color); font:inherit;
      }
      textarea { resize:vertical; }
      .modal-actions { display:flex; justify-content:flex-end; gap:10px; }
      .error { padding:15px; border-radius:12px; background:var(--error-color); color:white; }
      @media(max-width:900px) {
        .stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .grid { grid-template-columns:1fr; }
        .wide { grid-column:auto; }
        .hero { grid-template-columns:1fr; }
        .actions { justify-content:flex-start; }
      }
      @media(max-width:600px) {
        .page { padding:14px; }
        .profile { align-items:flex-start; }
        .pet-photo { width:82px; height:82px; border-radius:18px; }
        .stats { grid-template-columns:1fr 1fr; }
        .topbar { align-items:flex-start; }
        .tree-children { grid-template-columns:1fr; }
      }
    `;

    if (this._loading) {
      this.shadowRoot.innerHTML = `<style>${styles}</style><div class="page"><p>Caricamento PawBook…</p></div>`;
      return;
    }

    if (this._error) {
      this.shadowRoot.innerHTML = `<style>${styles}</style><div class="page"><div class="error">${this.esc(this._error)}</div></div>`;
      return;
    }

    if (!this._books.length) {
      this.shadowRoot.innerHTML = `
        <style>${styles}</style>
        <div class="page">
          <div class="topbar"><div class="brand"><h1>🐾 PawBook</h1></div></div>
          <div class="card">
            <h2>Nessun animale configurato</h2>
            <p class="muted">Aggiungi PawBook da Impostazioni → Dispositivi e servizi.</p>
            <button id="open-config">Apri integrazioni</button>
          </div>
        </div>`;
      this.shadowRoot.querySelector("#open-config")?.addEventListener("click", () => this.openConfig());
      return;
    }

    const book = this._books[this._selected];
    const p = book.profile || {};
    const lastWeight = this.latest(book.weights, "date");
    const lastVisit = this.latest(book.visits, "date");
    const lastHeat = this.latest(book.heat_cycles, "starts_on");
    const nextVax = this.nextVaccination(book);
    const treatments = this.activeTreatments(book);
    const photo = p.photo_url
      ? `<img class="pet-photo" src="${this.esc(p.photo_url)}" alt="${this.esc(p.dog_name)}">`
      : `<div class="pet-photo placeholder">🐾</div>`;

    const records = (items, renderer, empty = "Nessun dato registrato") =>
      items?.length
        ? [...items].reverse().slice(0, 5).map(renderer).join("")
        : `<div class="empty">${empty}</div>`;

    this.shadowRoot.innerHTML = `
      <style>${styles}</style>
      <div class="page">
        <div class="topbar">
          <div class="brand">
            <img src="/api/brands/integration/pawbook/icon.png" alt="">
            <div><h1>PawBook</h1><div class="muted">Libretto sanitario digitale</div></div>
          </div>
          <button class="secondary" id="refresh">↻ Aggiorna</button>
        </div>

        ${this._books.length > 1 ? `
          <div class="pet-tabs">
            ${this._books.map((item, index) => `
              <button class="pet-tab ${index === this._selected ? "active" : ""}" data-pet="${index}">
                🐾 ${this.esc(item.profile?.dog_name || item.title)}
              </button>`).join("")}
          </div>` : ""}

        <section class="hero">
          <div class="profile">
            ${photo}
            <div class="identity">
              <h2>${this.esc(p.dog_name || book.title)}</h2>
              <div class="identity-grid">
                <span>${this.esc(p.breed || "Razza non inserita")}</span>
                ${p.birth_date ? `<span>🎂 ${this.formatDate(p.birth_date)}</span>` : ""}
                ${p.microchip ? `<span>🪪 ${this.esc(p.microchip)}</span>` : ""}
                ${p.enci_registry ? `<span>🏆 ${this.esc(p.enci_registry)}</span>` : ""}
              </div>
            </div>
          </div>
          <div class="actions">
            <button data-form="weight">+ Peso</button>
            <button data-form="vaccination">+ Vaccino</button>
            <button data-form="visit">+ Visita</button>
            <button class="secondary" id="profile-config">Modifica profilo</button>
          </div>
        </section>

        <section class="stats">
          <div class="stat"><span>Peso attuale</span><strong>${lastWeight ? `${this.esc(lastWeight.weight)} kg` : "—"}</strong></div>
          <div class="stat"><span>Prossimo vaccino</span><strong>${nextVax ? this.formatDate(nextVax.expires_on) : "—"}</strong></div>
          <div class="stat"><span>Ultima visita</span><strong>${lastVisit ? this.formatDate(lastVisit.date) : "—"}</strong></div>
          <div class="stat"><span>Terapie attive</span><strong>${treatments.length}</strong></div>
        </section>

        <section class="grid">
          <article class="card">
            <div class="card-head"><h3>⚖️ Peso</h3><button class="small-btn" data-form="weight">Aggiungi</button></div>
            ${records(book.weights, (item) => `
              <div class="record"><strong>${this.esc(item.weight)} kg</strong>
              <small>${this.formatDate(item.date)}${item.notes ? ` · ${this.esc(item.notes)}` : ""}</small></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>💉 Vaccinazioni</h3><button class="small-btn" data-form="vaccination">Aggiungi</button></div>
            ${records(book.vaccinations, (item) => `
              <div class="record"><strong>${this.esc(item.name)}</strong>
              <small>${this.formatDate(item.administered_on)}
              ${item.expires_on ? ` · richiamo ${this.formatDate(item.expires_on)}` : ""}</small></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>🩺 Visite</h3><button class="small-btn" data-form="visit">Aggiungi</button></div>
            ${records(book.visits, (item) => `
              <div class="record"><strong>${this.esc(item.reason)}</strong>
              <small>${this.formatDate(item.date)}${item.veterinarian ? ` · ${this.esc(item.veterinarian)}` : ""}</small></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>💊 Terapie</h3><button class="small-btn" data-form="treatment">Aggiungi</button></div>
            ${records(book.treatments, (item) => `
              <div class="record"><strong>${this.esc(item.name)}</strong>
              <small>Dal ${this.formatDate(item.starts_on)}
              ${item.ends_on ? ` al ${this.formatDate(item.ends_on)}` : " · in corso"}
              ${item.dosage ? ` · ${this.esc(item.dosage)}` : ""}</small></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>🔥 Calori</h3><button class="small-btn" data-form="heat">Aggiungi</button></div>
            ${records(book.heat_cycles, (item) => `
              <div class="record"><strong>${this.formatDate(item.starts_on)}</strong>
              <small>${item.ends_on ? `Fine: ${this.formatDate(item.ends_on)}` : "In corso"}
              ${item.notes ? ` · ${this.esc(item.notes)}` : ""}</small></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>🏆 ENCI</h3><button class="small-btn secondary" id="open-enci">Apri ENCI</button></div>
            <div class="record"><strong>Nome registrato</strong><small>${this.esc(p.enci_name || "—")}</small></div>
            <div class="record"><strong>ROI/RSR</strong><small>${this.esc(p.enci_registry || "—")}</small></div>
            <div class="record"><strong>Pedigree</strong><small>${this.esc(p.pedigree_number || "—")}</small></div>
            <div class="record"><strong>Allevatore</strong><small>${this.esc(p.breeder || "—")}</small></div>
          </article>

          <article class="card wide">
            <div class="card-head"><h3>🌳 Albero genealogico</h3><button class="small-btn" data-form="genealogy">Importa / modifica</button></div>
            <div class="tree">
              ${book.genealogy && Object.keys(book.genealogy).length
                ? this.renderGenealogyNode(book.genealogy)
                : `<div class="empty">Genealogia non importata</div>`}
            </div>
          </article>
        </section>
      </div>
      <div id="dialog"></div>
    `;

    this.shadowRoot.querySelector("#refresh")?.addEventListener("click", () => this.loadBooks());
    this.shadowRoot.querySelector("#profile-config")?.addEventListener("click", () => this.openConfig());
    this.shadowRoot.querySelector("#open-enci")?.addEventListener("click", () => {
      window.open(p.enci_url || "https://www.enci.it/libro-genealogico/libro-genealogico-on-line", "_blank", "noopener");
    });
    this.shadowRoot.querySelectorAll("[data-form]").forEach((button) =>
      button.addEventListener("click", () => this.showForm(button.dataset.form))
    );
    this.shadowRoot.querySelectorAll("[data-pet]").forEach((button) =>
      button.addEventListener("click", () => {
        this._selected = Number(button.dataset.pet);
        this.render();
      })
    );
  }
}

if (!customElements.get("pawbook-panel")) {
  customElements.define("pawbook-panel", PawBookPanel);
}
