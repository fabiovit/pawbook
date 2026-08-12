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

      /* PawBook 6.1.0 definitive mobile header */
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

      /* PawBook 6.1.0 · DOMOTICA / Inverter shell */
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
</style>
      <div class="page">
        <div class="topbar inverter-shell">
          <div class="top-row">
            <div class="top-left">
              <button type="button" class="ha-mobile-menu ha-menu" id="ha-mobile-menu" aria-label="Apri menu Home Assistant" title="Menu Home Assistant">
                <span class="hamburger-glyph" aria-hidden="true">☰</span>
              </button>
              <div class="brand-mark brand-icon" aria-hidden="true">
                <svg viewBox="0 0 64 64" role="img">
                  <ellipse cx="17" cy="21" rx="7" ry="10" transform="rotate(-24 17 21)"></ellipse>
                  <ellipse cx="29" cy="14" rx="7" ry="10" transform="rotate(-7 29 14)"></ellipse>
                  <ellipse cx="42" cy="15" rx="7" ry="10" transform="rotate(9 42 15)"></ellipse>
                  <ellipse cx="52" cy="24" rx="7" ry="10" transform="rotate(25 52 24)"></ellipse>
                  <path d="M17 47c0-11 8-20 15-20 8 0 17 9 17 20 0 8-6 12-13 9-3-1-5-1-8 0-6 3-11-1-11-9z"></path>
                </svg>
              </div>
              <div class="brand-copy">
                <div class="brand-title-row">
                  <strong>PawBook</strong>
                  <span class="version-badge v2-badge">6.1.0</span>
                </div>
                <span class="brand-subtitle">Libretto sanitario digitale · Health Center</span>
              </div>
            </div>
            <div class="topbar-actions">
              <button type="button" class="support-project-btn" id="support-project" title="Supporta PawBook su Ko-fi">
                <span aria-hidden="true">☕</span><span class="support-project-label">Supporta il progetto</span>
              </button>
            </div>
          </div>
          <nav class="dashboard-nav tabs" aria-label="Sezioni PawBook">
            <button class="active" data-nav-target="overview"><span class="nav-icon">🐾</span><span>Panoramica</span></button>
          <button data-nav-target="smart-section"><span class="nav-icon">❤️</span><span>Smart Health</span></button>
          <button data-nav-target="health-section"><span class="nav-icon">⚖️</span><span>Peso</span></button>
          <button data-nav-target="vaccines-section"><span class="nav-icon">💉</span><span>Vaccini</span></button>
          <button data-nav-target="visits-section"><span class="nav-icon">🩺</span><span>Visite</span></button>
          <button data-nav-target="treatments-section"><span class="nav-icon">💊</span><span>Terapie</span></button>
          <button data-nav-target="heat-section"><span class="nav-icon">❤️</span><span>Calori</span></button>
          <button data-nav-target="calendar-section"><span class="nav-icon">📅</span><span>Calendario</span></button>
          <button data-nav-target="timeline-section"><span class="nav-icon">◴</span><span>Salute</span></button>
          <button data-nav-target="genealogy-section"><span class="nav-icon">♧</span><span>Genealogia</span></button>
          <button data-nav-target="enci-section"><span class="nav-icon">▤</span><span>ENCI</span></button>
          <button data-nav-target="statistics-section"><span class="nav-icon">▥</span><span>Statistiche</span></button>
          <button data-nav-target="documents-section"><span class="nav-icon">📎</span><span>Documenti</span></button>
          <button data-nav-target="report-section"><span class="nav-icon">📄</span><span>Report</span></button>
          <button data-nav-target="backup-section"><span class="nav-icon">⇅</span><span>Backup</span></button>
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



        <section class="smart-dashboard" aria-label="Smart Dashboard PawBook">
          <div class="smart-dashboard-head">
            <div><h3>✨ Smart Dashboard</h3><small class="muted">Le informazioni più importanti di ${this.esc(p.dog_name || book.title)} in un colpo d'occhio</small></div>
          </div>
          <button type="button" class="smart-reminder-strip" data-nav-target="reminders-section">
            <span>🔔 Promemoria automatici</span>
            <span class="smart-reminder-copy">
              <strong>${reminders[0] ? this.esc(reminders[0].title) : "Nessun promemoria urgente"}</strong>
              <small>${reminders[0] ? this.esc(reminders[0].detail) : "Si aggiornano automaticamente usando vaccini, visite, terapie, peso e calori registrati."}</small>
            </span>
            <span class="smart-reminder-open">Apri →</span>
          </button>
          <div class="smart-dashboard-grid">
            <button class="smart-dash-card health" data-nav-target="smart-section">
              <span class="smart-dash-icon">❤️</span><span><small>Stato salute</small>
              <strong>${smart.some(x=>x.level === "danger") ? "Da controllare" : smart.some(x=>x.level === "warn") ? "Attenzione" : "Tutto regolare"}</strong>
              <em>${smart[0]?.text ? this.esc(smart[0].text) : "Nessun avviso"}</em></span>
            </button>
            <button class="smart-dash-card" data-nav-target="vaccines-section">
              <span class="smart-dash-icon">💉</span><span><small>Prossimo vaccino</small>
              <strong>${nextVax ? this.formatDate(nextVax.expires_on) : "Nessuna scadenza"}</strong>
              <em>${vaccineStatusCounts.expired ? `${vaccineStatusCounts.expired} vaccini scaduti` : vaccineStatusCounts.warning ? `${vaccineStatusCounts.warning} in scadenza` : "Situazione regolare"}</em></span>
            </button>
            <button class="smart-dash-card" data-nav-target="visits-section">
              <span class="smart-dash-icon">🩺</span><span><small>Ultima visita</small>
              <strong>${lastVisit ? this.formatDate(lastVisit.date) : "Nessuna visita"}</strong>
              <em>${lastVisit?.reason ? this.esc(lastVisit.reason) : `${book.visits?.length || 0} visite registrate`}</em></span>
            </button>
            <button class="smart-dash-card" data-nav-target="treatments-section">
              <span class="smart-dash-icon">💊</span><span><small>Terapie attive</small>
              <strong>${treatments.length}</strong>
              <em>${treatments.length ? this.esc(treatments.map(x=>x.name||"Terapia").slice(0,2).join(" · ")) : "Nessuna terapia in corso"}</em></span>
            </button>
            <button class="smart-dash-card" data-nav-target="health-section">
              <span class="smart-dash-icon">⚖️</span><span><small>Peso</small>
              <strong>${lastWeight ? `${this.esc(lastWeight.weight)} kg` : "—"}</strong>
              <em>${weightStats.delta !== null && weightStats.delta !== undefined ? `${weightStats.delta > 0 ? "+" : ""}${weightStats.delta} kg dall'ultima pesata` : "Nessuna variazione disponibile"}</em></span>
            </button>
            <button class="smart-dash-card heat" data-nav-target="heat-section">
              <span class="smart-dash-icon">🌸</span><span><small>Prossimo calore stimato</small>
              <strong>${heatStats.forecast ? this.formatDate(heatStats.forecast.center) : "Dati insufficienti"}</strong>
              <em>${heatStats.forecast ? `${this.formatDate(heatStats.forecast.from)} – ${this.formatDate(heatStats.forecast.to)}` : `${heatStats.cycles.length} cicli registrati`}</em></span>
            </button>
          </div>
        </section>

        <section class="grid">

          <article class="card v2-section wide" id="smart-section">
            <div class="card-head"><div><h3>❤️ Smart Health</h3><small class="muted">Riepilogo automatico dei dati già presenti in PawBook</small></div></div>
            <div class="smart-list">${smart.map(item=>`<div class="smart-item ${item.level}"><div class="smart-icon">${item.icon}</div><div>${this.esc(item.text)}</div></div>`).join("")}</div>
            <p class="muted" style="margin-top:12px">PawBook evidenzia scadenze e cronologia registrata; non formula diagnosi o valutazioni cliniche.</p>
          </article>

          <article class="card wide weight-dashboard" id="health-section">
            <div class="card-head"><div><h3>⚖️ Weight Center</h3><small class="muted">Andamento, variazioni e cronologia completa del peso</small></div><button class="small-btn" data-form="weight">Aggiungi peso</button></div>
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
            <div class="card-head"><div><h3>💉 Centro Vaccinazioni</h3><small class="muted">Stato, prossimi richiami e cronologia completa di ogni vaccino</small></div><button class="small-btn" data-form="vaccination">Aggiungi dose</button></div>
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
            <div class="card-head"><div><h3>🩺 Veterinary Center</h3><small class="muted">Visite, controlli, esami, referti e cronologia veterinaria completa</small></div><button class="small-btn" data-form="visit">Aggiungi visita</button></div>
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
            <div class="card-head"><div><h3>💊 Treatments Center</h3><small class="muted">Terapie, farmaci, dosaggi, durata e documenti in un'unica vista</small></div><button class="small-btn" data-form="treatment">Aggiungi terapia</button></div>
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

          <article class="card heat-center" id="heat-section">
            <div class="card-head">
              <div>
                <h3>❤️ Heat Cycle Center</h3>
                <small class="muted">Storico e proiezione indicativa del prossimo calore</small>
              </div>
              <button class="small-btn" data-form="heat">Aggiungi calore</button>
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

          <article class="card v2-section reminders-center" id="reminders-section">
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

          <article class="card v2-section health-calendar-card" id="calendar-section">
            <div class="card-head">
              <div><h3>📅 Calendario salute</h3><small class="muted">Richiami, terapie e proiezione del prossimo calore</small></div>
              <div class="calendar-controls">
                <button type="button" class="small-btn secondary" id="calendar-prev">‹</button>
                <button type="button" class="small-btn secondary" id="calendar-today">Oggi</button>
                <button type="button" class="small-btn secondary" id="calendar-next">›</button>
              </div>
            </div>
            <div class="calendar-month-title">${this.esc(healthCalendar.label)}</div>
            <div class="health-calendar-weekdays">
              ${["Lun","Mar","Mer","Gio","Ven","Sab","Dom"].map(day=>`<span>${day}</span>`).join("")}
            </div>
            <div class="health-calendar-grid">
              ${healthCalendar.days.map(day=>`
                <div class="health-calendar-day ${day.currentMonth ? "" : "outside"} ${day.today ? "today" : ""}">
                  <span class="calendar-day-number">${day.day}</span>
                  <div class="calendar-day-events">
                    ${day.events.slice(0,3).map(event=>`<span class="calendar-event ${event.type}" title="${this.esc(event.title)}">${event.icon}<b>${this.esc(event.title)}</b></span>`).join("")}
                    ${day.events.length>3 ? `<small>+${day.events.length-3}</small>` : ""}
                  </div>
                </div>`).join("")}
            </div>
            <div class="calendar-upcoming">
              <h4>Prossimi eventi</h4>
              ${healthCalendar.upcoming.length ? healthCalendar.upcoming.map(event=>`
                <div class="calendar-upcoming-row"><span>${event.icon}</span><strong>${this.formatDate(event.date)}</strong><em>${this.esc(event.title)}</em>${event.estimate ? `<small>stima</small>` : ""}</div>`).join("") : `<div class="empty">Nessun evento futuro registrato</div>`}
            </div>
            <div class="calendar-native-note">🏠 Gli stessi richiami, le terapie e la finestra stimata del calore sono disponibili anche nell'entità calendario nativa di Home Assistant.</div>
          </article>

          <article class="card v2-section health-timeline-card" id="timeline-section">
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
        this.render();
        requestAnimationFrame(() => this.shadowRoot.querySelector(`#${targetId}`)?.scrollIntoView({behavior:"smooth",block:"start"}));
      });
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
    this.shadowRoot.querySelector("#calendar-prev")?.addEventListener("click", () => {
      this._calendarOffset = (this._calendarOffset || 0) - 1;
      this.render();
      requestAnimationFrame(() => this.shadowRoot.querySelector("#calendar-section")?.scrollIntoView({block:"start"}));
    });
    this.shadowRoot.querySelector("#calendar-next")?.addEventListener("click", () => {
      this._calendarOffset = (this._calendarOffset || 0) + 1;
      this.render();
      requestAnimationFrame(() => this.shadowRoot.querySelector("#calendar-section")?.scrollIntoView({block:"start"}));
    });
    this.shadowRoot.querySelector("#calendar-today")?.addEventListener("click", () => {
      this._calendarOffset = 0;
      this.render();
      requestAnimationFrame(() => this.shadowRoot.querySelector("#calendar-section")?.scrollIntoView({block:"start"}));
    });

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

if (!customElements.get("pawbook-panel-v610")) {
  customElements.define("pawbook-panel-v610", PawBookPanelV420);
}
