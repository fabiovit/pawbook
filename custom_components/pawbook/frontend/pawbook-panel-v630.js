class PawBookPanelV420 extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._books = [];
    this._selected = 0;
    this._loading = true;
    this._error = "";
    this._mobileGenealogyPath = [];
    this._calendarOffset = 0;
    this._activeView = "overview";
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

  vaccinationGroups(book) {
    const groups = new Map();
    for (const item of (book.vaccinations || [])) {
      const name = String(item.name || "Vaccinazione").trim() || "Vaccinazione";
      const key = name.toLocaleLowerCase("it-IT");
      if (!groups.has(key)) groups.set(key, { name, items: [] });
      groups.get(key).items.push(item);
    }
    return [...groups.values()].map(group => {
      group.items.sort((a,b) => String(b.administered_on || "").localeCompare(String(a.administered_on || "")));
      group.latest = group.items[0] || null;
      group.next = group.items
        .filter(x => x.expires_on)
        .sort((a,b) => String(b.expires_on).localeCompare(String(a.expires_on)))[0] || null;
      return group;
    }).sort((a,b) => String(b.latest?.administered_on || "").localeCompare(String(a.latest?.administered_on || "")));
  }

  vaccinationStatus(group) {
    const expiry = group?.next?.expires_on;
    if (!expiry) return { key:"history", label:"Storico", icon:"⚪" };
    const today = new Date(); today.setHours(0,0,0,0);
    const date = new Date(`${expiry}T00:00:00`);
    if (Number.isNaN(date.getTime())) return { key:"history", label:"Storico", icon:"⚪" };
    const days = Math.ceil((date - today) / 86400000);
    if (days < 0) return { key:"expired", label:"Scaduto", icon:"🔴", days };
    if (days <= 30) return { key:"warning", label:"In scadenza", icon:"🟡", days };
    return { key:"ok", label:"In regola", icon:"🟢", days };
  }

  visitCategory(item) {
    const text = `${item?.reason || ""} ${item?.outcome || ""} ${item?.notes || ""}`.toLowerCase();
    const rules = [
      ["Intervento", "🏥", ["intervento", "chirurg", "operaz"]],
      ["Esami", "🧪", ["esame", "analisi", "laboratorio", "sangue", "urine", "citolog", "istolog"]],
      ["Diagnostica", "🩻", ["radiograf", "rx", "ecograf", "tac", "risonanza", "diagnostic"]],
      ["Specialistica", "❤️", ["cardiolog", "ortoped", "dermatolog", "oculist", "neurolog", "gastro", "specialist"]],
      ["Controllo", "🩺", ["controllo", "check", "visita", "richiamo"]],
    ];
    for (const [label, icon, words] of rules) {
      if (words.some(word => text.includes(word))) return { label, icon };
    }
    return { label: "Visita", icon: "🩺" };
  }

  visitStats(book) {
    const visits = [...(book.visits || [])].filter(v => v.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const vets = new Set(visits.map(v => (v.veterinarian || "").trim()).filter(Boolean));
    const categories = new Map();
    visits.forEach(v => {
      const cat = this.visitCategory(v);
      categories.set(cat.label, (categories.get(cat.label) || 0) + 1);
    });
    let daysSince = null;
    if (visits[0]?.date) {
      const d = new Date(`${visits[0].date}T00:00:00`), today = new Date(); today.setHours(0,0,0,0);
      daysSince = Math.max(0, Math.round((today-d)/86400000));
    }
    return { visits, vets: vets.size, categories, last: visits[0] || null, daysSince };
  }

  visitAttachments(book, recordId) {
    return (book.attachments || []).filter(a => a.category === "visits" && a.record_id === recordId);
  }

  renderVisitAttachments(book, recordId) {
    const rows = this.visitAttachments(book, recordId);
    if (!rows.length) return "";
    return `<div class="visit-attachments">${rows.map(a=>`<a href="${this.esc(a.data)}" download="${this.esc(a.name)}">📎 ${this.esc(a.name)}</a>`).join("")}</div>`;
  }

  treatmentAttachments(book, recordId) {
    return (book.attachments || []).filter(a => a.category === "treatments" && a.record_id === recordId);
  }

  renderTreatmentAttachments(book, recordId) {
    const rows = this.treatmentAttachments(book, recordId);
    if (!rows.length) return "";
    return `<div class="treatment-attachments">${rows.map(a=>`<a href="${this.esc(a.data)}" download="${this.esc(a.name)}">📎 ${this.esc(a.name)}</a>`).join("")}</div>`;
  }

  treatmentStatus(item) {
    const today = new Date().toISOString().slice(0,10);
    if (item?.starts_on && item.starts_on > today) return { key:"upcoming", label:"Programmata", icon:"🗓️" };
    if (item?.ends_on && item.ends_on < today) return { key:"completed", label:"Terminata", icon:"✅" };
    return { key:"active", label:"In corso", icon:"💊" };
  }

  treatmentProgress(item) {
    if (!item?.starts_on || !item?.ends_on) return null;
    const start = new Date(`${item.starts_on}T00:00:00`);
    const end = new Date(`${item.ends_on}T00:00:00`);
    const today = new Date(); today.setHours(0,0,0,0);
    const total = Math.max(1, Math.round((end-start)/86400000)+1);
    const elapsed = Math.max(0, Math.min(total, Math.round((today-start)/86400000)+1));
    return { total, elapsed, percent: Math.max(0, Math.min(100, Math.round(elapsed/total*100))) };
  }

  treatmentStats(book) {
    const items = [...(book.treatments || [])].sort((a,b)=>String(b.starts_on||"").localeCompare(String(a.starts_on||"")));
    const active=[], upcoming=[], completed=[];
    items.forEach(item => { const status=this.treatmentStatus(item); if (status.key === "active") active.push(item); else if (status.key === "upcoming") upcoming.push(item); else completed.push(item); });
    const medicines = new Set(items.map(x => String(x.name||"").trim().toLowerCase()).filter(Boolean));
    return { items, active, upcoming, completed, medicines: medicines.size };
  }

  heatCycleStats(book) {
    const parse = value => {
      if (!value) return null;
      const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return null;
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    };
    const iso = date =>
      `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const addDays = (date, days) => {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d;
    };
    const median = values => {
      if (!values.length) return null;
      const sorted = [...values].sort((a,b) => a-b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid-1] + sorted[mid]) / 2);
    };

    const cycles = [...(book.heat_cycles || [])]
      .filter(x => parse(x.starts_on))
      .sort((a,b) => String(a.starts_on).localeCompare(String(b.starts_on)));

    const durations = cycles.map(x => {
      const s = parse(x.starts_on), e = parse(x.ends_on);
      return s && e ? Math.max(1, Math.round((e-s)/86400000) + 1) : null;
    }).filter(Number.isFinite);

    const intervals = [];
    for (let i=1; i<cycles.length; i++) {
      const prev = parse(cycles[i-1].starts_on);
      const cur = parse(cycles[i].starts_on);
      if (prev && cur) intervals.push(Math.round((cur-prev)/86400000));
    }

    const medianInterval = median(intervals);
    const avgDuration = durations.length
      ? Math.round(durations.reduce((a,b)=>a+b,0) / durations.length)
      : null;
    const last = cycles.length ? cycles.at(-1) : null;

    let forecast = null;
    if (last && medianInterval) {
      const center = addDays(parse(last.starts_on), medianInterval);
      const deviations = intervals.map(v => Math.abs(v - medianInterval));
      const observedSpread = median(deviations) || 0;

      // Prudente: almeno +/- 21 giorni, massimo +/- 60.
      const halfWindow = Math.max(21, Math.min(60, observedSpread + 21));

      const confidence =
        intervals.length >= 4 ? "Buona" :
        intervals.length >= 2 ? "Indicativa" :
        "Limitata";

      forecast = {
        center: iso(center),
        from: iso(addDays(center, -halfWindow)),
        to: iso(addDays(center, halfWindow)),
        confidence,
        cyclesUsed: cycles.length,
        intervalsUsed: intervals.length
      };
    }

    return {
      cycles: [...cycles].reverse(),
      durations,
      intervals,
      medianInterval,
      avgDuration,
      last,
      forecast
    };
  }

  heatDuration(item) {
    if (!item?.starts_on || !item?.ends_on) return null;
    const start = new Date(`${item.starts_on}T00:00:00`);
    const end = new Date(`${item.ends_on}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return Math.max(1, Math.round((end-start)/86400000) + 1);
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

  smartReminders(book) {
    const today = new Date(); today.setHours(0,0,0,0);
    const daysBetween = value => {
      if (!value) return null;
      const date = new Date(`${value}T00:00:00`);
      if (Number.isNaN(date.getTime())) return null;
      return Math.ceil((date - today) / 86400000);
    };
    const reminders = [];
    this.vaccinationGroups(book).forEach(group => {
      const status = this.vaccinationStatus(group);
      if (status.key === "expired") reminders.push({level:"danger",icon:"💉",title:`${group.name}: richiamo scaduto`,detail:`Scaduto da ${Math.abs(status.days)} giorni`,target:"vaccines-section",priority:1});
      else if (status.key === "warning") reminders.push({level:"warn",icon:"💉",title:`${group.name}: richiamo vicino`,detail:`Tra ${status.days} giorni`,target:"vaccines-section",priority:2});
    });
    (book.treatments || []).forEach(item => {
      const days = daysBetween(item.ends_on);
      if (days !== null && days >= 0 && days <= 3) reminders.push({level:"warn",icon:"💊",title:`Termina ${item.name || "terapia"}`,detail:days===0?"Termina oggi":`Tra ${days} ${days===1?"giorno":"giorni"}`,target:"treatments-section",priority:2});
    });
    const visits=[...(book.visits||[])].filter(x=>x.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    if (!visits.length) reminders.push({level:"info",icon:"🩺",title:"Nessuna visita registrata",detail:"Aggiungi la prima visita veterinaria",target:"visits-section",priority:4});
    else {
      const since=Math.abs(daysBetween(visits[0].date) ?? 0);
      if (since>365) reminders.push({level:"warn",icon:"🩺",title:"Visita da programmare",detail:`Ultima visita ${since} giorni fa`,target:"visits-section",priority:3});
    }
    const weights=[...(book.weights||[])].filter(x=>x.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    if (weights.length) {
      const since=Math.abs(daysBetween(weights[0].date) ?? 0);
      if (since>30) reminders.push({level:"info",icon:"⚖️",title:"Peso da aggiornare",detail:`Ultima pesata ${since} giorni fa`,target:"health-section",priority:5});
    }
    const heat=this.heatCycleStats(book).forecast;
    if (heat) {
      const todayIso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
      const untilWindow=daysBetween(heat.from);
      if (heat.from<=todayIso && heat.to>=todayIso) reminders.push({level:"info",icon:"🌸",title:"Finestra stimata del calore",detail:`${this.formatDate(heat.from)} – ${this.formatDate(heat.to)}`,target:"heat-section",priority:3});
      else if (untilWindow!==null && untilWindow>0 && untilWindow<=30) reminders.push({level:"info",icon:"🌸",title:"Finestra del calore in avvicinamento",detail:`Inizia indicativamente tra ${untilWindow} giorni`,target:"heat-section",priority:4});
    }
    return reminders.sort((a,b)=>a.priority-b.priority);
  }

  familyOverview() {
    const today = new Date().toISOString().slice(0,10);
    const pets = this._books.map((book,index) => {
      const profile = book.profile || {};
      const weights = [...(book.weights || [])].filter(x=>x.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      const nextVax = this.nextVaccination(book);
      const visits = [...(book.visits || [])].filter(x=>x.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      const reminders = this.smartReminders(book);
      const heat = this.heatCycleStats(book).forecast;
      return {
        index,
        name: profile.dog_name || book.title || `Animale ${index+1}`,
        breed: profile.breed || "Razza non inserita",
        photo: profile.photo_url || "",
        weight: weights[0]?.weight ?? null,
        nextVax,
        lastVisit: visits[0] || null,
        reminders,
        heat,
      };
    });

    const reminders = [];
    pets.forEach(pet => pet.reminders.forEach(item => reminders.push({...item, petIndex:pet.index, petName:pet.name})));
    reminders.sort((a,b)=>(a.priority||99)-(b.priority||99));

    const events = [];
    this._books.forEach((book,index) => {
      const name = pets[index]?.name || book.title;
      this.healthCalendarEvents(book).forEach(event => {
        if (event.date >= today) events.push({...event, petIndex:index, petName:name});
      });
    });
    events.sort((a,b)=>String(a.date).localeCompare(String(b.date)));

    return { pets, reminders, upcoming:events.slice(0,10) };
  }

  healthCalendarEvents(book) {
    const events = [];
    (book.vaccinations || []).forEach(item => {
      if (item.expires_on) events.push({date:item.expires_on, type:"vaccination", icon:"💉", title:item.name || "Richiamo vaccino"});
    });
    (book.treatments || []).forEach(item => {
      if (item.starts_on) events.push({date:item.starts_on, type:"treatment", icon:"💊", title:`Inizio ${item.name || "terapia"}`});
      if (item.ends_on) events.push({date:item.ends_on, type:"treatment", icon:"💊", title:`Fine ${item.name || "terapia"}`});
    });
    const heat = this.heatCycleStats(book).forecast;
    if (heat) {
      events.push({date:heat.center, type:"heat", icon:"🌸", title:"Prossimo calore stimato", estimate:true});
    }
    return events.filter(item=>item.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }

  healthCalendarMonth(book) {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + (this._calendarOffset || 0), 1);
    const year = first.getFullYear(), month = first.getMonth();
    const monthStart = new Date(year, month, 1);
    const weekday = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - weekday);
    const events = this.healthCalendarEvents(book);
    const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const days = [];
    for (let index=0; index<42; index++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const key = iso(date);
      days.push({
        date:key,
        day:date.getDate(),
        currentMonth:date.getMonth() === month,
        today:key === iso(now),
        events:events.filter(item=>item.date === key),
      });
    }
    return {
      label:new Intl.DateTimeFormat("it-IT",{month:"long",year:"numeric"}).format(first),
      days,
      upcoming:events.filter(item=>item.date >= iso(now)).slice(0,6),
    };
  }

  weightTrend(book) {
    const values = [...(book.weights || [])].filter(x => Number.isFinite(Number(x.weight))).sort((a,b) => String(a.date||"").localeCompare(String(b.date||"")));
    if (values.length < 2) return null;
    const first = Number(values[0].weight), last = Number(values.at(-1).weight);
    return { first, last, delta: Math.round((last-first)*10)/10, count: values.length };
  }

  weightStats(book) {
    const items = [...(book.weights || [])]
      .filter(x => x?.date && Number.isFinite(Number(x.weight)))
      .sort((a,b) => String(a.date).localeCompare(String(b.date)));
    if (!items.length) {
      return { items: [], latest: null, previous: null, delta: null, totalDelta: null, min: null, max: null, average: null, daysSince: null, years: [] };
    }
    const latest = items.at(-1);
    const previous = items.length > 1 ? items.at(-2) : null;
    const round1 = n => Math.round(n * 10) / 10;
    const delta = previous ? round1(Number(latest.weight) - Number(previous.weight)) : null;
    const totalDelta = items.length > 1 ? round1(Number(latest.weight) - Number(items[0].weight)) : null;
    const weights = items.map(x => Number(x.weight));
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const average = round1(weights.reduce((sum, n) => sum + n, 0) / weights.length);
    const today = new Date(); today.setHours(0,0,0,0);
    const lastDate = new Date(`${latest.date}T00:00:00`);
    const daysSince = Math.max(0, Math.round((today - lastDate) / 86400000));
    const groups = new Map();
    [...items].reverse().forEach(item => {
      const year = String(item.date || "").slice(0,4) || "—";
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(item);
    });
    return {
      items, latest, previous, delta, totalDelta,
      min: round1(min), max: round1(max), average, daysSince,
      years: [...groups.entries()].map(([year, rows]) => ({ year, rows }))
    };
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
    const editLabel = editMode && kind === "heat"
      ? `Modifica ciclo di calore · ${this.formatDate(record?.starts_on)}${record?.ends_on ? ` → ${this.formatDate(record.ends_on)}` : ""}`
      : editMode ? `Modifica ${spec.title.replace("Aggiungi ", "").replace("Registra ", "")}` : spec.title;
    const editContext = editMode && kind === "heat"
      ? `<div class="edit-context"><span>❤️</span><strong>Ciclo iniziato il ${this.formatDate(record?.starts_on)}</strong><small>${record?.ends_on ? `Fine ${this.formatDate(record.ends_on)}` : "In corso"}</small></div>`
      : "";
    const dialog = this.shadowRoot.querySelector("#dialog");
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-card">
          <div class="modal-head">
            <h2>${this.esc(editLabel)}</h2>
            <button class="icon-btn" data-close aria-label="Chiudi">✕</button>
          </div>
          ${editContext}
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
      const confirmed = confirm(kind === "heat"
        ? `Eliminare definitivamente il ciclo iniziato il ${this.formatDate(record?.starts_on)}?`
        : "Eliminare definitivamente questa registrazione?");
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
    const root = book.genealogy || {};
    const info = (label, value) => `<div class="enci-field"><span>${this.esc(label)}</span><strong>${this.esc(value || "—")}</strong></div>`;
    const healthEvent = needle => events.find(item => `${item.TIPO || ""} ${item.AVVENIMENTO || ""}`.toUpperCase().includes(needle));
    const hdEvent = healthEvent("DISPLASIA ANCA");
    const edEvent = healthEvent("DISPLASIA GOMITO");
    const dnaEvent = events.find(item => {
      const text = `${item.TIPO || ""} ${item.AVVENIMENTO || ""}`.toUpperCase();
      return text.includes("CAMPIONE BIOLOGICO") || text.includes("DNA");
    });
    const extractGrade = (item, kind) => {
      if (!item) return "—";
      const text = String(item.AVVENIMENTO || "").toUpperCase();
      if (kind === "HD") {
        const match = text.match(/HD[.\s]*([A-E])(?:\s*\((\d+)\))?/);
        return match ? `${match[1]}${match[2] ? ` (${match[2]})` : ""}` : text.replace("DISPLASIA ANCA", "").trim() || "Registrato";
      }
      const match = text.match(/ED\s*\(?(\d+)\)?/);
      return match ? match[1] : text.replace("DISPLASIA GOMITO", "").trim() || "Registrato";
    };
    const dateOf = item => item ? (item.DATA_CHAR || (item.DATA ? this.formatDate(item.DATA) : "—")) : "—";
    const ancestorCount = (() => {
      let count = 0;
      const walk = node => {
        if (!node) return;
        if (node !== root && node.name) count += 1;
        walk(node.father); walk(node.mother);
      };
      walk(root); return count;
    })();
    return `
      <div class="enci-pro-hero">
        <div><span class="enci-pro-kicker">🧬 ENCI Pro</span><h3>${this.esc(p.enci_name || p.dog_name || root.name || "Profilo ENCI")}</h3>
        <p>${this.esc(p.enci_registry || root.roi || "Registro non disponibile")}${p.breed ? ` · ${this.esc(p.breed)}` : ""}</p></div>
        <div class="enci-pro-status"><span class="life-status ${p.deceased ? "deceased" : "alive"}"><i></i>${p.deceased ? "Deceduto" : "Vivo"}</span></div>
      </div>
      <div class="enci-pro-summary">
        <div class="enci-pro-stat"><span>🦴 HD</span><strong>${this.esc(extractGrade(hdEvent, "HD"))}</strong><small>${this.esc(dateOf(hdEvent))}</small></div>
        <div class="enci-pro-stat"><span>💪 ED</span><strong>${this.esc(extractGrade(edEvent, "ED"))}</strong><small>${this.esc(dateOf(edEvent))}</small></div>
        <div class="enci-pro-stat"><span>🧬 DNA</span><strong>${dnaEvent ? "Disponibile" : "—"}</strong><small>${this.esc(dnaEvent ? (dnaEvent.AVVENIMENTO || dateOf(dnaEvent)) : "Nessun dato")}</small></div>
        <div class="enci-pro-stat"><span>🌳 Pedigree</span><strong>${ancestorCount}</strong><small>antenati disponibili</small></div>
      </div>
      <div class="enci-panels">
        <section class="enci-panel"><h4>👥 Anagrafica ENCI</h4><div class="enci-info-grid">
          ${info("Razza", p.breed)}${info("Mantello", p.color)}${info("Sesso", p.sex)}
          ${info("Data di nascita", p.birth_date ? this.formatDate(p.birth_date) : "")}${info("Allevatore", p.breeder)}${info("Proprietario", p.owner)}
          ${info("Microchip", p.microchip)}${info("ROI / LOI", p.enci_registry)}${info("Padre", p.father)}${info("Madre", p.mother)}
        </div></section>
        <section class="enci-panel"><h4>🩺 Salute ufficiale</h4><div class="enci-health-official">
          <div><span>Displasia anca</span><strong>${this.esc(extractGrade(hdEvent, "HD"))}</strong><small>${this.esc(dateOf(hdEvent))}</small></div>
          <div><span>Displasia gomito</span><strong>${this.esc(extractGrade(edEvent, "ED"))}</strong><small>${this.esc(dateOf(edEvent))}</small></div>
          <div><span>Campione biologico / DNA</span><strong>${dnaEvent ? "Registrato" : "Non disponibile"}</strong><small>${this.esc(dnaEvent?.AVVENIMENTO || "—")}</small></div>
        </div></section>
        <section class="enci-panel"><h4>🩺 Avvenimenti ENCI <span class="enci-count">${events.length}</span></h4>
          ${events.length ? `<div class="enci-events">${events.map(item => `<div class="enci-event"><span>${this.esc(item.DATA_CHAR || (item.DATA ? this.formatDate(item.DATA) : "—"))}</span><strong>${this.esc(item.TIPO || "Avvenimento")}</strong><small>${this.esc(item.AVVENIMENTO || "—")}${item.CODICE ? ` · ${this.esc(item.CODICE)}` : ""}</small></div>`).join("")}</div>` : `<div class="empty">Nessun avvenimento disponibile</div>`}
        </section>
        <section class="enci-panel"><h4>📄 Documenti sanitari ENCI</h4>
          <div class="document-status"><span>Documenti sanitari</span><strong>${Array.isArray(docs.Dto) && docs.Dto.length ? `${docs.Dto.length} disponibili` : "Nessun documento disponibile"}</strong></div>
          <div class="document-status"><span>Carta dentaria</span><strong>${dental.length ? `${dental.length} disponibile` : "Nessuna carta dentaria disponibile"}</strong></div>
        </section>
      </div>
      <div class="enci-note">ℹ️ I dati sono importati dal Libro genealogico ENCI e potrebbero non essere completi. Verifica sempre con la documentazione ufficiale.</div>`;
  }

  smartHealth(book) {
    const today = new Date(); today.setHours(0,0,0,0);
    const notes = [];
    const next = this.nextVaccination(book);
    if (next?.expires_on) {
      const d = new Date(`${next.expires_on}T00:00:00`);
      const days = Math.round((d - today) / 86400000);
      if (days < 0) notes.push({level:"danger", icon:"💉", text:`${next.name || "Vaccino"} scaduto da ${Math.abs(days)} giorni`});
      else if (days <= 30) notes.push({level:"warn", icon:"💉", text:`${next.name || "Vaccino"}: richiamo tra ${days} giorni`});
      else notes.push({level:"ok", icon:"💉", text:`Prossimo richiamo tra ${days} giorni`});
    } else notes.push({level:"info", icon:"💉", text:"Nessun richiamo vaccinale futuro registrato"});

    const visit = this.latest(book.visits, "date");
    if (visit?.date) {
      const d = new Date(`${visit.date}T00:00:00`);
      const days = Math.max(0, Math.round((today - d) / 86400000));
      notes.push({level: days > 365 ? "warn" : "ok", icon:"🩺", text:`Ultima visita ${days} giorni fa${days > 365 ? " · valuta se programmare un controllo" : ""}`});
    } else notes.push({level:"warn", icon:"🩺", text:"Nessuna visita veterinaria registrata"});

    const weight = this.latest(book.weights, "date");
    if (weight?.date) {
      const d = new Date(`${weight.date}T00:00:00`);
      const days = Math.max(0, Math.round((today - d) / 86400000));
      notes.push({level: days > 30 ? "warn" : "ok", icon:"⚖️", text:`Ultimo peso ${weight.weight} kg · ${days} giorni fa`});
    } else notes.push({level:"info", icon:"⚖️", text:"Nessun peso registrato"});

    const active = this.activeTreatments(book);
    notes.push({level: active.length ? "info" : "ok", icon:"💊", text: active.length ? `${active.length} terapia${active.length > 1 ? "e" : ""} attiva${active.length > 1 ? "e" : ""}: ${active.map(x=>x.name).filter(Boolean).slice(0,2).join(", ")}` : "Nessuna terapia attiva"});
    return notes;
  }

  weightChart(book) {
    const rows = [...(book.weights || [])].filter(x => x.date && Number.isFinite(Number(x.weight))).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-36);
    if (rows.length < 2) return `<div class="empty">Servono almeno due pesate per il grafico</div>`;
    const values = rows.map(x=>Number(x.weight));
    const min = Math.min(...values), max = Math.max(...values), span = Math.max(.5, max-min);
    const W=720,H=230,pad=30;
    const pts = rows.map((x,i)=>{
      const px = pad + (i/(rows.length-1))*(W-pad*2);
      const py = H-pad - ((Number(x.weight)-min)/span)*(H-pad*2);
      return [px,py,x];
    });
    const line=pts.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return `<div class="chart-wrap"><svg class="weight-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento peso"><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" class="chart-axis"/><polyline points="${line}" class="chart-line"/>${pts.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="5" class="chart-point"><title>${this.esc(r.weight)} kg · ${this.formatDate(r.date)}</title></circle>`).join("")}</svg><div class="chart-caption"><span>${this.formatDate(rows[0].date)} · ${rows[0].weight} kg</span><span>${this.formatDate(rows.at(-1).date)} · ${rows.at(-1).weight} kg</span></div></div>`;
  }

  showAttachmentDialog(category = "general", recordId = "", heading = "Allegati") {
    const book = this._books[this._selected]; if (!book) return;
    const dialog = this.shadowRoot.querySelector("#dialog");
    dialog.innerHTML = `<div class="modal"><div class="modal-card"><div class="modal-head"><div><h2>${this.esc(heading)}</h2><p class="muted">Salva localmente referti, analisi e immagini. Max circa 2,5 MB per file.</p></div><button class="icon-btn" data-close>✕</button></div><label style="display:block;margin-top:16px"><span>File</span><input id="attachment-file" type="file" accept="image/*,application/pdf"></label><div class="modal-actions"><button class="secondary" data-close>Annulla</button><button id="save-attachment" disabled>Salva allegato</button></div></div></div>`;
    dialog.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>dialog.innerHTML=""));
    const input=dialog.querySelector("#attachment-file"), btn=dialog.querySelector("#save-attachment");
    let payload=null,file=null;
    input?.addEventListener("change", async e=>{
      file=e.target.files?.[0] || null; payload=null; btn.disabled=true;
      if (!file) return;
      if (file.size > 2.5*1024*1024) { alert("File troppo grande: massimo circa 2,5 MB"); input.value=""; return; }
      payload=await new Promise((resolve,reject)=>{const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file);});
      btn.disabled=false;
    });
    btn?.addEventListener("click", async ()=>{
      if (!payload || !file) return; btn.disabled=true; btn.textContent="Salvataggio…";
      try { await this._hass.callWS({type:"pawbook/add_attachment",entry_id:book.entry_id,name:file.name,mime_type:file.type||"application/octet-stream",data:payload,category,record_id:recordId}); await this.loadBooks(); dialog.innerHTML=""; }
      catch(err){btn.disabled=false;btn.textContent="Salva allegato";alert(`Errore allegato: ${err?.message||err}`);}
    });
  }

  async deleteAttachment(id) {
    const book=this._books[this._selected]; if(!book || !confirm("Eliminare questo allegato?")) return;
    try { await this._hass.callWS({type:"pawbook/delete_attachment",entry_id:book.entry_id,attachment_id:id}); await this.loadBooks(); }
    catch(err){alert(`Errore: ${err?.message||err}`);}
  }

  printReport() {
    const book=this._books[this._selected]; if(!book) return;
    const p=book.profile||{}, w=window.open("","_blank"); if(!w) return;
    const rows=(arr,fn)=>arr?.length?arr.map(fn).join(""):`<p>—</p>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>PawBook · ${this.esc(p.dog_name||book.title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#152033;max-width:900px;margin:36px auto;padding:0 24px}h1{color:#1565c0}h2{margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:6px}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.item{padding:8px 0;border-bottom:1px solid #eee}small{color:#667}@media print{button{display:none}body{margin:0}}</style></head><body><button onclick="window.print()">Stampa / Salva PDF</button><h1>🐾 PawBook · ${this.esc(p.dog_name||book.title)}</h1><div class="meta"><div><b>Razza:</b> ${this.esc(p.breed||"—")}</div><div><b>Nascita:</b> ${this.formatDate(p.birth_date)}</div><div><b>Microchip:</b> ${this.esc(p.microchip||"—")}</div><div><b>ENCI:</b> ${this.esc(p.enci_registry||"—")}</div></div><h2>Vaccinazioni</h2>${rows(book.vaccinations,x=>`<div class="item"><b>${this.esc(x.name||"")}</b><br><small>${this.formatDate(x.administered_on)}${x.expires_on?` · richiamo ${this.formatDate(x.expires_on)}`:""}</small></div>`)}<h2>Visite</h2>${rows(book.visits,x=>`<div class="item"><b>${this.esc(x.reason||"")}</b><br><small>${this.formatDate(x.date)} · ${this.esc(x.veterinarian||"")}</small><br>${this.esc(x.outcome||x.notes||"")}</div>`)}<h2>Terapie</h2>${rows(book.treatments,x=>`<div class="item"><b>${this.esc(x.name||"")}</b><br><small>${this.formatDate(x.starts_on)}${x.ends_on?` → ${this.formatDate(x.ends_on)}`:""} · ${this.esc(x.dosage||"")}</small></div>`)}<h2>Pesi</h2>${rows(book.weights,x=>`<div class="item">${this.formatDate(x.date)} · <b>${this.esc(x.weight)} kg</b></div>`)}<p><small>Report generato da PawBook. Non sostituisce la documentazione veterinaria ufficiale.</small></p></body></html>`);
    w.document.close();
  }


  applyPageView() {
    const root = this.shadowRoot;
    if (!root) return;

    const view = this._activeView || "overview";
    const overview = root.querySelector("#overview");
    const grid = root.querySelector(".grid");
    const articles = [...root.querySelectorAll(".grid > article[id]")];

    const managementIds = [
      "health-section",
      "vaccines-section",
      "visits-section",
      "treatments-section",
      "heat-section"
    ];

    const diagnosticsIds = [
      "statistics-section",
      "documents-section",
      "report-section",
      "backup-section"
    ];

    if (overview) overview.style.display = view === "overview" ? "" : "none";
    if (grid) grid.style.display = view === "overview" ? "none" : "grid";

    articles.forEach((article) => {
      let show = false;

      if (view === "management-section") {
        show = article.id === "management-intro";
      } else if (view === "diagnostics-section") {
        show = article.id === "diagnostics-intro" || diagnosticsIds.includes(article.id);
      } else {
        show = article.id === view;
      }

      article.style.setProperty("display", show ? "" : "none", show ? "" : "important");
      article.classList.toggle("pb-page-active", show);
      article.classList.toggle("pb-management-card", view === "management-section" && show);
      article.classList.toggle("pb-diagnostics-card", view === "diagnostics-section" && show);
    });

    const managementIntro = root.querySelector("#management-intro");
    if (managementIntro) {
      managementIntro.style.setProperty(
        "display",
        view === "management-section" ? "block" : "none",
        "important"
      );
    }

    const diagnosticsIntro = root.querySelector("#diagnostics-intro");
    if (diagnosticsIntro) {
      diagnosticsIntro.style.setProperty(
        "display",
        view === "diagnostics-section" ? "block" : "none",
        "important"
      );
    }

    root.querySelectorAll(".dashboard-nav button[data-nav-target]").forEach((button) => {
      button.classList.toggle("active", button.dataset.navTarget === view);
    });

    root.querySelector(".page")?.classList.toggle("pb-subpage-mode", view !== "overview");
    root.querySelector(".page")?.classList.toggle("pb-management-mode", view === "management-section");
    root.querySelector(".page")?.classList.toggle("pb-diagnostics-mode", view === "diagnostics-section");
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

      .smart-list { display:grid; gap:10px; }
      .smart-item { display:grid; grid-template-columns:36px 1fr; gap:10px; align-items:center; padding:12px 14px; border-radius:14px; background:var(--secondary-background-color); }
      .smart-item .smart-icon { font-size:22px; }
      .smart-item.ok { border-left:4px solid #2eaf64; } .smart-item.warn { border-left:4px solid #f0a000; } .smart-item.danger { border-left:4px solid #d64545; } .smart-item.info { border-left:4px solid var(--primary-color); }
      .chart-wrap { overflow:hidden; } .weight-chart { width:100%; min-height:190px; } .chart-axis { stroke:var(--divider-color); stroke-width:2; } .chart-line { fill:none; stroke:var(--primary-color); stroke-width:4; stroke-linecap:round; stroke-linejoin:round; } .chart-point { fill:var(--card-background-color); stroke:var(--primary-color); stroke-width:3; } .chart-caption { display:flex; justify-content:space-between; color:var(--secondary-text-color); font-size:12px; }
      .attachment-list { display:grid; gap:8px; } .attachment { display:grid; grid-template-columns:1fr auto auto; gap:8px; align-items:center; padding:10px 0; border-top:1px solid var(--divider-color); } .attachment:first-child{border-top:0}.attachment a{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--primary-color);font-weight:600}.report-actions{display:flex;gap:10px;flex-wrap:wrap}
      .dashboard-nav { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:4px; margin:4px 0 24px; padding:14px 12px 8px; border-radius:24px; background:var(--card-background-color); box-shadow:var(--ha-card-box-shadow,0 2px 12px rgba(0,0,0,.06)); }
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
      .home-overview { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:0 0 18px; }
      .home-tile { min-width:0; display:flex; align-items:center; gap:13px; padding:17px; text-align:left; border-radius:20px; background:var(--card-background-color); color:var(--primary-text-color); border:1px solid var(--divider-color); box-shadow:var(--ha-card-box-shadow,0 1px 8px rgba(0,0,0,.05)); }
      .home-tile:hover { transform:translateY(-1px); border-color:color-mix(in srgb,var(--primary-color) 55%,var(--divider-color)); }
      .home-tile-icon { flex:0 0 46px; width:46px; height:46px; display:grid; place-items:center; border-radius:15px; background:var(--secondary-background-color); font-size:24px; }
      .home-tile > span:last-child { min-width:0; }
      .home-tile small,.home-tile strong,.home-tile em { display:block; }
      .home-tile small { color:var(--secondary-text-color); font-size:12px; }
      .home-tile strong { margin-top:3px; font-size:17px; line-height:1.15; }
      .home-tile em { margin-top:5px; color:var(--secondary-text-color); font-size:11px; font-style:normal; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .weight-center-hero { display:grid; grid-template-columns:minmax(0,1.35fr) repeat(2,minmax(150px,.65fr)); gap:12px; margin:14px 0 16px; }
      .weight-center-hero > div { border:1px solid var(--divider-color); border-radius:17px; padding:16px; background:linear-gradient(145deg,var(--secondary-background-color),var(--card-background-color)); }
      .weight-center-hero .primary { display:flex; gap:13px; align-items:center; }
      .weight-center-hero .hero-icon { width:46px; height:46px; border-radius:14px; display:grid; place-items:center; background:color-mix(in srgb,var(--primary-color) 14%,transparent); font-size:24px; }
      .weight-center-hero span,.weight-center-hero small,.weight-center-hero strong { display:block; }
      .weight-center-hero span,.weight-center-hero small { color:var(--secondary-text-color); }
      .weight-center-hero strong { margin:3px 0; font-size:20px; }
      .weight-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:14px 0 16px; }
      .weight-summary > div { padding:13px 14px; border:1px solid var(--divider-color); border-radius:15px; background:var(--secondary-background-color); }
      .weight-summary span,.weight-summary strong,.weight-summary small { display:block; }
      .weight-summary span,.weight-summary small { color:var(--secondary-text-color); font-size:12px; }
      .weight-summary strong { margin:3px 0; font-size:21px; }
      .weight-delta { display:inline-flex !important; align-items:center; width:max-content; padding:4px 8px; border-radius:999px; margin-top:5px; font-weight:700; font-size:11px !important; }
      .weight-delta.up { color:#9a5b00; background:rgba(245,158,11,.14); }
      .weight-delta.down { color:#1565c0; background:rgba(33,150,243,.12); }
      .weight-delta.stable { color:#2e7d32; background:rgba(46,125,50,.12); }
      .weight-chart-panel { margin:16px 0; padding:14px; border:1px solid var(--divider-color); border-radius:17px; background:var(--secondary-background-color); }
      .weight-chart-panel h4 { margin:0 0 10px; }
      .weight-history { display:grid; gap:10px; margin-top:14px; }
      .weight-year { border:1px solid var(--divider-color); border-radius:17px; overflow:hidden; background:var(--card-background-color); }
      .weight-year > summary { list-style:none; cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:13px 16px; font-weight:800; background:var(--secondary-background-color); }
      .weight-year > summary::-webkit-details-marker { display:none; }
      .weight-year-list { padding:4px 14px 8px; }
      .weight-row { position:relative; display:grid; grid-template-columns:112px 120px minmax(0,1fr) auto; gap:12px; align-items:center; padding:12px 0; border-bottom:1px solid var(--divider-color); }
      .weight-row:last-child { border-bottom:0; }
      .weight-row .weight-value { font-size:17px; font-weight:800; }
      .weight-row .weight-note { color:var(--secondary-text-color); font-size:12px; white-space:pre-wrap; }
      .weight-actions { display:flex; gap:6px; justify-content:flex-end; }
      .visit-center-hero { display:grid; grid-template-columns:minmax(0,1.35fr) repeat(2,minmax(150px,.65fr)); gap:12px; margin:14px 0 16px; }
      .visit-center-hero > div { border:1px solid var(--divider-color); border-radius:17px; padding:16px; background:linear-gradient(145deg,var(--secondary-background-color),var(--card-background-color)); }
      .visit-center-hero .primary { display:flex; gap:13px; align-items:center; }
      .visit-center-hero .hero-icon { width:46px; height:46px; border-radius:14px; display:grid; place-items:center; background:color-mix(in srgb,var(--primary-color) 14%,transparent); font-size:24px; }
      .visit-center-hero span,.visit-center-hero small,.visit-center-hero strong { display:block; }
      .visit-center-hero span,.visit-center-hero small { color:var(--secondary-text-color); }
      .visit-center-hero strong { margin:3px 0; font-size:20px; }
      .visit-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:14px 0 16px; }
      .visit-summary > div { padding:13px 14px; border:1px solid var(--divider-color); border-radius:15px; background:var(--secondary-background-color); }
      .visit-summary span,.visit-summary strong { display:block; }
      .visit-summary span { color:var(--secondary-text-color); font-size:12px; }
      .visit-summary strong { margin-top:3px; font-size:21px; }
      .visit-timeline { display:grid; gap:12px; }
      .visit-year { border:1px solid var(--divider-color); border-radius:17px; overflow:hidden; background:var(--card-background-color); }
      .visit-year > summary { list-style:none; cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:13px 16px; font-weight:800; background:var(--secondary-background-color); }
      .visit-year > summary::-webkit-details-marker { display:none; }
      .visit-year-list { padding:4px 14px 8px; }
      .visit-row { position:relative; display:grid; grid-template-columns:70px minmax(0,1fr) auto; gap:12px; align-items:flex-start; padding:13px 0; border-bottom:1px solid var(--divider-color); }
      .visit-row:last-child { border-bottom:0; }
      .visit-type { display:grid; gap:4px; justify-items:center; text-align:center; }
      .visit-type .visit-icon { width:42px; height:42px; display:grid; place-items:center; border-radius:13px; background:color-mix(in srgb,var(--primary-color) 12%,transparent); font-size:21px; }
      .visit-type small { color:var(--secondary-text-color); font-size:10px; font-weight:700; }
      .visit-info strong { display:block; font-size:16px; }
      .visit-info .visit-meta { display:flex; flex-wrap:wrap; gap:5px 12px; margin-top:4px; color:var(--secondary-text-color); font-size:12px; }
      .visit-outcome { margin-top:7px; white-space:pre-wrap; line-height:1.42; }
      .visit-notes { margin-top:5px; color:var(--secondary-text-color); white-space:pre-wrap; font-size:12px; }
      .visit-attachments { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; }
      .visit-attachments a { display:inline-flex; max-width:100%; padding:6px 9px; border:1px solid var(--divider-color); border-radius:9px; color:var(--primary-color); text-decoration:none; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .visit-actions { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
      .visit-actions button { padding:7px 10px; font-size:12px; }
      .vaccine-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:14px 0 16px; }
      .vaccine-summary > div { padding:13px 14px; border:1px solid var(--divider-color); border-radius:15px; background:var(--secondary-background-color); }
      .vaccine-summary span,.vaccine-summary strong { display:block; }
      .vaccine-summary span { color:var(--secondary-text-color); font-size:12px; }
      .vaccine-summary strong { margin-top:3px; font-size:22px; }
      .treatment-center-hero { display:grid; grid-template-columns:minmax(0,1.35fr) repeat(2,minmax(150px,.65fr)); gap:12px; margin:14px 0 16px; }
      .treatment-center-hero > div { border:1px solid var(--divider-color); border-radius:17px; padding:16px; background:linear-gradient(145deg,var(--secondary-background-color),var(--card-background-color)); }
      .treatment-center-hero .primary { display:flex; gap:13px; align-items:center; }
      .treatment-center-hero .hero-icon { width:46px; height:46px; border-radius:14px; display:grid; place-items:center; background:color-mix(in srgb,var(--primary-color) 14%,transparent); font-size:24px; }
      .treatment-center-hero span,.treatment-center-hero small,.treatment-center-hero strong { display:block; }
      .treatment-center-hero span,.treatment-center-hero small { color:var(--secondary-text-color); }
      .treatment-center-hero strong { margin:3px 0; font-size:20px; }
      .treatment-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:16px; }
      .treatment-summary > div { padding:13px 14px; border-radius:14px; background:var(--secondary-background-color); border:1px solid var(--divider-color); }
      .treatment-summary span,.treatment-summary strong { display:block; } .treatment-summary span { color:var(--secondary-text-color); font-size:12px; } .treatment-summary strong { font-size:21px; margin-top:3px; }
      .treatment-list { display:grid; gap:11px; }
      .treatment-row { display:grid; grid-template-columns:100px minmax(0,1fr) auto; gap:14px; align-items:start; padding:15px; border:1px solid var(--divider-color); border-radius:16px; background:var(--card-background-color); }
      .treatment-state { display:grid; gap:5px; justify-items:start; }
      .treatment-state .pill { display:inline-flex; align-items:center; gap:5px; padding:5px 8px; border-radius:999px; font-size:11px; font-weight:700; background:var(--secondary-background-color); }
      .treatment-state .active { color:#0b7a3e; background:rgba(22,163,74,.12); } .treatment-state .completed { color:#52606d; } .treatment-state .upcoming { color:#8a5a00; background:rgba(245,158,11,.13); }
      .treatment-info { min-width:0; } .treatment-info > strong { display:block; font-size:17px; }
      .treatment-meta { display:flex; gap:10px; flex-wrap:wrap; color:var(--secondary-text-color); font-size:12px; margin-top:5px; }
      .treatment-note { margin-top:8px; line-height:1.45; }
      .treatment-progress { margin-top:10px; display:grid; gap:5px; }
      .treatment-progress-bar { height:7px; background:var(--secondary-background-color); border-radius:999px; overflow:hidden; }
      .treatment-progress-bar > i { display:block; height:100%; background:var(--primary-color); border-radius:inherit; }
      .treatment-progress small { color:var(--secondary-text-color); }
      .treatment-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
      .treatment-attachments { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; }
      .treatment-attachments a { display:inline-flex; max-width:100%; padding:6px 9px; border:1px solid var(--divider-color); border-radius:9px; color:var(--primary-color); text-decoration:none; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .vaccine-center-hero { display:grid; grid-template-columns:minmax(0,1.35fr) repeat(2,minmax(150px,.65fr)); gap:12px; margin:14px 0 16px; }
      .vaccine-center-hero > div { border:1px solid var(--divider-color); border-radius:17px; padding:16px; background:linear-gradient(145deg,var(--secondary-background-color),var(--card-background-color)); }
      .vaccine-center-hero .primary { display:flex; gap:13px; align-items:center; }
      .vaccine-center-hero .hero-icon { width:46px; height:46px; border-radius:14px; display:grid; place-items:center; background:color-mix(in srgb,var(--primary-color) 14%,transparent); font-size:24px; }
      .vaccine-center-hero span,.vaccine-center-hero small,.vaccine-center-hero strong { display:block; }
      .vaccine-center-hero span,.vaccine-center-hero small { color:var(--secondary-text-color); }
      .vaccine-center-hero strong { margin:3px 0; font-size:20px; }
      .vaccine-group-tools { display:flex; gap:8px; align-items:center; justify-content:flex-end; padding:0 14px 12px; }
      .vaccine-dose-meta { display:flex; flex-wrap:wrap; gap:6px 12px; margin-top:5px; }
      .vaccine-dose-meta small { margin:0 !important; }
      .vaccine-note { margin-top:5px; color:var(--secondary-text-color); font-size:12px; white-space:pre-wrap; }
      .vaccine-status-line { font-size:12px; font-weight:700; margin-top:3px; }
      .vaccine-group.ok .vaccine-status-line { color:#2e7d32; }
      .vaccine-group.warning .vaccine-status-line { color:#d58b00; }
      .vaccine-group.expired .vaccine-status-line { color:#c62828; }
      .vaccine-groups { display:grid; gap:10px; }
      .vaccine-group { border:1px solid var(--divider-color); border-radius:17px; overflow:hidden; background:var(--card-background-color); }
      .vaccine-group summary { list-style:none; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:16px; padding:15px 17px; }
      .vaccine-group summary::-webkit-details-marker { display:none; }
      .vaccine-group[open] summary { border-bottom:1px solid var(--divider-color); }
      .vaccine-group-title { display:flex; align-items:center; gap:11px; min-width:0; }
      .vaccine-group-title strong,.vaccine-group-title small { display:block; }
      .vaccine-group-title strong { font-size:17px; overflow-wrap:anywhere; }
      .vaccine-group-title small { margin-top:2px; color:var(--secondary-text-color); }
      .vaccine-dot { font-size:16px; }
      .vaccine-group-current { margin-left:auto; text-align:right; flex:0 0 auto; }
      .vaccine-group-current small,.vaccine-group-current strong,.vaccine-group-current em { display:block; }
      .vaccine-group-current small,.vaccine-group-current em { color:var(--secondary-text-color); font-size:11px; font-style:normal; }
      .vaccine-group-current strong { margin:2px 0; }
      .vaccine-history { padding:4px 14px 8px; }
      .vaccine-history-row { position:relative; display:grid; grid-template-columns:112px minmax(0,1fr) auto; gap:12px; align-items:center; padding:11px 0; border-bottom:1px solid var(--divider-color); }
      .vaccine-history-row:last-child { border-bottom:0; }
      .vaccine-date { font-weight:700; }
      .vaccine-history-info strong,.vaccine-history-info small { display:block; }
      .vaccine-history-info small { margin-top:2px; color:var(--secondary-text-color); }
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
        .home-overview { grid-template-columns:repeat(2,minmax(0,1fr)); }
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
        .home-overview { grid-template-columns:1fr; gap:8px; margin-bottom:12px; }
        .home-tile { min-height:78px; padding:13px 14px; border-radius:17px; }
        .home-tile-icon { flex-basis:42px; width:42px; height:42px; border-radius:13px; font-size:21px; }
        .visit-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .weight-center-hero { grid-template-columns:1fr; }
        .weight-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .weight-row { grid-template-columns:92px 90px minmax(0,1fr); }
        .weight-actions { grid-column:1/-1; justify-content:flex-start; }
        .visit-center-hero { grid-template-columns:1fr; }
        .treatment-center-hero { grid-template-columns:1fr; }
        .treatment-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .treatment-row { grid-template-columns:1fr; }
        .treatment-actions { justify-content:flex-start; }
        .visit-row { grid-template-columns:52px minmax(0,1fr); padding:13px 0; }
        .visit-actions { grid-column:1 / -1; justify-content:flex-start; padding-left:64px; }
        .vaccine-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .vaccine-center-hero { grid-template-columns:1fr; }
        .vaccine-center-hero .primary { min-height:76px; }
        .weight-summary { grid-template-columns:1fr 1fr; }
        .weight-row { grid-template-columns:1fr; gap:5px; }
        .weight-actions { grid-column:auto; justify-content:flex-start; }
        .vaccine-group summary { align-items:flex-start; padding:14px; }
        .vaccine-group-current { max-width:115px; }
        .vaccine-history { padding:3px 12px 7px; }
        .vaccine-history-row { grid-template-columns:1fr; gap:4px; padding:12px 0 56px; }
        .vaccine-history-row .record-actions { bottom:8px; }
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
    const family = this._books.length > 1 ? this.familyOverview() : null;
    const p = book.profile || {};
    const lastWeight = this.latest(book.weights, "date");
    const lastVisit = this.latest(book.visits, "date");
    const visitStats = this.visitStats(book);
    const lastHeat = this.latest(book.heat_cycles, "starts_on");
    const heatStats = this.heatCycleStats(book);
    const healthCalendar = this.healthCalendarMonth(book);
    const reminders = this.smartReminders(book);
    const nextVax = this.nextVaccination(book);
    const treatments = this.activeTreatments(book);
    const treatmentStats = this.treatmentStats(book);
    const timeline = this.timelineItems(book);
    const trend = this.weightTrend(book);
    const weightStats = this.weightStats(book);
    const smart = this.smartHealth(book);
    const vaccineGroups = this.vaccinationGroups(book);
    const vaccineStatusCounts = vaccineGroups.reduce((acc, group) => {
      const status = this.vaccinationStatus(group).key;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const photo = p.photo_url
      ? `<img class="pet-photo" src="${this.esc(p.photo_url)}" alt="${this.esc(p.dog_name)}">`
      : `<div class="pet-photo placeholder">🐾</div>`;

    const records = (items, renderer, empty = "Nessun dato registrato") =>
      items?.length
        ? [...items].reverse().slice(0, 5).map(renderer).join("")
        : `<div class="empty">${empty}</div>`;

    this.shadowRoot.innerHTML = `
      <style>${styles}
      .enci-pro-hero{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:20px;border:1px solid var(--divider-color,#ddd);border-radius:18px;margin-bottom:14px;background:var(--card-background-color,#fff)}
      .enci-pro-hero h3{margin:5px 0 4px;font-size:1.35rem}.enci-pro-hero p{margin:0;color:var(--secondary-text-color,#666)}
      .enci-pro-kicker{font-size:.82rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--primary-color,#03a9f4)}
      .enci-pro-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .enci-pro-stat{padding:14px;border:1px solid var(--divider-color,#ddd);border-radius:16px;background:var(--card-background-color,#fff);display:flex;flex-direction:column;gap:4px}
      .enci-pro-stat span{font-size:.82rem;color:var(--secondary-text-color,#666)}.enci-pro-stat strong{font-size:1.2rem}.enci-pro-stat small{color:var(--secondary-text-color,#777);overflow:hidden;text-overflow:ellipsis}
      .enci-health-official{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.enci-health-official>div{padding:12px;border:1px solid var(--divider-color,#ddd);border-radius:14px;display:flex;flex-direction:column;gap:4px}
      .enci-health-official span,.enci-health-official small{color:var(--secondary-text-color,#666);font-size:.82rem}.enci-count{font-size:.75rem;padding:2px 7px;border-radius:999px;background:var(--secondary-background-color,#eee)}
      @media(max-width:700px){.enci-pro-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.enci-health-official{grid-template-columns:1fr}.enci-pro-hero{align-items:flex-start}.enci-pro-status{flex-shrink:0}}

      .heat-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}
      .heat-stat{padding:14px;border:1px solid var(--divider-color,#ddd);border-radius:16px;display:flex;flex-direction:column;gap:5px;background:var(--card-background-color,#fff)}
      .heat-stat span{font-size:.82rem;color:var(--secondary-text-color,#666)}
      .heat-stat strong{font-size:1.08rem}
      .heat-stat small{color:var(--secondary-text-color,#777)}
      .heat-stat.forecast{border-width:2px}
      .heat-forecast-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:var(--secondary-background-color,#f3f3f3);margin-bottom:14px}
      .heat-forecast-note span{color:var(--secondary-text-color,#666);font-size:.86rem}
      .heat-history{display:flex;flex-direction:column;gap:9px}
      .heat-record{display:grid;grid-template-columns:minmax(180px,.8fr) 1fr auto;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--divider-color,#ddd)}
      .heat-date{display:grid;grid-template-columns:auto 1fr;column-gap:8px}
      .heat-date span{grid-row:1/3}
      .heat-date small{color:var(--secondary-text-color,#666)}
      .heat-notes{color:var(--secondary-text-color,#666);font-size:.9rem}
      @media(max-width:800px){
        .heat-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
        .heat-record{grid-template-columns:1fr}
        .heat-record .record-actions{justify-content:flex-start}
        .heat-forecast-note{flex-direction:column}
      }
      @media(max-width:480px){.heat-summary{grid-template-columns:1fr}}

      .smart-dashboard{margin:16px 0 18px}.smart-dashboard-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:10px}.smart-dashboard-head h3{margin:0 0 3px}
      .smart-dashboard-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .smart-dash-card{appearance:none;text-align:left;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);border-radius:17px;padding:14px;display:grid;grid-template-columns:38px 1fr;gap:10px;cursor:pointer;min-width:0}
      .smart-dash-card:hover{border-color:var(--primary-color)}.smart-dash-icon{font-size:24px}.smart-dash-card small,.smart-dash-card strong,.smart-dash-card em{display:block}.smart-dash-card small{color:var(--secondary-text-color);font-size:11px;text-transform:uppercase;font-weight:700;letter-spacing:.3px}.smart-dash-card strong{font-size:17px;margin:3px 0}.smart-dash-card em{font-size:12px;color:var(--secondary-text-color);font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .health-timeline-card{overflow:hidden}.timeline-total{font-size:12px;color:var(--secondary-text-color);padding:5px 9px;border-radius:999px;background:var(--secondary-background-color)}
      .timeline-filters{display:flex;gap:7px;overflow-x:auto;padding:3px 0 12px;scrollbar-width:thin}.timeline-filter{white-space:nowrap;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);border-radius:999px;padding:7px 10px;cursor:pointer}.timeline-filter.active{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
      .health-timeline{display:grid}.health-timeline-row{display:grid;grid-template-columns:92px 36px minmax(0,1fr);gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--divider-color)}.health-timeline-row.timeline-hidden{display:none}.health-timeline-date{font-size:12px;color:var(--secondary-text-color)}.health-timeline-icon{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--secondary-background-color)}.health-timeline-body span,.health-timeline-body strong,.health-timeline-body small{display:block}.health-timeline-body span{font-size:10px;text-transform:uppercase;color:var(--primary-color);font-weight:800}.health-timeline-body small{color:var(--secondary-text-color);margin-top:2px}.timeline-more{width:100%;margin-top:10px}
      @media(max-width:850px){.smart-dashboard-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:520px){.smart-dashboard-grid{grid-template-columns:1fr}.health-timeline-row{grid-template-columns:70px 32px minmax(0,1fr);gap:7px}.smart-dash-card em{white-space:normal}}

      .smart-reminder-strip{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--divider-color);border-radius:15px;background:var(--card-background-color);margin-bottom:10px}.smart-reminder-strip>span{font-weight:800}.smart-reminder-strip strong{font-size:.9rem}
      .calendar-controls{display:flex;gap:6px}.calendar-month-title{text-transform:capitalize;font-size:1.1rem;font-weight:800;margin:10px 0}.health-calendar-weekdays,.health-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.health-calendar-weekdays span{text-align:center;font-size:11px;font-weight:800;color:var(--secondary-text-color);padding:7px 2px}.health-calendar-day{min-height:90px;padding:6px;border-top:1px solid var(--divider-color);border-left:1px solid var(--divider-color);background:var(--card-background-color);min-width:0}.health-calendar-day:nth-child(7n){border-right:1px solid var(--divider-color)}.health-calendar-day.outside{opacity:.38}.health-calendar-day.today .calendar-day-number{background:var(--primary-color);color:var(--text-primary-color,#fff)}.calendar-day-number{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;font-size:12px;font-weight:800}.calendar-day-events{display:grid;gap:3px;margin-top:4px}.calendar-event{display:flex;gap:3px;align-items:center;font-size:10px;padding:3px 4px;border-radius:6px;background:var(--secondary-background-color);overflow:hidden}.calendar-event b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.calendar-upcoming{margin-top:16px}.calendar-upcoming h4{margin-bottom:6px}.calendar-upcoming-row{display:grid;grid-template-columns:26px 90px 1fr auto;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--divider-color)}.calendar-upcoming-row em{font-style:normal}.calendar-upcoming-row small{color:var(--secondary-text-color)}.calendar-native-note{margin-top:12px;padding:10px 12px;border-radius:12px;background:var(--secondary-background-color);color:var(--secondary-text-color);font-size:.82rem}
      @media(max-width:650px){.smart-reminder-strip{grid-template-columns:1fr}.health-calendar-day{min-height:66px;padding:3px}.calendar-event b{display:none}.calendar-upcoming-row{grid-template-columns:24px 80px 1fr}.calendar-upcoming-row small{display:none}.health-calendar-weekdays span{font-size:9px}}

      .heat-record{position:relative}
      .heat-record .record-actions{position:static!important;right:auto!important;top:auto!important;transform:none!important;justify-self:end;display:flex;gap:7px}
      .heat-record .record-actions button{min-width:74px}
      .edit-context{display:grid;grid-template-columns:28px 1fr;gap:2px 8px;padding:10px 12px;margin:0 0 14px;border-radius:12px;background:var(--secondary-background-color);border:1px solid var(--divider-color)}
      .edit-context span{grid-row:1/3;font-size:20px}.edit-context strong,.edit-context small{display:block}.edit-context small{color:var(--secondary-text-color)}
      button.smart-reminder-strip{width:100%;color:var(--primary-text-color);text-align:left;cursor:pointer;grid-template-columns:auto 1fr auto}.smart-reminder-copy strong,.smart-reminder-copy small{display:block}.smart-reminder-copy small{margin-top:2px;color:var(--secondary-text-color);font-weight:400}.smart-reminder-open{font-weight:800;color:var(--primary-color)}
      .reminder-auto-badge{font-size:10px;font-weight:900;letter-spacing:.7px;padding:5px 8px;border-radius:999px;background:color-mix(in srgb,var(--primary-color) 12%,transparent);color:var(--primary-color)}
      .reminders-list{display:grid;gap:8px}.reminder-row{width:100%;display:grid;grid-template-columns:36px 1fr 20px;gap:8px;align-items:center;text-align:left;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);padding:11px 12px;border-radius:13px;cursor:pointer}.reminder-row:hover{border-color:var(--primary-color)}.reminder-row strong,.reminder-row small{display:block}.reminder-row small{color:var(--secondary-text-color);margin-top:2px}.reminder-icon{font-size:22px}.reminder-arrow{font-size:24px;color:var(--secondary-text-color)}.reminder-row.danger{border-left:4px solid var(--error-color,#db4437)}.reminder-row.warn{border-left:4px solid #f4b400}.reminder-row.info{border-left:4px solid var(--primary-color)}
      .reminder-empty{display:grid;grid-template-columns:34px 1fr;gap:3px 8px;align-items:center;padding:16px;border-radius:14px;background:var(--secondary-background-color)}.reminder-empty>span{grid-row:1/3;font-size:24px}.reminder-empty strong,.reminder-empty small{display:block}.reminder-empty small{color:var(--secondary-text-color)}
      .reminder-rules{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.reminder-rules span{font-size:11px;color:var(--secondary-text-color);padding:5px 7px;border-radius:999px;background:var(--secondary-background-color)}
      @media(max-width:800px){.heat-record .record-actions{justify-self:start}.smart-reminder-strip{grid-template-columns:1fr!important}.smart-reminder-open{justify-self:start}}

      .multi-pet-hub{margin-bottom:20px;padding:22px;border-radius:24px;background:var(--card-background-color);box-shadow:var(--ha-card-box-shadow,0 2px 12px rgba(0,0,0,.06))}
      .multi-pet-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.multi-pet-head h2{margin:3px 0 3px;font-size:26px}.multi-pet-kicker{font-size:11px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;color:var(--primary-color)}.multi-pet-total{padding:7px 10px;border-radius:999px;background:var(--secondary-background-color);font-size:12px;font-weight:800;white-space:nowrap}
      .family-pets{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.family-pet-card{display:grid;grid-template-columns:62px 1fr auto;gap:11px;align-items:center;text-align:left;padding:12px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);border-radius:17px;cursor:pointer;min-width:0}.family-pet-card.active{border-color:var(--primary-color);box-shadow:0 0 0 1px var(--primary-color)}.family-pet-card img,.family-pet-placeholder{width:62px;height:62px;border-radius:15px;object-fit:cover;background:var(--secondary-background-color)}.family-pet-placeholder{display:grid;place-items:center;font-size:25px}.family-pet-main strong,.family-pet-main small,.family-pet-main em{display:block}.family-pet-main strong{font-size:17px}.family-pet-main small{color:var(--secondary-text-color);margin:2px 0 6px}.family-pet-main em{font-size:11px;font-style:normal;color:var(--primary-color)}.family-pet-stats{display:grid;gap:5px;text-align:right}.family-pet-stats small{white-space:nowrap;color:var(--secondary-text-color)}
      .family-overview-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.family-panel{padding:14px;border:1px solid var(--divider-color);border-radius:16px;background:var(--secondary-background-color)}.family-panel-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:7px}.family-panel-head h3{margin:0;font-size:16px}.family-panel-head small{color:var(--secondary-text-color)}
      .family-reminders,.family-events{display:grid}.family-reminder,.family-event{width:100%;border:0;border-top:1px solid var(--divider-color);border-radius:0;background:transparent;color:var(--primary-text-color);padding:8px 3px;display:grid;gap:8px;align-items:center;text-align:left;cursor:pointer}.family-reminder{grid-template-columns:28px 1fr 16px}.family-reminder strong,.family-reminder em,.family-reminder small{display:block}.family-reminder em{font-style:normal;font-weight:700}.family-reminder small{color:var(--secondary-text-color)}.family-reminder b{font-size:20px;color:var(--secondary-text-color)}.family-event{grid-template-columns:28px 82px 1fr}.family-event>span:last-child b,.family-event>span:last-child small{display:block}.family-event>span:last-child small{color:var(--secondary-text-color);margin-top:2px}.family-empty{padding:14px 4px;color:var(--secondary-text-color)}.family-switcher{margin-top:-8px}
      @media(max-width:850px){.family-overview-grid{grid-template-columns:1fr}.multi-pet-head{flex-direction:column}.family-pet-card{grid-template-columns:56px 1fr}.family-pet-card img,.family-pet-placeholder{width:56px;height:56px}.family-pet-stats{grid-column:2;text-align:left;display:flex;gap:12px;flex-wrap:wrap}}
      @media(max-width:520px){.multi-pet-hub{padding:14px;border-radius:18px}.family-pets{grid-template-columns:1fr}.family-event{grid-template-columns:24px 76px 1fr}.family-panel-head{align-items:flex-start;flex-direction:column}}

      .ha-mobile-menu{
        display:none;
        flex:0 0 auto;
        width:48px;
        height:48px;
        padding:0;
        border-radius:50%;
        background:transparent;
        color:var(--primary-text-color);
        box-shadow:none;
        align-items:center;
        justify-content:center;
        font-size:30px;
        line-height:1;
        font-weight:400;
      }
      .ha-mobile-menu:hover{background:var(--secondary-background-color)}
      @media(max-width:900px){
        .topbar{display:flex;align-items:center;gap:8px}
        .ha-mobile-menu{display:flex}
      }

      .topbar-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
      .support-project-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:0 14px;border:1px solid var(--divider-color);border-radius:12px;background:var(--card-background-color);color:var(--primary-text-color);font-size:13px;font-weight:600;box-shadow:none;cursor:pointer;white-space:nowrap}
      .support-project-btn:hover{border-color:var(--primary-color);background:var(--secondary-background-color)}
      @media(max-width:900px){.topbar-actions{margin-left:auto}.support-project-btn{width:44px;height:44px;min-height:44px;padding:0;border-radius:12px;font-size:20px}.support-project-label{display:none}}

      /* PawBook 6.10.4 definitive mobile header */
      .topbar{
        display:flex !important;
        align-items:center !important;
        justify-content:flex-start !important;
        gap:12px !important;
        width:100%;
      }
      .topbar .brand{
        display:flex !important;
        align-items:center !important;
        gap:14px !important;
        margin:0 !important;
        min-width:0;
      }
      .topbar-actions{
        margin-left:auto !important;
        display:flex !important;
        align-items:center !important;
        justify-content:flex-end !important;
        flex:0 0 auto;
      }
      .ha-mobile-menu{
        order:0;
        flex:0 0 auto;
      }
      .topbar .brand{
        order:1;
      }
      .topbar-actions{
        order:2;
      }
      .support-project-btn{
        display:inline-flex !important;
        align-items:center;
        justify-content:center;
        gap:7px;
        min-height:42px;
        padding:0 14px;
        border:1px solid var(--divider-color);
        border-radius:12px;
        background:var(--card-background-color);
        color:var(--primary-text-color);
        font-size:13px;
        font-weight:600;
        box-shadow:none;
        cursor:pointer;
        white-space:nowrap;
      }
      @media(max-width:900px){
        .topbar{
          gap:8px !important;
        }
        .ha-mobile-menu{
          display:flex !important;
          width:44px;
          height:44px;
          padding:0;
          border-radius:12px;
        }
        .topbar .brand{
          flex:1 1 auto;
          min-width:0;
          justify-content:flex-start !important;
        }
        .topbar .brand-mark{
          width:48px !important;
          height:48px !important;
          border-radius:14px !important;
        }
        .topbar .brand-mark svg{
          width:30px !important;
          height:30px !important;
        }
        .topbar h1{
          font-size:28px !important;
          margin-bottom:2px !important;
          white-space:nowrap;
        }
        .topbar .muted{
          font-size:14px !important;
          white-space:nowrap;
        }
        .support-project-btn{
          display:flex !important;
          width:44px;
          height:44px;
          min-height:44px;
          padding:0;
          border-radius:12px;
          font-size:20px;
        }
        .support-project-label{
          display:none !important;
        }
      }
      @media(max-width:430px){
        .topbar{
          gap:6px !important;
        }
        .topbar .brand{
          gap:9px !important;
        }
        .topbar h1{
          font-size:25px !important;
        }
        .topbar .muted{
          font-size:12px !important;
        }
        .v2-badge{
          font-size:10px !important;
          padding:4px 7px !important;
          margin-left:5px !important;
        }
        .ha-mobile-menu,
        .support-project-btn{
          width:40px !important;
          height:40px !important;
          min-height:40px !important;
        }
      }

      /* PawBook 6.10.4 · DOMOTICA / Inverter shell */
      :host{
        --paw-accent:var(--primary-color);
        --paw-green:#48d58b;
        --paw-red:#ff6b6b;
        --paw-warn:#ffb74d;
      }
      .page{
        max-width:1480px !important;
        margin:0 auto !important;
        padding:20px 26px 56px !important;
      }
      .topbar.inverter-shell{
        position:sticky !important;
        top:0 !important;
        z-index:30 !important;
        width:100% !important;
        display:block !important;
        padding:8px 0 13px !important;
        margin:0 0 18px !important;
        background:color-mix(in srgb,var(--primary-background-color) 92%,transparent) !important;
        backdrop-filter:blur(18px);
        -webkit-backdrop-filter:blur(18px);
      }
      .topbar .top-row{
        display:flex;
        align-items:center;
        width:100%;
        margin-bottom:12px;
        gap:12px;
      }
      .topbar .top-left{
        display:flex;
        align-items:center;
        gap:10px;
        min-width:0;
        flex:1 1 auto;
      }
      .ha-menu{
        width:44px !important;
        height:44px !important;
        flex:0 0 44px !important;
        border:0 !important;
        border-radius:14px !important;
        padding:0 !important;
        background:transparent !important;
        color:var(--primary-text-color) !important;
        display:none !important;
        place-items:center !important;
        box-shadow:none !important;
      }
      .ha-menu:active{background:rgba(127,127,127,.18) !important}
      .hamburger-glyph{font-size:34px;line-height:1;font-weight:500;display:block;transform:translateY(-1px)}
      .brand-icon{
        width:44px !important;
        height:44px !important;
        flex:0 0 44px;
        display:grid !important;
        place-items:center;
        border-radius:14px !important;
        background:linear-gradient(145deg,color-mix(in srgb,var(--primary-color) 20%,transparent),color-mix(in srgb,var(--primary-color) 6%,transparent)) !important;
        color:var(--primary-color);
        border:1px solid color-mix(in srgb,var(--primary-color) 25%,transparent) !important;
        box-shadow:0 8px 28px color-mix(in srgb,var(--primary-color) 9%,transparent) !important;
      }
      .brand-icon svg{width:28px !important;height:28px !important;fill:var(--primary-color) !important}
      .brand-copy{min-width:0}
      .brand-title-row{display:flex;align-items:center;gap:8px}
      .brand-title-row strong{font-size:19px;font-weight:800;letter-spacing:-.01em}
      .version-badge{
        font-size:10px !important;
        font-weight:850 !important;
        color:var(--primary-color) !important;
        background:color-mix(in srgb,var(--primary-color) 10%,transparent) !important;
        border:1px solid color-mix(in srgb,var(--primary-color) 16%,transparent) !important;
        border-radius:999px !important;
        padding:4px 7px !important;
        margin:0 !important;
      }
      .brand-subtitle{display:block;color:var(--secondary-text-color);font-size:11px;margin-top:2px}
      .topbar-actions{margin-left:auto !important;display:flex !important;align-items:center !important;gap:8px}
      .support-project-btn{
        display:inline-flex !important;
        align-items:center;
        justify-content:center;
        gap:7px;
        min-height:40px !important;
        padding:0 13px !important;
        border:1px solid var(--divider-color) !important;
        border-radius:12px !important;
        background:color-mix(in srgb,var(--card-background-color) 94%,transparent) !important;
        color:var(--primary-text-color) !important;
        font-size:12px !important;
        font-weight:700 !important;
        box-shadow:none !important;
      }
      .support-project-btn:hover{
        border-color:color-mix(in srgb,var(--primary-color) 45%,var(--divider-color)) !important;
        background:color-mix(in srgb,var(--primary-color) 7%,var(--card-background-color)) !important;
      }

      /* Same tab geometry/behavior as Inverter Dashboard */
      .dashboard-nav.tabs{
        display:grid !important;
        grid-auto-flow:column !important;
        grid-auto-columns:max-content !important;
        grid-template-columns:none !important;
        justify-content:start !important;
        gap:6px !important;
        width:100% !important;
        max-width:100% !important;
        overflow-x:auto !important;
        overflow-y:hidden !important;
        padding:2px 2px 7px !important;
        margin:0 !important;
        border-radius:0 !important;
        background:transparent !important;
        box-shadow:none !important;
        -webkit-overflow-scrolling:touch;
        overscroll-behavior-x:contain;
        scrollbar-width:none;
        scroll-snap-type:none !important;
      }
      .dashboard-nav.tabs::-webkit-scrollbar{display:none}
      .dashboard-nav.tabs button{
        position:relative;
        display:flex !important;
        flex-direction:row !important;
        align-items:center !important;
        justify-content:center !important;
        gap:7px !important;
        white-space:nowrap !important;
        min-width:max-content !important;
        min-height:0 !important;
        height:auto !important;
        flex:none !important;
        border:0 !important;
        background:transparent !important;
        color:var(--secondary-text-color) !important;
        padding:9px 12px !important;
        border-radius:12px !important;
        cursor:pointer;
        font-weight:750 !important;
        font-size:12px !important;
        box-shadow:none !important;
        -webkit-tap-highlight-color:transparent;
        user-select:none;
        -webkit-user-select:none;
      }
      .dashboard-nav.tabs button:hover,
      .dashboard-nav.tabs button.active{
        background:color-mix(in srgb,var(--primary-color) 10%,transparent) !important;
        color:var(--primary-color) !important;
      }
      .dashboard-nav.tabs button.active::after{display:none !important}
      .dashboard-nav.tabs .nav-icon{font-size:17px !important;line-height:1 !important}

      /* Bring the rest of PawBook closer to the cleaner DOMOTICA geometry */
      .hero{
        border:1px solid color-mix(in srgb,var(--divider-color) 82%,transparent);
        box-shadow:0 16px 48px rgba(0,0,0,.08) !important;
      }
      .stat,.card{
        border:1px solid color-mix(in srgb,var(--divider-color) 82%,transparent);
        box-shadow:0 10px 34px rgba(0,0,0,.055) !important;
      }
      .smart-dashboard,.multi-pet-hub{margin-top:24px}
      .footer{
        margin-top:34px;
        text-align:center;
        color:var(--secondary-text-color);
        font-size:10px;
      }

      @media(max-width:620px){
        .page{padding:10px 10px 42px !important}
        .topbar.inverter-shell{padding-top:6px !important;margin-bottom:12px !important}
        .topbar .top-row{margin-bottom:8px;gap:7px}
        .ha-menu{
          display:grid !important;
          width:42px !important;
          height:42px !important;
          flex-basis:42px !important;
        }
        .brand-icon{width:42px !important;height:42px !important;flex-basis:42px}
        .brand-title-row strong{font-size:18px}
        .brand-subtitle{font-size:10px}
        .support-project-btn{
          width:42px !important;
          height:42px !important;
          min-height:42px !important;
          padding:0 !important;
          font-size:18px !important;
        }
        .support-project-label{display:none !important}
        .dashboard-nav.tabs{margin:0 -2px !important;padding:2px 2px 7px !important}
        .dashboard-nav.tabs button{padding:9px 11px !important;font-size:12px !important}
        .dashboard-nav.tabs .nav-icon{font-size:17px !important}
      }
      @media(max-width:390px){
        .brand-subtitle{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .brand-title-row strong{font-size:17px}
        .version-badge{font-size:9px !important;padding:3px 6px !important}
      }

      /* PawBook 6.10.4 · Visual Redesign */
      :host{
        --paw-surface:color-mix(in srgb,var(--card-background-color) 96%,var(--primary-background-color));
        --paw-line:color-mix(in srgb,var(--divider-color) 78%,transparent);
        --paw-accent-soft:color-mix(in srgb,var(--primary-color) 10%,transparent);
      }
      .page{max-width:none !important;margin:0 !important;padding:18px 22px 56px !important}
      .app-hero{
        position:relative;overflow:hidden;display:grid !important;
        grid-template-columns:minmax(0,1fr) auto !important;align-items:center;gap:26px;
        padding:30px 32px !important;border-radius:20px !important;
        border:1px solid var(--paw-line) !important;
        background:
          radial-gradient(circle at 85% 15%,color-mix(in srgb,var(--primary-color) 14%,transparent),transparent 34%),
          linear-gradient(145deg,var(--paw-surface),color-mix(in srgb,var(--primary-background-color) 94%,var(--card-background-color))) !important;
        box-shadow:none !important;
      }
      .app-hero::before{
        content:"";position:absolute;inset:0 auto 0 0;width:4px;
        background:linear-gradient(var(--primary-color),color-mix(in srgb,var(--primary-color) 25%,transparent));
      }
      .app-hero .profile{gap:24px !important}
      .app-hero .photo-button,.app-hero .pet-photo,.app-hero .photo-button .placeholder{
        width:156px !important;height:156px !important;border-radius:22px !important;
      }
      .profile-kicker{display:block;color:var(--primary-color);font-size:10px;font-weight:900;letter-spacing:.12em;margin-bottom:7px}
      .app-hero .identity h2{font-size:38px !important;margin:0 0 10px !important}
      .app-hero .identity-grid{gap:8px 18px !important;font-size:14px !important}

      .telemetry-rail{
        display:grid !important;grid-template-columns:repeat(4,minmax(0,1fr)) !important;
        gap:0 !important;margin:14px 0 18px !important;border:1px solid var(--paw-line);
        border-radius:18px;overflow:hidden;background:var(--paw-surface);
      }
      .telemetry-rail .stat{
        min-height:104px !important;padding:18px 66px 16px 18px !important;
        border:0 !important;border-right:1px solid var(--paw-line) !important;border-radius:0 !important;
        background:transparent !important;box-shadow:none !important;
      }
      .telemetry-rail .stat:last-child{border-right:0 !important}
      .telemetry-rail .stat span{font-size:12px !important;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px !important}
      .telemetry-rail .stat strong{font-size:25px !important;letter-spacing:-.02em}
      .telemetry-rail .stat-icon{
        width:42px !important;height:42px !important;right:16px !important;border-radius:12px !important;
        background:var(--paw-accent-soft) !important;border:1px solid color-mix(in srgb,var(--primary-color) 20%,transparent);
      }

      .card{
        border:1px solid var(--paw-line) !important;border-radius:18px !important;
        background:var(--paw-surface) !important;box-shadow:none !important;
      }
      .card.v2-section,.heat-center,.health-calendar-card,.health-timeline-card,.reminders-center{
        padding:22px 24px !important;position:relative;overflow:hidden;
      }
      .card.v2-section::before,.heat-center::before,.health-calendar-card::before,.health-timeline-card::before,.reminders-center::before{
        content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
        background:linear-gradient(var(--primary-color),transparent 78%);opacity:.9;
      }
      .card-head{
        align-items:center !important;padding-bottom:12px;margin-bottom:8px;border-bottom:1px solid var(--paw-line);
      }
      .card-head h3{font-size:18px !important;margin:0 !important;letter-spacing:-.01em}
      .card-head .muted{font-size:11px !important;margin-top:3px}

      .smart-dashboard{padding:0 !important;margin:20px 0 !important}
      .smart-dashboard-head{padding:0 2px 10px;border-bottom:1px solid var(--paw-line)}
      .smart-dashboard-grid{
        display:grid !important;grid-template-columns:repeat(3,minmax(0,1fr)) !important;
        gap:1px !important;border:1px solid var(--paw-line);border-radius:18px;
        overflow:hidden;background:var(--paw-line);
      }
      .smart-dash-card{
        min-height:116px;border:0 !important;border-radius:0 !important;
        background:var(--paw-surface) !important;box-shadow:none !important;padding:18px !important;
      }
      .smart-dash-card:hover{background:color-mix(in srgb,var(--primary-color) 5%,var(--paw-surface)) !important}
      .smart-dash-icon{
        width:36px;height:36px;display:grid;place-items:center;border-radius:10px;
        background:var(--paw-accent-soft);font-size:20px !important;
      }

      button.smart-reminder-strip{
        border-radius:14px !important;border:1px solid color-mix(in srgb,var(--primary-color) 20%,var(--paw-line)) !important;
        background:linear-gradient(90deg,color-mix(in srgb,var(--primary-color) 7%,transparent),transparent 55%),var(--paw-surface) !important;
        box-shadow:none !important;padding:12px 14px !important;
      }

      .visit-row,.treatment-row,.vaccine-dose,.health-timeline-row,.heat-record,.calendar-upcoming-row,.reminder-row{
        border-radius:0 !important;border:0 !important;border-top:1px solid var(--paw-line) !important;
        background:transparent !important;box-shadow:none !important;
      }

      .vaccine-card,.treatment-card,.visit-card{
        border:1px solid var(--paw-line) !important;border-radius:14px !important;
        background:transparent !important;box-shadow:none !important;
      }

      .enci-pro-hero{
        border-radius:16px !important;box-shadow:none !important;
        background:linear-gradient(120deg,color-mix(in srgb,var(--primary-color) 8%,transparent),transparent 55%),var(--paw-surface) !important;
      }
      .enci-pro-stat{border-radius:12px !important;box-shadow:none !important}
      .enci-panel{border-radius:14px !important}

      .multi-pet-hub{
        border:1px solid var(--paw-line) !important;border-radius:18px !important;
        background:var(--paw-surface) !important;box-shadow:none !important;
      }
      .family-pet-card{border-radius:14px !important;box-shadow:none !important}
      .family-panel{border-radius:14px !important;background:transparent !important}

      button,.button{border-radius:10px !important;box-shadow:none !important}
      .small-btn,.secondary,.record-edit,.record-delete{min-height:34px}

      .weight-center-summary,.weight-summary-grid,.visit-summary,.treatment-summary,.vaccine-summary,.heat-summary{
        gap:1px !important;border:1px solid var(--paw-line);border-radius:14px;
        overflow:hidden;background:var(--paw-line);
      }
      .weight-center-summary > *,.weight-summary-grid > *,.visit-summary > *,.treatment-summary > *,.vaccine-summary > *,.heat-summary > *{
        border:0 !important;border-radius:0 !important;background:var(--paw-surface) !important;box-shadow:none !important;
      }

      @media(max-width:850px){
        .page{padding:10px 10px 42px !important}
        .app-hero{grid-template-columns:1fr !important;padding:22px 18px !important}
        .app-hero .profile{flex-direction:column !important;text-align:center}
        .app-hero .identity-grid{justify-content:center}
        .telemetry-rail{grid-template-columns:1fr 1fr !important}
        .telemetry-rail .stat:nth-child(2){border-right:0 !important}
        .telemetry-rail .stat:nth-child(-n+2){border-bottom:1px solid var(--paw-line) !important}
        .smart-dashboard-grid{grid-template-columns:1fr 1fr !important}
      }
      @media(max-width:520px){
        .app-hero .photo-button,.app-hero .pet-photo,.app-hero .photo-button .placeholder{
          width:138px !important;height:138px !important;
        }
        .app-hero .identity h2{font-size:31px !important}
        .telemetry-rail{grid-template-columns:1fr !important}
        .telemetry-rail .stat{border-right:0 !important;border-bottom:1px solid var(--paw-line) !important}
        .telemetry-rail .stat:last-child{border-bottom:0 !important}
        .smart-dashboard-grid{grid-template-columns:1fr !important}
        .card.v2-section,.heat-center,.health-calendar-card,.health-timeline-card,.reminders-center{
          padding:18px 16px !important;
        }
      }

      /* PawBook 6.10.4 — true structural redesign */
      .page{
        padding:16px 20px 56px !important;
      }

      /* HERO becomes the single top application header panel */
      .app-hero{
        display:grid !important;
        grid-template-columns:minmax(0,1fr) auto !important;
        grid-template-areas:
          "profile tools"
          "kpis kpis" !important;
        gap:18px 20px !important;
        padding:22px 24px !important;
        border-radius:18px !important;
        background:
          linear-gradient(120deg,color-mix(in srgb,var(--primary-color) 7%,var(--card-background-color)),var(--card-background-color) 58%) !important;
      }
      .app-hero .profile{grid-area:profile !important}
      .hero-tools{
        grid-area:tools;
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:7px;
        flex-wrap:wrap;
      }
      .hero-tools button{
        display:inline-flex;
        align-items:center;
        gap:6px;
        min-height:36px;
        padding:0 11px !important;
        border:1px solid var(--paw-line) !important;
        background:color-mix(in srgb,var(--card-background-color) 92%,transparent) !important;
        color:var(--primary-text-color) !important;
        font-size:12px !important;
      }
      .hero-kpi-rail{
        grid-area:kpis;
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:0;
        border-top:1px solid var(--paw-line);
        padding-top:14px;
      }
      .hero-kpi-rail .stat{
        position:relative;
        min-height:72px !important;
        padding:8px 50px 8px 14px !important;
        border:0 !important;
        border-right:1px solid var(--paw-line) !important;
        border-radius:0 !important;
        background:transparent !important;
        box-shadow:none !important;
      }
      .hero-kpi-rail .stat:first-child{padding-left:0 !important}
      .hero-kpi-rail .stat:last-child{border-right:0 !important}
      .hero-kpi-rail .stat span{
        font-size:10px !important;
        text-transform:uppercase;
        letter-spacing:.05em;
        margin-bottom:4px !important;
      }
      .hero-kpi-rail .stat strong{
        font-size:22px !important;
      }
      .hero-kpi-rail .stat-icon{
        width:34px !important;height:34px !important;
        right:12px !important;
        border-radius:9px !important;
        font-size:17px !important;
      }

      /* Main app sections: 2-column dashboard on desktop */
      .grid{
        display:grid !important;
        grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        gap:14px !important;
        align-items:start;
      }
      .grid > .span-2,
      .grid > .smart-dashboard,
      .grid > .multi-pet-hub{
        grid-column:1 / -1 !important;
      }
      .app-panel{
        min-height:100%;
      }

      /* Smart Dashboard becomes one matrix, not 6 floating cards */
      .smart-dashboard{
        border:1px solid var(--paw-line);
        border-radius:18px;
        overflow:hidden;
        background:var(--paw-surface);
      }
      .smart-dashboard-head{
        margin:0 !important;
        padding:16px 18px 12px !important;
        border-bottom:1px solid var(--paw-line);
      }
      .smart-reminder-strip{
        margin:0 !important;
        border:0 !important;
        border-bottom:1px solid var(--paw-line) !important;
        border-radius:0 !important;
        background:linear-gradient(90deg,color-mix(in srgb,var(--primary-color) 6%,transparent),transparent) !important;
      }
      .status-matrix{
        display:grid !important;
        grid-template-columns:repeat(6,minmax(0,1fr)) !important;
        gap:0 !important;
        border:0 !important;
        border-radius:0 !important;
        background:transparent !important;
      }
      .status-matrix .smart-dash-card{
        min-height:104px !important;
        padding:14px !important;
        border-right:1px solid var(--paw-line) !important;
        border-bottom:0 !important;
      }
      .status-matrix .smart-dash-card:last-child{border-right:0 !important}
      .status-matrix .smart-dash-card{
        grid-template-columns:1fr !important;
        gap:8px !important;
      }
      .status-matrix .smart-dash-icon{
        width:30px !important;height:30px !important;font-size:17px !important;
      }
      .status-matrix .smart-dash-card strong{font-size:14px !important}
      .status-matrix .smart-dash-card em{font-size:10px !important}

      /* Flatten all app panels */
      .app-panel{
        border-radius:16px !important;
        box-shadow:none !important;
        background:var(--paw-surface) !important;
      }
      .app-panel .card-head{
        margin-bottom:4px !important;
        padding-bottom:10px !important;
      }

      /* Remove "card inside card" visual where possible */
      .vaccine-card,
      .visit-card,
      .treatment-card,
      .enci-panel,
      .family-panel{
        background:transparent !important;
        border-left:0 !important;
        border-right:0 !important;
        border-bottom:0 !important;
        border-radius:0 !important;
      }

      .vaccine-card:first-child,
      .visit-card:first-child,
      .treatment-card:first-child{
        border-top:0 !important;
      }

      .heat-summary,
      .visit-summary,
      .treatment-summary,
      .vaccine-summary,
      .weight-summary-grid{
        display:grid !important;
        grid-template-columns:repeat(auto-fit,minmax(140px,1fr)) !important;
        border-radius:12px !important;
      }

      /* Mobile: same hierarchy, vertical without giant cards */
      @media(max-width:900px){
        .grid{grid-template-columns:1fr !important}
        .grid > *{grid-column:1 !important}
        .app-hero{
          grid-template-columns:1fr !important;
          grid-template-areas:"profile" "tools" "kpis" !important;
        }
        .hero-tools{justify-content:center}
        .hero-kpi-rail{grid-template-columns:1fr 1fr !important}
        .hero-kpi-rail .stat:nth-child(2){border-right:0 !important}
        .hero-kpi-rail .stat:nth-child(-n+2){border-bottom:1px solid var(--paw-line) !important}
        .status-matrix{grid-template-columns:1fr 1fr !important}
        .status-matrix .smart-dash-card{
          border-bottom:1px solid var(--paw-line) !important;
        }
        .status-matrix .smart-dash-card:nth-child(2n){border-right:0 !important}
      }

      @media(max-width:520px){
        .page{padding:10px 10px 40px !important}
        .app-hero{padding:18px 14px !important}
        .app-hero .profile{gap:14px !important}
        .app-hero .photo-button,
        .app-hero .pet-photo,
        .app-hero .photo-button .placeholder{
          width:118px !important;height:118px !important;
        }
        .app-hero .identity h2{font-size:28px !important}
        .hero-tools button span{display:none}
        .hero-tools button{width:40px;height:40px;justify-content:center;padding:0 !important}
        .hero-kpi-rail{grid-template-columns:1fr !important}
        .hero-kpi-rail .stat{
          border-right:0 !important;
          border-bottom:1px solid var(--paw-line) !important;
          padding-left:0 !important;
        }
        .hero-kpi-rail .stat:last-child{border-bottom:0 !important}
        .status-matrix{grid-template-columns:1fr !important}
        .status-matrix .smart-dash-card{
          border-right:0 !important;
        }
      }

/* PawBook 6.10.4 Recovery UI Polish */
:host {
  --pb-radius-lg: 24px;
  --pb-radius-md: 16px;
  --pb-border: color-mix(in srgb, var(--divider-color) 82%, transparent);
  --pb-elev: 0 18px 48px rgba(0,0,0,.08);
}

.page {
  max-width: 1440px !important;
  margin: 0 auto !important;
  padding: 18px 24px 56px !important;
}

.topbar {
  border-radius: 22px !important;
  border: 1px solid var(--pb-border) !important;
  box-shadow: var(--pb-elev) !important;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.dashboard-nav {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  overflow-x: auto !important;
  scrollbar-width: none;
  padding: 6px 2px 10px !important;
  margin: 12px 0 22px !important;
}
.dashboard-nav::-webkit-scrollbar { display:none; }

.dashboard-nav button {
  min-height: 40px !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 7px !important;
  padding: 0 13px !important;
  border-radius: 12px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: var(--secondary-text-color) !important;
  font-weight: 750 !important;
  white-space: nowrap !important;
  transition: background .18s ease, color .18s ease, border-color .18s ease, transform .18s ease;
}

.dashboard-nav button:hover {
  background: var(--secondary-background-color) !important;
  color: var(--primary-text-color) !important;
}

.dashboard-nav button.active {
  color: var(--primary-color) !important;
  background: color-mix(in srgb, var(--primary-color) 10%, transparent) !important;
  border-color: color-mix(in srgb, var(--primary-color) 20%, transparent) !important;
}

.grid > article,
.card,
.health-calendar-card,
.health-timeline-card,
.reminders-center,
.heat-center {
  border-radius: var(--pb-radius-lg) !important;
}

.grid > article {
  border: 1px solid var(--pb-border) !important;
  box-shadow: 0 12px 34px rgba(0,0,0,.055) !important;
  padding: 24px 26px 34px !important;
}

.grid > article > .card-head,
.scene-heading {
  padding-bottom: 16px !important;
  margin-bottom: 20px !important;
  border-bottom: 1px solid var(--pb-border) !important;
}

.grid > article > .card-head h3,
.scene-heading h2 {
  font-size: clamp(24px, 2vw, 30px) !important;
  line-height: 1.08 !important;
  letter-spacing: -.02em;
}

@media (max-width: 760px) {
  .page {
    padding: 10px 12px 42px !important;
  }

  .topbar {
    border-radius: 18px !important;
  }

  .dashboard-nav {
    gap: 4px !important;
    margin: 8px 0 16px !important;
    padding-bottom: 8px !important;
  }

  .dashboard-nav button {
    min-height: 38px !important;
    padding: 0 11px !important;
    font-size: 11px !important;
    flex: 0 0 auto !important;
  }

  .grid > article {
    padding: 18px 14px 28px !important;
    border-radius: 18px !important;
  }

  .grid > article > .card-head,
  .scene-heading {
    margin-bottom: 16px !important;
    padding-bottom: 14px !important;
  }
}


/* PawBook 6.10.4 DOMOTICA Rebuild */
:host {
  --pb-gap: 18px;
  --pb-radius-xl: 28px;
  --pb-radius-lg: 20px;
  --pb-radius-md: 14px;
  --pb-border: color-mix(in srgb, var(--divider-color) 78%, transparent);
  --pb-soft: color-mix(in srgb, var(--secondary-background-color) 88%, transparent);
  --pb-accent-soft: color-mix(in srgb, var(--primary-color) 12%, transparent);
  --pb-shadow: 0 18px 60px rgba(0,0,0,.08);
}

.page {
  max-width: 1480px !important;
  margin: 0 auto !important;
  padding: 18px 24px 64px !important;
}

.topbar {
  position: sticky !important;
  top: 10px !important;
  z-index: 40 !important;
  border-radius: var(--pb-radius-xl) !important;
  border: 1px solid var(--pb-border) !important;
  background: color-mix(in srgb, var(--card-background-color) 88%, transparent) !important;
  box-shadow: var(--pb-shadow) !important;
  backdrop-filter: blur(22px) saturate(1.15);
  -webkit-backdrop-filter: blur(22px) saturate(1.15);
  overflow: hidden !important;
}

.topbar::after {
  content: "";
  display: block;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary-color) 45%, transparent), transparent);
  opacity: .55;
}

.dashboard-nav {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  overflow-x: auto !important;
  scrollbar-width: none;
  padding: 8px 10px 10px !important;
  margin: 0 !important;
  border-top: 1px solid var(--pb-border) !important;
  background: transparent !important;
}
.dashboard-nav::-webkit-scrollbar { display: none; }

.dashboard-nav button {
  appearance: none;
  min-height: 42px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 7px !important;
  padding: 0 14px !important;
  border-radius: 13px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: var(--secondary-text-color) !important;
  font-size: 12px !important;
  font-weight: 760 !important;
  letter-spacing: .01em;
  white-space: nowrap !important;
  transition: .18s ease;
}

.dashboard-nav button:hover {
  color: var(--primary-text-color) !important;
  background: var(--pb-soft) !important;
}

.dashboard-nav button.active {
  color: var(--primary-color) !important;
  background: var(--pb-accent-soft) !important;
  border-color: color-mix(in srgb, var(--primary-color) 26%, transparent) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 6%, transparent);
}

.grid {
  gap: var(--pb-gap) !important;
}

.grid > article,
.card,
.health-calendar-card,
.health-timeline-card,
.reminders-center,
.heat-center {
  border-radius: var(--pb-radius-xl) !important;
  border: 1px solid var(--pb-border) !important;
  background: var(--card-background-color) !important;
  box-shadow: 0 14px 44px rgba(0,0,0,.055) !important;
}

.grid > article {
  padding: 26px 28px 34px !important;
  overflow: hidden !important;
}

.grid > article::before,
.card::before,
.health-calendar-card::before,
.health-timeline-card::before,
.reminders-center::before,
.heat-center::before {
  display: none !important;
  content: none !important;
}

.grid > article > .card-head,
.scene-heading {
  display: flex !important;
  align-items: flex-end !important;
  justify-content: space-between !important;
  gap: 14px !important;
  padding: 0 0 18px !important;
  margin: 0 0 22px !important;
  border-bottom: 1px solid var(--pb-border) !important;
}

.grid > article > .card-head h3,
.scene-heading h2 {
  margin: 0 !important;
  font-size: clamp(25px, 2.2vw, 32px) !important;
  line-height: 1.03 !important;
  letter-spacing: -.025em !important;
}

.grid > article > .card-head p,
.scene-heading p,
.muted,
.secondary {
  color: var(--secondary-text-color) !important;
}

.kpi-grid,
.summary-grid,
.stats-grid,
.health-grid {
  gap: 12px !important;
}

.kpi,
.stat,
.summary-item,
.metric {
  border-radius: var(--pb-radius-lg) !important;
  border: 1px solid var(--pb-border) !important;
  background: var(--pb-soft) !important;
  box-shadow: none !important;
}

button,
.action-button,
.primary-action,
.secondary-action {
  border-radius: 13px !important;
}

#smart-section .smart-list {
  display: grid !important;
  gap: 10px !important;
}

#smart-section .smart-item {
  border: 1px solid var(--pb-border) !important;
  border-left: 0 !important;
  border-radius: 16px !important;
  background: var(--pb-soft) !important;
  padding: 16px 18px !important;
}

#calendar-section .health-calendar-card,
.health-calendar-card {
  overflow: hidden !important;
}

.calendar-grid {
  gap: 6px !important;
}

.calendar-day {
  border-radius: 12px !important;
  border: 1px solid transparent !important;
  min-height: 76px !important;
}

.calendar-day:hover {
  background: var(--pb-soft) !important;
  border-color: var(--pb-border) !important;
}

.timeline-item {
  border-radius: 16px !important;
  border: 1px solid var(--pb-border) !important;
  background: var(--pb-soft) !important;
}

input,
select,
textarea {
  border-radius: 12px !important;
}

@media (min-width: 980px) {
  .dashboard-nav {
    justify-content: center !important;
  }
}

@media (max-width: 760px) {
  .page {
    padding: 10px 10px 44px !important;
  }

  .topbar {
    top: 6px !important;
    border-radius: 20px !important;
  }

  .dashboard-nav {
    justify-content: flex-start !important;
    padding: 7px 8px 9px !important;
    gap: 4px !important;
  }

  .dashboard-nav button {
    min-height: 40px !important;
    padding: 0 11px !important;
    font-size: 11px !important;
    flex: 0 0 auto !important;
  }

  .grid {
    gap: 12px !important;
  }

  .grid > article,
  .card,
  .health-calendar-card,
  .health-timeline-card,
  .reminders-center,
  .heat-center {
    border-radius: 19px !important;
  }

  .grid > article {
    padding: 18px 14px 26px !important;
  }

  .grid > article > .card-head,
  .scene-heading {
    align-items: flex-start !important;
    flex-direction: column !important;
    padding-bottom: 14px !important;
    margin-bottom: 16px !important;
  }

  .grid > article > .card-head h3,
  .scene-heading h2 {
    font-size: 25px !important;
  }

  .kpi-grid,
  .summary-grid,
  .stats-grid,
  .health-grid {
    grid-template-columns: 1fr !important;
  }

  .calendar-day {
    min-height: 58px !important;
    padding: 7px !important;
  }
}


/* PawBook 6.10.4 New UI */
:host{
  --pb-surface:color-mix(in srgb,var(--card-background-color) 94%,transparent);
  --pb-soft:color-mix(in srgb,var(--secondary-background-color) 86%,transparent);
  --pb-line:color-mix(in srgb,var(--divider-color) 72%,transparent);
  --pb-accent-soft:color-mix(in srgb,var(--primary-color) 12%,transparent);
  --pb-shadow:0 24px 80px rgba(0,0,0,.10);
}
.pb-main-nav{
  justify-content:center!important;
  gap:5px!important;
}
.pb-main-nav>button{
  min-width:auto!important;
  padding:0 14px!important;
}
.pb-command{
  display:grid;
  gap:16px;
  margin-bottom:20px;
}
.pb-command-hero{
  position:relative;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:22px;
  align-items:center;
  min-height:245px;
  padding:30px;
  overflow:hidden;
  border:1px solid var(--pb-line);
  border-radius:30px;
  background:
    radial-gradient(circle at 86% 10%,color-mix(in srgb,var(--primary-color) 16%,transparent),transparent 36%),
    linear-gradient(145deg,var(--pb-surface),color-mix(in srgb,var(--secondary-background-color) 72%,var(--card-background-color)));
  box-shadow:var(--pb-shadow);
}
.pb-command-hero::after{
  content:"";
  position:absolute;
  width:280px;height:280px;
  right:-110px;bottom:-160px;
  border-radius:50%;
  border:44px solid color-mix(in srgb,var(--primary-color) 5%,transparent);
  pointer-events:none;
}
.pb-pet-visual{display:flex;align-items:center;gap:24px;min-width:0;z-index:1}
.pb-photo{flex:0 0 auto}
.pb-photo .pet-photo,.pb-photo .placeholder{width:170px!important;height:170px!important;border-radius:34px!important}
.pb-pet-copy{min-width:0}
.pb-eyebrow{display:block;font-size:10px;font-weight:900;letter-spacing:.16em;color:var(--primary-color);margin-bottom:8px}
.pb-pet-copy h2{font-size:clamp(34px,4vw,54px)!important;letter-spacing:-.045em!important;line-height:.98!important;margin:0 0 14px!important}
.pb-pet-meta{display:flex;flex-wrap:wrap;gap:8px}
.pb-pet-meta span{padding:7px 10px;border:1px solid var(--pb-line);border-radius:999px;background:color-mix(in srgb,var(--card-background-color) 72%,transparent);font-size:12px;color:var(--secondary-text-color)}
.pb-health-orbit{z-index:1}
.pb-health-score{
  width:188px;height:188px;border-radius:50%;
  display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;
  border:1px solid var(--pb-line);
  background:color-mix(in srgb,var(--card-background-color) 78%,transparent);
  box-shadow:inset 0 0 0 12px color-mix(in srgb,var(--secondary-background-color) 50%,transparent),0 18px 50px rgba(0,0,0,.08);
}
.pb-health-score.ok{box-shadow:inset 0 0 0 12px color-mix(in srgb,#43d17d 12%,transparent),0 18px 50px rgba(0,0,0,.08)}
.pb-health-score.warn{box-shadow:inset 0 0 0 12px color-mix(in srgb,#ffb74d 14%,transparent),0 18px 50px rgba(0,0,0,.08)}
.pb-health-score.danger{box-shadow:inset 0 0 0 12px color-mix(in srgb,var(--error-color) 13%,transparent),0 18px 50px rgba(0,0,0,.08)}
.pb-health-dot{width:9px;height:9px;border-radius:50%;background:#43d17d;margin-bottom:8px;box-shadow:0 0 0 6px color-mix(in srgb,#43d17d 15%,transparent)}
.pb-health-score.warn .pb-health-dot{background:#ffb74d;box-shadow:0 0 0 6px color-mix(in srgb,#ffb74d 15%,transparent)}
.pb-health-score.danger .pb-health-dot{background:var(--error-color);box-shadow:0 0 0 6px color-mix(in srgb,var(--error-color) 15%,transparent)}
.pb-health-score small,.pb-health-score em{color:var(--secondary-text-color);font-style:normal;font-size:11px}
.pb-health-score strong{font-size:18px;margin:5px 0;max-width:135px}
.pb-vitals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.pb-vital{
  min-height:112px!important;
  display:grid!important;grid-template-columns:42px minmax(0,1fr)!important;gap:12px!important;align-items:center!important;
  padding:16px!important;text-align:left!important;
  color:var(--primary-text-color)!important;background:var(--pb-surface)!important;border:1px solid var(--pb-line)!important;border-radius:18px!important;
  box-shadow:none!important;
}
.pb-vital:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--primary-color) 32%,var(--pb-line))!important}
.pb-vital-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:var(--pb-soft);font-size:21px}
.pb-vital small,.pb-vital strong,.pb-vital em{display:block}
.pb-vital small{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--secondary-text-color)}
.pb-vital strong{font-size:18px;margin:4px 0}
.pb-vital em{font-size:11px;font-style:normal;color:var(--secondary-text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pb-command-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.6fr);gap:12px}
.pb-focus,.pb-forecast,.pb-launcher{
  border:1px solid var(--pb-line);border-radius:22px;background:var(--pb-surface);padding:22px;
}
.pb-focus{background:linear-gradient(145deg,var(--pb-accent-soft),var(--pb-surface))}
.pb-section-label{font-size:10px;font-weight:900;letter-spacing:.13em;color:var(--primary-color);margin-bottom:12px}
.pb-focus h3{font-size:25px;margin:0 0 7px}.pb-focus p,.pb-forecast p{color:var(--secondary-text-color);margin:0}
.pb-focus-actions{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}
.pb-forecast strong{display:block;font-size:29px;letter-spacing:-.025em;margin:4px 0 8px}
.pb-link{padding:0!important;margin-top:16px!important;background:transparent!important;color:var(--primary-color)!important}
.pb-launcher{padding:22px}
.pb-launcher-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:14px}
.pb-launcher-head h3{font-size:23px;margin:0}
.pb-profile-button{flex:0 0 auto}
.pb-launcher-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.pb-launcher-grid>button{
  min-height:118px!important;display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:flex-end!important;
  padding:15px!important;border:1px solid var(--pb-line)!important;border-radius:16px!important;background:var(--pb-soft)!important;color:var(--primary-text-color)!important;text-align:left!important;
}
.pb-launcher-grid>button>span{font-size:24px;margin-bottom:auto}
.pb-launcher-grid>button strong{font-size:15px;margin:8px 0 2px}
.pb-launcher-grid>button small{font-size:10px;color:var(--secondary-text-color)}
.pb-utilities{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.pb-utilities button{min-height:48px!important;background:transparent!important;color:var(--secondary-text-color)!important;border:1px solid var(--pb-line)!important}
.pb-utilities button:hover{background:var(--pb-soft)!important;color:var(--primary-text-color)!important}
.pb-quick-add{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
.pb-quick-add>span{margin-right:auto;color:var(--secondary-text-color);font-size:12px;font-weight:800}
.pb-quick-add button{min-height:38px!important;padding:0 12px!important;border-radius:11px!important}
#smart-section .smart-item{border-left:0!important;box-shadow:none!important}

@media(max-width:980px){
  .pb-vitals{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pb-command-grid{grid-template-columns:1fr}
  .pb-launcher-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:760px){
  .pb-main-nav{justify-content:flex-start!important}
  .pb-main-nav>button{padding:0 12px!important}
  .pb-command{gap:10px}
  .pb-command-hero{grid-template-columns:1fr;padding:18px;min-height:0;border-radius:22px}
  .pb-pet-visual{gap:14px;align-items:flex-start}
  .pb-photo .pet-photo,.pb-photo .placeholder{width:92px!important;height:92px!important;border-radius:22px!important}
  .pb-photo::after{width:28px!important;height:28px!important;font-size:13px!important}
  .pb-pet-copy h2{font-size:32px!important;margin-bottom:10px!important}
  .pb-pet-meta{gap:5px}.pb-pet-meta span{font-size:10px;padding:5px 7px}
  .pb-health-orbit{display:none}
  .pb-vitals{grid-template-columns:1fr 1fr;gap:7px}
  .pb-vital{min-height:88px!important;grid-template-columns:34px minmax(0,1fr)!important;gap:8px!important;padding:12px!important;border-radius:15px!important}
  .pb-vital-icon{width:34px;height:34px;border-radius:10px;font-size:17px}
  .pb-vital strong{font-size:15px}.pb-vital em{display:none}
  .pb-focus,.pb-forecast,.pb-launcher{padding:16px;border-radius:18px}
  .pb-focus h3{font-size:21px}
  .pb-forecast strong{font-size:24px}
  .pb-launcher-head{align-items:flex-start}.pb-launcher-head h3{font-size:20px}
  .pb-profile-button{font-size:11px!important;padding:0 10px!important}
  .pb-launcher-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
  .pb-launcher-grid>button{min-height:98px!important;padding:12px!important}
  .pb-launcher-grid>button:last-child{grid-column:1/-1;min-height:82px!important}
  .pb-utilities{grid-template-columns:1fr 1fr}
  .pb-quick-add{justify-content:flex-start}.pb-quick-add>span{width:100%;margin:0}
}


/* PawBook 6.10.4 DOMOTICA shell + Agenda */
.pb-domotica-header{
  position:sticky!important;
  top:10px!important;
  z-index:60!important;
  overflow:hidden!important;
  border:1px solid var(--pb-line)!important;
  border-radius:22px!important;
  background:color-mix(in srgb,var(--card-background-color) 91%,transparent)!important;
  box-shadow:0 16px 48px rgba(0,0,0,.10)!important;
  backdrop-filter:blur(20px) saturate(1.15)!important;
  -webkit-backdrop-filter:blur(20px) saturate(1.15)!important;
}

.pb-domotica-top{
  min-height:70px!important;
  padding:10px 14px!important;
}

.pb-brand-icon{
  width:42px!important;
  height:42px!important;
  border-radius:13px!important;
  display:grid!important;
  place-items:center!important;
  background:var(--pb-accent-soft)!important;
  border:1px solid color-mix(in srgb,var(--primary-color) 20%,transparent)!important;
}
.pb-brand-icon svg{width:26px!important;height:26px!important}

.pb-header-actions{gap:8px!important}
.pb-header-status{
  min-height:38px!important;
  display:inline-flex!important;
  align-items:center!important;
  gap:8px!important;
  padding:0 12px!important;
  color:var(--primary-text-color)!important;
  background:var(--pb-soft)!important;
  border:1px solid var(--pb-line)!important;
  border-radius:11px!important;
  font-size:11px!important;
  font-weight:800!important;
}
.pb-status-led{
  width:8px;height:8px;border-radius:50%;display:inline-block;background:#43d17d;
  box-shadow:0 0 0 5px color-mix(in srgb,#43d17d 14%,transparent);
}
.pb-status-led.warn{
  background:#ffb74d;
  box-shadow:0 0 0 5px color-mix(in srgb,#ffb74d 14%,transparent);
}

.pb-domotica-nav{
  border-top:1px solid var(--pb-line)!important;
  padding:6px 9px 8px!important;
  background:color-mix(in srgb,var(--secondary-background-color) 36%,transparent)!important;
}
.pb-domotica-nav>button{
  min-height:38px!important;
  border-radius:10px!important;
  font-size:11px!important;
  font-weight:800!important;
}
.pb-domotica-nav>button.active{
  background:var(--pb-accent-soft)!important;
  border-color:color-mix(in srgb,var(--primary-color) 22%,transparent)!important;
}

/* Main command card: flatter, closer to Inverter/CBBO */
.pb-command-hero{
  min-height:215px!important;
  padding:26px!important;
  border-radius:22px!important;
  box-shadow:0 14px 40px rgba(0,0,0,.065)!important;
}
.pb-photo .pet-photo,.pb-photo .placeholder{
  width:150px!important;
  height:150px!important;
  border-radius:26px!important;
}
.pb-health-score{
  width:166px!important;height:166px!important;
}
.pb-vital{
  min-height:100px!important;
  border-radius:15px!important;
}
.pb-focus,.pb-forecast,.pb-launcher{
  border-radius:18px!important;
}
.pb-launcher-grid>button{
  border-radius:14px!important;
}

/* Agenda */
.pb-agenda{
  padding:0!important;
  overflow:hidden!important;
  border-radius:22px!important;
  border:1px solid var(--pb-line)!important;
  background:var(--pb-surface)!important;
  box-shadow:0 14px 42px rgba(0,0,0,.055)!important;
}
.pb-agenda::before{display:none!important}

.pb-agenda-head{
  min-height:88px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:18px;
  padding:18px 22px;
  border-bottom:1px solid var(--pb-line);
  background:
    linear-gradient(100deg,color-mix(in srgb,var(--primary-color) 7%,transparent),transparent 48%),
    var(--pb-surface);
}
.pb-agenda-kicker{
  display:block;
  margin-bottom:4px;
  font-size:9px;
  font-weight:900;
  letter-spacing:.16em;
  color:var(--primary-color);
}
.pb-agenda-head h3{
  margin:0!important;
  font-size:25px!important;
  letter-spacing:-.025em!important;
}
.pb-agenda-head p{
  margin:4px 0 0;
  color:var(--secondary-text-color);
  font-size:12px;
}
.pb-calendar-controls button{
  width:38px!important;
  height:38px!important;
  padding:0!important;
  border-radius:10px!important;
}
.pb-calendar-controls .pb-today-btn{
  width:auto!important;
  padding:0 13px!important;
}

.pb-agenda-layout{
  display:grid;
  grid-template-columns:minmax(0,1.65fr) minmax(300px,.65fr);
  min-height:560px;
}
.pb-calendar-panel{
  min-width:0;
  padding:20px 22px 18px;
}
.pb-agenda-side{
  min-width:0;
  padding:20px;
  border-left:1px solid var(--pb-line);
  background:color-mix(in srgb,var(--secondary-background-color) 42%,var(--card-background-color));
}

.pb-calendar-title-row{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:16px;
  margin-bottom:14px;
}
.pb-calendar-title-row>div:first-child{
  display:flex;flex-direction:column;gap:2px;
}
.pb-calendar-title-row small,
.pb-agenda-side-head small{
  font-size:9px;
  font-weight:900;
  letter-spacing:.13em;
  color:var(--secondary-text-color);
}
.pb-calendar-title-row .calendar-month-title{
  margin:0!important;
  font-size:26px!important;
  line-height:1!important;
  text-transform:capitalize;
}
.pb-calendar-legend{
  display:flex;
  flex-wrap:wrap;
  justify-content:flex-end;
  gap:8px 10px;
}
.pb-calendar-legend span{
  display:inline-flex;
  align-items:center;
  gap:5px;
  font-size:9px;
  color:var(--secondary-text-color);
}
.pb-calendar-legend i,
.pb-event-dots i{
  width:7px;height:7px;border-radius:50%;display:inline-block;background:var(--primary-color);
}
.pb-calendar-legend i.vaccine,.pb-event-dots i.vaccine{background:#4da3ff}
.pb-calendar-legend i.treatment,.pb-event-dots i.treatment{background:#a976ff}
.pb-calendar-legend i.heat,.pb-event-dots i.heat{background:#ff6f91}
.pb-calendar-legend i.other,.pb-event-dots i.other{background:#6dc99b}

.pb-weekdays{
  margin-bottom:5px;
}
.pb-weekdays span{
  padding:7px 4px!important;
  font-size:9px!important;
  letter-spacing:.08em;
  text-transform:uppercase;
}

.pb-calendar-grid{
  gap:5px!important;
  background:transparent!important;
}
.pb-calendar-day{
  min-height:76px!important;
  padding:8px!important;
  border:1px solid transparent!important;
  border-radius:12px!important;
  background:transparent!important;
  transition:.16s ease;
}
.pb-calendar-day:hover{
  border-color:var(--pb-line)!important;
  background:var(--pb-soft)!important;
}
.pb-calendar-day.has-events{
  background:color-mix(in srgb,var(--secondary-background-color) 45%,transparent)!important;
}
.pb-calendar-day.outside{
  opacity:.30!important;
}
.pb-day-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:4px;
}
.pb-calendar-day .calendar-day-number{
  width:27px!important;height:27px!important;
  font-size:11px!important;
  border-radius:9px!important;
}
.pb-calendar-day.today .calendar-day-number{
  background:var(--primary-color)!important;
  color:#fff!important;
  box-shadow:0 5px 14px color-mix(in srgb,var(--primary-color) 30%,transparent);
}
.pb-event-count{
  min-width:18px;height:18px;
  display:grid;place-items:center;
  padding:0 4px;
  border-radius:999px;
  background:var(--pb-accent-soft);
  color:var(--primary-color);
  font-size:8px;
  font-weight:900;
}
.pb-event-dots{
  min-height:18px;
  display:flex;
  align-items:center;
  gap:4px;
  margin-top:15px;
}
.pb-event-dots i{
  width:8px;height:8px;
}
.pb-event-dots b{
  font-size:8px;color:var(--secondary-text-color);
}

.pb-calendar-foot{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  margin-top:13px;
  padding-top:12px;
  border-top:1px solid var(--pb-line);
  color:var(--secondary-text-color);
  font-size:10px;
}

.pb-agenda-side-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:10px;
  margin-bottom:14px;
}
.pb-agenda-side-head h4{
  margin:3px 0 0;
  font-size:20px;
}
.pb-event-total{
  min-width:28px;height:28px;
  display:grid;place-items:center;
  border-radius:9px;
  background:var(--pb-accent-soft);
  color:var(--primary-color);
  font-size:11px;
  font-weight:900;
}

.pb-upcoming-list{
  display:grid;
  gap:7px;
}
.pb-upcoming-item{
  position:relative;
  display:grid;
  grid-template-columns:42px 32px minmax(0,1fr) auto;
  gap:9px;
  align-items:center;
  min-height:62px;
  padding:8px 9px;
  border:1px solid var(--pb-line);
  border-radius:13px;
  background:var(--card-background-color);
}
.pb-upcoming-date{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  min-height:42px;
  border-radius:10px;
  background:var(--pb-soft);
}
.pb-upcoming-date strong{
  font-size:17px;line-height:1;
}
.pb-upcoming-date small{
  margin-top:3px;
  font-size:8px;
  color:var(--secondary-text-color);
}
.pb-upcoming-icon{
  width:30px;height:30px;
  display:grid;place-items:center;
  border-radius:9px;
  background:var(--pb-soft);
  font-size:16px;
}
.pb-upcoming-copy{
  min-width:0;
}
.pb-upcoming-copy strong,
.pb-upcoming-copy small{
  display:block;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.pb-upcoming-copy strong{
  font-size:11px;
}
.pb-upcoming-copy small{
  margin-top:3px;
  color:var(--secondary-text-color);
  font-size:9px;
}
.pb-estimate{
  padding:4px 6px;
  border-radius:7px;
  background:color-mix(in srgb,#ff6f91 12%,transparent);
  color:#d74d70;
  font-size:7px;
  font-weight:900;
  letter-spacing:.08em;
}
.pb-agenda-empty{
  min-height:170px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:20px;
  color:var(--secondary-text-color);
}
.pb-agenda-empty>span{
  width:42px;height:42px;
  display:grid;place-items:center;
  margin-bottom:10px;
  border-radius:13px;
  background:color-mix(in srgb,#43d17d 12%,transparent);
  color:#36a966;
  font-size:20px;
}
.pb-agenda-empty strong{color:var(--primary-text-color)}
.pb-agenda-empty small{margin-top:4px}

.pb-agenda-health-btn{
  width:100%!important;
  min-height:55px!important;
  display:grid!important;
  grid-template-columns:30px minmax(0,1fr) auto!important;
  gap:9px!important;
  align-items:center!important;
  margin-top:12px!important;
  padding:8px 10px!important;
  text-align:left!important;
  color:var(--primary-text-color)!important;
  border:1px solid color-mix(in srgb,var(--primary-color) 20%,var(--pb-line))!important;
  border-radius:13px!important;
  background:var(--pb-accent-soft)!important;
}
.pb-agenda-health-btn>span:first-child{
  width:30px;height:30px;
  display:grid;place-items:center;
  border-radius:9px;
  background:color-mix(in srgb,var(--primary-color) 14%,transparent);
  color:var(--primary-color);
}
.pb-agenda-health-btn strong,
.pb-agenda-health-btn small{
  display:block;
}
.pb-agenda-health-btn strong{font-size:11px}
.pb-agenda-health-btn small{margin-top:2px;color:var(--secondary-text-color);font-size:9px}
.pb-agenda-health-btn>b{font-size:20px;color:var(--primary-color)}

@media(max-width:900px){
  .pb-agenda-layout{grid-template-columns:1fr}
  .pb-agenda-side{
    border-left:0;
    border-top:1px solid var(--pb-line);
  }
  .pb-upcoming-list{
    grid-template-columns:1fr 1fr;
  }
}

@media(max-width:760px){
  .pb-domotica-header{
    top:6px!important;
    border-radius:17px!important;
  }
  .pb-domotica-top{
    min-height:58px!important;
    padding:7px 9px!important;
  }
  .pb-brand-icon{
    width:35px!important;height:35px!important;border-radius:10px!important;
  }
  .pb-brand-icon svg{width:22px!important;height:22px!important}
  .brand-subtitle{display:none!important}
  .pb-header-status{display:none!important}
  .support-project-label{display:none!important}

  .pb-domotica-nav{
    justify-content:flex-start!important;
    overflow-x:auto!important;
    padding:5px 7px 7px!important;
  }
  .pb-domotica-nav>button{
    flex:0 0 auto!important;
    min-height:36px!important;
    padding:0 10px!important;
    font-size:10px!important;
  }

  .pb-command-hero{
    padding:17px!important;
    border-radius:18px!important;
  }
  .pb-photo .pet-photo,.pb-photo .placeholder{
    width:88px!important;height:88px!important;border-radius:18px!important;
  }

  .pb-agenda{
    border-radius:18px!important;
  }
  .pb-agenda-head{
    min-height:0;
    align-items:flex-start;
    padding:15px;
  }
  .pb-agenda-head h3{font-size:22px!important}
  .pb-agenda-head p{font-size:10px}
  .pb-calendar-controls button{
    width:34px!important;height:34px!important;
  }
  .pb-calendar-controls .pb-today-btn{
    padding:0 10px!important;
  }
  .pb-calendar-panel{
    padding:14px 10px 12px;
  }
  .pb-calendar-title-row{
    align-items:flex-start;
    flex-direction:column;
    gap:9px;
  }
  .pb-calendar-title-row .calendar-month-title{
    font-size:22px!important;
  }
  .pb-calendar-legend{
    justify-content:flex-start;
  }
  .pb-calendar-day{
    min-height:58px!important;
    padding:5px!important;
    border-radius:9px!important;
  }
  .pb-calendar-day .calendar-day-number{
    width:23px!important;height:23px!important;border-radius:7px!important;font-size:10px!important;
  }
  .pb-event-count{display:none}
  .pb-event-dots{
    gap:2px;
    margin-top:9px;
  }
  .pb-event-dots i{
    width:6px;height:6px;
  }
  .pb-calendar-foot{
    justify-content:flex-start;
    font-size:9px;
  }
  .pb-agenda-side{
    padding:14px 12px;
  }
  .pb-upcoming-list{
    grid-template-columns:1fr;
  }
  .pb-upcoming-item{
    min-height:58px;
  }
}


/* PawBook 6.10.4 Health OS stable rebuild */
.pb-os-header{
  position:sticky!important;top:10px!important;z-index:70!important;
  overflow:hidden!important;border:1px solid color-mix(in srgb,var(--divider-color) 68%,transparent)!important;
  border-radius:20px!important;background:color-mix(in srgb,var(--card-background-color) 94%,transparent)!important;
  box-shadow:0 14px 44px rgba(0,0,0,.09)!important;
  backdrop-filter:blur(20px) saturate(1.12)!important;-webkit-backdrop-filter:blur(20px) saturate(1.12)!important;
}
.pb-os-bar{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 12px}
.pb-os-left,.pb-os-right{display:flex;align-items:center;gap:9px}
.pb-os-hamburger{width:38px!important;height:38px!important;border-radius:10px!important}
.pb-os-logo{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--primary-color) 11%,transparent);color:var(--primary-color)}
.pb-os-logo svg{width:24px;height:24px;fill:currentColor}
.pb-os-brand>div{display:flex;align-items:center;gap:7px}.pb-os-brand strong{font-size:15px}.pb-os-brand>div span{padding:3px 6px;border-radius:6px;background:var(--secondary-background-color);color:var(--secondary-text-color);font-size:8px;font-weight:900}
.pb-os-brand small{display:block;margin-top:1px;color:var(--secondary-text-color);font-size:9px}
.pb-os-health{min-height:36px!important;display:inline-flex!important;align-items:center!important;gap:7px!important;padding:0 11px!important;border:1px solid var(--divider-color)!important;border-radius:10px!important;background:transparent!important;color:var(--primary-text-color)!important;font-size:10px!important;font-weight:800!important}
.pb-os-health i{width:7px;height:7px;border-radius:50%;background:#44c97a;box-shadow:0 0 0 4px color-mix(in srgb,#44c97a 12%,transparent)}
.pb-os-health i.warn{background:#ffae42;box-shadow:0 0 0 4px color-mix(in srgb,#ffae42 12%,transparent)}
.pb-os-nav{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:2px!important;margin:0!important;padding:4px 8px 7px!important;border-top:1px solid color-mix(in srgb,var(--divider-color) 65%,transparent)!important;background:transparent!important;overflow-x:auto!important;scrollbar-width:none}
.pb-os-nav::-webkit-scrollbar{display:none}.pb-os-nav>button{flex:0 0 auto!important;min-height:34px!important;padding:0 11px!important;border-radius:9px!important;border:0!important;background:transparent!important;color:var(--secondary-text-color)!important;font-size:10px!important;font-weight:850!important}
.pb-os-nav>button.active{background:color-mix(in srgb,var(--primary-color) 10%,transparent)!important;color:var(--primary-color)!important}
.pb-os-nav>button:hover{background:var(--secondary-background-color)!important;color:var(--primary-text-color)!important}

.pb-os-home{display:grid;gap:11px;margin-bottom:18px}
.pb-os-hero{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px;align-items:stretch;min-height:210px;padding:22px;border:1px solid color-mix(in srgb,var(--divider-color) 68%,transparent);border-radius:22px;background:linear-gradient(135deg,color-mix(in srgb,var(--card-background-color) 96%,transparent),color-mix(in srgb,var(--primary-color) 5%,var(--card-background-color)));box-shadow:0 13px 42px rgba(0,0,0,.055)}
.pb-os-pet{display:flex;align-items:center;gap:19px;min-width:0}.pb-os-photo{flex:0 0 auto}.pb-os-photo .pet-photo,.pb-os-photo .placeholder{width:142px!important;height:142px!important;border-radius:28px!important;box-shadow:0 12px 34px rgba(0,0,0,.10)!important}
.pb-os-kicker{display:block;font-size:8px;font-weight:950;letter-spacing:.17em;color:var(--primary-color);margin-bottom:6px}
.pb-os-pet-copy h2{margin:0!important;font-size:clamp(34px,4vw,50px)!important;line-height:.98!important;letter-spacing:-.045em!important}.pb-os-pet-copy>p{margin:8px 0 13px;color:var(--secondary-text-color);font-size:13px}
.pb-os-tags{display:flex;flex-wrap:wrap;gap:6px}.pb-os-tags span{padding:6px 8px;border-radius:8px;background:color-mix(in srgb,var(--secondary-background-color) 78%,transparent);color:var(--secondary-text-color);font-size:9px}
.pb-os-health-card{display:flex;align-items:center;gap:14px;padding:18px;border-radius:18px;background:color-mix(in srgb,var(--secondary-background-color) 65%,transparent);border:1px solid color-mix(in srgb,var(--divider-color) 62%,transparent)}
.pb-os-health-ring{width:70px;height:70px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;background:color-mix(in srgb,#44c97a 10%,transparent);box-shadow:inset 0 0 0 7px color-mix(in srgb,#44c97a 11%,transparent)}
.pb-os-health-ring span{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:#44c97a;color:white;font-size:18px;font-weight:900}
.pb-os-health-card.warn .pb-os-health-ring{background:color-mix(in srgb,#ffae42 10%,transparent);box-shadow:inset 0 0 0 7px color-mix(in srgb,#ffae42 11%,transparent)}.pb-os-health-card.warn .pb-os-health-ring span{background:#ffae42}
.pb-os-health-card.danger .pb-os-health-ring{background:color-mix(in srgb,var(--error-color) 10%,transparent);box-shadow:inset 0 0 0 7px color-mix(in srgb,var(--error-color) 11%,transparent)}.pb-os-health-card.danger .pb-os-health-ring span{background:var(--error-color)}
.pb-os-health-card small,.pb-os-health-card strong,.pb-os-health-card p{display:block}.pb-os-health-card small{font-size:8px;font-weight:900;letter-spacing:.12em;color:var(--secondary-text-color)}.pb-os-health-card strong{margin:4px 0;font-size:17px}.pb-os-health-card p{margin:0;color:var(--secondary-text-color);font-size:10px}

.pb-os-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.pb-os-strip>button{min-height:70px!important;display:flex!important;align-items:center!important;gap:10px!important;padding:11px 13px!important;text-align:left!important;border:1px solid color-mix(in srgb,var(--divider-color) 64%,transparent)!important;border-radius:14px!important;background:var(--card-background-color)!important;color:var(--primary-text-color)!important}.pb-os-strip>button>span{font-size:20px}.pb-os-strip small,.pb-os-strip strong{display:block}.pb-os-strip small{font-size:7px;letter-spacing:.1em;color:var(--secondary-text-color)}.pb-os-strip strong{margin-top:3px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb-os-main-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.55fr);gap:8px}.pb-os-now,.pb-os-next,.pb-os-centers{padding:18px;border:1px solid color-mix(in srgb,var(--divider-color) 64%,transparent);border-radius:17px;background:var(--card-background-color)}
.pb-os-section-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:13px}.pb-os-section-head h3{margin:0;font-size:20px}.pb-os-section-head>button,.pb-os-next>button{padding:0!important;border:0!important;background:transparent!important;color:var(--primary-color)!important;font-size:10px!important}
.pb-os-priority,.pb-os-clear{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:11px;align-items:center;padding:13px;border-radius:13px;background:color-mix(in srgb,#ffae42 8%,var(--secondary-background-color))}.pb-os-clear{grid-template-columns:40px minmax(0,1fr);background:color-mix(in srgb,#44c97a 7%,var(--secondary-background-color))}
.pb-os-priority-icon,.pb-os-clear>span{width:40px;height:40px;display:grid;place-items:center;border-radius:11px;background:color-mix(in srgb,#ffae42 17%,transparent);color:#d78a15;font-size:17px;font-weight:900}.pb-os-clear>span{background:color-mix(in srgb,#44c97a 16%,transparent);color:#36a966}.pb-os-priority strong,.pb-os-clear strong{font-size:12px}.pb-os-priority p,.pb-os-clear p{margin:3px 0 0;color:var(--secondary-text-color);font-size:9px}.pb-os-priority>button{min-height:32px!important;padding:0 9px!important;border-radius:9px!important;font-size:9px!important}
.pb-os-next>strong{display:block;margin:5px 0 7px;font-size:27px;letter-spacing:-.035em}.pb-os-next>p{min-height:34px;margin:0 0 12px;color:var(--secondary-text-color);font-size:10px;line-height:1.45}
.pb-os-centers-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.pb-os-centers-grid>button{min-height:79px!important;display:grid!important;grid-template-columns:34px minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;padding:11px!important;text-align:left!important;border:1px solid color-mix(in srgb,var(--divider-color) 62%,transparent)!important;border-radius:12px!important;background:color-mix(in srgb,var(--secondary-background-color) 54%,transparent)!important;color:var(--primary-text-color)!important}.pb-os-centers-grid>button>span{font-size:18px}.pb-os-centers-grid strong,.pb-os-centers-grid small{display:block}.pb-os-centers-grid strong{font-size:11px}.pb-os-centers-grid small{margin-top:2px;color:var(--secondary-text-color);font-size:8px}.pb-os-centers-grid b{font-size:17px;color:var(--secondary-text-color)}
.pb-os-footer-tools{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.pb-os-footer-tools>button{min-height:40px!important;border:1px solid color-mix(in srgb,var(--divider-color) 60%,transparent)!important;border-radius:11px!important;background:transparent!important;color:var(--secondary-text-color)!important;font-size:9px!important}.pb-os-footer-tools>button:hover{background:var(--secondary-background-color)!important;color:var(--primary-text-color)!important}

/* Agenda - no card grid */
.pb-os-agenda{padding:0!important;overflow:hidden!important;border:1px solid color-mix(in srgb,var(--divider-color) 64%,transparent)!important;border-radius:20px!important;background:var(--card-background-color)!important;box-shadow:0 12px 38px rgba(0,0,0,.05)!important}.pb-os-agenda::before{display:none!important}
.pb-os-agenda-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid color-mix(in srgb,var(--divider-color) 60%,transparent)}.pb-os-agenda-top h3{margin:0!important;font-size:24px!important;text-transform:capitalize;letter-spacing:-.025em}.pb-os-agenda-top p{margin:4px 0 0;color:var(--secondary-text-color);font-size:10px}
.pb-os-agenda-controls{display:flex;align-items:center;gap:5px}.pb-os-agenda-controls button{min-width:34px!important;height:34px!important;padding:0 9px!important;border:1px solid var(--divider-color)!important;border-radius:9px!important;background:transparent!important;color:var(--primary-text-color)!important;font-size:11px!important}.pb-os-agenda-controls button:first-child,.pb-os-agenda-controls button:last-child{font-size:18px!important}
.pb-os-agenda-body{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);min-height:500px}.pb-os-mini-calendar{padding:18px 20px}.pb-os-weekdays,.pb-os-days{display:grid;grid-template-columns:repeat(7,1fr)}.pb-os-weekdays{margin-bottom:8px}.pb-os-weekdays span{text-align:center;color:var(--secondary-text-color);font-size:8px;font-weight:900;letter-spacing:.08em}
.pb-os-days{row-gap:7px}.pb-os-day{position:relative;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border-radius:11px;color:var(--primary-text-color)}.pb-os-day>span{width:29px;height:29px;display:grid;place-items:center;border-radius:50%;font-size:10px;font-weight:750}.pb-os-day:hover{background:color-mix(in srgb,var(--secondary-background-color) 58%,transparent)}.pb-os-day.outside{opacity:.22}.pb-os-day.today>span{background:var(--primary-color);color:#fff;box-shadow:0 5px 15px color-mix(in srgb,var(--primary-color) 25%,transparent)}.pb-os-day-events{height:6px;display:flex;align-items:center;gap:2px}.pb-os-day-events i,.pb-os-calendar-legend i{width:5px;height:5px;border-radius:50%;background:#6dc99b}.pb-os-day-events i.vaccine,.pb-os-calendar-legend i.vaccine{background:#4da3ff}.pb-os-day-events i.treatment,.pb-os-calendar-legend i.treatment{background:#a976ff}.pb-os-day-events i.heat,.pb-os-calendar-legend i.heat{background:#ff6f91}
.pb-os-calendar-legend{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin-top:14px;padding-top:13px;border-top:1px solid color-mix(in srgb,var(--divider-color) 55%,transparent)}.pb-os-calendar-legend span{display:flex;align-items:center;gap:5px;color:var(--secondary-text-color);font-size:8px}.pb-os-calendar-legend i{width:6px;height:6px}
.pb-os-agenda-stream{padding:18px;border-left:1px solid color-mix(in srgb,var(--divider-color) 60%,transparent);background:color-mix(in srgb,var(--secondary-background-color) 34%,var(--card-background-color))}.pb-os-stream-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.pb-os-stream-head h4{margin:0;font-size:19px}.pb-os-stream-head>strong{min-width:27px;height:27px;display:grid;place-items:center;border-radius:8px;background:color-mix(in srgb,var(--primary-color) 10%,transparent);color:var(--primary-color);font-size:10px}
.pb-os-stream{display:grid}.pb-os-stream-item{display:grid;grid-template-columns:38px 20px minmax(0,1fr) 28px;gap:7px;align-items:start;min-height:61px}.pb-os-stream-date{text-align:center;padding-top:2px}.pb-os-stream-date strong,.pb-os-stream-date span{display:block}.pb-os-stream-date strong{font-size:16px;line-height:1}.pb-os-stream-date span{margin-top:3px;color:var(--secondary-text-color);font-size:8px}.pb-os-stream-line{position:relative;height:100%;display:flex;justify-content:center}.pb-os-stream-line i{position:relative;z-index:2;width:8px;height:8px;margin-top:5px;border-radius:50%;background:#6dc99b;box-shadow:0 0 0 4px color-mix(in srgb,#6dc99b 12%,transparent)}.pb-os-stream-item.vaccine .pb-os-stream-line i{background:#4da3ff;box-shadow:0 0 0 4px color-mix(in srgb,#4da3ff 12%,transparent)}.pb-os-stream-item.treatment .pb-os-stream-line i{background:#a976ff;box-shadow:0 0 0 4px color-mix(in srgb,#a976ff 12%,transparent)}.pb-os-stream-item.heat .pb-os-stream-line i{background:#ff6f91;box-shadow:0 0 0 4px color-mix(in srgb,#ff6f91 12%,transparent)}.pb-os-stream-line b{position:absolute;top:15px;bottom:-5px;width:1px;background:var(--divider-color)}
.pb-os-stream-copy{padding-top:0}.pb-os-stream-copy small,.pb-os-stream-copy strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pb-os-stream-copy small{margin-bottom:3px;color:var(--secondary-text-color);font-size:7px;font-weight:800;letter-spacing:.08em}.pb-os-stream-copy strong{font-size:10px}.pb-os-stream-icon{width:27px;height:27px;display:grid;place-items:center;border-radius:8px;background:var(--card-background-color);font-size:13px}.pb-os-stream-empty{min-height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--secondary-text-color)}.pb-os-stream-empty>span{width:42px;height:42px;display:grid;place-items:center;margin-bottom:9px;border-radius:13px;background:color-mix(in srgb,#44c97a 11%,transparent);color:#36a966;font-size:19px}.pb-os-stream-empty strong{color:var(--primary-text-color)}.pb-os-stream-empty p{margin:4px 0 0;font-size:9px}
.pb-os-agenda-smart{width:100%!important;min-height:48px!important;display:grid!important;grid-template-columns:28px minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;margin-top:8px!important;padding:7px 9px!important;text-align:left!important;border:1px solid color-mix(in srgb,var(--primary-color) 18%,var(--divider-color))!important;border-radius:11px!important;background:color-mix(in srgb,var(--primary-color) 7%,transparent)!important;color:var(--primary-text-color)!important}.pb-os-agenda-smart>span{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:color-mix(in srgb,var(--primary-color) 11%,transparent);color:var(--primary-color)}.pb-os-agenda-smart strong,.pb-os-agenda-smart small{display:block}.pb-os-agenda-smart strong{font-size:10px}.pb-os-agenda-smart small{margin-top:1px;color:var(--secondary-text-color);font-size:8px}.pb-os-agenda-smart>b{color:var(--primary-color);font-size:17px}

@media(max-width:980px){
  .pb-os-hero{grid-template-columns:1fr}.pb-os-health-card{max-width:none}.pb-os-strip{grid-template-columns:1fr 1fr}.pb-os-main-grid{grid-template-columns:1fr}.pb-os-centers-grid{grid-template-columns:1fr 1fr}.pb-os-agenda-body{grid-template-columns:1fr}.pb-os-agenda-stream{border-left:0;border-top:1px solid var(--divider-color)}
}
@media(max-width:760px){
  .pb-os-header{top:6px!important;border-radius:15px!important}.pb-os-bar{min-height:54px;padding:6px 7px}.pb-os-logo{width:34px;height:34px;border-radius:10px}.pb-os-logo svg{width:20px;height:20px}.pb-os-brand small{display:none}.pb-os-health{display:none!important}.support-project-label{display:none!important}.pb-os-nav{padding:4px 6px 6px!important}.pb-os-nav>button{min-height:32px!important;padding:0 9px!important;font-size:9px!important}
  .pb-os-home{gap:8px}.pb-os-hero{min-height:0;padding:15px;border-radius:17px}.pb-os-pet{align-items:flex-start;gap:12px}.pb-os-photo .pet-photo,.pb-os-photo .placeholder{width:84px!important;height:84px!important;border-radius:18px!important}.pb-os-pet-copy h2{font-size:30px!important}.pb-os-pet-copy>p{margin:5px 0 8px;font-size:10px}.pb-os-tags{gap:4px}.pb-os-tags span{padding:4px 6px;border-radius:6px;font-size:8px}.pb-os-health-card{padding:12px}.pb-os-health-ring{width:54px;height:54px}.pb-os-health-ring span{width:30px;height:30px;font-size:14px}.pb-os-strip{gap:5px}.pb-os-strip>button{min-height:58px!important;padding:8px 9px!important;border-radius:11px!important}.pb-os-strip>button>span{font-size:16px}.pb-os-strip strong{font-size:11px}.pb-os-now,.pb-os-next,.pb-os-centers{padding:14px;border-radius:14px}.pb-os-centers-grid{gap:5px}.pb-os-centers-grid>button{min-height:67px!important;padding:9px!important}.pb-os-footer-tools{grid-template-columns:1fr 1fr}
  .pb-os-agenda{border-radius:16px!important}.pb-os-agenda-top{align-items:flex-start;padding:14px}.pb-os-agenda-top h3{font-size:21px!important}.pb-os-agenda-top p{font-size:9px}.pb-os-agenda-controls button{min-width:31px!important;height:31px!important;padding:0 7px!important}.pb-os-mini-calendar{padding:14px 8px}.pb-os-days{row-gap:3px}.pb-os-day{min-height:43px;border-radius:8px}.pb-os-day>span{width:26px;height:26px;font-size:9px}.pb-os-calendar-legend{gap:8px}.pb-os-agenda-stream{padding:14px 11px}.pb-os-stream-item{grid-template-columns:34px 18px minmax(0,1fr) 26px;min-height:57px}
}


/* PawBook 6.10.4 - Modern Health Center */
:host{
  --pb-accent:#58d6c7;
  --pb-accent-2:#76e2d5;
  --pb-accent-soft:color-mix(in srgb,var(--pb-accent) 12%,transparent);
  --pb-accent-line:color-mix(in srgb,var(--pb-accent) 32%,transparent);
  --pb-panel:#191b1b;
  --pb-panel-2:#1e2121;
  --pb-line:rgba(255,255,255,.09);
  --pb-muted:rgba(255,255,255,.56);
}
.pb-modern-header{
  position:sticky!important;top:0!important;z-index:80!important;
  border:0!important;border-radius:0!important;
  background:#101111!important;
  box-shadow:none!important;
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
}
.pb-modern-brandrow{
  min-height:66px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 16px;
}
.pb-modern-brandleft,.pb-modern-actions{display:flex;align-items:center;gap:10px}
.pb-modern-hamburger{width:38px!important;height:38px!important;border-radius:10px!important}
.pb-modern-logo{
  width:42px;height:42px;display:grid;place-items:center;border-radius:12px;
  background:linear-gradient(145deg,color-mix(in srgb,var(--pb-accent) 16%,#111),#141616);
  border:1px solid color-mix(in srgb,var(--pb-accent) 42%,transparent);
  color:var(--pb-accent);
}
.pb-modern-logo svg{width:24px;height:24px;fill:currentColor}
.pb-modern-titleline{display:flex;align-items:center;gap:8px}
.pb-modern-titleline strong{font-size:16px;letter-spacing:-.02em}
.pb-modern-version{
  padding:3px 6px;border-radius:999px;
  border:1px solid color-mix(in srgb,var(--pb-accent) 44%,transparent);
  color:var(--pb-accent);font-size:8px;font-weight:900;
  background:color-mix(in srgb,var(--pb-accent) 8%,transparent);
}
.pb-modern-brandcopy small{display:block;margin-top:1px;color:var(--secondary-text-color);font-size:9px}
.pb-modern-status{
  min-height:34px!important;display:flex!important;align-items:center!important;gap:7px!important;padding:0 10px!important;
  border:1px solid var(--divider-color)!important;border-radius:9px!important;background:transparent!important;color:var(--primary-text-color)!important;font-size:9px!important;font-weight:800!important;
}
.pb-modern-dot{width:7px;height:7px;border-radius:50%;background:#48d884;box-shadow:0 0 0 4px color-mix(in srgb,#48d884 13%,transparent)}
.pb-modern-dot.warn{background:#ffb64c;box-shadow:0 0 0 4px color-mix(in srgb,#ffb64c 13%,transparent)}
.pb-modern-nav{
  display:flex!important;align-items:center!important;gap:10px!important;overflow-x:auto!important;scrollbar-width:none;
  padding:0 16px!important;margin:0!important;border-top:0!important;border-bottom:1px solid var(--divider-color)!important;background:#101111!important;
}
.pb-modern-nav::-webkit-scrollbar{display:none}
.pb-modern-nav>button{
  position:relative;flex:0 0 auto!important;min-height:46px!important;padding:0 2px!important;
  border:0!important;border-radius:0!important;background:transparent!important;color:var(--secondary-text-color)!important;
  font-size:10px!important;font-weight:850!important;display:flex!important;align-items:center!important;gap:7px!important;
}
.pb-modern-nav>button.active{color:var(--pb-accent)!important;background:transparent!important}
.pb-modern-nav>button.active::after{
  content:"";position:absolute;left:0;right:0;bottom:0;height:3px;border-radius:999px 999px 0 0;background:var(--pb-accent);
}
.pb-nav-glyph{font-size:15px}

.pb-modern-page{display:grid;gap:12px;padding-top:20px}
.pb-modern-section-title{padding:0 6px 4px}
.pb-modern-section-title>span,.pb-modern-block-title>span{
  display:block;margin-bottom:6px;color:var(--secondary-text-color);font-size:8px;font-weight:900;letter-spacing:.18em;
}
.pb-modern-section-title h2{margin:0;font-size:32px;letter-spacing:-.035em;line-height:1}
.pb-modern-section-title p{margin:7px 0 0;color:var(--secondary-text-color);font-size:11px}

.pb-modern-hero{
  position:relative;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(360px,.8fr);gap:22px;align-items:center;
  min-height:300px;padding:34px 40px;overflow:hidden;
  border:1px solid var(--divider-color);border-radius:28px;
  background:
    radial-gradient(circle at 14% 20%,color-mix(in srgb,var(--pb-accent) 12%,transparent),transparent 26%),
    radial-gradient(circle at 96% 0%,color-mix(in srgb,#7a89ff 7%,transparent),transparent 25%),
    linear-gradient(135deg,#1a1d1d,#1b1e1e 65%,#161818);
}
.pb-modern-hero::after{
  content:"";position:absolute;inset:auto -80px -140px auto;width:320px;height:320px;border-radius:50%;
  background:radial-gradient(circle,color-mix(in srgb,var(--pb-accent) 8%,transparent),transparent 70%);pointer-events:none;
}
.pb-modern-kicker{display:block;margin-bottom:9px;color:var(--secondary-text-color);font-size:8px;font-weight:900;letter-spacing:.16em}
.pb-modern-hero-copy h1{margin:0;max-width:720px;font-size:clamp(40px,5vw,64px);line-height:.98;letter-spacing:-.055em;font-weight:800}
.pb-modern-hero-copy h1 em{
  font-style:normal;background:linear-gradient(90deg,var(--pb-accent),#77c9ff);-webkit-background-clip:text;background-clip:text;color:transparent;
}
.pb-modern-hero-copy>p{margin:14px 0 0;max-width:660px;color:var(--secondary-text-color);font-size:12px}
.pb-modern-live-line{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:22px;color:var(--secondary-text-color);font-size:9px}
.pb-modern-live-dot{width:7px;height:7px;border-radius:50%;background:#48d884;box-shadow:0 0 0 4px color-mix(in srgb,#48d884 12%,transparent)}
.pb-modern-live-dot.warn{background:#ffb64c;box-shadow:0 0 0 4px color-mix(in srgb,#ffb64c 12%,transparent)}
.pb-modern-live-line strong{color:var(--primary-text-color)}

.pb-modern-livecard{
  position:relative;z-index:1;padding:22px 24px;border-radius:22px;background:rgba(12,14,14,.40);border:1px solid rgba(255,255,255,.08);
}
.pb-modern-livecard-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.pb-modern-livecard-top>span{font-size:8px;font-weight:900;letter-spacing:.13em;color:var(--secondary-text-color)}
.pb-modern-photo{width:44px;height:44px!important;min-height:44px!important;padding:0!important;border:0!important;border-radius:12px!important;overflow:hidden!important;background:var(--secondary-background-color)!important}
.pb-modern-photo .pet-photo,.pb-modern-photo .placeholder{width:44px!important;height:44px!important;border-radius:12px!important}
.pb-modern-score{margin-top:16px}
.pb-modern-score strong{display:block;font-size:48px;letter-spacing:-.05em;line-height:1;color:var(--pb-accent)}
.pb-modern-score.warn strong{color:#ffb64c}.pb-modern-score.danger strong{color:#ff6969}
.pb-modern-score small{display:block;margin-top:5px;color:var(--secondary-text-color);font-size:9px}
.pb-modern-progress{height:4px;margin-top:16px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
.pb-modern-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--pb-accent),#78d8ff)}
.pb-modern-live-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
.pb-modern-live-kpis small,.pb-modern-live-kpis strong{display:block}
.pb-modern-live-kpis small{font-size:7px;color:var(--secondary-text-color)}
.pb-modern-live-kpis strong{margin-top:3px;font-size:12px}

.pb-modern-block-title{display:flex;align-items:center;justify-content:space-between;padding:6px 0 0}
.pb-modern-block-title>span{margin:0}.pb-modern-block-title small{color:var(--secondary-text-color);font-size:8px}

.pb-modern-kpirow{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--divider-color);border-radius:22px;overflow:hidden}
.pb-modern-kpirow>button{
  min-height:116px!important;display:grid!important;grid-template-columns:26px 1fr!important;gap:10px!important;align-items:start!important;
  padding:18px 22px!important;text-align:left!important;border:0!important;border-right:1px solid var(--divider-color)!important;border-radius:0!important;background:#1a1c1c!important;color:var(--primary-text-color)!important;
}
.pb-modern-kpirow>button:last-child{border-right:0!important}
.pb-modern-kpirow>button>span{font-size:17px}
.pb-modern-kpirow small,.pb-modern-kpirow strong,.pb-modern-kpirow em{display:block}
.pb-modern-kpirow small{font-size:7px;font-weight:900;letter-spacing:.1em;color:var(--secondary-text-color)}
.pb-modern-kpirow strong{margin-top:10px;font-size:20px}
.pb-modern-kpirow em{margin-top:6px;font-size:8px;font-style:normal;color:var(--secondary-text-color)}

.pb-modern-duo{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pb-modern-priority,.pb-modern-cycle{min-height:175px;padding:24px;border:1px solid var(--divider-color);border-radius:22px;background:#1a1c1c}
.pb-modern-priority{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;background:linear-gradient(145deg,color-mix(in srgb,var(--pb-accent) 7%,#1a1c1c),#1a1c1c)}
.pb-modern-priority h3{margin:0;font-size:27px;letter-spacing:-.03em}.pb-modern-priority p{margin:8px 0 0;color:var(--secondary-text-color);font-size:10px;max-width:560px}
.pb-modern-priority>button,.pb-modern-cycle>button{border:0!important;background:transparent!important;color:var(--pb-accent)!important;padding:0!important;font-size:9px!important}
.pb-modern-cycle>strong{display:block;margin:8px 0 6px;font-size:36px;letter-spacing:-.04em}.pb-modern-cycle p{margin:0 0 14px;color:var(--secondary-text-color);font-size:10px}

.pb-modern-centers{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid var(--divider-color);border-radius:22px;overflow:hidden}
.pb-modern-centers>button{
  min-height:96px!important;display:flex!important;align-items:center!important;gap:11px!important;padding:16px 18px!important;text-align:left!important;
  border:0!important;border-right:1px solid var(--divider-color)!important;border-radius:0!important;background:#1a1c1c!important;color:var(--primary-text-color)!important;
}
.pb-modern-centers>button:last-child{border-right:0!important}
.pb-modern-centers>button>span{font-size:19px}
.pb-modern-centers strong,.pb-modern-centers small{display:block}.pb-modern-centers strong{font-size:12px}.pb-modern-centers small{margin-top:3px;color:var(--secondary-text-color);font-size:8px}
.pb-modern-tools{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.pb-modern-tools>button{min-height:40px!important;border:1px solid var(--divider-color)!important;border-radius:10px!important;background:transparent!important;color:var(--secondary-text-color)!important;font-size:9px!important}
.pb-modern-tools>button:hover{background:var(--secondary-background-color)!important;color:var(--primary-text-color)!important}

/* Agenda */
.pb-modern-agenda{padding:18px 0 0!important;border:0!important;background:transparent!important;box-shadow:none!important}
.pb-modern-agenda::before{display:none!important}
.pb-modern-agenda-title{padding:0 6px 12px}
.pb-modern-agenda-shell{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(340px,.75fr);overflow:hidden;border:1px solid var(--divider-color);border-radius:24px;background:#1a1c1c}
.pb-modern-agenda-left{padding:22px}
.pb-modern-agenda-controls{display:flex;gap:5px;justify-content:flex-end;margin-bottom:16px}
.pb-modern-agenda-controls button{min-width:34px!important;height:34px!important;padding:0 9px!important;border:1px solid var(--divider-color)!important;border-radius:9px!important;background:transparent!important;color:var(--primary-text-color)!important}
.pb-modern-weekdays,.pb-modern-days{display:grid;grid-template-columns:repeat(7,1fr)}
.pb-modern-weekdays{margin-bottom:8px}.pb-modern-weekdays span{text-align:center;color:var(--secondary-text-color);font-size:8px;font-weight:900;letter-spacing:.08em}
.pb-modern-days{row-gap:7px}
.pb-modern-day{min-height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border-radius:10px}
.pb-modern-day:hover{background:rgba(255,255,255,.025)}
.pb-modern-day.outside{opacity:.20}
.pb-modern-day>span{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;font-size:10px;font-weight:750}
.pb-modern-day.today>span{background:var(--pb-accent);color:#081514}
.pb-modern-day>div{height:6px;display:flex;gap:2px}.pb-modern-day i{width:6px;height:6px;border-radius:50%;background:#66cda8}.pb-modern-day i.vaccine{background:#60a8ff}.pb-modern-day i.treatment{background:#a879ff}.pb-modern-day i.heat{background:#ff7194}
.pb-modern-agenda-right{padding:22px;border-left:1px solid var(--divider-color);background:#171919}
.pb-modern-agenda-right-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.pb-modern-agenda-right-head span{font-size:8px;font-weight:900;letter-spacing:.13em;color:var(--secondary-text-color)}.pb-modern-agenda-right-head strong{min-width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:var(--pb-accent-soft);color:var(--pb-accent);font-size:10px}
.pb-modern-eventlist{display:grid}.pb-modern-event{display:grid;grid-template-columns:40px 14px minmax(0,1fr) 28px;gap:8px;align-items:center;min-height:59px}.pb-modern-event-date{text-align:center}.pb-modern-event-date strong,.pb-modern-event-date span{display:block}.pb-modern-event-date strong{font-size:16px}.pb-modern-event-date span{font-size:8px;color:var(--secondary-text-color)}
.pb-modern-event-dot{width:7px;height:7px;border-radius:50%;background:#66cda8;box-shadow:0 0 0 4px color-mix(in srgb,#66cda8 12%,transparent)}.pb-modern-event.vaccine .pb-modern-event-dot{background:#60a8ff;box-shadow:0 0 0 4px color-mix(in srgb,#60a8ff 12%,transparent)}.pb-modern-event.treatment .pb-modern-event-dot{background:#a879ff;box-shadow:0 0 0 4px color-mix(in srgb,#a879ff 12%,transparent)}.pb-modern-event.heat .pb-modern-event-dot{background:#ff7194;box-shadow:0 0 0 4px color-mix(in srgb,#ff7194 12%,transparent)}
.pb-modern-event-copy small,.pb-modern-event-copy strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pb-modern-event-copy small{font-size:7px;color:var(--secondary-text-color)}.pb-modern-event-copy strong{margin-top:3px;font-size:10px}.pb-modern-event-icon{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:#202323;font-size:13px}
.pb-modern-event-empty{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.pb-modern-event-empty>span{width:44px;height:44px;display:grid;place-items:center;margin-bottom:10px;border-radius:13px;background:var(--pb-accent-soft);color:var(--pb-accent);font-size:20px}.pb-modern-event-empty strong{font-size:12px}.pb-modern-event-empty small{margin-top:4px;color:var(--secondary-text-color);font-size:9px}
.pb-modern-smart-btn{width:100%!important;min-height:42px!important;margin-top:10px!important;border:1px solid var(--pb-accent-line)!important;border-radius:10px!important;background:var(--pb-accent-soft)!important;color:var(--pb-accent)!important;font-size:9px!important;font-weight:850!important}

/* Light theme */
@media (prefers-color-scheme: light){
  :host{
    --pb-panel:#ffffff;
    --pb-panel-2:#f6f8f8;
    --pb-line:rgba(0,0,0,.10);
    --pb-muted:rgba(0,0,0,.55);
  }
  .pb-modern-header,.pb-modern-nav{background:var(--card-background-color)!important}
  .pb-modern-hero,
  .pb-modern-kpirow>button,
  .pb-modern-priority,
  .pb-modern-cycle,
  .pb-modern-centers>button,
  .pb-modern-agenda-shell,
  .pb-modern-agenda-right{background:var(--card-background-color)!important}
  .pb-modern-livecard{background:color-mix(in srgb,var(--secondary-background-color) 72%,transparent)}
}

@media(max-width:980px){
  .pb-modern-hero{grid-template-columns:1fr}.pb-modern-kpirow{grid-template-columns:1fr 1fr}.pb-modern-kpirow>button:nth-child(2){border-right:0!important}.pb-modern-kpirow>button:nth-child(-n+2){border-bottom:1px solid var(--divider-color)!important}
  .pb-modern-duo{grid-template-columns:1fr}.pb-modern-centers{grid-template-columns:1fr 1fr}.pb-modern-centers>button{border-bottom:1px solid var(--divider-color)!important}.pb-modern-centers>button:nth-child(2n){border-right:0!important}.pb-modern-centers>button:last-child{grid-column:1/-1;border-bottom:0!important}
  .pb-modern-agenda-shell{grid-template-columns:1fr}.pb-modern-agenda-right{border-left:0;border-top:1px solid var(--divider-color)}
}
@media(max-width:760px){
  .pb-modern-brandrow{min-height:56px;padding:6px 8px}.pb-modern-logo{width:36px;height:36px;border-radius:10px}.pb-modern-logo svg{width:21px;height:21px}.pb-modern-brandcopy small{display:none}.pb-modern-status{display:none!important}
  .pb-modern-nav{gap:8px!important;padding:0 9px!important}.pb-modern-nav>button{min-height:40px!important;font-size:9px!important}.pb-nav-glyph{font-size:13px}
  .pb-modern-page{padding-top:14px}.pb-modern-section-title h2{font-size:27px}.pb-modern-hero{min-height:0;padding:22px 18px;border-radius:20px}.pb-modern-hero-copy h1{font-size:38px}.pb-modern-livecard{padding:17px;border-radius:17px}.pb-modern-score strong{font-size:40px}.pb-modern-kpirow{grid-template-columns:1fr}.pb-modern-kpirow>button{border-right:0!important;border-bottom:1px solid var(--divider-color)!important}.pb-modern-kpirow>button:last-child{border-bottom:0!important}.pb-modern-priority{align-items:flex-start;flex-direction:column}.pb-modern-centers{grid-template-columns:1fr}.pb-modern-centers>button{border-right:0!important}.pb-modern-centers>button:last-child{grid-column:auto}.pb-modern-tools{grid-template-columns:1fr 1fr}.pb-modern-agenda-left{padding:16px 8px}.pb-modern-day{min-height:48px}.pb-modern-agenda-right{padding:16px 11px}
}


/* PawBook 6.10.4 - true multipage */
.grid{display:none}
.grid>.pb-page-active{
  grid-column:1/-1!important;
  width:100%!important;
  max-width:none!important;
  margin:0!important;
}
.pb-subpage-mode .grid{
  min-height:calc(100vh - 150px);
}
.grid>.pb-page-active{
  padding:22px 0 40px!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  box-shadow:none!important;
}
.grid>.pb-page-active>.card-head,
.grid>.pb-page-active>.scene-heading{
  margin:0 0 24px!important;
  padding:0 6px 18px!important;
  border-bottom:1px solid var(--divider-color)!important;
}
.grid>.pb-page-active>.card-head h3,
.grid>.pb-page-active>.scene-heading h2{
  font-size:34px!important;
  letter-spacing:-.04em!important;
}

/* Huge Evie portrait */
.pb-modern-hero-photo{
  grid-template-columns:minmax(330px, .78fr) minmax(0,1.22fr)!important;
  min-height:440px!important;
  padding:28px!important;
}
.pb-modern-portrait-wrap{
  min-height:380px;
}
.pb-modern-portrait{
  position:relative;
  width:100%!important;
  height:100%!important;
  min-height:380px!important;
  padding:0!important;
  overflow:hidden!important;
  border:0!important;
  border-radius:24px!important;
  background:var(--secondary-background-color)!important;
}
.pb-modern-portrait .pet-photo,
.pb-modern-portrait .placeholder{
  width:100%!important;
  height:100%!important;
  min-height:380px!important;
  object-fit:cover!important;
  border-radius:24px!important;
}
.pb-modern-portrait .placeholder{
  display:grid!important;
  place-items:center!important;
  font-size:72px!important;
}
.pb-modern-photo-edit{
  position:absolute;
  right:14px;
  bottom:14px;
  width:40px;
  height:40px;
  display:grid;
  place-items:center;
  border-radius:12px;
  background:rgba(10,12,12,.72);
  color:#fff;
  border:1px solid rgba(255,255,255,.16);
}
.pb-modern-hero-copy{
  align-self:center;
  padding:12px 20px;
}
.pb-modern-hero-copy h1{
  font-size:clamp(54px,6vw,82px)!important;
  margin:0!important;
}
.pb-modern-breed{
  margin:10px 0 18px!important;
  color:var(--secondary-text-color);
  font-size:15px!important;
}
.pb-modern-profile-row{
  display:flex;
  flex-wrap:wrap;
  gap:7px;
}
.pb-modern-profile-row span{
  padding:7px 9px;
  border-radius:8px;
  background:rgba(255,255,255,.045);
  color:var(--secondary-text-color);
  font-size:9px;
}
.pb-modern-health-summary{
  display:flex;
  align-items:end;
  justify-content:space-between;
  gap:16px;
  margin-top:28px;
  padding:20px 0 18px;
  border-top:1px solid var(--divider-color);
  border-bottom:1px solid var(--divider-color);
}
.pb-modern-health-value small,
.pb-modern-health-value strong{
  display:block;
}
.pb-modern-health-value small{
  font-size:8px;
  font-weight:900;
  letter-spacing:.14em;
  color:var(--secondary-text-color);
}
.pb-modern-health-value strong{
  margin-top:6px;
  font-size:28px;
  color:var(--pb-accent);
}
.pb-modern-health-summary.warn .pb-modern-health-value strong{color:#ffb64c}
.pb-modern-health-summary.danger .pb-modern-health-value strong{color:#ff6969}
.pb-modern-health-meta{
  display:flex;
  align-items:center;
  gap:8px;
  color:var(--secondary-text-color);
  font-size:9px;
}

/* Agenda becomes a timeline page; no calendar grid */
.pb-agenda-page{
  padding:20px 0 40px!important;
}
.pb-page-heading{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:20px;
  padding:0 6px 22px;
  border-bottom:1px solid var(--divider-color);
}
.pb-page-heading>div:first-child>span{
  display:block;
  margin-bottom:7px;
  color:var(--pb-accent);
  font-size:8px;
  font-weight:900;
  letter-spacing:.17em;
}
.pb-page-heading h2{
  margin:0!important;
  font-size:42px!important;
  letter-spacing:-.045em!important;
}
.pb-page-heading p{
  margin:7px 0 0;
  color:var(--secondary-text-color);
  font-size:11px;
}
.pb-agenda-actions{
  display:flex;
  gap:5px;
}
.pb-agenda-actions button{
  min-width:38px!important;
  height:38px!important;
  padding:0 11px!important;
  border:1px solid var(--divider-color)!important;
  border-radius:10px!important;
  background:transparent!important;
  color:var(--primary-text-color)!important;
}
.pb-agenda-monthbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
  margin-top:24px;
  padding:20px 22px;
  border:1px solid var(--divider-color);
  border-radius:18px;
  background:linear-gradient(135deg,color-mix(in srgb,var(--pb-accent) 6%,#1a1c1c),#1a1c1c);
}
.pb-agenda-monthbar small,
.pb-agenda-monthbar strong{
  display:block;
}
.pb-agenda-monthbar small{
  font-size:8px;
  font-weight:900;
  letter-spacing:.13em;
  color:var(--secondary-text-color);
}
.pb-agenda-monthbar strong{
  margin-top:5px;
  font-size:26px;
  text-transform:capitalize;
}
.pb-agenda-monthstats{
  display:flex;
  flex-wrap:wrap;
  justify-content:flex-end;
  gap:8px;
}
.pb-agenda-monthstats span{
  display:flex;
  align-items:center;
  gap:6px;
  padding:7px 9px;
  border-radius:999px;
  background:rgba(255,255,255,.045);
  color:var(--secondary-text-color);
  font-size:8px;
}
.pb-agenda-monthstats i{
  width:7px;height:7px;border-radius:50%;background:#66cda8;
}
.pb-agenda-monthstats i.vaccine{background:#60a8ff}
.pb-agenda-monthstats i.treatment{background:#a879ff}
.pb-agenda-monthstats i.heat{background:#ff7194}

.pb-agenda-timeline{
  margin-top:18px;
  padding:0 6px;
}
.pb-agenda-row{
  display:grid;
  grid-template-columns:58px 26px minmax(0,1fr) 46px;
  gap:10px;
  min-height:92px;
  align-items:start;
}
.pb-agenda-datebox{
  padding-top:3px;
  text-align:center;
}
.pb-agenda-datebox strong,
.pb-agenda-datebox span{
  display:block;
}
.pb-agenda-datebox strong{
  font-size:28px;
  line-height:1;
}
.pb-agenda-datebox span{
  margin-top:5px;
  color:var(--secondary-text-color);
  font-size:9px;
}
.pb-agenda-rail{
  position:relative;
  height:100%;
  display:flex;
  justify-content:center;
}
.pb-agenda-rail i{
  position:relative;
  z-index:2;
  width:10px;
  height:10px;
  margin-top:10px;
  border-radius:50%;
  background:#66cda8;
  box-shadow:0 0 0 5px color-mix(in srgb,#66cda8 12%,transparent);
}
.pb-agenda-row.vaccine .pb-agenda-rail i{
  background:#60a8ff;
  box-shadow:0 0 0 5px color-mix(in srgb,#60a8ff 12%,transparent);
}
.pb-agenda-row.treatment .pb-agenda-rail i{
  background:#a879ff;
  box-shadow:0 0 0 5px color-mix(in srgb,#a879ff 12%,transparent);
}
.pb-agenda-row.heat .pb-agenda-rail i{
  background:#ff7194;
  box-shadow:0 0 0 5px color-mix(in srgb,#ff7194 12%,transparent);
}
.pb-agenda-rail b{
  position:absolute;
  top:23px;
  bottom:-10px;
  width:1px;
  background:var(--divider-color);
}
.pb-agenda-event-main{
  padding:3px 0 22px;
  border-bottom:1px solid var(--divider-color);
}
.pb-agenda-event-main small{
  display:block;
  margin-bottom:4px;
  color:var(--secondary-text-color);
  font-size:8px;
  font-weight:900;
  letter-spacing:.08em;
}
.pb-agenda-event-main strong{
  display:block;
  font-size:15px;
}
.pb-agenda-event-main p{
  margin:5px 0 0;
  color:var(--secondary-text-color);
  font-size:9px;
}
.pb-agenda-event-icon{
  width:42px;height:42px;
  display:grid;
  place-items:center;
  margin-top:1px;
  border-radius:12px;
  background:var(--secondary-background-color);
  font-size:19px;
}
.pb-agenda-empty{
  min-height:360px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  text-align:center;
}
.pb-agenda-empty>span{
  width:60px;height:60px;
  display:grid;place-items:center;
  border-radius:18px;
  background:var(--pb-accent-soft);
  color:var(--pb-accent);
  font-size:28px;
}
.pb-agenda-empty h3{margin:14px 0 5px;font-size:25px}
.pb-agenda-empty p{margin:0;color:var(--secondary-text-color)}
.pb-agenda-footer{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-top:20px;
  padding-top:16px;
  border-top:1px solid var(--divider-color);
}
.pb-agenda-footer button{
  border:0!important;
  background:transparent!important;
  color:var(--pb-accent)!important;
  padding:0!important;
}
.pb-agenda-footer span{
  color:var(--secondary-text-color);
  font-size:8px;
}

@media(max-width:900px){
  .pb-modern-hero-photo{
    grid-template-columns:1fr!important;
  }
  .pb-modern-portrait-wrap,
  .pb-modern-portrait,
  .pb-modern-portrait .pet-photo,
  .pb-modern-portrait .placeholder{
    min-height:520px!important;
  }
}

@media(max-width:760px){
  .pb-modern-hero-photo{
    padding:14px!important;
    min-height:0!important;
  }
  .pb-modern-portrait-wrap,
  .pb-modern-portrait,
  .pb-modern-portrait .pet-photo,
  .pb-modern-portrait .placeholder{
    min-height:360px!important;
  }
  .pb-modern-hero-copy{
    padding:10px 4px!important;
  }
  .pb-modern-hero-copy h1{
    font-size:44px!important;
  }
  .pb-modern-health-summary{
    align-items:flex-start;
    flex-direction:column;
  }
  .pb-page-heading{
    align-items:flex-start;
    flex-direction:column;
  }
  .pb-page-heading h2{
    font-size:34px!important;
  }
  .pb-agenda-monthbar{
    align-items:flex-start;
    flex-direction:column;
    padding:16px;
  }
  .pb-agenda-monthstats{
    justify-content:flex-start;
  }
  .pb-agenda-row{
    grid-template-columns:44px 18px minmax(0,1fr) 38px;
    min-height:82px;
  }
  .pb-agenda-datebox strong{font-size:22px}
  .pb-agenda-event-icon{
    width:36px;height:36px;border-radius:10px;font-size:16px;
  }
}


/* PawBook 6.10.4 - CRUD clarity */
.pb-crud-head{
  align-items:center!important;
  margin-bottom:12px!important;
}
.pb-crud-kicker{
  display:block;
  margin-bottom:6px;
  color:var(--pb-accent);
  font-size:8px;
  font-weight:950;
  letter-spacing:.16em;
}
.pb-crud-add{
  min-height:42px!important;
  padding:0 15px!important;
  border:1px solid var(--pb-accent-line)!important;
  border-radius:11px!important;
  background:var(--pb-accent)!important;
  color:#071312!important;
  font-size:10px!important;
  font-weight:900!important;
  box-shadow:0 8px 22px color-mix(in srgb,var(--pb-accent) 20%,transparent)!important;
}
.pb-crud-help{
  display:grid;
  grid-template-columns:34px minmax(0,1fr);
  gap:10px;
  align-items:center;
  margin:0 0 16px;
  padding:11px 13px;
  border:1px solid color-mix(in srgb,var(--pb-accent) 18%,var(--divider-color));
  border-radius:12px;
  background:color-mix(in srgb,var(--pb-accent) 5%,transparent);
}
.pb-crud-help>span{
  width:34px;height:34px;
  display:grid;place-items:center;
  border-radius:10px;
  background:var(--pb-accent-soft);
  color:var(--pb-accent);
  font-size:16px;
}
.pb-crud-help strong,.pb-crud-help small{display:block}
.pb-crud-help strong{font-size:10px}
.pb-crud-help small{margin-top:3px;color:var(--secondary-text-color);font-size:8px;line-height:1.45}

/* Make all record actions explicit and always visible */
.record-actions,
.weight-actions,
.visit-actions,
.treatment-actions{
  display:flex!important;
  align-items:center!important;
  justify-content:flex-end!important;
  gap:6px!important;
  flex-wrap:wrap!important;
  opacity:1!important;
  visibility:visible!important;
}
.record-edit,
.record-delete{
  min-height:32px!important;
  padding:0 10px!important;
  border-radius:9px!important;
  font-size:9px!important;
  font-weight:850!important;
}
.record-edit{
  border:1px solid color-mix(in srgb,var(--pb-accent) 28%,var(--divider-color))!important;
  background:var(--pb-accent-soft)!important;
  color:var(--pb-accent)!important;
}
.record-edit::before{content:"✎ ";font-size:10px}
.record-delete{
  border:1px solid color-mix(in srgb,#ff6969 28%,var(--divider-color))!important;
  background:color-mix(in srgb,#ff6969 8%,transparent)!important;
  color:#ff6969!important;
}
.record-delete::before{content:"⌫ ";font-size:10px}

/* Existing attachment buttons align with CRUD controls */
.visit-actions .small-btn,
.treatment-actions .small-btn{
  min-height:32px!important;
  padding:0 10px!important;
  border-radius:9px!important;
  font-size:9px!important;
}

/* Make rows read like records, not passive text */
.weight-row,
.vaccine-history-row,
.visit-row,
.treatment-row,
.heat-record{
  border:1px solid color-mix(in srgb,var(--divider-color) 72%,transparent)!important;
  border-radius:12px!important;
  margin-bottom:7px!important;
  background:color-mix(in srgb,var(--card-background-color) 94%,transparent)!important;
}
.weight-row:hover,
.vaccine-history-row:hover,
.visit-row:hover,
.treatment-row:hover,
.heat-record:hover{
  border-color:color-mix(in srgb,var(--pb-accent) 24%,var(--divider-color))!important;
}

@media(max-width:760px){
  .pb-crud-head{
    align-items:flex-start!important;
    flex-direction:column!important;
  }
  .pb-crud-add{
    width:100%!important;
    min-height:46px!important;
    font-size:11px!important;
  }
  .pb-crud-help{
    grid-template-columns:30px minmax(0,1fr);
    padding:9px 10px;
  }
  .pb-crud-help>span{width:30px;height:30px}
  .record-actions,
  .weight-actions,
  .visit-actions,
  .treatment-actions{
    width:100%!important;
    justify-content:flex-start!important;
    margin-top:8px!important;
  }
  .record-edit,
  .record-delete,
  .visit-actions .small-btn,
  .treatment-actions .small-btn{
    min-height:36px!important;
    flex:1 1 auto!important;
    text-align:center!important;
  }
}


/* PawBook 6.10.4 - clearer menu + unified management */
.pb-clear-nav{
  display:flex!important;
  align-items:center!important;
  gap:25px!important;
  padding:0 16px!important;
  margin:0!important;
  overflow-x:auto!important;
  scrollbar-width:none!important;
  border-bottom:1px solid var(--divider-color)!important;
  background:#101111!important;
}
.pb-clear-nav::-webkit-scrollbar{display:none!important}
.pb-clear-nav>button{
  position:relative!important;
  flex:0 0 auto!important;
  min-height:52px!important;
  display:flex!important;
  align-items:center!important;
  gap:9px!important;
  padding:0 1px!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  color:rgba(255,255,255,.58)!important;
  font-size:12px!important;
  font-weight:800!important;
  letter-spacing:-.01em!important;
}
.pb-clear-nav>button:hover{
  color:rgba(255,255,255,.88)!important;
}
.pb-clear-nav>button.active{
  color:#ffffff!important;
}
.pb-clear-nav>button.active::after{
  content:"";
  position:absolute;
  left:0;right:0;bottom:0;
  height:3px;
  border-radius:999px 999px 0 0;
  background:var(--pb-accent);
}
.pb-clear-icon{
  width:20px;
  display:inline-grid;
  place-items:center;
  color:inherit;
  font-size:17px!important;
  line-height:1;
}

/* Bigger typography throughout active subpages */
.pb-subpage-mode .grid>.pb-page-active h3{
  font-size:30px!important;
  line-height:1.05!important;
  letter-spacing:-.035em!important;
}
.pb-subpage-mode .grid>.pb-page-active .muted,
.pb-subpage-mode .grid>.pb-page-active small{
  font-size:10px!important;
  line-height:1.45!important;
}
.pb-subpage-mode .grid>.pb-page-active strong{
  font-size:inherit;
}

/* Management overview */
.pb-management-intro{
  display:none;
  grid-column:1/-1!important;
  margin:0 0 6px!important;
  padding:28px 6px 18px!important;
  border:0!important;
  background:transparent!important;
  box-shadow:none!important;
}
.pb-management-mode .pb-management-intro{
  display:flex!important;
  align-items:flex-end;
  justify-content:space-between;
  gap:22px;
}
.pb-management-intro>div:first-child>span{
  display:block;
  margin-bottom:7px;
  color:var(--pb-accent);
  font-size:9px;
  font-weight:950;
  letter-spacing:.17em;
}
.pb-management-intro h2{
  margin:0!important;
  font-size:40px!important;
  letter-spacing:-.045em!important;
}
.pb-management-intro p{
  margin:8px 0 0;
  color:var(--secondary-text-color);
  font-size:12px;
}
.pb-management-legend{
  display:flex;
  gap:6px;
  flex-wrap:wrap;
  justify-content:flex-end;
}
.pb-management-legend span{
  padding:7px 9px;
  border-radius:9px;
  border:1px solid var(--divider-color);
  color:var(--secondary-text-color);
  font-size:9px;
  font-weight:800;
}

/* In management mode, CRUD centers are true sections, not floating cards */
.pb-management-mode .grid{
  grid-template-columns:1fr!important;
  gap:12px!important;
}
.pb-management-mode .pb-management-card{
  display:block!important;
  grid-column:1/-1!important;
  padding:22px!important;
  border:1px solid var(--divider-color)!important;
  border-radius:20px!important;
  background:color-mix(in srgb,var(--card-background-color) 97%,#111)!important;
  box-shadow:none!important;
}
.pb-management-mode .pb-management-card>.card-head{
  padding:0 0 15px!important;
  margin-bottom:14px!important;
  border-bottom:1px solid var(--divider-color)!important;
}
.pb-management-mode .pb-management-card .pb-crud-add{
  min-height:46px!important;
  padding:0 16px!important;
  font-size:11px!important;
}
.pb-management-mode .pb-crud-help{
  margin-bottom:18px!important;
  padding:12px 14px!important;
}
.pb-management-mode .pb-crud-help strong{
  font-size:11px!important;
}
.pb-management-mode .pb-crud-help small{
  font-size:9px!important;
}

/* Record rows more readable */
.pb-management-mode .weight-row,
.pb-management-mode .vaccine-history-row,
.pb-management-mode .visit-row,
.pb-management-mode .treatment-row,
.pb-management-mode .heat-record{
  padding:13px 14px!important;
  margin-bottom:8px!important;
  border-radius:12px!important;
}
.pb-management-mode .record-edit,
.pb-management-mode .record-delete,
.pb-management-mode .visit-actions .small-btn,
.pb-management-mode .treatment-actions .small-btn{
  min-height:34px!important;
  padding:0 10px!important;
  font-size:9px!important;
}

/* Diagnostics grouped similarly */
.pb-diagnostics-mode .grid{
  grid-template-columns:1fr!important;
  gap:12px!important;
}
.pb-diagnostics-mode .pb-diagnostics-card{
  grid-column:1/-1!important;
  padding:22px!important;
  border:1px solid var(--divider-color)!important;
  border-radius:20px!important;
  background:color-mix(in srgb,var(--card-background-color) 97%,#111)!important;
}

/* Dashboard text clarity */
.pb-modern-page .pb-modern-kpirow small,
.pb-modern-page .pb-modern-centers small,
.pb-modern-page .pb-modern-live-kpis small{
  font-size:8px!important;
}
.pb-modern-page .pb-modern-kpirow strong{
  font-size:21px!important;
}
.pb-modern-page .pb-modern-centers strong{
  font-size:13px!important;
}

@media(max-width:760px){
  .pb-clear-nav{
    gap:18px!important;
    padding:0 10px!important;
  }
  .pb-clear-nav>button{
    min-height:48px!important;
    font-size:11px!important;
    gap:7px!important;
  }
  .pb-clear-icon{
    font-size:15px!important;
  }
  .pb-management-mode .pb-management-intro{
    align-items:flex-start!important;
    flex-direction:column!important;
    padding:22px 4px 12px!important;
  }
  .pb-management-intro h2{
    font-size:33px!important;
  }
  .pb-management-legend{
    justify-content:flex-start!important;
  }
  .pb-management-mode .pb-management-card{
    padding:15px!important;
    border-radius:16px!important;
  }
  .pb-management-mode .pb-management-card>.card-head{
    align-items:flex-start!important;
    flex-direction:column!important;
  }
  .pb-management-mode .pb-management-card .pb-crud-add{
    width:100%!important;
  }
}


/* PawBook 6.10.4 - visual refinement */

/* Remove old help boxes entirely */
.pb-crud-help{display:none!important}

/* Dashboard Health Centers */
.pb-modern-centers-v2{
  display:grid!important;
  grid-template-columns:repeat(5,minmax(0,1fr))!important;
  border:1px solid var(--divider-color)!important;
  border-radius:22px!important;
  overflow:hidden!important;
  background:#181a1a!important;
}
.pb-modern-centers-v2>button{
  min-height:126px!important;
  display:grid!important;
  grid-template-columns:46px minmax(0,1fr) 18px!important;
  gap:13px!important;
  align-items:center!important;
  padding:20px!important;
  text-align:left!important;
  border:0!important;
  border-right:1px solid var(--divider-color)!important;
  border-radius:0!important;
  background:transparent!important;
  color:var(--primary-text-color)!important;
}
.pb-modern-centers-v2>button:last-child{border-right:0!important}
.pb-modern-centers-v2>button:hover{
  background:color-mix(in srgb,var(--pb-accent) 5%,transparent)!important;
}
.pb-center-icon{
  width:46px;height:46px;
  display:grid;place-items:center;
  border-radius:13px;
  background:color-mix(in srgb,var(--pb-accent) 8%,transparent);
  font-size:24px!important;
}
.pb-modern-centers-v2 small,
.pb-modern-centers-v2 strong,
.pb-modern-centers-v2 p{display:block}
.pb-modern-centers-v2 small{
  margin:0 0 5px!important;
  font-size:7px!important;
  font-weight:900!important;
  letter-spacing:.11em!important;
  color:var(--secondary-text-color)!important;
}
.pb-modern-centers-v2 strong{
  font-size:15px!important;
}
.pb-modern-centers-v2 p{
  margin:5px 0 0!important;
  color:var(--secondary-text-color)!important;
  font-size:9px!important;
  line-height:1.35!important;
}
.pb-modern-centers-v2 b{
  color:var(--secondary-text-color)!important;
  font-size:22px!important;
}

.pb-modern-tools-v2{
  display:grid!important;
  grid-template-columns:repeat(5,minmax(0,1fr))!important;
  gap:6px!important;
}
.pb-modern-tools-v2>button{
  min-height:46px!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:7px!important;
  border:1px solid var(--divider-color)!important;
  border-radius:11px!important;
  background:transparent!important;
  color:var(--secondary-text-color)!important;
}
.pb-modern-tools-v2>button span{font-size:14px}
.pb-modern-tools-v2>button strong{font-size:10px!important}

/* Management page */
.pb-management-mode .grid{
  grid-template-columns:1fr!important;
  gap:16px!important;
}
.pb-management-mode .pb-management-intro{
  position:relative!important;
  display:grid!important;
  grid-template-columns:minmax(0,1fr) auto!important;
  align-items:end!important;
  gap:28px!important;
  margin:0 0 4px!important;
  padding:34px 36px!important;
  overflow:hidden!important;
  border:1px solid var(--divider-color)!important;
  border-radius:24px!important;
  background:
    radial-gradient(circle at 0% 0%,color-mix(in srgb,var(--pb-accent) 12%,transparent),transparent 35%),
    linear-gradient(135deg,#1b1e1e,#181a1a)!important;
}
.pb-management-copy>span{
  display:block!important;
  margin-bottom:8px!important;
  color:var(--pb-accent)!important;
  font-size:9px!important;
  font-weight:950!important;
  letter-spacing:.18em!important;
}
.pb-management-copy h2{
  margin:0!important;
  font-size:46px!important;
  line-height:.95!important;
  letter-spacing:-.05em!important;
}
.pb-management-copy p{
  margin:10px 0 0!important;
  color:var(--secondary-text-color)!important;
  font-size:12px!important;
}
.pb-management-overview{
  display:grid!important;
  grid-template-columns:repeat(5,minmax(80px,1fr))!important;
  min-width:470px!important;
  overflow:hidden!important;
  border:1px solid rgba(255,255,255,.07)!important;
  border-radius:16px!important;
  background:rgba(0,0,0,.12)!important;
}
.pb-management-overview>div{
  padding:16px 14px!important;
  border-right:1px solid rgba(255,255,255,.07)!important;
}
.pb-management-overview>div:last-child{border-right:0!important}
.pb-management-overview small,
.pb-management-overview strong{display:block!important}
.pb-management-overview small{
  color:var(--secondary-text-color)!important;
  font-size:7px!important;
  letter-spacing:.10em!important;
}
.pb-management-overview strong{
  margin-top:6px!important;
  font-size:18px!important;
}

.pb-management-mode .pb-management-card{
  padding:28px 30px!important;
  border-radius:22px!important;
  background:#191b1b!important;
}
.pb-management-mode .pb-management-card>.card-head{
  min-height:74px!important;
  align-items:center!important;
  padding-bottom:18px!important;
}
.pb-management-mode .pb-management-card>.card-head h3{
  font-size:31px!important;
}
.pb-management-mode .pb-management-card>.card-head .muted{
  font-size:11px!important;
}
.pb-management-mode .pb-crud-kicker{
  font-size:8px!important;
}
.pb-management-mode .pb-crud-add{
  min-height:48px!important;
  padding:0 18px!important;
  font-size:11px!important;
  border-radius:12px!important;
}

/* Make records much more readable */
.pb-management-mode .weight-row,
.pb-management-mode .vaccine-history-row,
.pb-management-mode .visit-row,
.pb-management-mode .treatment-row,
.pb-management-mode .heat-record{
  min-height:64px!important;
  padding:15px 16px!important;
  margin-bottom:9px!important;
  border-radius:13px!important;
}
.pb-management-mode .weight-row strong,
.pb-management-mode .vaccine-history-row strong,
.pb-management-mode .visit-row strong,
.pb-management-mode .treatment-row strong,
.pb-management-mode .heat-record strong{
  font-size:12px!important;
}
.pb-management-mode .weight-row small,
.pb-management-mode .vaccine-history-row small,
.pb-management-mode .visit-row small,
.pb-management-mode .treatment-row small,
.pb-management-mode .heat-record small{
  font-size:9px!important;
}

/* ENCI main page */
#enci-section.pb-page-active{
  padding:26px 6px 40px!important;
}
#enci-section .card-head{
  min-height:84px!important;
}
#enci-section .card-head h3{
  font-size:36px!important;
  letter-spacing:-.04em!important;
}
#enci-section .card-head .muted{
  font-size:11px!important;
}
#enci-section .enci-grid,
#enci-section .profile-list,
#enci-section .enci-data{
  font-size:12px!important;
}
#enci-section .enci-grid strong,
#enci-section .profile-list strong,
#enci-section .enci-data strong{
  font-size:14px!important;
}
#enci-section .enci-grid small,
#enci-section .profile-list small,
#enci-section .enci-data small{
  font-size:10px!important;
}
#enci-section .profile-row,
#enci-section .enci-row{
  min-height:58px!important;
  padding:14px 0!important;
}
#enci-section button{
  min-height:40px!important;
  font-size:10px!important;
}

/* ENCI PRO section: enlarge everything */
#enci-pro-section.pb-page-active{
  padding:20px 0 40px!important;
}
#enci-pro-section .enci-pro-hero{
  min-height:140px!important;
  padding:28px 30px!important;
  border-radius:22px!important;
}
#enci-pro-section .enci-pro-hero h2{
  font-size:38px!important;
  letter-spacing:-.04em!important;
}
#enci-pro-section .enci-pro-hero p,
#enci-pro-section .enci-pro-hero small{
  font-size:11px!important;
}
#enci-pro-section .enci-pro-kpis{
  gap:10px!important;
}
#enci-pro-section .enci-pro-kpis>div{
  min-height:100px!important;
  padding:18px!important;
  border-radius:15px!important;
}
#enci-pro-section .enci-pro-kpis strong{
  font-size:17px!important;
}
#enci-pro-section .enci-pro-kpis small{
  font-size:9px!important;
}
#enci-pro-section .enci-pro-grid{
  gap:18px!important;
}
#enci-pro-section .enci-pro-grid h3{
  font-size:18px!important;
}
#enci-pro-section .enci-pro-grid strong{
  font-size:13px!important;
}
#enci-pro-section .enci-pro-grid small,
#enci-pro-section .enci-pro-grid p{
  font-size:10px!important;
  line-height:1.45!important;
}

/* Diagnostics */
.pb-diagnostics-mode .pb-diagnostics-card{
  padding:30px!important;
  border-radius:22px!important;
}
.pb-diagnostics-mode .pb-diagnostics-card>.card-head h3{
  font-size:34px!important;
  letter-spacing:-.04em!important;
}
.pb-diagnostics-mode .pb-diagnostics-card>.card-head .muted{
  font-size:11px!important;
}
.pb-diagnostics-mode .stats-grid,
.pb-diagnostics-mode .stat-grid{
  gap:12px!important;
}
.pb-diagnostics-mode .stat-box,
.pb-diagnostics-mode .stat-item{
  min-height:104px!important;
  padding:18px!important;
  border-radius:14px!important;
}
.pb-diagnostics-mode .stat-box strong,
.pb-diagnostics-mode .stat-item strong{
  font-size:20px!important;
}
.pb-diagnostics-mode .stat-box small,
.pb-diagnostics-mode .stat-item small{
  font-size:9px!important;
}
.pb-diagnostics-mode button{
  min-height:42px!important;
  padding:0 14px!important;
  border-radius:10px!important;
  font-size:10px!important;
}

/* General readability */
.pb-subpage-mode .grid>.pb-page-active{
  font-size:12px!important;
}
.pb-subpage-mode .grid>.pb-page-active p{
  font-size:10px!important;
  line-height:1.5!important;
}

@media(max-width:1100px){
  .pb-management-mode .pb-management-intro{
    grid-template-columns:1fr!important;
  }
  .pb-management-overview{
    min-width:0!important;
    width:100%!important;
  }
  .pb-modern-centers-v2{
    grid-template-columns:1fr 1fr!important;
  }
  .pb-modern-centers-v2>button{
    border-bottom:1px solid var(--divider-color)!important;
  }
  .pb-modern-centers-v2>button:nth-child(2n){border-right:0!important}
  .pb-modern-centers-v2>button:last-child{
    grid-column:1/-1!important;
    border-bottom:0!important;
  }
}

@media(max-width:760px){
  .pb-management-mode .pb-management-intro{
    padding:22px 18px!important;
    border-radius:18px!important;
  }
  .pb-management-copy h2{
    font-size:36px!important;
  }
  .pb-management-overview{
    grid-template-columns:1fr 1fr!important;
  }
  .pb-management-overview>div{
    border-bottom:1px solid rgba(255,255,255,.07)!important;
  }
  .pb-management-mode .pb-management-card{
    padding:18px!important;
    border-radius:16px!important;
  }
  .pb-management-mode .pb-management-card>.card-head h3{
    font-size:25px!important;
  }
  .pb-modern-centers-v2{
    grid-template-columns:1fr!important;
  }
  .pb-modern-centers-v2>button{
    min-height:98px!important;
    border-right:0!important;
  }
  .pb-modern-centers-v2>button:last-child{grid-column:auto!important}
  .pb-modern-tools-v2{
    grid-template-columns:1fr 1fr!important;
  }
  #enci-section .card-head h3,
  #enci-pro-section .enci-pro-hero h2,
  .pb-diagnostics-mode .pb-diagnostics-card>.card-head h3{
    font-size:28px!important;
  }
}


/* PawBook 6.10.4 — Health Control Center */
:host{
  --pb-accent:#55d8c8;
  --pb-accent2:#65bdf4;
  --pb-surface:#181a1a;
  --pb-surface2:#1d2020;
}

/* Management hub */
.pb-control-hub{
  display:block!important;
  grid-column:1/-1!important;
  padding:22px 0 38px!important;
  border:0!important;
  background:transparent!important;
  box-shadow:none!important;
}
.pb-control-hero{
  min-height:255px;
  display:grid;
  grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr);
  gap:24px;
  align-items:center;
  padding:32px 36px;
  border:1px solid var(--divider-color);
  border-radius:26px;
  background:
    radial-gradient(circle at 8% 15%,color-mix(in srgb,var(--pb-accent) 12%,transparent),transparent 28%),
    linear-gradient(135deg,#1b1e1e,#181a1a 70%);
}
.pb-control-kicker{
  display:block;margin-bottom:10px;color:var(--pb-accent);
  font-size:9px;font-weight:950;letter-spacing:.18em;
}
.pb-control-hero h2{
  margin:0!important;font-size:50px!important;line-height:.96!important;letter-spacing:-.05em!important;
}
.pb-control-hero p{
  max-width:680px;margin:13px 0 0!important;color:var(--secondary-text-color)!important;font-size:12px!important;
}
.pb-control-status{
  padding:24px;border:1px solid rgba(255,255,255,.08);border-radius:20px;background:rgba(0,0,0,.14);
}
.pb-control-status small,.pb-control-status strong{display:block}
.pb-control-status small{font-size:8px;letter-spacing:.14em;color:var(--secondary-text-color)}
.pb-control-status strong{margin:8px 0 15px;font-size:26px;color:var(--pb-accent)}
.pb-control-status div{display:flex;align-items:center;gap:8px;color:var(--secondary-text-color);font-size:9px}

.pb-control-title{
  display:flex;align-items:center;justify-content:space-between;margin:20px 0 9px;
}
.pb-control-title span{font-size:8px;font-weight:950;letter-spacing:.18em;color:var(--secondary-text-color)}
.pb-control-title small{font-size:8px;color:var(--secondary-text-color)}

.pb-control-modules{
  display:grid;grid-template-columns:repeat(5,minmax(0,1fr));
  border:1px solid var(--divider-color);border-radius:22px;overflow:hidden;background:var(--pb-surface);
}
.pb-control-modules>button{
  min-height:165px!important;display:grid!important;grid-template-columns:1fr auto!important;
  grid-template-rows:auto 1fr!important;gap:12px!important;padding:22px!important;text-align:left!important;
  border:0!important;border-right:1px solid var(--divider-color)!important;border-radius:0!important;
  background:transparent!important;color:var(--primary-text-color)!important;
}
.pb-control-modules>button:last-child{border-right:0!important}
.pb-control-modules>button:hover{background:color-mix(in srgb,var(--pb-accent) 5%,transparent)!important}
.pb-control-module-icon{
  grid-column:1/-1;width:46px;height:46px;display:grid;place-items:center;border-radius:13px;
  background:color-mix(in srgb,var(--pb-accent) 9%,transparent);font-size:23px;
}
.pb-control-modules small,.pb-control-modules strong,.pb-control-modules p{display:block}
.pb-control-modules small{font-size:7px;font-weight:950;letter-spacing:.12em;color:var(--secondary-text-color)}
.pb-control-modules strong{margin-top:8px;font-size:28px;letter-spacing:-.035em}
.pb-control-modules p{margin:6px 0 0;color:var(--secondary-text-color);font-size:9px}
.pb-control-modules b{align-self:end;font-size:24px;color:var(--secondary-text-color)}
.pb-control-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.pb-control-tools>button{
  min-height:68px!important;display:flex!important;align-items:center!important;gap:11px!important;padding:13px 16px!important;text-align:left!important;
  border:1px solid var(--divider-color)!important;border-radius:13px!important;background:transparent!important;color:var(--primary-text-color)!important;
}
.pb-control-tools>button>span{font-size:19px;color:var(--pb-accent)}
.pb-control-tools strong,.pb-control-tools small{display:block}.pb-control-tools strong{font-size:11px}.pb-control-tools small{margin-top:3px;color:var(--secondary-text-color);font-size:8px}

/* Module pages */
.pb-management-mode .grid{display:grid!important}
.grid>.pb-page-active{grid-column:1/-1!important}
#health-section.pb-page-active,
#vaccines-section.pb-page-active,
#visits-section.pb-page-active,
#treatments-section.pb-page-active,
#heat-section.pb-page-active{
  padding:22px 0 42px!important;border:0!important;background:transparent!important;box-shadow:none!important;
}
.pb-module-heading{
  display:flex;align-items:flex-end;justify-content:space-between;gap:22px;
  margin:0 0 22px;padding:0 6px 18px;border-bottom:1px solid var(--divider-color);
}
.pb-module-heading-copy>span{
  display:block;margin:10px 0 6px;color:var(--pb-accent);font-size:9px;font-weight:950;letter-spacing:.17em;
}
.pb-module-heading-copy h2{
  margin:0!important;font-size:42px!important;letter-spacing:-.045em!important;line-height:1!important;
}
.pb-module-heading-copy p{
  margin:8px 0 0!important;color:var(--secondary-text-color)!important;font-size:11px!important;
}
.pb-back-management{
  min-height:30px!important;padding:0!important;border:0!important;background:transparent!important;color:var(--secondary-text-color)!important;font-size:9px!important;
}
.pb-module-add{
  min-height:44px!important;padding:0 16px!important;border:1px solid color-mix(in srgb,var(--pb-accent) 42%,transparent)!important;
  border-radius:11px!important;background:var(--pb-accent)!important;color:#071312!important;font-size:10px!important;font-weight:900!important;
}
.pb-module-secondary{
  min-height:44px!important;padding:0 16px!important;border:1px solid var(--divider-color)!important;border-radius:11px!important;background:transparent!important;color:var(--primary-text-color)!important;
}
.pb-module-actions{display:flex;gap:7px}

/* Hero cards become the big Fotovoltaico-style panel */
.weight-center-hero,.vaccine-center-hero,.visit-center-hero,.treatment-center-hero,.heat-summary{
  display:grid!important;grid-template-columns:minmax(0,1.35fr) repeat(2,minmax(180px,.55fr))!important;
  gap:0!important;overflow:hidden!important;margin:0 0 10px!important;padding:0!important;
  border:1px solid var(--divider-color)!important;border-radius:24px!important;background:var(--pb-surface)!important;
}
.weight-center-hero>div,.vaccine-center-hero>div,.visit-center-hero>div,.treatment-center-hero>div,.heat-summary>.heat-stat{
  min-height:185px!important;display:flex!important;flex-direction:column!important;justify-content:center!important;padding:24px 26px!important;
  border-right:1px solid var(--divider-color)!important;
}
.weight-center-hero>div:last-child,.vaccine-center-hero>div:last-child,.visit-center-hero>div:last-child,.treatment-center-hero>div:last-child,.heat-summary>.heat-stat:last-child{border-right:0!important}
.weight-center-hero .primary,.vaccine-center-hero .primary,.visit-center-hero .primary,.treatment-center-hero .primary{
  background:
    radial-gradient(circle at 10% 10%,color-mix(in srgb,var(--pb-accent) 13%,transparent),transparent 38%),
    linear-gradient(135deg,#1d2120,#191b1b)!important;
}
.weight-center-hero .primary strong,.vaccine-center-hero .primary strong,.visit-center-hero .primary strong,.treatment-center-hero .primary strong{
  font-size:33px!important;letter-spacing:-.04em!important;
}
.weight-center-hero>div>strong,.vaccine-center-hero>div>strong,.visit-center-hero>div>strong,.treatment-center-hero>div>strong,.heat-summary>.heat-stat>strong{
  font-size:25px!important;letter-spacing:-.035em!important;
}
.weight-center-hero small,.vaccine-center-hero small,.visit-center-hero small,.treatment-center-hero small,.heat-summary small{
  font-size:9px!important;color:var(--secondary-text-color)!important;
}

/* KPI strips */
.weight-summary,.vaccine-summary,.visit-summary,.treatment-summary{
  display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:0!important;overflow:hidden!important;
  margin:0 0 20px!important;border:1px solid var(--divider-color)!important;border-radius:18px!important;background:var(--pb-surface)!important;
}
.weight-summary>div,.vaccine-summary>div,.visit-summary>div,.treatment-summary>div{
  min-height:88px!important;padding:17px 20px!important;border-right:1px solid var(--divider-color)!important;
}
.weight-summary>div:last-child,.vaccine-summary>div:last-child,.visit-summary>div:last-child,.treatment-summary>div:last-child{border-right:0!important}
.weight-summary span,.vaccine-summary span,.visit-summary span,.treatment-summary span{
  font-size:7px!important;font-weight:900!important;letter-spacing:.09em!important;color:var(--secondary-text-color)!important;
}
.weight-summary strong,.vaccine-summary strong,.visit-summary strong,.treatment-summary strong{
  display:block!important;margin-top:8px!important;font-size:21px!important;
}

/* History blocks flatter and clearer */
.weight-history,.vaccine-center-list,.visit-center-list,.treatment-list,.heat-history{
  margin-top:16px!important;padding:18px!important;border:1px solid var(--divider-color)!important;border-radius:18px!important;background:var(--pb-surface)!important;
}
.weight-row,.vaccine-history-row,.visit-row,.treatment-row,.heat-record{
  background:transparent!important;border:0!important;border-bottom:1px solid var(--divider-color)!important;border-radius:0!important;
}
.weight-row:last-child,.vaccine-history-row:last-child,.visit-row:last-child,.treatment-row:last-child,.heat-record:last-child{border-bottom:0!important}
.record-edit,.record-delete{
  min-height:34px!important;padding:0 10px!important;border-radius:8px!important;font-size:9px!important;
}

/* ENCI page */
#enci-section.pb-page-active{
  padding:22px 0 42px!important;border:0!important;background:transparent!important;
}
.pb-enci-heading{margin-bottom:18px!important}
#enci-section>.record{
  display:grid!important;grid-template-columns:220px 1fr!important;align-items:center!important;
  min-height:70px!important;padding:14px 20px!important;border-bottom:1px solid var(--divider-color)!important;background:var(--pb-surface)!important;
}
#enci-section>.record:first-of-type{border-radius:18px 18px 0 0!important}
#enci-section>.record:last-of-type{border-radius:0 0 18px 18px!important;border-bottom:0!important}
#enci-section>.record strong{font-size:12px!important}
#enci-section>.record small{font-size:11px!important;color:var(--secondary-text-color)!important}

/* Genealogy */
#genealogy-section.pb-page-active{
  padding:22px 0 42px!important;border:0!important;background:transparent!important;
}
#genealogy-section>.card-head{
  min-height:78px!important;margin-bottom:18px!important;padding:0 6px 18px!important;border-bottom:1px solid var(--divider-color)!important;
}
#genealogy-section>.card-head h3{font-size:38px!important;letter-spacing:-.04em!important}

/* Diagnostics */
.pb-diagnostics-intro{
  display:none;grid-column:1/-1!important;padding:26px 6px 12px!important;border:0!important;background:transparent!important;
}
.pb-diagnostics-mode .pb-diagnostics-intro{display:block!important}
.pb-diagnostics-intro>span{display:block;margin-bottom:7px;color:var(--pb-accent);font-size:9px;font-weight:950;letter-spacing:.18em}
.pb-diagnostics-intro h2{margin:0!important;font-size:44px!important;letter-spacing:-.05em!important}
.pb-diagnostics-intro p{margin:8px 0 0!important;color:var(--secondary-text-color)!important;font-size:11px!important}
.pb-diagnostics-mode .pb-diagnostics-card{
  border:0!important;border-radius:0!important;background:transparent!important;padding:20px 0 34px!important;
}
.pb-diagnostics-mode .pb-diagnostics-card>.card-head{
  padding:0 6px 16px!important;margin-bottom:14px!important;border-bottom:1px solid var(--divider-color)!important;
}
.pb-diagnostics-mode .insight-grid{
  display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:0!important;overflow:hidden!important;
  border:1px solid var(--divider-color)!important;border-radius:18px!important;background:var(--pb-surface)!important;
}
.pb-diagnostics-mode .insight{
  min-height:100px!important;padding:18px!important;border-right:1px solid var(--divider-color)!important;border-radius:0!important;background:transparent!important;
}
.pb-diagnostics-mode .insight:last-child{border-right:0!important}
.pb-diagnostics-mode .insight strong{font-size:22px!important}

/* hide old dashboard mini centers/tools when not needed? keep but improve spacing */
.pb-modern-centers-v2{margin-bottom:8px!important}

@media(max-width:1050px){
  .pb-control-hero{grid-template-columns:1fr!important}
  .pb-control-modules{grid-template-columns:1fr 1fr!important}
  .pb-control-modules>button{border-bottom:1px solid var(--divider-color)!important}
  .pb-control-modules>button:nth-child(2n){border-right:0!important}
  .pb-control-modules>button:last-child{grid-column:1/-1!important;border-bottom:0!important}
  .weight-center-hero,.vaccine-center-hero,.visit-center-hero,.treatment-center-hero,.heat-summary{grid-template-columns:1fr 1fr!important}
  .weight-center-hero .primary,.vaccine-center-hero .primary,.visit-center-hero .primary,.treatment-center-hero .primary{grid-column:1/-1!important}
}
@media(max-width:760px){
  .pb-control-hero{padding:22px 18px;border-radius:19px}
  .pb-control-hero h2{font-size:38px!important}
  .pb-control-modules{grid-template-columns:1fr!important}
  .pb-control-modules>button{min-height:125px!important;border-right:0!important}
  .pb-control-modules>button:last-child{grid-column:auto!important}
  .pb-control-tools{grid-template-columns:1fr 1fr}
  .pb-module-heading{align-items:flex-start;flex-direction:column}
  .pb-module-heading-copy h2{font-size:34px!important}
  .pb-module-add{width:100%!important}
  .weight-center-hero,.vaccine-center-hero,.visit-center-hero,.treatment-center-hero,.heat-summary{grid-template-columns:1fr!important}
  .weight-center-hero .primary,.vaccine-center-hero .primary,.visit-center-hero .primary,.treatment-center-hero .primary{grid-column:auto!important}
  .weight-center-hero>div,.vaccine-center-hero>div,.visit-center-hero>div,.treatment-center-hero>div,.heat-summary>.heat-stat{
    min-height:125px!important;border-right:0!important;border-bottom:1px solid var(--divider-color)!important;
  }
  .weight-summary,.vaccine-summary,.visit-summary,.treatment-summary{grid-template-columns:1fr 1fr!important}
  .pb-diagnostics-mode .insight-grid{grid-template-columns:1fr 1fr!important}
  #enci-section>.record{grid-template-columns:1fr!important;gap:4px!important}
}


/* PawBook 6.10.4 — management intro visibility fix */
#management-intro{
  display:none!important;
}
.pb-management-mode #management-intro{
  display:block!important;
}
#diagnostics-intro{
  display:none!important;
}
.pb-diagnostics-mode #diagnostics-intro{
  display:block!important;
}

/* Never show the Gestione hero inside module pages */
#health-section.pb-page-active ~ #management-intro,
#vaccines-section.pb-page-active ~ #management-intro,
#visits-section.pb-page-active ~ #management-intro,
#treatments-section.pb-page-active ~ #management-intro,
#heat-section.pb-page-active ~ #management-intro{
  display:none!important;
}


/* PawBook 6.10.4 — typography readability */
.pb-clear-nav>button{
  font-size:13px!important;
}

.pb-modern-brandcopy small,
.pb-control-kicker,
.pb-control-title span,
.pb-control-title small,
.pb-module-heading-copy>span,
.pb-modern-kicker,
.pb-modern-block-title>span,
.pb-modern-section-title>span,
.pb-agenda-monthbar small,
.pb-page-heading>div:first-child>span,
.pb-crud-kicker{
  font-size:9px!important;
}

.pb-modern-live-line,
.pb-modern-profile-row span,
.pb-modern-health-meta,
.pb-control-status div,
.pb-control-modules p,
.pb-control-tools small,
.pb-modern-centers-v2 p,
.pb-modern-tools-v2>button strong,
.pb-agenda-event-main p,
.pb-agenda-footer span{
  font-size:10px!important;
}

.pb-modern-brandcopy small,
.pb-modern-live-kpis small,
.pb-control-status small,
.pb-control-modules small,
.pb-control-tools strong,
.pb-module-heading-copy p,
.pb-modern-section-title p,
.pb-modern-hero-copy>p,
.pb-modern-kpirow em,
.pb-modern-kpirow small,
.pb-modern-centers-v2 small,
.pb-agenda-event-main small,
.pb-diagnostics-intro p{
  font-size:10px!important;
}

.pb-control-hero p,
.pb-modern-breed,
.pb-management-copy p,
#enci-section .card-head .muted,
#enci-section .enci-grid small,
#enci-section .profile-list small,
#enci-section .enci-data small,
#enci-pro-section .enci-pro-hero p,
#enci-pro-section .enci-pro-hero small,
#enci-pro-section .enci-pro-grid small,
#enci-pro-section .enci-pro-grid p,
.pb-diagnostics-mode .pb-diagnostics-card>.card-head .muted,
.pb-diagnostics-mode .stat-box small,
.pb-diagnostics-mode .stat-item small{
  font-size:11px!important;
}

.pb-management-mode .pb-management-card>.card-head .muted,
.pb-management-mode .weight-row small,
.pb-management-mode .vaccine-history-row small,
.pb-management-mode .visit-row small,
.pb-management-mode .treatment-row small,
.pb-management-mode .heat-record small{
  font-size:10px!important;
}

.record-edit,
.record-delete,
.visit-actions .small-btn,
.treatment-actions .small-btn,
.pb-back-management,
.pb-module-add,
.pb-module-secondary,
.pb-agenda-actions button,
.pb-modern-status,
.pb-modern-smart-btn{
  font-size:10px!important;
}

@media(max-width:760px){
  .pb-clear-nav>button{
    font-size:12px!important;
  }
  .pb-modern-profile-row span,
  .pb-modern-live-line,
  .pb-control-tools small,
  .pb-control-modules p,
  .pb-modern-centers-v2 p{
    font-size:9px!important;
  }
}


/* PawBook 6.10.4 — BIG typography pass */

/* Menu */
.pb-clear-nav>button{
  font-size:15px!important;
  min-height:56px!important;
  gap:10px!important;
}
.pb-clear-icon{
  font-size:19px!important;
}

/* Generic small labels / eyebrows */
.pb-modern-brandcopy small,
.pb-control-kicker,
.pb-control-title span,
.pb-control-title small,
.pb-module-heading-copy>span,
.pb-modern-kicker,
.pb-modern-block-title>span,
.pb-modern-section-title>span,
.pb-agenda-monthbar small,
.pb-page-heading>div:first-child>span,
.pb-crud-kicker,
.pb-management-copy>span,
.pb-diagnostics-intro>span,
.pb-modern-livecard-top>span,
.pb-modern-kpirow small,
.pb-modern-centers-v2 small,
.pb-modern-live-kpis small,
.pb-control-status small,
.pb-control-modules small,
.pb-control-tools small,
.pb-agenda-event-main small,
.pb-management-overview small,
.pb-modern-health-value small{
  font-size:11px!important;
  line-height:1.35!important;
}

/* Secondary text */
.pb-modern-live-line,
.pb-modern-profile-row span,
.pb-modern-health-meta,
.pb-control-status div,
.pb-control-modules p,
.pb-control-tools strong,
.pb-modern-centers-v2 p,
.pb-modern-tools-v2>button strong,
.pb-agenda-event-main p,
.pb-agenda-footer span,
.pb-module-heading-copy p,
.pb-modern-section-title p,
.pb-modern-hero-copy>p,
.pb-modern-kpirow em,
.pb-diagnostics-intro p,
.pb-control-hero p,
.pb-management-copy p,
.pb-modern-breed{
  font-size:13px!important;
  line-height:1.5!important;
}

/* Main values in smaller panels */
.pb-modern-live-kpis strong,
.pb-modern-centers-v2 strong,
.pb-control-tools strong,
.pb-management-overview strong,
.pb-modern-kpirow strong{
  font-size:16px!important;
}

/* CRUD pages */
.pb-management-mode .pb-management-card>.card-head .muted,
.pb-management-mode .weight-row small,
.pb-management-mode .vaccine-history-row small,
.pb-management-mode .visit-row small,
.pb-management-mode .treatment-row small,
.pb-management-mode .heat-record small,
.pb-management-mode .pb-management-card .muted{
  font-size:12px!important;
  line-height:1.5!important;
}
.pb-management-mode .weight-row strong,
.pb-management-mode .vaccine-history-row strong,
.pb-management-mode .visit-row strong,
.pb-management-mode .treatment-row strong,
.pb-management-mode .heat-record strong{
  font-size:15px!important;
}

/* ENCI */
#enci-section .card-head .muted,
#enci-section .enci-grid small,
#enci-section .profile-list small,
#enci-section .enci-data small,
#enci-section>.record small{
  font-size:13px!important;
  line-height:1.5!important;
}
#enci-section .enci-grid strong,
#enci-section .profile-list strong,
#enci-section .enci-data strong,
#enci-section>.record strong{
  font-size:16px!important;
}

/* ENCI Pro */
#enci-pro-section .enci-pro-hero p,
#enci-pro-section .enci-pro-hero small,
#enci-pro-section .enci-pro-grid small,
#enci-pro-section .enci-pro-grid p,
#enci-pro-section .enci-pro-kpis small{
  font-size:13px!important;
  line-height:1.5!important;
}
#enci-pro-section .enci-pro-grid strong,
#enci-pro-section .enci-pro-kpis strong{
  font-size:16px!important;
}

/* Diagnostics */
.pb-diagnostics-mode .pb-diagnostics-card>.card-head .muted,
.pb-diagnostics-mode .stat-box small,
.pb-diagnostics-mode .stat-item small,
.pb-diagnostics-mode .insight small{
  font-size:12px!important;
  line-height:1.5!important;
}
.pb-diagnostics-mode .stat-box strong,
.pb-diagnostics-mode .stat-item strong,
.pb-diagnostics-mode .insight strong{
  font-size:22px!important;
}

/* Buttons */
.record-edit,
.record-delete,
.visit-actions .small-btn,
.treatment-actions .small-btn,
.pb-back-management,
.pb-module-add,
.pb-module-secondary,
.pb-agenda-actions button,
.pb-modern-status,
.pb-modern-smart-btn,
.pb-modern-tools-v2>button,
.pb-control-tools>button{
  font-size:12px!important;
}
.pb-module-add,
.pb-module-secondary{
  min-height:48px!important;
}

/* Agenda */
.pb-agenda-datebox span{
  font-size:11px!important;
}
.pb-agenda-event-main strong{
  font-size:16px!important;
}

/* Mobile: still large, but safe */
@media(max-width:760px){
  .pb-clear-nav>button{
    font-size:14px!important;
    min-height:52px!important;
  }
  .pb-clear-icon{
    font-size:17px!important;
  }

  .pb-modern-brandcopy small,
  .pb-control-kicker,
  .pb-control-title span,
  .pb-control-title small,
  .pb-module-heading-copy>span,
  .pb-modern-kicker,
  .pb-modern-block-title>span,
  .pb-modern-section-title>span,
  .pb-agenda-monthbar small,
  .pb-page-heading>div:first-child>span,
  .pb-crud-kicker,
  .pb-management-copy>span,
  .pb-diagnostics-intro>span{
    font-size:10px!important;
  }

  .pb-modern-live-line,
  .pb-modern-profile-row span,
  .pb-modern-health-meta,
  .pb-control-status div,
  .pb-control-modules p,
  .pb-control-tools strong,
  .pb-modern-centers-v2 p,
  .pb-agenda-event-main p,
  .pb-module-heading-copy p,
  .pb-modern-section-title p,
  .pb-modern-hero-copy>p,
  .pb-modern-kpirow em,
  .pb-diagnostics-intro p,
  .pb-control-hero p,
  .pb-management-copy p,
  .pb-modern-breed{
    font-size:12px!important;
  }

  .record-edit,
  .record-delete,
  .visit-actions .small-btn,
  .treatment-actions .small-btn,
  .pb-module-add,
  .pb-module-secondary{
    font-size:11px!important;
  }
}

</style>
      <div class="page">
        <div class="topbar inverter-shell pb-modern-header">
          <div class="pb-modern-brandrow">
            <div class="pb-modern-brandleft">
              <button type="button" class="ha-mobile-menu ha-menu pb-modern-hamburger" id="ha-mobile-menu"
                      aria-label="Apri menu Home Assistant" title="Menu Home Assistant">
                <span class="hamburger-glyph" aria-hidden="true">☰</span>
              </button>

              <div class="pb-modern-logo" aria-hidden="true">
                <svg viewBox="0 0 64 64" role="img">
                  <ellipse cx="17" cy="21" rx="7" ry="10" transform="rotate(-24 17 21)"></ellipse>
                  <ellipse cx="29" cy="14" rx="7" ry="10" transform="rotate(-7 29 14)"></ellipse>
                  <ellipse cx="42" cy="15" rx="7" ry="10" transform="rotate(9 42 15)"></ellipse>
                  <ellipse cx="52" cy="24" rx="7" ry="10" transform="rotate(25 52 24)"></ellipse>
                  <path d="M17 47c0-11 8-20 15-20 8 0 17 9 17 20 0 8-6 12-13 9-3-1-5-1-8 0-6 3-11-1-11-9z"></path>
                </svg>
              </div>

              <div class="pb-modern-brandcopy">
                <div class="pb-modern-titleline">
                  <strong>PawBook</strong>
                  <span class="pb-modern-version">6.10.4</span>
                </div>
                <small>Pet Health Center</small>
              </div>
            </div>

            <div class="pb-modern-actions">
              <button type="button" class="pb-modern-status" data-nav-target="management-section">
                <span class="pb-modern-dot ${reminders.length ? "warn" : "ok"}"></span>
                <span>${reminders.length ? `${reminders.length} avvisi` : "Salute regolare"}</span>
              </button>
              <button type="button" class="support-project-btn pb-modern-support" id="support-project" title="Supporta PawBook su Ko-fi">
                <span aria-hidden="true">☕</span>
              </button>
            </div>
          </div>

          <nav class="dashboard-nav tabs pb-clear-nav" aria-label="Sezioni PawBook">
            <button class="active" data-nav-target="overview">
              <span class="pb-clear-icon">▦</span><span>Dashboard</span>
            </button>
            <button data-nav-target="management-section">
              <span class="pb-clear-icon">✚</span><span>Gestione</span>
            </button>
            <button data-nav-target="calendar-section">
              <span class="pb-clear-icon">▤</span><span>Agenda</span>
            </button>
            <button data-nav-target="enci-section">
              <span class="pb-clear-icon">◆</span><span>ENCI</span>
            </button>
            <button data-nav-target="genealogy-section">
              <span class="pb-clear-icon">⌘</span><span>Genealogia</span>
            </button>
            <button data-nav-target="diagnostics-section">
              <span class="pb-clear-icon">🛠</span><span>Diagnostica</span>
            </button>
          </nav>
        </div>

        ${family ? `
          <section class="multi-pet-hub" id="family-hub">
            <div class="multi-pet-head">
              <div><span class="multi-pet-kicker">🐾 PawBook Family</span><h2>I miei cani</h2><small class="muted">${family.pets.length} profili · dati e promemoria sempre separati</small></div>
              <span class="multi-pet-total">${family.reminders.length ? `🔔 ${family.reminders.length} promemoria` : "✅ Tutto regolare"}</span>
            </div>

            <div class="family-pets">
              ${family.pets.map(pet=>`
                <button type="button" class="family-pet-card ${pet.index===this._selected?"active":""}" data-family-pet="${pet.index}">
                  ${pet.photo ? `<img src="${this.esc(pet.photo)}" alt="${this.esc(pet.name)}">` : `<span class="family-pet-placeholder">🐾</span>`}
                  <span class="family-pet-main">
                    <strong>${this.esc(pet.name)}</strong>
                    <small>${this.esc(pet.breed)}</small>
                    <em>${pet.reminders.length ? `🔔 ${pet.reminders.length} ${pet.reminders.length===1?"promemoria":"promemoria"}` : "✅ Nessun avviso"}</em>
                  </span>
                  <span class="family-pet-stats">
                    <small>⚖️ ${pet.weight!==null ? `${this.esc(pet.weight)} kg` : "—"}</small>
                    <small>💉 ${pet.nextVax ? this.formatDate(pet.nextVax.expires_on) : "—"}</small>
                  </span>
                </button>`).join("")}
            </div>

            <div class="family-overview-grid">
              <div class="family-panel">
                <div class="family-panel-head"><h3>🔔 Promemoria famiglia</h3><small>Priorità di tutti i cani</small></div>
                ${family.reminders.length ? `<div class="family-reminders">${family.reminders.slice(0,6).map(item=>`
                  <button type="button" class="family-reminder ${item.level}" data-family-target-pet="${item.petIndex}" data-family-target="${this.esc(item.target)}">
                    <span>${item.icon}</span><span><strong>${this.esc(item.petName)}</strong><em>${this.esc(item.title)}</em><small>${this.esc(item.detail)}</small></span><b>›</b>
                  </button>`).join("")}</div>` : `<div class="family-empty">✅ Nessun promemoria urgente per nessun cane.</div>`}
              </div>

              <div class="family-panel">
                <div class="family-panel-head"><h3>📅 Prossimi eventi</h3><small>Agenda sanitaria condivisa</small></div>
                ${family.upcoming.length ? `<div class="family-events">${family.upcoming.slice(0,6).map(event=>`
                  <button type="button" class="family-event" data-family-target-pet="${event.petIndex}" data-family-target="calendar-section">
                    <span>${event.icon}</span><strong>${this.formatDate(event.date)}</strong><span><b>${this.esc(event.petName)}</b><small>${this.esc(event.title)}</small></span>
                  </button>`).join("")}</div>` : `<div class="family-empty">Nessun evento futuro registrato.</div>`}
              </div>
            </div>
          </section>

          <div class="pet-tabs family-switcher" aria-label="Cambia cane">
            ${this._books.map((item,index)=>`
              <button class="pet-tab ${index===this._selected?"active":""}" data-pet="${index}">
                🐾 ${this.esc(item.profile?.dog_name || item.title)}
              </button>`).join("")}
          </div>` : ""}

        <section class="pb-modern-page" id="overview">
          <div class="pb-modern-section-title">
            <span>PAWBOOK</span>
            <h2>Dashboard salute</h2>
            <p>Profilo, stato sanitario e prossime attività in un’unica vista.</p>
          </div>

          <article class="pb-modern-hero pb-modern-hero-photo">
            <div class="pb-modern-portrait-wrap">
              <button type="button" id="edit-photo" class="pb-modern-portrait" title="Modifica foto">
                ${photo}
                <span class="pb-modern-photo-edit">✎</span>
              </button>
            </div>

            <div class="pb-modern-hero-copy">
              <span class="pb-modern-kicker">HOME ASSISTANT · PET HEALTH CENTER</span>
              <h1>${this.esc(p.dog_name || book.title)}</h1>
              <p class="pb-modern-breed">${this.esc(p.breed || "Profilo PawBook")}</p>

              <div class="pb-modern-profile-row">
                ${p.birth_date ? `<span>🎂 ${this.formatDate(p.birth_date)}</span>` : ""}
                ${p.microchip ? `<span>◈ ${this.esc(p.microchip)}</span>` : ""}
                ${p.enci_registry ? `<span>🏆 ${this.esc(p.enci_registry)}</span>` : ""}
              </div>

              <div class="pb-modern-health-summary ${smart.some(x=>x.level === "danger") ? "danger" : smart.some(x=>x.level === "warn") ? "warn" : "ok"}">
                <div class="pb-modern-health-value">
                  <small>STATO SALUTE</small>
                  <strong>${smart.some(x=>x.level === "danger") ? "DA CONTROLLARE" : smart.some(x=>x.level === "warn") ? "ATTENZIONE" : "TUTTO REGOLARE"}</strong>
                </div>
                <div class="pb-modern-health-meta">
                  <span class="pb-modern-live-dot ${reminders.length ? "warn" : "ok"}"></span>
                  <span>${reminders.length ? `${reminders.length} promemoria attivi` : "Nessuna priorità sanitaria"}</span>
                </div>
              </div>

              <div class="pb-modern-live-kpis">
                <div><small>Peso</small><strong>${lastWeight ? `${this.esc(lastWeight.weight)} kg` : "—"}</strong></div>
                <div><small>Vaccino</small><strong>${nextVax ? this.formatDate(nextVax.expires_on) : "—"}</strong></div>
                <div><small>Terapie</small><strong>${treatments.length ? treatments.length : "0"}</strong></div>
              </div>
            </div>
          </article>

          <div class="pb-modern-block-title">
            <span>HEALTH OVERVIEW</span>
            <small>01</small>
          </div>

          <div class="pb-modern-kpirow">
            <button type="button" data-nav-target="health-section">
              <span>⚖️</span><div><small>PESO ATTUALE</small><strong>${lastWeight ? `${this.esc(lastWeight.weight)} kg` : "—"}</strong><em>${weightStats.delta !== null && weightStats.delta !== undefined ? `${weightStats.delta > 0 ? "+" : ""}${weightStats.delta} kg ultimo delta` : "Nessun trend"}</em></div>
            </button>
            <button type="button" data-nav-target="vaccines-section">
              <span>💉</span><div><small>PROSSIMO VACCINO</small><strong>${nextVax ? this.formatDate(nextVax.expires_on) : "Nessuna scadenza"}</strong><em>${vaccineStatusCounts.expired ? `${vaccineStatusCounts.expired} scaduti` : vaccineStatusCounts.warning ? `${vaccineStatusCounts.warning} in scadenza` : "Situazione regolare"}</em></div>
            </button>
            <button type="button" data-nav-target="visits-section">
              <span>🩺</span><div><small>ULTIMA VISITA</small><strong>${lastVisit ? this.formatDate(lastVisit.date) : "—"}</strong><em>${lastVisit?.reason ? this.esc(lastVisit.reason) : `${book.visits?.length || 0} visite registrate`}</em></div>
            </button>
            <button type="button" data-nav-target="treatments-section">
              <span>💊</span><div><small>TERAPIE ATTIVE</small><strong>${treatments.length ? `${treatments.length}` : "0"}</strong><em>${treatments.length ? this.esc(treatments.map(x=>x.name||"Terapia").slice(0,2).join(" · ")) : "Nessuna terapia"}</em></div>
            </button>
          </div>

          <div class="pb-modern-block-title">
            <span>PRIORITÀ E CICLI</span>
            <small>02</small>
          </div>

          <div class="pb-modern-duo">
            <article class="pb-modern-priority">
              <div>
                <span class="pb-modern-kicker">SMART HEALTH</span>
                <h3>${reminders.length ? this.esc(reminders[0].title) : "Tutto regolare"}</h3>
                <p>${reminders.length ? this.esc(reminders[0].detail) : "Nessuna priorità sanitaria rilevata nei dati registrati."}</p>
              </div>
              <button type="button" data-nav-target="${reminders[0]?.target || "smart-section"}">Apri →</button>
            </article>

            <article class="pb-modern-cycle">
              <span class="pb-modern-kicker">PROSSIMO CALORE</span>
              <strong>${heatStats.forecast ? this.formatDate(heatStats.forecast.center) : "—"}</strong>
              <p>${heatStats.forecast ? `Finestra ${this.formatDate(heatStats.forecast.from)} – ${this.formatDate(heatStats.forecast.to)}` : "Dati insufficienti per una previsione."}</p>
              <button type="button" data-nav-target="heat-section">Heat Cycle Center →</button>
            </article>
          </div>

          <div class="pb-modern-block-title">
            <span>HEALTH CENTERS</span>
            <small>03</small>
          </div>

          <div class="pb-modern-centers pb-modern-centers-v2">
            <button type="button" data-nav-target="health-section">
              <span class="pb-center-icon">⚖️</span>
              <div><small>HEALTH CENTER</small><strong>Peso</strong><p>Trend, storico e nuove pesate</p></div>
              <b>›</b>
            </button>
            <button type="button" data-nav-target="vaccines-section">
              <span class="pb-center-icon">💉</span>
              <div><small>HEALTH CENTER</small><strong>Vaccini</strong><p>Dosi, richiami e scadenze</p></div>
              <b>›</b>
            </button>
            <button type="button" data-nav-target="visits-section">
              <span class="pb-center-icon">🩺</span>
              <div><small>HEALTH CENTER</small><strong>Visite</strong><p>Controlli e referti veterinari</p></div>
              <b>›</b>
            </button>
            <button type="button" data-nav-target="treatments-section">
              <span class="pb-center-icon">💊</span>
              <div><small>HEALTH CENTER</small><strong>Terapie</strong><p>Farmaci, dosaggi e durata</p></div>
              <b>›</b>
            </button>
            <button type="button" data-nav-target="heat-section">
              <span class="pb-center-icon">🌸</span>
              <div><small>HEALTH CENTER</small><strong>Calori</strong><p>Cicli e previsione</p></div>
              <b>›</b>
            </button>
          </div>

          <div class="pb-modern-tools pb-modern-tools-v2">
            <button data-nav-target="statistics-section"><span>▥</span><strong>Statistiche</strong></button>
            <button data-nav-target="documents-section"><span>⌕</span><strong>Documenti</strong></button>
            <button data-nav-target="report-section"><span>▤</span><strong>Report</strong></button>
            <button data-nav-target="backup-section"><span>⇅</span><strong>Backup</strong></button>
            <button type="button" id="profile-config"><span>⚙</span><strong>Profilo</strong></button>
          </div>
        </section>

        <section class="grid">
          <article class="pb-diagnostics-intro" id="diagnostics-intro">
            <span>PAWBOOK SYSTEM</span>
            <h2>Diagnostica</h2>
            <p>Statistiche, documenti, report e strumenti di manutenzione.</p>
          </article>
          <article class="pb-management-intro pb-control-hub" id="management-intro">
            <div class="pb-control-hero">
              <div>
                <span class="pb-control-kicker">PAWBOOK · HEALTH CONTROL CENTER</span>
                <h2>Gestione salute</h2>
                <p>Tutti i dati modificabili di ${this.esc(p.dog_name || book.title)}, organizzati in moduli separati.</p>
              </div>

              <div class="pb-control-status">
                <small>STATO SANITARIO</small>
                <strong>${reminders.length ? `${reminders.length} DA CONTROLLARE` : "TUTTO REGOLARE"}</strong>
                <div><span class="pb-modern-live-dot ${reminders.length ? "warn" : "ok"}"></span>${reminders.length ? "Sono presenti promemoria attivi" : "Nessuna priorità sanitaria"}</div>
              </div>
            </div>

            <div class="pb-control-title"><span>MODULI SANITARI</span><small>05</small></div>

            <div class="pb-control-modules">
              <button type="button" class="weight" data-nav-target="health-section">
                <span class="pb-control-module-icon">⚖️</span>
                <div><small>PESO</small><strong>${lastWeight ? `${this.esc(lastWeight.weight)} kg` : "—"}</strong><p>Pesate, trend e storico</p></div>
                <b>›</b>
              </button>
              <button type="button" class="vaccine" data-nav-target="vaccines-section">
                <span class="pb-control-module-icon">💉</span>
                <div><small>VACCINI</small><strong>${book.vaccinations?.length || 0}</strong><p>Dosi, richiami e scadenze</p></div>
                <b>›</b>
              </button>
              <button type="button" class="visit" data-nav-target="visits-section">
                <span class="pb-control-module-icon">🩺</span>
                <div><small>VISITE</small><strong>${book.visits?.length || 0}</strong><p>Controlli e referti</p></div>
                <b>›</b>
              </button>
              <button type="button" class="treatment" data-nav-target="treatments-section">
                <span class="pb-control-module-icon">💊</span>
                <div><small>TERAPIE</small><strong>${treatmentStats.items.length || 0}</strong><p>Farmaci, dosaggi e durata</p></div>
                <b>›</b>
              </button>
              <button type="button" class="heat" data-nav-target="heat-section">
                <span class="pb-control-module-icon">🌸</span>
                <div><small>CALORI</small><strong>${heatStats.cycles.length || 0}</strong><p>Cicli e previsione</p></div>
                <b>›</b>
              </button>
            </div>

            <div class="pb-control-title"><span>STRUMENTI</span><small>TOOLS</small></div>

            <div class="pb-control-tools">
              <button type="button" data-nav-target="statistics-section"><span>▥</span><div><strong>Statistiche</strong><small>Analisi dello storico</small></div></button>
              <button type="button" data-nav-target="documents-section"><span>⌕</span><div><strong>Documenti</strong><small>Referti e allegati</small></div></button>
              <button type="button" data-nav-target="report-section"><span>▤</span><div><strong>Report</strong><small>Scheda sanitaria</small></div></button>
              <button type="button" data-nav-target="backup-section"><span>⇅</span><div><strong>Backup</strong><small>Esporta e ripristina</small></div></button>
            </div>
          </article>

          <article class="card v2-section wide" id="smart-section">
            <div class="card-head"><div><h3>❤️ Smart Health</h3><small class="muted">Riepilogo automatico dei dati già presenti in PawBook</small></div></div>
            <div class="smart-list">${smart.map(item=>`<div class="smart-item ${item.level}"><div class="smart-icon">${item.icon}</div><div>${this.esc(item.text)}</div></div>`).join("")}</div>
            <p class="muted" style="margin-top:12px">PawBook evidenzia scadenze e cronologia registrata; non formula diagnosi o valutazioni cliniche.</p>
          </article>

          <article class="card wide weight-dashboard" id="health-section">
            <div class="pb-module-heading">
              <div class="pb-module-heading-copy">
                <button type="button" class="pb-back-management" data-nav-target="management-section">← Gestione</button>
                <span>PESO</span>
                <h2>Weight Center</h2>
                <p>Pesate, variazioni e storico completo.</p>
              </div>
              <button class="pb-module-add" data-form="weight">＋ Nuova pesata</button>
            </div>

            <div class="weight-center-hero">
              <div class="primary"><span class="hero-icon">⚖️</span><span><small>Peso attuale</small><strong>${weightStats.latest ? `${this.esc(weightStats.latest.weight)} kg` : "—"}</strong><span>${weightStats.latest ? `${this.formatDate(weightStats.latest.date)} · ${weightStats.daysSince} giorni fa` : "Nessuna pesata registrata"}</span></span></div>
              <div><span>Ultima variazione</span><strong>${weightStats.delta == null ? "—" : `${weightStats.delta > 0 ? "+" : ""}${weightStats.delta} kg`}</strong><small>${weightStats.previous ? `Da ${this.esc(weightStats.previous.weight)} kg` : "Servono almeno due pesate"}</small>${weightStats.delta != null ? `<span class="weight-delta ${weightStats.delta > 0 ? "up" : weightStats.delta < 0 ? "down" : "stable"}">${weightStats.delta > 0 ? "↑ Aumento" : weightStats.delta < 0 ? "↓ Diminuzione" : "• Stabile"}</span>` : ""}</div>
              <div><span>Variazione totale</span><strong>${weightStats.totalDelta == null ? "—" : `${weightStats.totalDelta > 0 ? "+" : ""}${weightStats.totalDelta} kg`}</strong><small>${weightStats.items.length > 1 ? `${this.formatDate(weightStats.items[0].date)} → oggi` : "Storico insufficiente"}</small></div>
            </div>
            <div class="weight-summary">
              <div><span>Registrazioni</span><strong>${weightStats.items.length}</strong><small>Pesate archiviate</small></div>
              <div><span>Media</span><strong>${weightStats.average == null ? "—" : `${weightStats.average} kg`}</strong><small>Sull'intero storico</small></div>
              <div><span>Minimo</span><strong>${weightStats.min == null ? "—" : `${weightStats.min} kg`}</strong><small>Peso più basso</small></div>
              <div><span>Massimo</span><strong>${weightStats.max == null ? "—" : `${weightStats.max} kg`}</strong><small>Peso più alto</small></div>
            </div>
            <div class="weight-chart-panel"><h4>Andamento del peso</h4>${this.weightChart(book)}</div>
            ${weightStats.years.length ? `<div class="weight-history">${weightStats.years.map((group,index)=>`<details class="weight-year" ${index===0?"open":""}><summary><span>${this.esc(group.year)}</span><small>${group.rows.length} ${group.rows.length===1?"pesata":"pesate"}</small></summary><div class="weight-year-list">${group.rows.map(item=>`<div class="weight-row editable" data-edit-kind="weight" data-category="weights" data-record-id="${this.esc(item.id)}"><span>${this.formatDate(item.date)}</span><span class="weight-value">${this.esc(item.weight)} kg</span><span class="weight-note">${item.notes ? this.esc(item.notes) : "Nessuna nota"}</span><span class="weight-actions"><button type="button" class="record-edit" title="Modifica">Modifica</button><button type="button" class="record-delete danger" title="Elimina">Elimina</button></span></div>`).join("")}</div></details>`).join("")}</div>` : `<div class="empty">Nessuna pesata registrata. Usa “Aggiungi peso” per iniziare.</div>`}
          </article>

          <article class="card wide vaccines-dashboard" id="vaccines-section">
            <div class="pb-module-heading">
              <div class="pb-module-heading-copy">
                <button type="button" class="pb-back-management" data-nav-target="management-section">← Gestione</button>
                <span>VACCINI</span>
                <h2>Vaccination Center</h2>
                <p>Dosi, richiami e scadenze vaccinali.</p>
              </div>
              <button class="pb-module-add" data-form="vaccination">＋ Nuova dose</button>
            </div>

            <div class="vaccine-center-hero">
              <div class="primary"><span class="hero-icon">💉</span><span><small>Stato vaccinale</small><strong>${vaccineStatusCounts.expired ? `${vaccineStatusCounts.expired} vaccini scaduti` : vaccineStatusCounts.warning ? `${vaccineStatusCounts.warning} in scadenza` : vaccineGroups.length ? "Tutto in regola" : "Nessun vaccino registrato"}</strong><span>${book.vaccinations?.length || 0} somministrazioni · ${vaccineGroups.length} tipi</span></span></div>
              <div><span>Prossimo richiamo</span><strong>${nextVax ? this.formatDate(nextVax.expires_on) : "—"}</strong><small>${nextVax ? this.esc(nextVax.name || "Vaccinazione") : "Nessuna scadenza futura"}</small></div>
              <div><span>Ultima dose</span><strong>${book.vaccinations?.length ? this.formatDate(this.latest(book.vaccinations,"administered_on")?.administered_on) : "—"}</strong><small>${book.vaccinations?.length ? this.esc(this.latest(book.vaccinations,"administered_on")?.name || "Vaccinazione") : "Nessuna somministrazione"}</small></div>
            </div>
            <div class="vaccine-summary">
              <div><span>Tipi</span><strong>${vaccineGroups.length}</strong></div>
              <div class="ok"><span>In regola</span><strong>${vaccineStatusCounts.ok || 0}</strong></div>
              <div class="warning"><span>In scadenza</span><strong>${vaccineStatusCounts.warning || 0}</strong></div>
              <div class="expired"><span>Scaduti</span><strong>${vaccineStatusCounts.expired || 0}</strong></div>
            </div>
            ${vaccineGroups.length ? `<div class="vaccine-groups">${vaccineGroups.map(group => {
              const status = this.vaccinationStatus(group);
              const latest = group.latest;
              const statusDetail = status.key === "ok" && Number.isFinite(status.days) ? `Richiamo tra ${status.days} giorni` : status.key === "warning" && Number.isFinite(status.days) ? `Richiamo tra ${status.days} giorni` : status.key === "expired" && Number.isFinite(status.days) ? `Scaduto da ${Math.abs(status.days)} giorni` : "Solo cronologia";
              return `<details class="vaccine-group ${status.key}" ${group === vaccineGroups[0] ? "open" : ""}>
                <summary>
                  <span class="vaccine-group-title"><span class="vaccine-dot">${status.icon}</span><span><strong>${this.esc(group.name)}</strong><small>${group.items.length} ${group.items.length === 1 ? "dose registrata" : "dosi registrate"}</small><span class="vaccine-status-line">${this.esc(status.label)} · ${this.esc(statusDetail)}</span></span></span>
                  <span class="vaccine-group-current"><small>Ultima dose</small><strong>${latest ? this.formatDate(latest.administered_on) : "—"}</strong>${group.next?.expires_on ? `<em>Richiamo ${this.formatDate(group.next.expires_on)}</em>` : ""}</span>
                </summary>
                <div class="vaccine-group-tools"><button type="button" class="small-btn" data-vaccine-add="${this.esc(group.name)}">+ Nuova dose di ${this.esc(group.name)}</button></div>
                <div class="vaccine-history">${group.items.map(item => `<div class="vaccine-history-row editable" data-edit-kind="vaccination" data-category="vaccinations" data-record-id="${this.esc(item.id)}"><span class="vaccine-date">${this.formatDate(item.administered_on)}</span><span class="vaccine-history-info"><strong>${this.esc(item.name || group.name)}</strong><span class="vaccine-dose-meta">${item.veterinarian ? `<small>🩺 ${this.esc(item.veterinarian)}</small>` : ""}${item.batch ? `<small>🏷️ Lotto ${this.esc(item.batch)}</small>` : ""}${item.expires_on ? `<small>📅 Richiamo ${this.formatDate(item.expires_on)}</small>` : ""}</span>${item.notes ? `<div class="vaccine-note">${this.esc(item.notes)}</div>` : ""}</span><span class="record-actions"><button type="button" class="record-edit" title="Modifica">Modifica</button><button type="button" class="record-delete danger" title="Elimina">Elimina</button></span></div>`).join("")}</div>
              </details>`;
            }).join("")}</div>` : `<div class="empty">Nessuna vaccinazione registrata. Usa “Aggiungi dose” per iniziare.</div>`}
          </article>

          <article class="card wide veterinary-dashboard" id="visits-section">
            <div class="pb-module-heading">
              <div class="pb-module-heading-copy">
                <button type="button" class="pb-back-management" data-nav-target="management-section">← Gestione</button>
                <span>VISITE</span>
                <h2>Veterinary Center</h2>
                <p>Controlli, referti e cronologia veterinaria.</p>
              </div>
              <button class="pb-module-add" data-form="visit">＋ Nuova visita</button>
            </div>

            <div class="visit-center-hero">
              <div class="primary"><span class="hero-icon">🩺</span><span><small>Stato visite</small><strong>${visitStats.last ? (visitStats.daysSince > 365 ? "Controllo da valutare" : "Cronologia aggiornata") : "Nessuna visita registrata"}</strong><span>${visitStats.visits.length} ${visitStats.visits.length === 1 ? "visita" : "visite"} archiviate</span></span></div>
              <div><span>Ultima visita</span><strong>${visitStats.last ? this.formatDate(visitStats.last.date) : "—"}</strong><small>${visitStats.last ? this.esc(visitStats.last.reason || "Visita") : "Nessuna registrazione"}</small></div>
              <div><span>Tempo trascorso</span><strong>${visitStats.daysSince !== null ? `${visitStats.daysSince} gg` : "—"}</strong><small>${visitStats.vets ? `${visitStats.vets} veterinari registrati` : "Veterinario non indicato"}</small></div>
            </div>
            <div class="visit-summary">
              <div><span>Totale visite</span><strong>${visitStats.visits.length}</strong></div>
              <div><span>Veterinari</span><strong>${visitStats.vets}</strong></div>
              <div><span>Categorie</span><strong>${visitStats.categories.size}</strong></div>
              <div><span>Allegati visite</span><strong>${(book.attachments||[]).filter(a=>a.category === "visits").length}</strong></div>
            </div>
            ${visitStats.visits.length ? `<div class="visit-timeline">${Object.entries(visitStats.visits.reduce((acc,item)=>{const year=String(item.date||"").slice(0,4)||"Senza data";(acc[year] ||= []).push(item);return acc;},{})).sort((a,b)=>String(b[0]).localeCompare(String(a[0]))).map(([year,items],yearIndex)=>`<details class="visit-year" ${yearIndex===0 ? "open" : ""}><summary><span>${this.esc(year)}</span><small>${items.length} ${items.length===1?"evento":"eventi"}</small></summary><div class="visit-year-list">${items.map(item=>{const cat=this.visitCategory(item);return `<div class="visit-row editable" data-edit-kind="visit" data-category="visits" data-record-id="${this.esc(item.id)}"><span class="visit-type"><span class="visit-icon">${cat.icon}</span><small>${this.esc(cat.label)}</small></span><span class="visit-info"><strong>${this.esc(item.reason || "Visita veterinaria")}</strong><span class="visit-meta"><span>📅 ${this.formatDate(item.date)}</span>${item.veterinarian?`<span>👨‍⚕️ ${this.esc(item.veterinarian)}</span>`:""}</span>${item.outcome?`<div class="visit-outcome">${this.esc(item.outcome)}</div>`:""}${item.notes?`<div class="visit-notes">${this.esc(item.notes)}</div>`:""}${this.renderVisitAttachments(book,item.id)}</span><span class="visit-actions"><button type="button" class="small-btn" data-visit-attachment="${this.esc(item.id)}">📎 Allegato</button><button type="button" class="record-edit" title="Modifica">Modifica</button><button type="button" class="record-delete danger" title="Elimina">Elimina</button></span></div>`;}).join("")}</div></details>`).join("")}</div>` : `<div class="empty">Nessuna visita registrata. Usa “Aggiungi visita” per iniziare.</div>`}
          </article>

          <article class="card wide treatments-dashboard" id="treatments-section">
            <div class="pb-module-heading">
              <div class="pb-module-heading-copy">
                <button type="button" class="pb-back-management" data-nav-target="management-section">← Gestione</button>
                <span>TERAPIE</span>
                <h2>Treatments Center</h2>
                <p>Farmaci, dosaggi e trattamenti.</p>
              </div>
              <button class="pb-module-add" data-form="treatment">＋ Nuova terapia</button>
            </div>

            <div class="treatment-center-hero">
              <div class="primary"><span class="hero-icon">💊</span><span><small>Stato terapie</small><strong>${treatmentStats.active.length ? `${treatmentStats.active.length} in corso` : "Nessuna terapia attiva"}</strong><span>${treatmentStats.items.length} ${treatmentStats.items.length===1?"terapia":"terapie"} archiviate</span></span></div>
              <div><span>Prossima programmata</span><strong>${treatmentStats.upcoming[0] ? this.formatDate(treatmentStats.upcoming[0].starts_on) : "—"}</strong><small>${treatmentStats.upcoming[0] ? this.esc(treatmentStats.upcoming[0].name||"Terapia") : "Nessuna terapia futura"}</small></div>
              <div><span>Farmaci / terapie</span><strong>${treatmentStats.medicines}</strong><small>${treatmentStats.completed.length} terminate</small></div>
            </div>
            <div class="treatment-summary">
              <div><span>In corso</span><strong>${treatmentStats.active.length}</strong></div>
              <div><span>Programmate</span><strong>${treatmentStats.upcoming.length}</strong></div>
              <div><span>Terminate</span><strong>${treatmentStats.completed.length}</strong></div>
              <div><span>Allegati</span><strong>${(book.attachments||[]).filter(a=>a.category === "treatments").length}</strong></div>
            </div>
            ${treatmentStats.items.length ? `<div class="treatment-list">${treatmentStats.items.map(item=>{const status=this.treatmentStatus(item),progress=this.treatmentProgress(item);return `<div class="treatment-row editable" data-edit-kind="treatment" data-category="treatments" data-record-id="${this.esc(item.id)}"><span class="treatment-state"><span class="pill ${status.key}">${status.icon} ${this.esc(status.label)}</span><small>${this.formatDate(item.starts_on)}</small>${item.ends_on?`<small>→ ${this.formatDate(item.ends_on)}</small>`:""}</span><span class="treatment-info"><strong>${this.esc(item.name||"Terapia")}</strong><span class="treatment-meta">${item.dosage?`<span>💊 ${this.esc(item.dosage)}</span>`:""}${item.frequency?`<span>⏱️ ${this.esc(item.frequency)}</span>`:""}</span>${progress&&status.key==="active"?`<div class="treatment-progress"><div class="treatment-progress-bar"><i style="width:${progress.percent}%"></i></div><small>Giorno ${progress.elapsed} di ${progress.total} · ${progress.percent}%</small></div>`:""}${item.notes?`<div class="treatment-note">${this.esc(item.notes)}</div>`:""}${this.renderTreatmentAttachments(book,item.id)}</span><span class="treatment-actions"><button type="button" class="small-btn" data-treatment-attachment="${this.esc(item.id)}">📎 Allegato</button><button type="button" class="record-edit" title="Modifica">Modifica</button><button type="button" class="record-delete danger" title="Elimina">Elimina</button></span></div>`;}).join("")}</div>` : `<div class="empty">Nessuna terapia registrata. Usa “Aggiungi terapia” per iniziare.</div>`}
          </article>

          <article class="card heat-center app-panel" id="heat-section">
            <div class="pb-module-heading">
              <div class="pb-module-heading-copy">
                <button type="button" class="pb-back-management" data-nav-target="management-section">← Gestione</button>
                <span>CALORI</span>
                <h2>Heat Cycle Center</h2>
                <p>Cicli, storico e previsione.</p>
              </div>
              <button class="pb-module-add" data-form="heat">＋ Nuovo ciclo</button>
            </div>
            

            ${heatStats.cycles.length ? `
              <div class="heat-summary">
                <div class="heat-stat">
                  <span>Ultimo calore</span>
                  <strong>${this.formatDate(heatStats.last?.starts_on)}</strong>
                  <small>${heatStats.last?.ends_on ? `Fine ${this.formatDate(heatStats.last.ends_on)}` : "In corso"}</small>
                </div>

                <div class="heat-stat">
                  <span>Durata media</span>
                  <strong>${heatStats.avgDuration ? `${heatStats.avgDuration} giorni` : "—"}</strong>
                  <small>${heatStats.durations.length ? `${heatStats.durations.length} cicli completi` : "Servono date di fine"}</small>
                </div>

                <div class="heat-stat">
                  <span>Intervallo tipico</span>
                  <strong>${heatStats.medianInterval ? `${Math.round(heatStats.medianInterval / 30.44)} mesi` : "—"}</strong>
                  <small>${heatStats.medianInterval ? `${heatStats.medianInterval} giorni (mediana)` : "Servono almeno 2 cicli"}</small>
                </div>

                <div class="heat-stat forecast">
                  <span>🌸 Prossimo calore stimato</span>
                  <strong>${heatStats.forecast ? this.formatDate(heatStats.forecast.center) : "Dati insufficienti"}</strong>
                  <small>${heatStats.forecast ? `${this.formatDate(heatStats.forecast.from)} – ${this.formatDate(heatStats.forecast.to)}` : "Registra almeno due inizi di calore"}</small>
                </div>
              </div>

              ${heatStats.forecast ? `
                <div class="heat-forecast-note">
                  <strong>Affidabilità: ${this.esc(heatStats.forecast.confidence)}</strong>
                  <span>Stima basata su ${heatStats.forecast.cyclesUsed} cicli registrati. È una proiezione statistica, non una previsione veterinaria.</span>
                </div>` : ""}

              <div class="heat-history">
                ${heatStats.cycles.map(item => {
                  const duration = this.heatDuration(item);
                  return `
                    <div class="heat-record editable"
                         data-edit-kind="heat"
                         data-category="heat_cycles"
                         data-record-id="${this.esc(item.id)}">
                      <div class="heat-date">
                        <span>❤️</span>
                        <strong>${this.formatDate(item.starts_on)}</strong>
                        <small>${item.ends_on ? `→ ${this.formatDate(item.ends_on)}` : "In corso"}${duration ? ` · ${duration} giorni` : ""}</small>
                      </div>
                      <div class="heat-notes">${item.notes ? this.esc(item.notes) : "Nessuna nota"}</div>
                      <span class="record-actions">
                        <button type="button" class="record-edit" title="Modifica">Modifica</button>
                        <button type="button" class="record-delete danger" title="Elimina">Elimina</button>
                      </span>
                    </div>`;
                }).join("")}
              </div>
            ` : `
              <div class="empty">
                Nessun ciclo di calore registrato. Aggiungine almeno due per ottenere una prima proiezione.
              </div>`}
          </article>

          <article class="card v2-section reminders-center app-panel" id="reminders-section">
            <div class="card-head"><div><h3>🔔 Promemoria automatici</h3><small class="muted">Generati automaticamente dai dati già presenti in PawBook. Non devi compilarli manualmente.</small></div><span class="reminder-auto-badge">AUTO</span></div>
            ${reminders.length ? `<div class="reminders-list">${reminders.map(item=>`
              <button type="button" class="reminder-row ${item.level}" data-nav-target="${this.esc(item.target)}">
                <span class="reminder-icon">${item.icon}</span>
                <span><strong>${this.esc(item.title)}</strong><small>${this.esc(item.detail)}</small></span>
                <span class="reminder-arrow">›</span>
              </button>`).join("")}</div>` : `<div class="reminder-empty"><span>✅</span><strong>Nessun promemoria urgente</strong><small>PawBook continuerà a controllare automaticamente vaccini, visite, terapie, peso e finestra stimata del calore.</small></div>`}
            <div class="reminder-rules">
              <span>💉 Vaccini: scaduti o entro 30 giorni</span>
              <span>💊 Terapie: fine entro 3 giorni</span>
              <span>🩺 Visita: oltre 12 mesi</span>
              <span>⚖️ Peso: oltre 30 giorni</span>
              <span>🌸 Calore: ingresso nella finestra stimata</span>
            </div>
          </article>

          <article class="card v2-section health-calendar-card app-panel span-2 pb-agenda-page" id="calendar-section">
            <div class="pb-page-heading">
              <div>
                <span>AGENDA SANITARIA</span>
                <h2>Prossimi eventi</h2>
                <p>Vaccini, terapie, visite e cicli ordinati nel tempo.</p>
              </div>
              <div class="pb-agenda-actions">
                <button type="button" id="calendar-prev">‹</button>
                <button type="button" id="calendar-today">Oggi</button>
                <button type="button" id="calendar-next">›</button>
              </div>
            </div>

            <div class="pb-agenda-monthbar">
              <div>
                <small>PERIODO</small>
                <strong>${this.esc(healthCalendar.label)}</strong>
              </div>
              <div class="pb-agenda-monthstats">
                <span><i class="vaccine"></i>${healthCalendar.upcoming.filter(e=>e.type==="vaccine").length} vaccini</span>
                <span><i class="treatment"></i>${healthCalendar.upcoming.filter(e=>e.type==="treatment").length} terapie</span>
                <span><i class="heat"></i>${healthCalendar.upcoming.filter(e=>e.type==="heat").length} cicli</span>
                <span><i class="other"></i>${healthCalendar.upcoming.filter(e=>!["vaccine","treatment","heat"].includes(e.type)).length} altri</span>
              </div>
            </div>

            <div class="pb-agenda-timeline">
              ${healthCalendar.upcoming.length ? healthCalendar.upcoming.slice(0,12).map((event, idx)=>`
                <article class="pb-agenda-row ${event.type || "other"}">
                  <div class="pb-agenda-datebox">
                    <strong>${this.formatDate(event.date).slice(0,2)}</strong>
                    <span>${this.formatDate(event.date).slice(3,5)}</span>
                  </div>

                  <div class="pb-agenda-rail">
                    <i></i>
                    ${idx < Math.min(healthCalendar.upcoming.length,12)-1 ? `<b></b>` : ""}
                  </div>

                  <div class="pb-agenda-event-main">
                    <small>${event.estimate ? "DATA STIMATA" : this.formatDate(event.date)}</small>
                    <strong>${this.esc(event.title)}</strong>
                    <p>${event.estimate ? "Previsione PawBook" : "Evento sanitario registrato"}</p>
                  </div>

                  <div class="pb-agenda-event-icon">${event.icon}</div>
                </article>
              `).join("") : `
                <div class="pb-agenda-empty">
                  <span>✓</span>
                  <h3>Agenda libera</h3>
                  <p>Nessun evento sanitario futuro registrato.</p>
                </div>`}
            </div>

            <div class="pb-agenda-footer">
              <button type="button" data-nav-target="management-section">♥ Apri Smart Health</button>
              <span>Sincronizzato con Home Assistant</span>
            </div>
          </article>

          <article class="card v2-section health-timeline-card app-panel span-2" id="timeline-section">
            <div class="card-head">
              <div><h3>🕘 Cronologia salute</h3><small class="muted">Eventi sanitari ordinati e filtrabili, senza sovraccaricare la pagina</small></div>
              <span class="timeline-total">${timeline.length} recenti</span>
            </div>
            ${timeline.length ? `
              <div class="timeline-filters" role="group" aria-label="Filtra cronologia salute">
                <button class="timeline-filter active" data-timeline-filter="all">Tutti</button>
                <button class="timeline-filter" data-timeline-filter="Vaccino">💉 Vaccini</button>
                <button class="timeline-filter" data-timeline-filter="Visita">🩺 Visite</button>
                <button class="timeline-filter" data-timeline-filter="Terapia">💊 Terapie</button>
                <button class="timeline-filter" data-timeline-filter="Peso">⚖️ Peso</button>
                <button class="timeline-filter" data-timeline-filter="Calore">❤️ Calori</button>
              </div>
              <div class="health-timeline">
                ${timeline.map((item,index)=>`
                  <div class="health-timeline-row ${index >= 8 ? "timeline-hidden" : ""}" data-timeline-type="${this.esc(item.type)}" data-timeline-index="${index}">
                    <div class="health-timeline-date">${this.formatDate(item.date)}</div>
                    <div class="health-timeline-icon">${item.icon}</div>
                    <div class="health-timeline-body"><span>${this.esc(item.type)}</span><strong>${this.esc(item.title)}</strong>${item.detail ? `<small>${this.esc(item.detail)}</small>` : ""}</div>
                  </div>`).join("")}
              </div>
              ${timeline.length > 8 ? `<button type="button" class="timeline-more secondary" id="timeline-more">Mostra tutti i ${timeline.length} eventi</button>` : ""}
            ` : `<div class="empty">Nessun evento disponibile</div>`}
          </article>

          <article class="card v2-section" id="statistics-section">
            <div class="card-head"><div><h3>📊 Statistiche</h3><small class="muted">Una lettura rapida dello storico PawBook</small></div></div>
            <div class="insight-grid">
              <div class="insight"><span>Registrazioni peso</span><strong>${book.weights?.length || 0}</strong><small>${trend ? `Variazione ${trend.delta > 0 ? "+" : ""}${trend.delta} kg` : "Aggiungi almeno due pesi"}</small></div>
              <div class="insight"><span>Vaccinazioni</span><strong>${book.vaccinations?.length || 0}</strong><small>${nextVax ? `Prossimo ${this.formatDate(nextVax.expires_on)}` : "Nessun richiamo futuro"}</small></div>
              <div class="insight"><span>Visite</span><strong>${book.visits?.length || 0}</strong><small>${lastVisit ? `Ultima ${this.formatDate(lastVisit.date)}` : "Nessuna visita"}</small></div>
              <div class="insight"><span>Terapie attive</span><strong>${treatments.length}</strong><small>${treatments.length ? treatments.map(x=>this.esc(x.name)).slice(0,2).join(" · ") : "Nessuna terapia in corso"}</small></div>
            </div>
            <div style="margin-top:18px"><h4>Andamento peso</h4>${this.weightChart(book)}</div>
          </article>

          <article class="card v2-section" id="documents-section">
            <div class="card-head"><div><h3>📎 Documenti</h3><small class="muted">Referti, analisi e immagini salvati localmente</small></div><button class="small-btn" id="add-attachment">Aggiungi</button></div>
            ${(book.attachments||[]).length ? `<div class="attachment-list">${(book.attachments||[]).map(a=>`<div class="attachment"><a href="${this.esc(a.data)}" download="${this.esc(a.name)}">${this.esc(a.name)}</a><small>${this.esc(a.mime_type||"")}</small><button class="small-btn danger" data-delete-attachment="${this.esc(a.id)}">Elimina</button></div>`).join("")}</div>` : `<div class="empty">Nessun allegato</div>`}
          </article>

          <article class="card v2-section" id="report-section">
            <div class="card-head"><div><h3>📄 Report sanitario</h3><small class="muted">Genera una scheda stampabile o salvala in PDF dal browser</small></div></div>
            <div class="report-actions"><button id="print-report">Apri report</button></div>
          </article>

          <article class="card v2-section" id="backup-section">
            <div class="card-head"><div><h3>☁️ Backup e ripristino</h3><small class="muted">Esporta tutti i dati di questo cane in un file JSON portabile</small></div></div>
            <p class="muted">Il backup include profilo, foto, pesi, vaccini, visite, terapie, calori, genealogia, allegati e dati ENCI.</p>
            <div class="backup-actions"><button id="export-backup">Esporta backup</button><button class="secondary" id="import-backup">Ripristina backup</button><button class="secondary" id="settings-config">Impostazioni integrazione</button></div>
          </article>

          <article class="card" id="enci-section">
            <div class="pb-module-heading pb-enci-heading">
              <div class="pb-module-heading-copy">
                <span>REGISTRO UFFICIALE</span>
                <h2>ENCI</h2>
                <p>Anagrafica, pedigree e dati ufficiali del cane.</p>
              </div>
              <div class="pb-module-actions">
                <button class="pb-module-add" id="import-enci">Importa / aggiorna</button>
                <button class="pb-module-secondary" id="open-enci">Apri ENCI</button>
              </div>
            </div>
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

    this.shadowRoot.querySelector("#support-project")?.addEventListener("click", () => {
      window.open("https://ko-fi.com/fabvittori", "_blank", "noopener,noreferrer");
    });

    this.shadowRoot.querySelector("#ha-mobile-menu")?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatchEvent(new Event("hass-toggle-menu", { bubbles:true, composed:true }));
      window.dispatchEvent(new Event("hass-toggle-menu", { bubbles:true, composed:true }));
    });
    this.shadowRoot.querySelector("#refresh")?.addEventListener("click", () => this.loadBooks());
    this.shadowRoot.querySelector("#profile-config")?.addEventListener("click", () => this.openConfig());
    this.shadowRoot.querySelector("#settings-config")?.addEventListener("click", () => this.openConfig());
    this.shadowRoot.querySelector("#export-backup")?.addEventListener("click", () => this.exportBackup());
    this.shadowRoot.querySelector("#import-backup")?.addEventListener("click", () => this.showRestoreBackup());
    this.shadowRoot.querySelector("#add-attachment")?.addEventListener("click", () => this.showAttachmentDialog());
    this.shadowRoot.querySelectorAll("[data-visit-attachment]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      const id = button.dataset.visitAttachment;
      const record = (book.visits || []).find(item => item.id === id);
      this.showAttachmentDialog("visits", id, `Allegato visita · ${record?.reason || "Visita"}`);
    }));
    this.shadowRoot.querySelectorAll("[data-treatment-attachment]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      const id = button.dataset.treatmentAttachment;
      const record = (book.treatments || []).find(item => item.id === id);
      this.showAttachmentDialog("treatments", id, `Allegato terapia · ${record?.name || "Terapia"}`);
    }));
    this.shadowRoot.querySelector("#print-report")?.addEventListener("click", () => this.printReport());
    this.shadowRoot.querySelectorAll("[data-delete-attachment]").forEach(b => b.addEventListener("click", () => this.deleteAttachment(b.dataset.deleteAttachment)));
    this.shadowRoot.querySelector("#edit-photo")?.addEventListener("click", () => this.showPhotoEditor());
    this.shadowRoot.querySelector("#import-enci")?.addEventListener("click", () => this.showEnciSearch());
    this.shadowRoot.querySelector("#open-enci")?.addEventListener("click", () => {
      window.open(p.enci_url || "https://www.enci.it/libro-genealogico/libro-genealogico-on-line", "_blank", "noopener");
    });
    this.shadowRoot.querySelectorAll("[data-family-pet]").forEach(button => {
      button.addEventListener("click", () => {
        this._selected = Number(button.dataset.familyPet);
        this._mobileGenealogyPath = [];
        this._calendarOffset = 0;
        this.render();
        requestAnimationFrame(() => this.shadowRoot.querySelector("#overview")?.scrollIntoView({behavior:"smooth",block:"start"}));
      });
    });
    this.shadowRoot.querySelectorAll("[data-family-target-pet]").forEach(button => {
      button.addEventListener("click", () => {
        this._selected = Number(button.dataset.familyTargetPet);
        this._mobileGenealogyPath = [];
        this._calendarOffset = 0;
        const targetId = button.dataset.familyTarget || "overview";
        this._activeView = targetId;
        this.render();
      });
    });

    this.shadowRoot.querySelectorAll("[data-nav-target]").forEach((button) => {
      button.addEventListener("click", () => {
        this._activeView = button.dataset.navTarget || "overview";
        this.applyPageView();
        window.scrollTo({ top: 0, behavior: "smooth" });
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
          this._activeView = "genealogy-section";
          this.render();
        } catch (err) {
          console.error("PawBook: percorso genealogico mobile non valido", err);
        }
      });
    });
    this.shadowRoot.querySelector("[data-mobile-genealogy-back]")?.addEventListener("click", () => {
      this._mobileGenealogyPath = (this._mobileGenealogyPath || []).slice(0, -1);
      this._activeView = "genealogy-section";
      this.render();
    });
    this.shadowRoot.querySelector("[data-mobile-genealogy-root]")?.addEventListener("click", () => {
      this._mobileGenealogyPath = [];
      this._activeView = "genealogy-section";
      this.render();
    });
    this.shadowRoot.querySelector("[data-mobile-ancestor-details]")?.addEventListener("click", (buttonEvent) => {
      try {
        this.showAncestorDetails(JSON.parse(decodeURIComponent(buttonEvent.currentTarget.dataset.mobileAncestorDetails)));
      } catch (err) {
        console.error("PawBook: impossibile aprire i dettagli ENCI mobile", err);
      }
    });
    this.shadowRoot.querySelector("#calendar-prev")?.addEventListener("click", () => {
      this._calendarOffset = (this._calendarOffset || 0) - 1;
      this._activeView = "calendar-section";
      this.render();
    });
    this.shadowRoot.querySelector("#calendar-next")?.addEventListener("click", () => {
      this._calendarOffset = (this._calendarOffset || 0) + 1;
      this._activeView = "calendar-section";
      this.render();
    });
    this.shadowRoot.querySelector("#calendar-today")?.addEventListener("click", () => {
      this._calendarOffset = 0;
      this._activeView = "calendar-section";
      this.render();
    });

    this.applyPageView();

    let timelineExpanded = false;
    const applyTimelineFilter = (filter = "all") => {
      const rows = [...this.shadowRoot.querySelectorAll(".health-timeline-row")];
      let visibleIndex = 0;
      rows.forEach(row => {
        const matches = filter === "all" || row.dataset.timelineType === filter;
        const show = matches && (timelineExpanded || visibleIndex < 8);
        row.style.display = show ? "" : "none";
        if (matches) visibleIndex += 1;
      });
      const more = this.shadowRoot.querySelector("#timeline-more");
      if (more) {
        const matchingCount = rows.filter(row => filter === "all" || row.dataset.timelineType === filter).length;
        more.style.display = matchingCount > 8 ? "" : "none";
        more.textContent = timelineExpanded ? "Mostra meno" : `Mostra tutti i ${matchingCount} eventi`;
      }
    };
    this.shadowRoot.querySelectorAll(".timeline-filter").forEach(button => {
      button.addEventListener("click", () => {
        this.shadowRoot.querySelectorAll(".timeline-filter").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        timelineExpanded = false;
        applyTimelineFilter(button.dataset.timelineFilter || "all");
      });
    });
    this.shadowRoot.querySelector("#timeline-more")?.addEventListener("click", () => {
      timelineExpanded = !timelineExpanded;
      const active = this.shadowRoot.querySelector(".timeline-filter.active");
      applyTimelineFilter(active?.dataset.timelineFilter || "all");
    });
    applyTimelineFilter("all");

    this.shadowRoot.querySelectorAll("[data-form]").forEach((button) =>
      button.addEventListener("click", () => this.showForm(button.dataset.form))
    );
    this.shadowRoot.querySelectorAll("[data-vaccine-add]").forEach((button) =>
      button.addEventListener("click", () => this.showForm("vaccination", { name: button.dataset.vaccineAdd || "" }))
    );
    this.shadowRoot.querySelectorAll("[data-edit-kind]").forEach((row) => {
      const category = row.dataset.category;
      const recordId = row.dataset.recordId;
      const record = (book[category] || []).find((item) => String(item.id) === String(recordId));

      if (row.dataset.editKind === "heat") {
        row.addEventListener("click", (event) => {
          if (event.target.closest("button")) return;
          if (record) this.showForm("heat", record, "heat_cycles");
        });
      }

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
        this._calendarOffset = 0;
        this.render();
      })
    );
  }
}

if (!customElements.get("pawbook-panel-v630")) {
  customElements.define("pawbook-panel-v630", PawBookPanelV420);
}
