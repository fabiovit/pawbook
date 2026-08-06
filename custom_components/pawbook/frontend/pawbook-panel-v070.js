class PawBookPanelV070 extends HTMLElement {
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

  showEnciSearch() {
    const book = this._books[this._selected];
    if (!book) return;
    const dialog = this.shadowRoot.querySelector("#dialog");
    dialog.innerHTML = `
      <div class="modal"><div class="modal-card genealogy-modal">
        <div class="modal-head"><div><h2>Importa da ENCI</h2><p class="muted">Cerca per ROI/LOI, nome oppure microchip.</p></div><button class="icon-btn" data-close>✕</button></div>
        <form id="enci-search-form">
          <div class="grid">
            <label><span>ROI / LOI / RSR</span><input name="registry" value="${this.esc(book.profile.enci_registry || book.profile.roi || "")}"></label>
            <label><span>Nome registrato</span><input name="name" value="${this.esc(book.profile.enci_name || "")}"></label>
            <label><span>Microchip</span><input name="microchip" value="${this.esc(book.profile.microchip || "")}"></label>
          </div>
          <div class="modal-actions"><button type="button" class="secondary" data-close>Annulla</button><button type="submit">Cerca su ENCI</button></div>
        </form>
        <div id="enci-results"></div>
      </div></div>`;
    dialog.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => dialog.innerHTML = ""));
    dialog.querySelector("#enci-search-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const out = dialog.querySelector("#enci-results");
      out.innerHTML = `<div class="empty">Ricerca in corso…</div>`;
      try {
        const rows = await this._hass.callWS({ type: "pawbook/enci_search", registry: fd.get("registry") || "", name: fd.get("name") || "", microchip: fd.get("microchip") || "" });
        if (!rows.length) { out.innerHTML = `<div class="empty">Nessun soggetto trovato</div>`; return; }
        out.innerHTML = `<div class="records">${rows.map((row, i) => `<div class="record"><strong>${this.esc(row.name || "Senza nome")}</strong><small>${this.esc(row.registry || "—")} · ${this.esc(row.breed || "Razza non indicata")} ${row.birth_date ? `· ${this.esc(row.birth_date)}` : ""}</small><button class="small-btn" data-enci-index="${i}">Importa</button></div>`).join("")}</div>`;
        out.querySelectorAll("[data-enci-index]").forEach(button => button.addEventListener("click", async () => {
          const row = rows[Number(button.dataset.enciIndex)];
          button.disabled = true; button.textContent = "Importazione…";
          try {
            await this._hass.callWS({ type: "pawbook/enci_import", entry_id: book.entry_id, enci_dog_id: row.id || "", registry: row.registry || "", microchip: row.microchip || "", search_row: row });
            await this.loadBooks(); dialog.innerHTML = "";
          } catch (err) { button.disabled = false; button.textContent = "Importa"; alert(`Errore ENCI: ${err?.message || err}`); }
        }));
      } catch (err) { out.innerHTML = `<div class="empty">Errore: ${this.esc(err?.message || err)}</div>`; }
    });
  }

  showForm(kind, record = null, category = null) {
    const book = this._books[this._selected];
    if (!book) return;
    const editMode = Boolean(record && category);

    const forms = {
      weight: {
        title: "Registra peso",
        fields: [
          ["weight", "number", "Peso (kg)", record?.weight ?? "", "0.1"],
          ["date", "date", "Data", record?.date || new Date().toISOString().slice(0, 10)],
          ["notes", "textarea", "Note", record?.notes || ""],
        ],
      },
      vaccination: {
        title: "Aggiungi vaccinazione",
        fields: [
          ["name", "text", "Vaccino", record?.name || ""],
          ["administered_on", "date", "Somministrato il", record?.administered_on || new Date().toISOString().slice(0, 10)],
          ["expires_on", "date", "Richiamo / scadenza", record?.expires_on || ""],
          ["veterinarian", "text", "Veterinario", record?.veterinarian || book.profile.veterinarian || ""],
          ["batch", "text", "Lotto", record?.batch || ""],
          ["notes", "textarea", "Note", record?.notes || ""],
        ],
      },
      visit: {
        title: "Aggiungi visita",
        fields: [
          ["date", "date", "Data", record?.date || new Date().toISOString().slice(0, 10)],
          ["reason", "text", "Motivo", record?.reason || ""],
          ["veterinarian", "text", "Veterinario", record?.veterinarian || book.profile.veterinarian || ""],
          ["outcome", "textarea", "Esito", record?.outcome || ""],
          ["notes", "textarea", "Note", record?.notes || ""],
        ],
      },
      treatment: {
        title: "Aggiungi terapia",
        fields: [
          ["name", "text", "Farmaco o terapia", record?.name || ""],
          ["starts_on", "date", "Inizio", record?.starts_on || new Date().toISOString().slice(0, 10)],
          ["ends_on", "date", "Fine", record?.ends_on || ""],
          ["dosage", "text", "Dosaggio", record?.dosage || ""],
          ["frequency", "text", "Frequenza", record?.frequency || ""],
          ["notes", "textarea", "Note", record?.notes || ""],
        ],
      },
      heat: {
        title: "Aggiungi ciclo di calore",
        fields: [
          ["starts_on", "date", "Inizio", record?.starts_on || new Date().toISOString().slice(0, 10)],
          ["ends_on", "date", "Fine", record?.ends_on || ""],
          ["notes", "textarea", "Note", record?.notes || ""],
        ],
      },
    };

    const spec = forms[kind];
    const dialog = this.shadowRoot.querySelector("#dialog");
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-card">
          <div class="modal-head">
            <h2>${this.esc(editMode ? `Modifica ${spec.title.replace("Aggiungi ", "").replace("Registra ", "")}` : spec.title)}</h2>
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
              ${editMode ? `<button type="button" class="danger" id="delete-record">Elimina</button>` : ""}
              <button type="button" class="secondary" data-close>Annulla</button>
              <button type="submit">Salva</button>
            </div>
          </form>
        </div>
      </div>`;

    dialog.querySelectorAll("[data-close]").forEach((button) =>
      button.addEventListener("click", () => { dialog.innerHTML = ""; })
    );

    dialog.querySelector("#delete-record")?.addEventListener("click", async () => {
      const confirmed = confirm("Eliminare definitivamente questa registrazione?");
      if (!confirmed) return;

      try {
        await this._hass.callService("pawbook", "delete_record", {
          dog_id: book.entry_id,
          category,
          record_id: record.id,
        });
        dialog.innerHTML = "";
        await this.loadBooks();
      } catch (err) {
        alert(`Errore: ${err?.message || err}`);
      }
    });

    dialog.querySelector("#entry-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      const data = Object.fromEntries(new FormData(event.target).entries());
      Object.keys(data).forEach((key) => {
        if (data[key] === "") delete data[key];
      });
      data.dog_id = book.entry_id;
      if (editMode) {
        data.category = category;
        data.record_id = record.id;
      }

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
        await this._hass.callService(
          "pawbook",
          editMode ? "update_record" : serviceMap[kind],
          data
        );
        dialog.innerHTML = "";
        await this.loadBooks();
      } catch (err) {
        alert(`Errore: ${err?.message || err}`);
        button.disabled = false;
      }
    });
  }


  genealogyValue(path, key) {
    let node = this._books[this._selected]?.genealogy || {};
    for (const part of path) {
      node = node?.[part] || {};
    }
    return node?.[key] || "";
  }

  buildGenealogyFromForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());

    const node = (prefix) => {
      const item = {
        name: data[`${prefix}_name`]?.trim() || "",
        roi: data[`${prefix}_roi`]?.trim() || "",
        microchip: data[`${prefix}_microchip`]?.trim() || "",
        titles: data[`${prefix}_titles`]
          ? data[`${prefix}_titles`].split(",").map((v) => v.trim()).filter(Boolean)
          : [],
        health: data[`${prefix}_health`]
          ? data[`${prefix}_health`].split(",").map((v) => v.trim()).filter(Boolean)
          : [],
      };
      return item;
    };

    const root = node("dog");
    root.father = node("father");
    root.mother = node("mother");

    root.father.father = node("paternal_grandfather");
    root.father.mother = node("paternal_grandmother");
    root.mother.father = node("maternal_grandfather");
    root.mother.mother = node("maternal_grandmother");

    const clean = (item) => {
      if (!item || typeof item !== "object") return {};
      for (const key of ["father", "mother"]) {
        if (item[key]) {
          item[key] = clean(item[key]);
          if (!item[key].name && !item[key].roi && !item[key].microchip) delete item[key];
        }
      }
      if (!item.name && !item.roi && !item.microchip) return {};
      if (!item.titles?.length) delete item.titles;
      if (!item.health?.length) delete item.health;
      return item;
    };

    return clean(root);
  }

  showGenealogyEditor() {
    const book = this._books[this._selected];
    if (!book) return;

    const dialog = this.shadowRoot.querySelector("#dialog");
    const field = (prefix, title, path = []) => `
      <section class="ancestor-block">
        <h3>${this.esc(title)}</h3>
        <div class="ancestor-grid">
          <label><span>Nome</span><input name="${prefix}_name" value="${this.esc(this.genealogyValue(path, "name"))}"></label>
          <label><span>ROI/RSR</span><input name="${prefix}_roi" value="${this.esc(this.genealogyValue(path, "roi"))}"></label>
          <label><span>Microchip</span><input name="${prefix}_microchip" value="${this.esc(this.genealogyValue(path, "microchip"))}"></label>
          <label><span>Titoli</span><input name="${prefix}_titles" value="${this.esc((this.genealogyValue(path, "titles") || []).join(", "))}" placeholder="Separati da virgola"></label>
          <label class="wide-field"><span>Dati sanitari</span><input name="${prefix}_health" value="${this.esc((this.genealogyValue(path, "health") || []).join(", "))}" placeholder="Separati da virgola"></label>
        </div>
      </section>`;

    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-card genealogy-modal">
          <div class="modal-head">
            <div>
              <h2>Editor genealogico</h2>
              <p class="muted">Inserisci manualmente i dati del pedigree ENCI. Nessun JSON richiesto.</p>
            </div>
            <button class="icon-btn" data-close aria-label="Chiudi">✕</button>
          </div>

          <form id="genealogy-form">
            ${field("dog", "Animale", [])}

            <div class="generation-title">Genitori</div>
            <div class="generation-grid">
              ${field("father", "Padre", ["father"])}
              ${field("mother", "Madre", ["mother"])}
            </div>

            <div class="generation-title">Nonni paterni</div>
            <div class="generation-grid">
              ${field("paternal_grandfather", "Nonno paterno", ["father", "father"])}
              ${field("paternal_grandmother", "Nonna paterna", ["father", "mother"])}
            </div>

            <div class="generation-title">Nonni materni</div>
            <div class="generation-grid">
              ${field("maternal_grandfather", "Nonno materno", ["mother", "father"])}
              ${field("maternal_grandmother", "Nonna materna", ["mother", "mother"])}
            </div>

            <div class="modal-actions">
              ${book.genealogy && Object.keys(book.genealogy).length
                ? `<button type="button" class="danger" id="clear-genealogy">Cancella albero</button>`
                : ""}
              <button type="button" class="secondary" data-close>Annulla</button>
              <button type="submit">Salva albero</button>
            </div>
          </form>
        </div>
      </div>`;

    dialog.querySelectorAll("[data-close]").forEach((button) =>
      button.addEventListener("click", () => { dialog.innerHTML = ""; })
    );

    dialog.querySelector("#clear-genealogy")?.addEventListener("click", async () => {
      if (!confirm("Eliminare definitivamente l'intero albero genealogico?")) return;
      try {
        await this._hass.callService("pawbook", "clear_genealogy", { dog_id: book.entry_id });
        dialog.innerHTML = "";
        await this.loadBooks();
      } catch (err) {
        alert(`Errore: ${err?.message || err}`);
      }
    });

    dialog.querySelector("#genealogy-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;

      const genealogy = this.buildGenealogyFromForm(event.target);
      if (!genealogy.name) {
        alert("Inserisci almeno il nome dell'animale.");
        button.disabled = false;
        return;
      }

      try {
        await this._hass.callService("pawbook", "import_genealogy", {
          dog_id: book.entry_id,
          genealogy_json: JSON.stringify(genealogy),
        });
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
      button.danger { background: var(--error-color); color: white; margin-right: auto; }
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
      .record.editable { position:relative; padding-right:170px; }
      .record.editable:hover { background:var(--secondary-background-color); border-radius:10px; padding-left:10px; }
      .record-actions {
        position:absolute; right:8px; top:50%; transform:translateY(-50%);
        display:flex; gap:7px;
      }
      .record-actions button { padding:7px 10px; font-size:12px; border-radius:9px; }
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
      .genealogy-modal { width:min(1100px,100%); }
      .generation-title {
        margin-top:8px; padding:10px 0 4px; font-weight:700;
        color:var(--primary-color); border-bottom:1px solid var(--divider-color);
      }
      .generation-grid {
        display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px;
      }
      .ancestor-block {
        padding:14px; border:1px solid var(--divider-color);
        border-radius:14px; background:var(--secondary-background-color);
      }
      .ancestor-block h3 { margin-bottom:12px; }
      .ancestor-grid {
        display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;
      }
      .wide-field { grid-column:1/-1; }
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
        .generation-grid, .ancestor-grid { grid-template-columns:1fr; }
        .record.editable { padding-right:10px; padding-bottom:54px; }
        .record-actions { left:8px; right:auto; top:auto; bottom:8px; transform:none; }
        .wide-field { grid-column:auto; }
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
              <div class="record editable" data-edit-kind="weight" data-category="weights" data-record-id="${this.esc(item.id)}">
              <strong>${this.esc(item.weight)} kg</strong>
              <small>${this.formatDate(item.date)}${item.notes ? ` · ${this.esc(item.notes)}` : ""}</small>
              <span class="record-actions">
                <button type="button" class="record-edit" title="Modifica">Modifica</button>
                <button type="button" class="record-delete danger" title="Elimina">Elimina</button>
              </span></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>💉 Vaccinazioni</h3><button class="small-btn" data-form="vaccination">Aggiungi</button></div>
            ${records(book.vaccinations, (item) => `
              <div class="record editable" data-edit-kind="vaccination" data-category="vaccinations" data-record-id="${this.esc(item.id)}">
              <strong>${this.esc(item.name)}</strong>
              <small>${this.formatDate(item.administered_on)}
              ${item.expires_on ? ` · richiamo ${this.formatDate(item.expires_on)}` : ""}</small>
              <span class="record-actions">
                <button type="button" class="record-edit" title="Modifica">Modifica</button>
                <button type="button" class="record-delete danger" title="Elimina">Elimina</button>
              </span></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>🩺 Visite</h3><button class="small-btn" data-form="visit">Aggiungi</button></div>
            ${records(book.visits, (item) => `
              <div class="record editable" data-edit-kind="visit" data-category="visits" data-record-id="${this.esc(item.id)}">
              <strong>${this.esc(item.reason)}</strong>
              <small>${this.formatDate(item.date)}${item.veterinarian ? ` · ${this.esc(item.veterinarian)}` : ""}</small>
              <span class="record-actions">
                <button type="button" class="record-edit" title="Modifica">Modifica</button>
                <button type="button" class="record-delete danger" title="Elimina">Elimina</button>
              </span></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>💊 Terapie</h3><button class="small-btn" data-form="treatment">Aggiungi</button></div>
            ${records(book.treatments, (item) => `
              <div class="record editable" data-edit-kind="treatment" data-category="treatments" data-record-id="${this.esc(item.id)}">
              <strong>${this.esc(item.name)}</strong>
              <small>Dal ${this.formatDate(item.starts_on)}
              ${item.ends_on ? ` al ${this.formatDate(item.ends_on)}` : " · in corso"}
              ${item.dosage ? ` · ${this.esc(item.dosage)}` : ""}</small>
              <span class="record-actions">
                <button type="button" class="record-edit" title="Modifica">Modifica</button>
                <button type="button" class="record-delete danger" title="Elimina">Elimina</button>
              </span></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>🔥 Calori</h3><button class="small-btn" data-form="heat">Aggiungi</button></div>
            ${records(book.heat_cycles, (item) => `
              <div class="record editable" data-edit-kind="heat" data-category="heat_cycles" data-record-id="${this.esc(item.id)}">
              <strong>${this.formatDate(item.starts_on)}</strong>
              <small>${item.ends_on ? `Fine: ${this.formatDate(item.ends_on)}` : "In corso"}
              ${item.notes ? ` · ${this.esc(item.notes)}` : ""}</small>
              <span class="record-actions">
                <button type="button" class="record-edit" title="Modifica">Modifica</button>
                <button type="button" class="record-delete danger" title="Elimina">Elimina</button>
              </span></div>`)}
          </article>

          <article class="card">
            <div class="card-head"><h3>🏆 ENCI</h3><span><button class="small-btn" id="import-enci">Importa / aggiorna</button> <button class="small-btn secondary" id="open-enci">Apri ENCI</button></span></div>
            <div class="record"><strong>Nome registrato</strong><small>${this.esc(p.enci_name || "—")}</small></div>
            <div class="record"><strong>ROI/RSR</strong><small>${this.esc(p.enci_registry || "—")}</small></div>
            <div class="record"><strong>Pedigree</strong><small>${this.esc(p.pedigree_number || "—")}</small></div>
            <div class="record"><strong>Allevatore</strong><small>${this.esc(p.breeder || "—")}</small></div>
          </article>

          <article class="card wide">
            <div class="card-head"><h3>🌳 Albero genealogico</h3><button class="small-btn" id="edit-genealogy">Modifica albero</button></div>
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
    this.shadowRoot.querySelector("#import-enci")?.addEventListener("click", () => this.showEnciSearch());
    this.shadowRoot.querySelector("#open-enci")?.addEventListener("click", () => {
      window.open(p.enci_url || "https://www.enci.it/libro-genealogico/libro-genealogico-on-line", "_blank", "noopener");
    });
    this.shadowRoot.querySelector("#edit-genealogy")?.addEventListener("click", () => {
      this.showGenealogyEditor();
    });
    this.shadowRoot.querySelectorAll("[data-form]").forEach((button) =>
      button.addEventListener("click", () => this.showForm(button.dataset.form))
    );
    this.shadowRoot.querySelectorAll("[data-edit-kind]").forEach((row) => {
      const category = row.dataset.category;
      const recordId = row.dataset.recordId;
      const record = (book[category] || []).find((item) => item.id === recordId);

      row.querySelector(".record-edit")?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (record) this.showForm(row.dataset.editKind, record, category);
      });

      row.querySelector(".record-delete")?.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!record) return;
        if (!confirm("Eliminare definitivamente questa registrazione?")) return;

        try {
          await this._hass.callService("pawbook", "delete_record", {
            dog_id: book.entry_id,
            category,
            record_id: record.id,
          });
          await this.loadBooks();
        } catch (err) {
          alert(`Errore: ${err?.message || err}`);
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-pet]").forEach((button) =>
      button.addEventListener("click", () => {
        this._selected = Number(button.dataset.pet);
        this.render();
      })
    );
  }
}

if (!customElements.get("pawbook-panel-v070")) {
  customElements.define("pawbook-panel-v070", PawBookPanelV070);
}
