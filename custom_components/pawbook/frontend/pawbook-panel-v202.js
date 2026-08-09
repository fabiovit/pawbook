class PawBookPanelV202 extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._books = [];
    this._selected = 0;
    this._loading = true;
    this._error = "";
    this._mobileGenealogyPath = [];
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
    const raw = String(value).trim();

    // Valori già nel formato italiano.
    const italian = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (italian) return raw;

    // Formato compatto ENCI: AAAAMMGG.
    const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[3]}/${compact[2]}/${compact[1]}`;

    // ISO o data/ora ISO: AAAA-MM-GG oppure AAAA-MM-GGT...
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

    // Ultimo tentativo per altri valori validi, evitando conversioni UTC.
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome"
      }).format(parsed);
    }
    return raw;
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

  ageLabel(value) {
    if (!value) return "—";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "—";
    const born = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const now = new Date();
    let months = (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
    if (now.getDate() < born.getDate()) months -= 1;
    if (months < 0) return "—";
    const years = Math.floor(months / 12);
    const rest = months % 12;
    if (!years) return `${rest} mesi`;
    if (!rest) return `${years} ${years === 1 ? "anno" : "anni"}`;
    return `${years} ${years === 1 ? "anno" : "anni"}, ${rest} mesi`;
  }

  timelineItems(book) {
    const items = [];
    (book.weights || []).forEach(x => items.push({ date:x.date, icon:"⚖️", type:"Peso", title:`${x.weight} kg`, detail:x.notes || "" }));
    (book.vaccinations || []).forEach(x => items.push({ date:x.administered_on, icon:"💉", type:"Vaccino", title:x.name || "Vaccinazione", detail:x.veterinarian || "" }));
    (book.visits || []).forEach(x => items.push({ date:x.date, icon:"🩺", type:"Visita", title:x.reason || "Visita", detail:x.outcome || x.veterinarian || "" }));
    (book.treatments || []).forEach(x => items.push({ date:x.starts_on, icon:"💊", type:"Terapia", title:x.name || "Terapia", detail:[x.dosage,x.frequency].filter(Boolean).join(" · ") }));
    (book.heat_cycles || []).forEach(x => items.push({ date:x.starts_on, icon:"🔥", type:"Calore", title:"Inizio ciclo", detail:x.notes || "" }));
    return items.filter(x => x.date).sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 16);
  }

  weightTrend(book) {
    const values = [...(book.weights || [])].filter(x => Number.isFinite(Number(x.weight))).sort((a,b) => String(a.date||"").localeCompare(String(b.date||"")));
    if (values.length < 2) return null;
    const first = Number(values[0].weight), last = Number(values.at(-1).weight);
    return { first, last, delta: Math.round((last-first)*10)/10, count: values.length };
  }

  async exportBackup() {
    const book = this._books[this._selected];
    if (!book) return;
    try {
      const payload = await this._hass.callWS({ type:"pawbook/export_backup", entry_id:book.entry_id });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = String(book.profile?.dog_name || book.title || "pawbook").replace(/[^a-z0-9_-]+/gi,"-").replace(/^-|-$/g,"");
      a.href = url; a.download = `pawbook-${safeName || "backup"}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(`Errore backup: ${err?.message || err}`); }
  }

  showRestoreBackup() {
    const book = this._books[this._selected];
    if (!book) return;
    const dialog = this.shadowRoot.querySelector("#dialog");
    dialog.innerHTML = `<div class="modal"><div class="modal-card"><div class="modal-head"><div><h2>Ripristina backup</h2><p class="muted">Il backup sostituirà i dati della scheda selezionata. Prima esporta una copia se vuoi poter tornare indietro.</p></div><button class="icon-btn" data-close>✕</button></div><label style="margin-top:18px;display:block"><span>File PawBook JSON</span><input id="backup-file" type="file" accept="application/json,.json"></label><div class="modal-actions" style="margin-top:18px"><button class="secondary" data-close>Annulla</button><button id="restore-backup" disabled>Ripristina</button></div></div></div>`;
    dialog.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => dialog.innerHTML=""));
    let payload = null;
    const btn = dialog.querySelector("#restore-backup");
    dialog.querySelector("#backup-file")?.addEventListener("change", async e => {
      try { payload = JSON.parse(await e.target.files?.[0]?.text()); btn.disabled = !payload; }
      catch { payload=null; btn.disabled=true; alert("File JSON non valido"); }
    });
    btn?.addEventListener("click", async () => {
      if (!payload || !confirm("Ripristinare questo backup? I dati attuali della scheda verranno sostituiti.")) return;
      btn.disabled=true; btn.textContent="Ripristino…";
      try { await this._hass.callWS({ type:"pawbook/import_backup", entry_id:book.entry_id, backup:payload }); await this.loadBooks(); dialog.innerHTML=""; }
      catch (err) { btn.disabled=false; btn.textContent="Ripristina"; alert(`Errore ripristino: ${err?.message || err}`); }
    });
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
        out.innerHTML = `<div class="records">${rows.map((row, i) => `<div class="record"><strong>${this.esc(row.name || "Senza nome")}</strong><small>${this.esc(row.registry || "—")} · ${this.esc(row.breed || "Razza non indicata")} ${row.birth_date ? `· ${this.esc(this.formatDate(row.birth_date))}` : ""}</small><button class="small-btn" data-enci-index="${i}">Importa</button></div>`).join("")}</div>`;
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


  async resizePhoto(file) {
    if (!file || !file.type.startsWith("image/")) {
      throw new Error("Seleziona un file immagine valido.");
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error("La foto originale non può superare 15 MB.");
    }

    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Impossibile leggere la foto."));
      reader.readAsDataURL(file);
    });

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Immagine non valida o danneggiata."));
      img.src = source;
    });

    const size = 640;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = Math.max(0, (image.naturalWidth - sourceSize) / 2);
    const sy = Math.max(0, (image.naturalHeight - sourceSize) / 2);
    context.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.84);
  }

  showPhotoEditor() {
    const book = this._books[this._selected];
    if (!book) return;
    const current = book.profile?.photo_url || "";
    const dialog = this.shadowRoot.querySelector("#dialog");
    dialog.innerHTML = `
      <div class="modal"><div class="modal-card photo-modal">
        <div class="modal-head">
          <div><h2>Foto del cane</h2><p class="muted">Scegli una foto: verrà ritagliata al centro e ridimensionata automaticamente.</p></div>
          <button class="icon-btn" data-close aria-label="Chiudi">✕</button>
        </div>
        <div class="photo-editor">
          <div id="photo-preview" class="photo-preview">
            ${current ? `<img src="${this.esc(current)}" alt="Foto di ${this.esc(book.profile?.dog_name || book.title)}">` : `<span>🐶</span>`}
          </div>
          <label class="photo-picker">
            <span>Seleziona una foto</span>
            <input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp">
          </label>
          <p class="muted photo-help">Formati supportati: JPG, PNG e WebP. La copia salvata sarà quadrata, 640×640 px.</p>
        </div>
        <div class="modal-actions">
          ${current ? `<button type="button" class="danger" id="remove-photo">Rimuovi foto</button>` : ""}
          <button type="button" class="secondary" data-close>Annulla</button>
          <button type="button" id="save-photo" disabled>Salva foto</button>
        </div>
      </div></div>`;

    let pendingPhoto = "";
    const preview = dialog.querySelector("#photo-preview");
    const saveButton = dialog.querySelector("#save-photo");
    dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => { dialog.innerHTML = ""; }));

    dialog.querySelector("#photo-file")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      saveButton.disabled = true;
      saveButton.textContent = "Elaborazione…";
      try {
        pendingPhoto = await this.resizePhoto(file);
        preview.innerHTML = `<img src="${pendingPhoto}" alt="Anteprima foto">`;
        saveButton.disabled = false;
        saveButton.textContent = "Salva foto";
      } catch (err) {
        saveButton.textContent = "Salva foto";
        alert(err?.message || err);
      }
    });

    saveButton?.addEventListener("click", async () => {
      if (!pendingPhoto) return;
      saveButton.disabled = true;
      saveButton.textContent = "Salvataggio…";
      try {
        await this._hass.callWS({ type: "pawbook/set_photo", entry_id: book.entry_id, photo_data: pendingPhoto });
        await this.loadBooks();
        dialog.innerHTML = "";
      } catch (err) {
        saveButton.disabled = false;
        saveButton.textContent = "Salva foto";
        alert(`Errore: ${err?.message || err}`);
      }
    });

    dialog.querySelector("#remove-photo")?.addEventListener("click", async () => {
      if (!confirm("Rimuovere la foto del cane?")) return;
      try {
        await this._hass.callWS({ type: "pawbook/set_photo", entry_id: book.entry_id, photo_data: "" });
        await this.loadBooks();
        dialog.innerHTML = "";
      } catch (err) {
        alert(`Errore: ${err?.message || err}`);
      }
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

  genealogyAt(root, index) {
    if (!root || index < 1) return null;
    const bits = (index + 1).toString(2).slice(1);
    let node = root;
    for (const bit of bits) {
      node = bit === "0" ? node?.father : node?.mother;
      if (!node) return null;
    }
    return node;
  }

  healthBadgeClass(kind, value) {
    const normalized = String(value ?? "").toUpperCase();
    if (kind === "hd") {
      if (normalized === "A") return "good";
      if (normalized === "B") return "watch";
      if (normalized === "C") return "warning";
      if (["D", "E"].includes(normalized)) return "bad";
    }
    if (kind === "ed") {
      if (normalized === "0") return "good";
      if (normalized === "1") return "watch";
      if (normalized === "2") return "warning";
      if (normalized === "3") return "bad";
    }
    return "neutral";
  }

  renderHealthBadges(node, compact = false) {
    const health = node?.health_summary || {};
    const badges = [];
    if (health.hd) badges.push(`<span class="health-badge ${this.healthBadgeClass("hd", health.hd)}">HD ${this.esc(health.hd)}</span>`);
    if (health.ed !== undefined && health.ed !== null && health.ed !== "") badges.push(`<span class="health-badge ${this.healthBadgeClass("ed", health.ed)}">ED ${this.esc(health.ed)}</span>`);
    if (health.dna) badges.push(`<span class="health-badge dna">DNA</span>`);
    if (!badges.length) return "";
    return `<div class="health-badges ${compact ? "compact" : ""}">${badges.join("")}</div>`;
  }

  renderPedigreeCard(node, index, generation) {
    if (!node?.name) return `<div class="pedigree-person empty-person">—</div>`;
    const female = index % 2 === 0;
    const relation = female ? "Madre" : "Padre";
    const encoded = encodeURIComponent(JSON.stringify(node));
    return `
      <button type="button" class="pedigree-person ${female ? "female" : "male"} generation-${generation}" data-ancestor="${this.esc(encoded)}" aria-label="Apri i dettagli di ${this.esc(node.name)}">
        <div class="person-relation">${female ? "♀" : "♂"} ${relation}</div>
        <strong>${this.esc(node.name)}</strong>
        ${node.roi ? `<span>${this.esc(node.roi)}</span>` : ""}
        ${node.birth_date ? `<small>${this.formatDate(node.birth_date)}</small>` : ""}
        ${this.renderHealthBadges(node, generation === 4)}
        ${generation === 4 ? `<span class="ancestor-open">Apri dettagli</span>` : ""}
      </button>`;
  }

  showAncestorDetails(node) {
    if (!node) return;
    const dialog = this.shadowRoot.querySelector("#dialog");
    const list = (value) => Array.isArray(value) && value.length
      ? `<ul>${value.map(item => `<li>${this.esc(item)}</li>`).join("")}</ul>`
      : `<span class="muted">Nessun dato</span>`;
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-card ancestor-modal">
          <div class="modal-head">
            <div><h2>${this.esc(node.name || "Antenato")}</h2><p class="muted">Dettagli genealogici</p></div>
            <button class="icon-btn" data-close aria-label="Chiudi">✕</button>
          </div>
          <div class="ancestor-detail-grid">
            <div><span>ROI / RSR</span><strong>${this.esc(node.roi || "—")}</strong></div>
            <div><span>Data di nascita</span><strong>${node.birth_date ? this.formatDate(node.birth_date) : "—"}</strong></div>
            <div><span>Microchip</span><strong>${this.esc(node.microchip || "—")}</strong></div>
            <div><span>ID ENCI</span><strong>${this.esc(node.enci_id || node.id || "—")}</strong></div>
          </div>
          <section class="ancestor-extra"><h3>Titoli</h3>${list(node.titles)}</section>
          <section class="ancestor-extra"><h3>Controlli sanitari ENCI</h3>
            ${this.renderHealthBadges(node)}
            ${Array.isArray(node.health_events) && node.health_events.length ? `<div class="ancestor-health-events">${node.health_events.map(item => `
              <div class="ancestor-health-event">
                <span>${item.date ? this.formatDate(item.date) : "—"}</span>
                <strong>${this.esc(item.type || "Avvenimento ENCI")}</strong>
                <small>${this.esc(item.description || "—")}</small>
              </div>`).join("")}</div>` : list(node.health)}
          </section>
          <div class="modal-actions"><button type="button" data-close>Chiudi</button></div>
        </div>
      </div>`;
    dialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => { dialog.innerHTML = ""; }));
  }

  genealogyNodeByPath(root, path = []) {
    let node = root;
    for (const side of path) {
      node = side === "father" ? node?.father : node?.mother;
      if (!node) return null;
    }
    return node;
  }

  mobileGenealogyRelation(path = []) {
    if (!path.length) return "Animale";
    return path.at(-1) === "father" ? "Padre" : "Madre";
  }

  renderMobileGenealogy(root) {
    let path = Array.isArray(this._mobileGenealogyPath) ? [...this._mobileGenealogyPath] : [];
    let current = this.genealogyNodeByPath(root, path);
    if (!current) {
      path = [];
      this._mobileGenealogyPath = [];
      current = root;
    }

    const profile = this._books[this._selected]?.profile || {};
    const crumbs = [{ label: root?.name || profile.dog_name || "Cane", path: [] }];
    let cursor = root;
    const cursorPath = [];
    for (const side of path) {
      cursorPath.push(side);
      cursor = side === "father" ? cursor?.father : cursor?.mother;
      if (!cursor) break;
      crumbs.push({ label: cursor.name || (side === "father" ? "Padre" : "Madre"), path: [...cursorPath] });
    }

    const currentRelation = this.mobileGenealogyRelation(path);
    const sexIcon = path.length ? (path.at(-1) === "father" ? "♂" : "♀") : "🐶";
    const childCard = (node, side) => {
      if (!node?.name) return `
        <div class="mobile-genealogy-parent empty-mobile-parent">
          <div><span>${side === "father" ? "♂ Padre" : "♀ Madre"}</span><strong>Non disponibile</strong></div>
        </div>`;
      const nextPath = [...path, side];
      const encoded = encodeURIComponent(JSON.stringify(nextPath));
      return `
        <button type="button" class="mobile-genealogy-parent ${side}" data-mobile-genealogy-path="${this.esc(encoded)}">
          <div class="mobile-genealogy-parent-main">
            <span>${side === "father" ? "♂ Padre" : "♀ Madre"}</span>
            <strong>${this.esc(node.name)}</strong>
            ${node.roi ? `<small>${this.esc(node.roi)}</small>` : ""}
            ${node.birth_date ? `<small>🎂 ${this.formatDate(node.birth_date)}</small>` : ""}
            ${this.renderHealthBadges(node)}
          </div>
          <span class="mobile-genealogy-chevron">›</span>
        </button>`;
    };

    const rootPhoto = !path.length && profile.photo_url
      ? `<img class="mobile-genealogy-photo" src="${this.esc(profile.photo_url)}" alt="Foto di ${this.esc(current?.name || profile.dog_name || "cane")}">`
      : `<div class="mobile-genealogy-avatar ${path.length && path.at(-1) === "mother" ? "female" : path.length ? "male" : "root"}">${sexIcon}</div>`;

    return `
      <div class="mobile-genealogy" aria-label="Genealogia mobile">
        <div class="mobile-genealogy-breadcrumbs">
          ${crumbs.map((crumb, index) => {
            const encoded = encodeURIComponent(JSON.stringify(crumb.path));
            return `${index ? `<span class="crumb-separator">›</span>` : ""}<button type="button" data-mobile-genealogy-path="${this.esc(encoded)}">${this.esc(crumb.label)}</button>`;
          }).join("")}
        </div>

        <div class="mobile-genealogy-current">
          ${rootPhoto}
          <div class="mobile-genealogy-current-info">
            <span class="mobile-genealogy-relation">${this.esc(currentRelation)}</span>
            <h4>${this.esc(current?.name || "—")}</h4>
            ${current?.roi ? `<div>${this.esc(current.roi)}</div>` : ""}
            ${current?.birth_date ? `<small>🎂 ${this.formatDate(current.birth_date)}</small>` : ""}
            ${this.renderHealthBadges(current)}
          </div>
          ${path.length ? `<button type="button" class="mobile-genealogy-back" data-mobile-genealogy-back aria-label="Torna alla generazione precedente">←</button>` : ""}
        </div>

        <div class="mobile-genealogy-parents">
          ${childCard(current?.father, "father")}
          ${childCard(current?.mother, "mother")}
        </div>

        <div class="mobile-genealogy-actions">
          <button type="button" class="secondary" data-mobile-ancestor-details="${this.esc(encodeURIComponent(JSON.stringify(current || {})))}">Dettagli ENCI</button>
          ${path.length ? `<button type="button" class="secondary" data-mobile-genealogy-root>Torna a ${this.esc(root?.name || "inizio")}</button>` : ""}
        </div>
      </div>`;
  }

  renderPedigree(root) {
    const labels = ["Genitori", "Nonni", "Bisnonni", "Trisnonni"];
    const rows = [];

    // Prime tre generazioni: una griglia ordinata e allineata.
    for (let generation = 1; generation <= 3; generation += 1) {
      const first = (2 ** generation) - 1;
      const count = 2 ** generation;
      const cards = [];
      for (let offset = 0; offset < count; offset += 1) {
        const index = first + offset;
        cards.push(this.renderPedigreeCard(this.genealogyAt(root, index), index, generation));
      }
      rows.push(`
        <div class="pedigree-row">
          <div class="generation-label"><strong>${generation}ª</strong><span>${labels[generation - 1]}</span></div>
          <div class="pedigree-cards generation-count-${count}">${cards.join("")}</div>
        </div>`);
    }

    // Quarta generazione: ogni coppia è fisicamente raggruppata sotto il
    // proprio figlio della terza generazione. In questo modo, per esempio,
    // RED e ADELAIDE restano sotto MOMO DELLA CASCINETTA, ROMEO e MILA sotto
    // BEATRICE DELLA METAURENSE, e così via per tutte le otto coppie.
    const fourthGroups = [];
    for (let parentOffset = 0; parentOffset < 8; parentOffset += 1) {
      const fatherIndex = 15 + (parentOffset * 2);
      const motherIndex = fatherIndex + 1;
      fourthGroups.push(`
        <div class="pedigree-family-group" aria-label="Genitori dell'antenato ${parentOffset + 1} della terza generazione">
          ${this.renderPedigreeCard(this.genealogyAt(root, fatherIndex), fatherIndex, 4)}
          ${this.renderPedigreeCard(this.genealogyAt(root, motherIndex), motherIndex, 4)}
        </div>`);
    }
    rows.push(`
      <div class="pedigree-row pedigree-row-fourth">
        <div class="generation-label"><strong>4ª</strong><span>Trisnonni</span><small>Clicca per i dettagli</small></div>
        <div class="pedigree-fourth-groups">${fourthGroups.join("")}</div>
      </div>`);

    const profile = this._books[this._selected]?.profile || {};
    const rootPhoto = profile.photo_url
      ? `<img class="pedigree-root-photo" src="${this.esc(profile.photo_url)}" alt="Foto di ${this.esc(root.name || profile.dog_name || "cane")}">`
      : `<div class="pedigree-root-photo pedigree-root-placeholder">🐾</div>`;
    return `
      <div class="pedigree-desktop">
      <div class="pedigree-wrap">
        <div class="pedigree-root">
          ${rootPhoto}
          <div class="pedigree-root-info">
            <strong>${this.esc(root.name || "—")}</strong>
            ${root.roi ? `<span>${this.esc(root.roi)}</span>` : ""}
            <small>${[profile.sex, profile.birth_date ? this.formatDate(profile.birth_date) : "", profile.breed].filter(Boolean).map(v => this.esc(v)).join(" · ")}</small>
          </div>
        </div>
        ${rows.join("")}
      </div>
      </div>
      ${this.renderMobileGenealogy(root)}`;
  }

  renderEnciPanels(book) {
    const p = book.profile || {};
    const enci = book.enci_data || {};
    const events = Array.isArray(enci.events) ? enci.events : [];
    const docs = enci.health_documents || {};
    const dental = Array.isArray(enci.dental) ? enci.dental : [];
    const info = (label, value) => `<div class="enci-field"><span>${this.esc(label)}</span><strong>${this.esc(value || "—")}</strong></div>`;
    return `
      <div class="enci-panels">
        <section class="enci-panel">
          <h4>👥 Anagrafica ENCI</h4>
          <div class="enci-info-grid">
            ${info("Razza", p.breed)}${info("Mantello", p.color)}${info("Sesso", p.sex)}
            ${info("Data di nascita", p.birth_date ? this.formatDate(p.birth_date) : "")}${info("Allevatore", p.breeder)}${info("Proprietario", p.owner)}
            ${info("Microchip", p.microchip)}${info("ROI / LOI", p.enci_registry)}<div class="enci-field"><span>Stato</span><strong class="life-status ${p.deceased ? "deceased" : "alive"}"><i></i>${p.deceased ? "Deceduto" : "Vivo"}</strong></div>
            ${info("Padre", p.father)}${info("Madre", p.mother)}
          </div>
        </section>
        <section class="enci-panel">
          <h4>🩺 Avvenimenti ENCI</h4>
          ${events.length ? `<div class="enci-events">${events.map(item => `
            <div class="enci-event">
              <span>${this.esc(item.DATA_CHAR || (item.DATA ? this.formatDate(item.DATA) : "—"))}</span>
              <strong>${this.esc(item.TIPO || "Avvenimento")}</strong>
              <small>${this.esc(item.AVVENIMENTO || "—")}${item.CODICE ? ` · ${this.esc(item.CODICE)}` : ""}</small>
            </div>`).join("")}</div>` : `<div class="empty">Nessun avvenimento disponibile</div>`}
        </section>
        <section class="enci-panel">
          <h4>📄 Documenti sanitari ENCI</h4>
          <div class="document-status"><span>Documenti sanitari</span><strong>${Array.isArray(docs.Dto) && docs.Dto.length ? `${docs.Dto.length} disponibili` : "Nessun documento disponibile"}</strong></div>
          <div class="document-status"><span>Carta dentaria</span><strong>${dental.length ? `${dental.length} disponibile` : "Nessuna carta dentaria disponibile"}</strong></div>
        </section>
      </div>
      <div class="enci-note">ℹ️ I dati sono importati dal Libro genealogico ENCI e potrebbero non essere completi. Verifica sempre con la documentazione ufficiale.</div>`;
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
      .page { max-width: 1500px; margin: 0 auto; padding: 30px 34px 42px; }
      .topbar {
        display: flex; justify-content: space-between; align-items: center;
        gap: 18px; margin-bottom: 28px;
      }
      .brand { display: flex; align-items: center; gap: 14px; }
      .brand-mark {
        width:66px; height:66px; border-radius:19px; display:grid; place-items:center;
        background:var(--card-background-color); border:1px solid var(--divider-color);
        box-shadow:var(--ha-card-box-shadow,0 2px 10px rgba(0,0,0,.08)); flex:0 0 auto;
      }
      .brand-mark svg { width:40px; height:40px; display:block; fill:var(--primary-color); }
      h1, h2, h3, p { margin-top: 0; }
      h1 { margin-bottom: 4px; font-size: 38px; line-height:1.05; letter-spacing:-.8px; }
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
        display: grid; grid-template-columns: minmax(0, 1fr);
        gap: 18px; padding: 30px 34px; border-radius: 28px;
        background: var(--card-background-color);
        box-shadow: var(--ha-card-box-shadow, 0 2px 12px rgba(0,0,0,.08));
        margin-bottom: 20px;
      }
      .profile { display: flex; gap: 20px; align-items: center; }
      .pet-photo {
        width: 178px; height: 178px; border-radius: 28px;
        object-fit: cover; background: var(--secondary-background-color);
      }
      .photo-button { position:relative; padding:0; border:0; background:transparent; border-radius:28px; }
      .photo-button::after { content:"📷"; position:absolute; right:-6px; bottom:-6px; width:34px; height:34px; display:grid; place-items:center; border-radius:50%; background:var(--primary-color); box-shadow:0 2px 8px rgba(0,0,0,.35); font-size:16px; }
      .photo-button:hover { transform:translateY(-1px); }
      .photo-button .placeholder { width:178px; height:178px; border-radius:28px; background:var(--secondary-background-color); }
      .photo-modal { max-width:560px; }
      .photo-editor { display:grid; justify-items:center; gap:16px; padding:8px 0 4px; }
      .photo-preview { width:240px; height:240px; border-radius:28px; overflow:hidden; display:grid; place-items:center; background:var(--secondary-background-color); border:1px solid var(--divider-color); font-size:76px; }
      .photo-preview img { width:100%; height:100%; object-fit:cover; }
      .photo-picker { width:100%; }
      .photo-picker span { display:block; margin-bottom:8px; font-weight:600; }
      .photo-picker input { width:100%; padding:12px; border:1px solid var(--divider-color); border-radius:12px; background:var(--secondary-background-color); color:var(--primary-text-color); }
      .photo-help { font-size:13px; text-align:center; }
      .placeholder {
        display: grid; place-items: center; font-size: 48px;
      }
      .identity h2 { font-size: 42px; line-height:1.05; letter-spacing:-.8px; margin-bottom: 9px; }
      .identity-grid { display: flex; flex-wrap: wrap; gap: 12px 28px; font-size:17px; color: var(--secondary-text-color); }
      .actions { display: none; align-items: flex-start; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .stats {
        display: grid; grid-template-columns: repeat(4, minmax(0,1fr));
        gap: 14px; margin-bottom: 20px;
      }
      .stat, .card {
        padding: 22px; border-radius: 22px; background: var(--card-background-color);
        box-shadow: var(--ha-card-box-shadow, 0 2px 12px rgba(0,0,0,.06));
      }
      .stat { position:relative; min-height:112px; display:flex; flex-direction:column; justify-content:center; padding-right:88px; }
      .stat span { display:block; color:var(--secondary-text-color); font-size:16px; margin-bottom:8px; }
      .stat strong { font-size: 28px; line-height:1.05; }
      .stat-icon { position:absolute; right:22px; top:50%; transform:translateY(-50%); width:54px; height:54px; border-radius:16px; display:grid; place-items:center; color:var(--primary-color); background:color-mix(in srgb, var(--primary-color) 9%, var(--card-background-color)); border:1px solid color-mix(in srgb, var(--primary-color) 18%, var(--divider-color)); font-size:27px; }
      .dashboard-nav { display:grid; grid-template-columns:repeat(9,minmax(0,1fr)); gap:4px; margin:4px 0 24px; padding:14px 12px 8px; border-radius:24px; background:var(--card-background-color); box-shadow:var(--ha-card-box-shadow,0 2px 12px rgba(0,0,0,.06)); }
      .dashboard-nav button { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; min-height:76px; padding:8px 5px 12px; border-radius:14px; background:transparent; color:var(--primary-text-color); font-weight:500; }
      .dashboard-nav button:hover { background:var(--secondary-background-color); }
      .dashboard-nav button.active { color:var(--primary-color); font-weight:700; }
      .dashboard-nav button.active::after { content:""; position:absolute; left:16%; right:16%; bottom:0; height:3px; border-radius:3px; background:var(--primary-color); }
      .dashboard-nav .nav-icon { font-size:25px; line-height:1; }
      .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
      .card-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:14px; }
      .card-head h3 { margin:0; }
      .small-btn { padding:8px 11px; font-size:13px; }
      .record { padding:11px 0; border-top:1px solid var(--divider-color); }
      .record:first-of-type { border-top:none; }
      .record strong { display:block; margin-bottom:4px; }
      .record small { color:var(--secondary-text-color); }
      .v2-section { grid-column:1/-1; }
      .timeline { position:relative; display:grid; gap:0; padding-left:18px; }
      .timeline::before { content:""; position:absolute; left:7px; top:12px; bottom:12px; width:2px; background:var(--divider-color); }
      .timeline-item { position:relative; display:grid; grid-template-columns:42px 110px 1fr; gap:12px; align-items:start; padding:12px 0; border-top:1px solid var(--divider-color); }
      .timeline-item:first-child { border-top:0; }
      .timeline-dot { position:relative; z-index:1; width:34px; height:34px; margin-left:-27px; border-radius:50%; display:grid; place-items:center; background:var(--card-background-color); border:2px solid var(--primary-color); }
      .timeline-date { color:var(--secondary-text-color); font-size:12px; padding-top:8px; }
      .timeline-content strong,.timeline-content span,.timeline-content small { display:block; }
      .timeline-content span { color:var(--primary-color); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.35px; }
      .timeline-content small { color:var(--secondary-text-color); margin-top:3px; }
      .insight-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
      .insight { padding:16px; border:1px solid var(--divider-color); border-radius:16px; background:var(--secondary-background-color); }
      .insight span,.insight strong,.insight small { display:block; }
      .insight span { color:var(--secondary-text-color); font-size:12px; }
      .insight strong { font-size:22px; margin:7px 0 3px; }
      .insight small { color:var(--secondary-text-color); }
      .backup-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
      .v2-badge { display:inline-flex; align-items:center; gap:5px; padding:5px 9px; border-radius:999px; background:color-mix(in srgb,var(--primary-color) 10%,transparent); color:var(--primary-color); font-size:12px; font-weight:700; margin-left:8px; vertical-align:middle; }
      .record.editable { position:relative; padding-right:170px; }
      .record.editable:hover { background:var(--secondary-background-color); border-radius:10px; padding-left:10px; }
      .record-actions {
        position:absolute; right:8px; top:50%; transform:translateY(-50%);
        display:flex; gap:7px;
      }
      .record-actions button { padding:7px 10px; font-size:12px; border-radius:9px; }
      .empty { padding:18px 0; text-align:center; color:var(--secondary-text-color); }
      .wide { grid-column:1/-1; }
      .pedigree-section { overflow:hidden; }
      .pedigree-wrap { overflow-x:auto; padding:6px 0 18px; min-width:100%; }
      .pedigree-root { width:420px; margin:0 auto 18px; padding:15px 18px; border:1px solid var(--primary-color); border-radius:15px; background:linear-gradient(135deg,var(--secondary-background-color),var(--card-background-color)); display:flex; align-items:center; gap:14px; }
      .pedigree-root-photo { width:72px; height:72px; border-radius:16px; object-fit:cover; flex:0 0 auto; background:var(--secondary-background-color); }
      .pedigree-root-placeholder { display:grid; place-items:center; font-size:28px; }
      .pedigree-root-info { min-width:0; }
      .pedigree-root strong,.pedigree-root span,.pedigree-root small { display:block; }
      .pedigree-root span,.pedigree-root small { color:var(--secondary-text-color); margin-top:4px; }
      .pedigree-row { display:grid; grid-template-columns:105px max-content; gap:14px; align-items:stretch; margin-top:10px; min-width:max-content; }
      .generation-label { display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:10px; border:1px solid var(--divider-color); border-radius:13px; background:var(--secondary-background-color); }
      .generation-label span { color:var(--secondary-text-color); font-size:12px; margin-top:3px; }
      .pedigree-cards { display:grid; gap:9px; }
      .generation-count-2 { grid-template-columns:repeat(2, minmax(360px, 1fr)); width:1115px; }
      .generation-count-4 { grid-template-columns:repeat(4, minmax(240px, 1fr)); width:1115px; }
      .generation-count-8 { grid-template-columns:repeat(8, minmax(130px, 1fr)); width:1115px; }
      .generation-count-16 { grid-template-columns:repeat(16, 118px); width:max-content; }
      .pedigree-fourth-groups { display:grid; grid-template-columns:repeat(8, minmax(130px,1fr)); gap:9px; width:1115px; align-items:stretch; }
      .pedigree-family-group { position:relative; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; min-width:0; padding-top:13px; }
      .pedigree-family-group::before { content:""; position:absolute; top:0; left:25%; right:25%; height:9px; border-top:1px solid rgba(150,160,170,.72); border-left:1px solid rgba(150,160,170,.72); border-right:1px solid rgba(150,160,170,.72); border-radius:3px 3px 0 0; pointer-events:none; }
      .pedigree-row-fourth { margin-top:0; }
      .pedigree-row-fourth .generation-label small { color:var(--secondary-text-color); font-size:9px; line-height:1.25; margin-top:5px; }
      .pedigree-person { min-width:0; padding:11px 12px; border-radius:12px; border:1px solid var(--divider-color); background:var(--secondary-background-color); overflow:hidden; color:var(--primary-text-color); text-align:left; font:inherit; cursor:pointer; transition:transform .15s ease, box-shadow .15s ease; }
      .pedigree-person:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,.22); }
      .pedigree-person.male { border-color:#3488c8; background:linear-gradient(135deg,rgba(35,112,170,.18),var(--secondary-background-color)); }
      .pedigree-person.female { border-color:#c84d83; background:linear-gradient(135deg,rgba(180,55,110,.17),var(--secondary-background-color)); }
      .pedigree-person strong,.pedigree-person span,.pedigree-person small { display:block; overflow-wrap:break-word; word-break:normal; hyphens:none; }
      .pedigree-person strong { font-size:13px; line-height:1.25; }
      .pedigree-person.generation-4 { min-height:118px; padding:7px 6px; }
      .pedigree-person.generation-4 strong { font-size:9px; line-height:1.16; margin-top:3px; overflow-wrap:normal; word-break:normal; }
      .pedigree-person.generation-4 span,.pedigree-person.generation-4 small,.pedigree-person.generation-4 .person-relation { font-size:7.7px; line-height:1.16; }
      .pedigree-person.generation-4 .ancestor-open { margin-top:6px !important; font-size:7px !important; }
      .pedigree-person span,.pedigree-person small,.person-relation { color:var(--secondary-text-color); font-size:11px; margin-top:3px; }
      .pedigree-person.male .person-relation { color:#54aaf0; }
      .pedigree-person.female .person-relation { color:#ed72a8; }
      .ancestor-open { margin-top:7px !important; opacity:.72; font-size:8px !important; }
      .health-badges { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
      .health-badges.compact { gap:3px; margin-top:5px; }
      .health-badge { display:inline-flex !important; align-items:center; justify-content:center; min-width:38px; padding:3px 7px; border-radius:999px; font-size:9px !important; line-height:1 !important; font-weight:800; border:1px solid transparent; color:#fff !important; margin:0 !important; }
      .health-badges.compact .health-badge { min-width:31px; padding:2px 4px; font-size:7px !important; }
      .health-badge.good { background:#187a47; border-color:#35c77a; }
      .health-badge.watch { background:#8a7010; border-color:#e4bf2b; }
      .health-badge.warning { background:#9a4d0d; border-color:#f08a2b; }
      .health-badge.bad { background:#8c2430; border-color:#ef5262; }
      .health-badge.dna { background:#5441a5; border-color:#8d78ed; }
      .health-badge.neutral { background:#4b5563; border-color:#7f8b99; }
      .ancestor-health-events { display:grid; gap:8px; margin-top:12px; }
      .ancestor-health-event { padding:10px 12px; border:1px solid var(--divider-color); border-radius:10px; background:var(--secondary-background-color); }
      .ancestor-health-event span,.ancestor-health-event strong,.ancestor-health-event small { display:block; }
      .ancestor-health-event span,.ancestor-health-event small { color:var(--secondary-text-color); }
      .ancestor-health-event strong { margin:3px 0; }
      .life-status { display:inline-flex !important; align-items:center; gap:7px; }
      .life-status i { width:10px; height:10px; border-radius:50%; display:inline-block; background:#7b8794; box-shadow:0 0 0 2px rgba(123,135,148,.15); }
      .life-status.alive { color:#67cf4b; }
      .life-status.alive i { background:#67cf4b; box-shadow:0 0 8px rgba(103,207,75,.55); }
      .life-status.deceased { color:var(--secondary-text-color); }
      .ancestor-modal { max-width:620px; }
      .ancestor-detail-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:12px 0 18px; }
      .ancestor-detail-grid > div { padding:13px; border:1px solid var(--divider-color); border-radius:12px; background:var(--secondary-background-color); }
      .ancestor-detail-grid span,.ancestor-detail-grid strong { display:block; }
      .ancestor-detail-grid span { color:var(--secondary-text-color); font-size:12px; margin-bottom:5px; }
      .ancestor-extra { padding:14px 0; border-top:1px solid var(--divider-color); }
      .ancestor-extra h3 { margin-bottom:8px; font-size:15px; }
      .ancestor-extra ul { margin:0; padding-left:20px; }
      .empty-person { opacity:.35; display:grid; place-items:center; }
      .enci-panels { display:grid; grid-template-columns:1.1fr 1fr 1fr; gap:14px; margin-top:18px; }
      .enci-panel { border:1px solid var(--divider-color); border-radius:15px; padding:15px; background:var(--secondary-background-color); }
      .enci-panel h4 { margin:0 0 12px; color:var(--primary-color); }
      .enci-info-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 12px; }
      .enci-field,.document-status { padding:9px 0; border-top:1px solid var(--divider-color); }
      .enci-field span,.document-status span { display:block; color:var(--secondary-text-color); font-size:11px; margin-bottom:4px; }
      .enci-field strong,.document-status strong { font-size:12px; overflow-wrap:anywhere; }
      .enci-event { display:grid; grid-template-columns:78px 1fr; gap:3px 10px; padding:9px 0; border-top:1px solid var(--divider-color); }
      .enci-event span { color:var(--secondary-text-color); font-size:11px; }
      .enci-event strong { font-size:12px; }
      .enci-event small { grid-column:2; color:var(--secondary-text-color); }
      .enci-note { margin-top:14px; padding:10px 13px; border:1px solid var(--divider-color); border-radius:11px; color:var(--secondary-text-color); font-size:12px; }
      .mobile-genealogy { display:none; }
      .mobile-genealogy-breadcrumbs { display:flex; align-items:center; gap:5px; overflow-x:auto; white-space:nowrap; padding:2px 1px 12px; scrollbar-width:none; }
      .mobile-genealogy-breadcrumbs::-webkit-scrollbar { display:none; }
      .mobile-genealogy-breadcrumbs button { min-height:34px; padding:5px 8px; border:0; background:transparent; color:var(--primary-color); font-weight:700; font-size:12px; }
      .crumb-separator { color:var(--secondary-text-color); }
      .mobile-genealogy-current { position:relative; display:flex; align-items:center; gap:13px; padding:16px; border:1px solid color-mix(in srgb,var(--primary-color) 45%,var(--divider-color)); border-radius:18px; background:linear-gradient(135deg,color-mix(in srgb,var(--primary-color) 9%,var(--card-background-color)),var(--card-background-color)); }
      .mobile-genealogy-photo,.mobile-genealogy-avatar { flex:0 0 62px; width:62px; height:62px; border-radius:16px; object-fit:cover; }
      .mobile-genealogy-avatar { display:grid; place-items:center; font-size:28px; border:1px solid var(--divider-color); background:var(--secondary-background-color); }
      .mobile-genealogy-avatar.male { color:#42a5f5; border-color:#2488ca; }
      .mobile-genealogy-avatar.female { color:#ff6aa8; border-color:#c53b75; }
      .mobile-genealogy-current-info { min-width:0; flex:1; }
      .mobile-genealogy-current-info h4 { margin:2px 0 4px; font-size:20px; line-height:1.1; overflow-wrap:anywhere; }
      .mobile-genealogy-current-info > div,.mobile-genealogy-current-info > small { display:block; color:var(--secondary-text-color); margin-top:2px; }
      .mobile-genealogy-relation { color:var(--primary-color); font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
      .mobile-genealogy-back { position:absolute; right:10px; top:10px; width:40px; min-height:40px; padding:0; border-radius:50%; background:var(--secondary-background-color); color:var(--primary-text-color); }
      .mobile-genealogy-parents { display:grid; gap:10px; margin-top:12px; }
      .mobile-genealogy-parent { width:100%; min-height:92px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 15px; text-align:left; border-radius:17px; background:var(--card-background-color); color:var(--primary-text-color); box-shadow:none; }
      .mobile-genealogy-parent.father { border:1px solid #2488ca; background:linear-gradient(135deg,rgba(36,136,202,.10),var(--card-background-color)); }
      .mobile-genealogy-parent.mother { border:1px solid #c53b75; background:linear-gradient(135deg,rgba(197,59,117,.10),var(--card-background-color)); }
      .mobile-genealogy-parent-main { min-width:0; flex:1; }
      .mobile-genealogy-parent-main > span:first-child { display:block; color:var(--primary-color); font-size:11px; margin-bottom:3px; }
      .mobile-genealogy-parent.mother .mobile-genealogy-parent-main > span:first-child { color:#ff6aa8; }
      .mobile-genealogy-parent-main strong { display:block; font-size:16px; line-height:1.18; overflow-wrap:anywhere; }
      .mobile-genealogy-parent-main small { display:block; color:var(--secondary-text-color); margin-top:3px; }
      .mobile-genealogy-chevron { flex:0 0 auto; font-size:34px; line-height:1; font-weight:300; color:var(--secondary-text-color); }
      .empty-mobile-parent { border:1px dashed var(--divider-color); color:var(--secondary-text-color); opacity:.72; }
      .mobile-genealogy-actions { display:grid; grid-template-columns:1fr; gap:8px; margin-top:12px; }
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
        .page { padding:18px 14px 34px; }
        .topbar { margin-bottom:18px; align-items:flex-start; }
        .brand-mark { width:52px; height:52px; border-radius:15px; }
        .brand-mark svg { width:32px; height:32px; }
        h1 { font-size:30px; }
        .hero { padding:20px; border-radius:22px; }
        .profile { align-items:flex-start; }
        .pet-photo,.photo-button .placeholder { width:110px; height:110px; border-radius:20px; }
        .identity h2 { font-size:30px; }
        .identity-grid { font-size:13px; gap:7px 12px; }
        .stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .grid { grid-template-columns:1fr; }
        .wide { grid-column:auto; }
        .insight-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .dashboard-nav {
          display:flex; overflow-x:auto; overflow-y:hidden; gap:6px;
          padding:10px; scroll-snap-type:x proximity; scrollbar-width:none;
          -webkit-overflow-scrolling:touch;
        }
        .dashboard-nav::-webkit-scrollbar { display:none; }
        .dashboard-nav button { flex:0 0 104px; min-height:68px; font-size:12px; scroll-snap-align:start; }
        .actions { justify-content:flex-start; }
        .enci-panels { grid-template-columns:1fr; }
      }
      @media(max-width:600px) {
        :host { overflow-x:hidden; }
        .page {
          width:100%; max-width:100%; overflow-x:hidden;
          padding:12px max(12px,env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));
        }
        .topbar { gap:10px; margin-bottom:14px; }
        .brand { gap:10px; min-width:0; }
        .brand-mark { width:44px; height:44px; border-radius:13px; }
        .brand-mark svg { width:27px; height:27px; }
        h1 { font-size:25px; letter-spacing:-.4px; }
        .v2-badge { font-size:10px; padding:4px 7px; margin-left:4px; }
        .pet-tabs {
          flex-wrap:nowrap; overflow-x:auto; padding-bottom:4px; margin-bottom:12px;
          scrollbar-width:none; -webkit-overflow-scrolling:touch;
        }
        .pet-tabs::-webkit-scrollbar { display:none; }
        .pet-tab { flex:0 0 auto; min-height:44px; }
        .hero { padding:18px 14px; border-radius:20px; margin-bottom:12px; }
        .profile { flex-direction:column; align-items:center; text-align:center; gap:13px; }
        .photo-button { border-radius:24px; }
        .pet-photo,.photo-button .placeholder { width:132px; height:132px; border-radius:24px; }
        .photo-button::after { width:38px; height:38px; right:-4px; bottom:-4px; }
        .identity { width:100%; min-width:0; }
        .identity h2 { font-size:29px; margin-bottom:8px; overflow-wrap:anywhere; }
        .identity-grid { justify-content:center; gap:8px 14px; font-size:13px; line-height:1.4; }
        .stats { grid-template-columns:1fr; gap:10px; margin-bottom:12px; }
        .stat { min-height:88px; padding:15px 72px 15px 16px; border-radius:18px; }
        .stat span { font-size:13px; margin-bottom:5px; }
        .stat strong { font-size:23px; }
        .stat-icon { right:15px; width:45px; height:45px; border-radius:14px; font-size:22px; }
        .dashboard-nav {
          position:sticky; top:0; z-index:40; margin:0 0 12px;
          border-radius:18px; padding:7px; gap:4px;
          background:color-mix(in srgb,var(--card-background-color) 94%,transparent);
          backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
        }
        .dashboard-nav button { flex-basis:88px; min-height:58px; padding:7px 5px 9px; font-size:11px; border-radius:12px; }
        .dashboard-nav .nav-icon { font-size:21px; }
        .card,.stat { box-shadow:var(--ha-card-box-shadow,0 1px 7px rgba(0,0,0,.05)); }
        .card { padding:16px; border-radius:18px; }
        .card-head { align-items:flex-start; }
        .card-head h3 { font-size:18px; }
        .small-btn { min-height:42px; padding:9px 12px; }
        button,.button { min-height:44px; }
        .insight-grid { grid-template-columns:1fr; }
        .timeline { padding-left:12px; }
        .timeline::before { left:6px; }
        .timeline-item { grid-template-columns:30px 1fr; gap:8px; padding:12px 0; }
        .timeline-dot { width:30px; height:30px; margin-left:-21px; }
        .timeline-date { grid-column:2; padding-top:0; font-size:11px; }
        .timeline-content { grid-column:2; min-width:0; }
        .backup-actions { display:grid; grid-template-columns:1fr; }
        .record.editable { padding-right:8px; padding-bottom:58px; }
        .record-actions { left:0; right:auto; top:auto; bottom:7px; transform:none; }
        .record-actions button { min-height:38px; }
        .enci-panels { grid-template-columns:1fr; gap:10px; }
        .enci-info-grid { grid-template-columns:1fr; }
        .enci-event { grid-template-columns:68px 1fr; }
        .pedigree-section { margin-left:0; margin-right:0; overflow:visible; }
        .pedigree-desktop { display:none; }
        .mobile-genealogy { display:block; }
        .pedigree-section > .card-head { margin-left:0; margin-right:0; }
        .genealogy-modal,.modal-card,.ancestor-modal,.photo-modal {
          width:100%; max-width:none; max-height:none; height:auto;
        }
        .modal {
          place-items:end center; padding:0;
          padding-top:env(safe-area-inset-top);
        }
        .modal-card {
          max-height:calc(100dvh - env(safe-area-inset-top));
          border-radius:22px 22px 0 0;
          padding:18px 16px calc(18px + env(safe-area-inset-bottom));
        }
        .modal-head { position:sticky; top:-18px; z-index:5; padding:8px 0 10px; background:var(--card-background-color); }
        .icon-btn { min-width:44px; min-height:44px; }
        .modal-actions { position:sticky; bottom:calc(-18px - env(safe-area-inset-bottom)); z-index:5; margin-left:-16px; margin-right:-16px; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); background:var(--card-background-color); border-top:1px solid var(--divider-color); }
        .modal-actions button { flex:1 1 auto; }
        .generation-grid,.ancestor-grid,.ancestor-detail-grid { grid-template-columns:1fr; }
        .wide-field { grid-column:auto; }
        .photo-preview { width:min(240px,72vw); height:min(240px,72vw); }
        input,textarea { font-size:16px; }
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
          <div class="topbar"><div class="brand"><div class="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64"><ellipse cx="17" cy="21" rx="7" ry="10" transform="rotate(-24 17 21)"></ellipse><ellipse cx="29" cy="14" rx="7" ry="10" transform="rotate(-7 29 14)"></ellipse><ellipse cx="42" cy="15" rx="7" ry="10" transform="rotate(9 42 15)"></ellipse><ellipse cx="52" cy="24" rx="7" ry="10" transform="rotate(25 52 24)"></ellipse><path d="M17 47c0-11 8-20 15-20 8 0 17 9 17 20 0 8-6 12-13 9-3-1-5-1-8 0-6 3-11-1-11-9z"></path></svg></div><h1>PawBook</h1></div></div>
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
    const timeline = this.timelineItems(book);
    const trend = this.weightTrend(book);
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
            <div class="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 64 64" role="img">
                <ellipse cx="17" cy="21" rx="7" ry="10" transform="rotate(-24 17 21)"></ellipse>
                <ellipse cx="29" cy="14" rx="7" ry="10" transform="rotate(-7 29 14)"></ellipse>
                <ellipse cx="42" cy="15" rx="7" ry="10" transform="rotate(9 42 15)"></ellipse>
                <ellipse cx="52" cy="24" rx="7" ry="10" transform="rotate(25 52 24)"></ellipse>
                <path d="M17 47c0-11 8-20 15-20 8 0 17 9 17 20 0 8-6 12-13 9-3-1-5-1-8 0-6 3-11-1-11-9z"></path>
              </svg>
            </div>
            <div><h1>PawBook <span class="v2-badge">2.0</span></h1><div class="muted">Libretto sanitario digitale</div></div>
          </div>
        </div>

        ${this._books.length > 1 ? `
          <div class="pet-tabs">
            ${this._books.map((item, index) => `
              <button class="pet-tab ${index === this._selected ? "active" : ""}" data-pet="${index}">
                🐾 ${this.esc(item.profile?.dog_name || item.title)}
              </button>`).join("")}
          </div>` : ""}

        <section class="hero" id="overview">
          <div class="profile">
            <button type="button" class="photo-button" id="edit-photo" title="Aggiungi o modifica la foto">${photo}</button>
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
          <div class="stat"><span>Peso attuale</span><strong>${lastWeight ? `${this.esc(lastWeight.weight)} kg` : "—"}</strong><div class="stat-icon">⚖️</div></div>
          <div class="stat"><span>Prossimo vaccino</span><strong>${nextVax ? this.formatDate(nextVax.expires_on) : "—"}</strong><div class="stat-icon">💉</div></div>
          <div class="stat"><span>Ultima visita</span><strong>${lastVisit ? this.formatDate(lastVisit.date) : "—"}</strong><div class="stat-icon">🩺</div></div>
          <div class="stat"><span>Età</span><strong>${this.esc(this.ageLabel(p.birth_date))}</strong><div class="stat-icon">🎂</div></div>
        </section>

        <nav class="dashboard-nav" aria-label="Sezioni PawBook">
          <button class="active" data-nav-target="overview"><span class="nav-icon">🐾</span><span>Panoramica</span></button>
          <button data-nav-target="health-section"><span class="nav-icon">♡</span><span>Salute</span></button>
          <button data-nav-target="vaccines-section"><span class="nav-icon">💉</span><span>Vaccini</span></button>
          <button data-nav-target="visits-section"><span class="nav-icon">🩺</span><span>Visite</span></button>
          <button data-nav-target="timeline-section"><span class="nav-icon">◴</span><span>Timeline</span></button>
          <button data-nav-target="genealogy-section"><span class="nav-icon">♧</span><span>Genealogia</span></button>
          <button data-nav-target="enci-section"><span class="nav-icon">▤</span><span>ENCI</span></button>
          <button data-nav-target="statistics-section"><span class="nav-icon">▥</span><span>Statistiche</span></button>
          <button data-nav-target="backup-section"><span class="nav-icon">⇅</span><span>Backup</span></button>
        </nav>

        <section class="grid">
          <article class="card" id="health-section">
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

          <article class="card" id="vaccines-section">
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

          <article class="card" id="visits-section">
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

          <article class="card v2-section" id="timeline-section">
            <div class="card-head"><div><h3>🕘 Timeline salute</h3><small class="muted">Gli ultimi eventi sanitari in un'unica cronologia</small></div></div>
            ${timeline.length ? `<div class="timeline">${timeline.map(item => `<div class="timeline-item"><div class="timeline-dot">${item.icon}</div><div class="timeline-date">${this.formatDate(item.date)}</div><div class="timeline-content"><span>${this.esc(item.type)}</span><strong>${this.esc(item.title)}</strong>${item.detail ? `<small>${this.esc(item.detail)}</small>` : ""}</div></div>`).join("")}</div>` : `<div class="empty">Nessun evento disponibile</div>`}
          </article>

          <article class="card v2-section" id="statistics-section">
            <div class="card-head"><div><h3>📊 Statistiche</h3><small class="muted">Una lettura rapida dello storico PawBook</small></div></div>
            <div class="insight-grid">
              <div class="insight"><span>Registrazioni peso</span><strong>${book.weights?.length || 0}</strong><small>${trend ? `Variazione ${trend.delta > 0 ? "+" : ""}${trend.delta} kg` : "Aggiungi almeno due pesi"}</small></div>
              <div class="insight"><span>Vaccinazioni</span><strong>${book.vaccinations?.length || 0}</strong><small>${nextVax ? `Prossimo ${this.formatDate(nextVax.expires_on)}` : "Nessun richiamo futuro"}</small></div>
              <div class="insight"><span>Visite</span><strong>${book.visits?.length || 0}</strong><small>${lastVisit ? `Ultima ${this.formatDate(lastVisit.date)}` : "Nessuna visita"}</small></div>
              <div class="insight"><span>Terapie attive</span><strong>${treatments.length}</strong><small>${treatments.length ? treatments.map(x=>this.esc(x.name)).slice(0,2).join(" · ") : "Nessuna terapia in corso"}</small></div>
            </div>
          </article>

          <article class="card v2-section" id="backup-section">
            <div class="card-head"><div><h3>☁️ Backup e ripristino</h3><small class="muted">Esporta tutti i dati di questo cane in un file JSON portabile</small></div></div>
            <p class="muted">Il backup include profilo, foto, pesi, vaccini, visite, terapie, calori, genealogia e dati ENCI.</p>
            <div class="backup-actions"><button id="export-backup">Esporta backup</button><button class="secondary" id="import-backup">Ripristina backup</button><button class="secondary" id="settings-config">Impostazioni integrazione</button></div>
          </article>

          <article class="card" id="enci-section">
            <div class="card-head"><h3>🏆 ENCI</h3><span><button class="small-btn" id="import-enci">Importa / aggiorna</button> <button class="small-btn secondary" id="open-enci">Apri ENCI</button></span></div>
            <div class="record"><strong>Nome registrato</strong><small>${this.esc(p.enci_name || "—")}</small></div>
            <div class="record"><strong>ROI/RSR</strong><small>${this.esc(p.enci_registry || "—")}</small></div>
            <div class="record"><strong>Pedigree</strong><small>${this.esc(p.pedigree_number || "—")}</small></div>
            <div class="record"><strong>Allevatore</strong><small>${this.esc(p.breeder || "—")}</small></div>
          </article>

          <article class="card wide pedigree-section" id="genealogy-section">
            <div class="card-head"><h3>🌳 Albero genealogico</h3><button class="small-btn" id="edit-genealogy">Modifica albero</button></div>
            ${book.genealogy && Object.keys(book.genealogy).length
              ? `${this.renderPedigree(book.genealogy)}${this.renderEnciPanels(book)}`
              : `<div class="empty">Genealogia non importata</div>`}
          </article>
        </section>
      </div>
      <div id="dialog"></div>
    `;

    this.shadowRoot.querySelector("#refresh")?.addEventListener("click", () => this.loadBooks());
    this.shadowRoot.querySelector("#profile-config")?.addEventListener("click", () => this.openConfig());
    this.shadowRoot.querySelector("#settings-config")?.addEventListener("click", () => this.openConfig());
    this.shadowRoot.querySelector("#export-backup")?.addEventListener("click", () => this.exportBackup());
    this.shadowRoot.querySelector("#import-backup")?.addEventListener("click", () => this.showRestoreBackup());
    this.shadowRoot.querySelector("#edit-photo")?.addEventListener("click", () => this.showPhotoEditor());
    this.shadowRoot.querySelector("#import-enci")?.addEventListener("click", () => this.showEnciSearch());
    this.shadowRoot.querySelector("#open-enci")?.addEventListener("click", () => {
      window.open(p.enci_url || "https://www.enci.it/libro-genealogico/libro-genealogico-on-line", "_blank", "noopener");
    });
    this.shadowRoot.querySelectorAll("[data-nav-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = this.shadowRoot.querySelector(`#${button.dataset.navTarget}`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        this.shadowRoot.querySelectorAll(".dashboard-nav button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
      });
    });
    this.shadowRoot.querySelector("[data-nav-action=\"settings\"]")?.addEventListener("click", () => this.openConfig());
    this.shadowRoot.querySelector("#edit-genealogy")?.addEventListener("click", () => {
      this.showGenealogyEditor();
    });
    this.shadowRoot.querySelectorAll("[data-ancestor]").forEach((card) => {
      card.addEventListener("click", () => {
        try {
          this.showAncestorDetails(JSON.parse(decodeURIComponent(card.dataset.ancestor)));
        } catch (err) {
          console.error("PawBook: impossibile aprire i dettagli dell'antenato", err);
        }
      });
    });
    this.shadowRoot.querySelectorAll("[data-mobile-genealogy-path]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          this._mobileGenealogyPath = JSON.parse(decodeURIComponent(button.dataset.mobileGenealogyPath));
          this.render();
          requestAnimationFrame(() => this.shadowRoot.querySelector("#genealogy-section")?.scrollIntoView({ block:"start" }));
        } catch (err) {
          console.error("PawBook: percorso genealogico mobile non valido", err);
        }
      });
    });
    this.shadowRoot.querySelector("[data-mobile-genealogy-back]")?.addEventListener("click", () => {
      this._mobileGenealogyPath = (this._mobileGenealogyPath || []).slice(0, -1);
      this.render();
      requestAnimationFrame(() => this.shadowRoot.querySelector("#genealogy-section")?.scrollIntoView({ block:"start" }));
    });
    this.shadowRoot.querySelector("[data-mobile-genealogy-root]")?.addEventListener("click", () => {
      this._mobileGenealogyPath = [];
      this.render();
      requestAnimationFrame(() => this.shadowRoot.querySelector("#genealogy-section")?.scrollIntoView({ block:"start" }));
    });
    this.shadowRoot.querySelector("[data-mobile-ancestor-details]")?.addEventListener("click", (buttonEvent) => {
      try {
        this.showAncestorDetails(JSON.parse(decodeURIComponent(buttonEvent.currentTarget.dataset.mobileAncestorDetails)));
      } catch (err) {
        console.error("PawBook: impossibile aprire i dettagli ENCI mobile", err);
      }
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
        this._mobileGenealogyPath = [];
        this.render();
      })
    );
  }
}

if (!customElements.get("pawbook-panel-v202")) {
  customElements.define("pawbook-panel-v202", PawBookPanelV202);
}
