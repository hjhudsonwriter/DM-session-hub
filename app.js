/* The Ironbow Bastion Manager (vanilla JS)
   Data: /data/facilities.json, /data/tools_tables.json, /data/events.json
   State: localStorage 'ironbow_bastion_state_v1'
*/

(() => {
  "use strict";

  // ---------- GitHub Pages base-path helper ----------
  const BASE = (() => {
    const parts = location.pathname.split("/").filter(Boolean);
    return parts.length ? `/${parts[0]}/` : "/";
  })();
  const withBase = (url) => url.startsWith("http") ? url : (BASE + url.replace(/^\//,""));

  const $ = (id) => document.getElementById(id);
  const whTableBody = document.getElementById("whTableBody");
  const addWarehouseRowBtn = document.getElementById("addWarehouseRowBtn");
  const saveWarehouseBtn = document.getElementById("saveWarehouseBtn");
  const clearWarehouseBtn = document.getElementById("clearWarehouseBtn");
 


  const STORAGE_KEY = "ironbow_bastion_state_v1";

  const state = loadState();

  const ui = {
    treasuryInput: $("treasuryInput"),
    levelSelect: $("levelSelect"),
    rollEventBtn: $("rollEventBtn"),
    advanceTurnBtn: $("advanceTurnBtn"),
    resetBtn: $("resetBtn"),
    downloadSaveBtn: $("downloadSaveBtn"),
    importSaveBtn: $("importSaveBtn"),
    importFileInput: $("importFileInput"),
    turnPill: $("turnPill"),

    defendersValue: $("defendersValue"),
    defendersMeta: $("defendersMeta"),
    addDefBtn: $("addDefBtn"),
    subDefBtn: $("subDefBtn"),

    militaryList: $("militaryList"),
    clearMilitaryBtn: $("clearMilitaryBtn"),

    defenderRoster: $("defenderRoster"),

    eventBox: $("eventBox"),
    facilitiesGrid: $("facilitiesGrid"),

    logList: $("logList"),
    clearLogBtn: $("clearLogBtn"),

    slotMeta: $("slotMeta"),
    slotList: $("slotList"),
    clearBuildBtn: $("clearBuildBtn"),
    pendingList: $("pendingList"),

    artisanToolGrid: $("artisanToolGrid"),
    saveArtisanToolsBtn: $("saveArtisanToolsBtn"),
    clearArtisanToolsBtn: $("clearArtisanToolsBtn"),
 
  };

  let DATA = { facilities: [], tools: {}, events: null };

   // --- Construction timing rules ---
function buildTurnsForRequiredLevel(requiredLevel){
  const rl = Number(requiredLevel || 0);
  if(rl >= 17) return 5;
  if(rl >= 13) return 5;
  if(rl >= 9)  return 4;
  if(rl >= 5)  return 3;
  return 0; // starter / no-threshold
}

// Your 5 always-built facilities
const STARTING_BUILT = ["barracks","armoury","watchtower","workshop","dock"];

// Normalize old saves: strings -> {status:"built"}
function normalizeBuiltExtras(){
  if(!Array.isArray(state.builtExtras)) state.builtExtras = [];
  state.builtExtras = state.builtExtras.map(x=>{
    if(!x) return "";
    if(typeof x === "string") return { facId: x, status: "built" };
    if(typeof x === "object" && x.facId) return x;
    return "";
  });
}

// Facilities "reserved" (built OR building) so you can't pick duplicates
function reservedFacilityIds(){
  normalizeBuiltExtras();
  const extra = state.builtExtras
    .filter(x => x && typeof x === "object" && x.facId)
    .map(x => x.facId);
  return Array.from(new Set([...STARTING_BUILT, ...extra]));
}

// Facilities that are actually ACTIVE (built only)
function builtFacilityIds(){
  normalizeBuiltExtras();
  const extraBuilt = state.builtExtras
    .filter(x => x && typeof x === "object" && x.status === "built" && x.facId)
    .map(x => x.facId);
  return Array.from(new Set([...STARTING_BUILT, ...extraBuilt]));
}

// Advance construction by 1 turn
function tickConstruction(){
  normalizeBuiltExtras();
  let completed = [];

  state.builtExtras = state.builtExtras.map(entry=>{
    if(!entry || entry === "") return "";

    if(entry.status === "building"){
      const next = Math.max(0, Number(entry.remaining || 0) - 1);
      if(next === 0){
        completed.push(entry.facId);
        return { facId: entry.facId, status: "built" };
      }
      return { ...entry, remaining: next };
    }

    return entry; // built
  });

  // Log completions
  for(const id of completed){
    const fac = DATA.facilities.find(f=>f.id===id);
    log("Construction Complete", `${fac ? fac.name : id} is now built and active.`);
  }
}

   const FACILITY_IMG = {
  // Starting facilities
  barracks: "barracks.png",
  armoury: "armoury.png",
  watchtower: "watchtower.png",
  workshop: "workshop.png",
  dock: "docks.png",

  // Buildable facilities
  arcane_study: "arcane_study.png",
  library: "library.png",
  smithy: "smithy.png",
  garden: "garden.png",
  menagerie: "menagerie.png",
  scriptorium: "scriptorium.png",

  // Your two missing ones (THIS is the fix)
  laboratory: "laboratory.png",
  war_room: "war_room.png",

  // The rest
  gaming_hall: "gambling_hall.png",
  storehouse: "storehouse.png",
  greenhouse: "greenhouse.png",
  guildhall: "guildhall.png",
};

  init().catch(err => {
  console.error(err);
  alert("App error during init. Open DevTools Console (F12) and check the error details.");
});


  async function init(){
    // Populate level selector 1-20
    ui.levelSelect.innerHTML = Array.from({length:20}, (_,i)=>`<option value="${i+1}">${i+1}</option>`).join("");

    // Load data
    const [facilities, tools, events] = await Promise.all([
      fetch(withBase("data/facilities.json")).then(r=>r.json()),
      fetch(withBase("data/tools_tables.json")).then(r=>r.json()),
      fetch(withBase("data/events.json")).then(r=>r.json()),
    ]);
    DATA = { facilities, tools, events };

    // Wire controls
    ui.treasuryInput.value = String(state.treasuryGP);
    ui.levelSelect.value = String(state.partyLevel);

    ui.treasuryInput.addEventListener("input", () => {
      state.treasuryGP = clampInt(ui.treasuryInput.value, 0);
      saveState();
      render();
    });

    ui.levelSelect.addEventListener("change", () => {
      state.partyLevel = clampInt(ui.levelSelect.value, 1);
      saveState();
      render();
    });

     ui.clearBuildBtn?.addEventListener("click", () => {
  if(!confirm("Clear all extra built facilities (slots) only? Your 5 starting facilities remain.")) return;
  state.builtExtras = [];
  saveState();
  log("Facilities", "Cleared extra built facilities.");
  render();
});

   ui.saveArtisanToolsBtn?.addEventListener("click", ()=>{
  readArtisanToolsFromUI();
  log("Artisan Tools", "Saved artisan tool selections.");
  render();
});

ui.clearArtisanToolsBtn?.addEventListener("click", ()=>{
  state.artisanTools = ["","","","","",""];
  saveState();
  log("Artisan Tools", "Cleared artisan tool selections.");
  render();
});

     ui.addDefBtn.addEventListener("click", () => {
      state.defenders.count += 1;
      saveState();
      log("Defenders", "Added 1 Bastion Defender.");
      render();
    });

    ui.subDefBtn.addEventListener("click", () => {
      state.defenders.count = Math.max(0, state.defenders.count - 1);
      if(state.defenders.count === 0) state.defenders.armed = false;
      saveState();
      log("Defenders", "Removed 1 Bastion Defender.");
      render();
    });

    ui.clearMilitaryBtn.addEventListener("click", () => {
      state.military = [];
      saveState();
      log("Military", "Cleared military list.");
      render();
    });

    if(clearWarehouseBtn){
  clearWarehouseBtn.addEventListener("click", () => {
    state.warehouse = [];
    saveState();
    log("Warehouse", "Cleared warehouse.");
    renderWarehouse();
    renderLog();
  });
}

    ui.clearLogBtn.addEventListener("click", () => {
      state.log = [];
      saveState();
      render();
    });

    ui.rollEventBtn?.addEventListener("click", () => {
      const roll = d(100);
      const ev = resolveEvent(roll, DATA.events.eventTable);
      const descLines = (DATA.events.descriptions && DATA.events.descriptions[ev.name]) ? DATA.events.descriptions[ev.name] : [];
      state.lastEvent = { roll, name: ev.name, lines: descLines, at: Date.now() };
      saveState();
      log("Bastion Event", `Rolled ${roll} → ${ev.name}`);
      render();
    });

    ui.advanceTurnBtn.addEventListener("click", () => {
  state.turn += 1;
       tickConstruction();
       // Bastion Event disappears when you move to the next turn
state.lastEvent = null;

  // One-turn buffs expire here
  state.defenders.patrolAdvantage = false;

  // Complete any orders due this turn
  const due = state.pendingOrders.filter(o => o.completeTurn === state.turn);
  state.pendingOrders = state.pendingOrders.filter(o => o.completeTurn !== state.turn);

  for(const o of due){
    completeOrder(o);
  }

  // Auto Bastion Event every 4 turns
if(state.turn % 4 === 0){
  const roll = d(100);
  const ev = resolveEvent(roll, DATA.events.eventTable);
  const descLines = (DATA.events.descriptions && DATA.events.descriptions[ev.name]) ? DATA.events.descriptions[ev.name] : [];
  state.lastEvent = { roll, name: ev.name, lines: descLines, at: Date.now() };
  log("Bastion Event", `Auto event (Turn ${state.turn}) → Rolled ${roll} → ${ev.name}`);
}

       saveState();
  log("Turn Advanced", `Bastion Turn is now ${state.turn}.`);
  render();
});

    // ---------------- Save Export / Import ----------------
ui.downloadSaveBtn?.addEventListener("click", () => {
  try{
    // Make sure latest UI edits are captured before export
    readWarehouseFromUI?.();
    readArtisanToolsFromUI?.();

    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: "application/json" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ironbow_bastion_save_turn_${state.turn}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(()=>URL.revokeObjectURL(a.href), 500);
    log("Save File", "Downloaded JSON save file.");
    saveState();
    render();
  }catch(e){
    console.error(e);
    alert("Could not download save. Open Console (F12) for details.");
  }
});

ui.importSaveBtn?.addEventListener("click", () => {
  ui.importFileInput?.click();
});

ui.importFileInput?.addEventListener("change", async () => {
  const file = ui.importFileInput.files?.[0];
  if(!file) return;

  try{
    const text = await file.text();
    const imported = JSON.parse(text);

    if(!confirm("Import this save? This will overwrite your current saved state in this browser.")){
      ui.importFileInput.value = "";
      return;
    }

    // Store imported JSON directly; your loadState() already merges defaults safely on reload
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    location.reload();
  }catch(e){
    console.error(e);
    alert("That file was not valid JSON (or couldn’t be read). Open Console (F12) for details.");
  }finally{
    ui.importFileInput.value = "";
  }
});

     ui.resetBtn.addEventListener("click", () => {
      if(!confirm("Reset app state? This clears your local saved data on THIS browser only.")) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });

    render();
  }

   function completeOrder(o){
  const fac = DATA.facilities.find(f => f.id === o.facId);
  if(!fac) return;
  const fn = (fac.functions || []).find(x => x.id === o.fnId);
  if(!fn) return;

  const label = o.label || `${fac.name}: ${fn.label}`;
  const optionLabel = o.optionLabel || null;
  const chosen = o.chosen || null;

  // Barracks recruit defenders
  if(fac.id==="barracks" && fn.id==="recruit_defenders"){
    const r = d(4);
    state.defenders.count += r;
    log("Order Completed", `${label} → Recruited ${r} defenders.`);
    return;
  }

  // Watchtower patrol buff (applies for the new turn)
  if(fac.id==="watchtower" && fn.id==="patrol"){
    state.defenders.patrolAdvantage = true;
    log("Order Completed", `${label} → Patrol active this turn.`);
    return;
  }

  // Armoury arm defenders
  if(fac.id==="armoury" && fn.id==="arm_defenders"){
    state.defenders.armed = (state.defenders.count > 0);
    log("Order Completed", `${label} → Defenders armed.`);
    return;
  }

  // War Room recruit → military
  if(fac.id==="war_room" && fn.id==="recruit"){
    const unit = optionLabel || "Unit";
    addToList(state.military, unit, { source: "War Room" });
    log("Order Completed", `${label} → Recruited: ${unit}.`);
    return;
  }

  // Menagerie recruit beast → military (or defenders later)
  if(fac.id==="menagerie" && fn.id==="recruit_beast"){
  const beast = optionLabel || "Beast";
  addToList(state.defenderBeasts, beast, { source: "Menagerie" });
  log("Order Completed", `${label} → Recruited beast: ${beast}. Added to Bastion Defenders.`);
  return;
}

  // Dock charter → warehouse
  if(fac.id==="dock" && fn.id==="charter_berth"){
    appendToWarehouse(optionLabel || "Chartered vessel", 1, "", "Dock");
    log("Order Completed", `${label} → Added to Warehouse.`);
    return;
  }

  // Workshop craft (tool table random)
  if(fac.id==="workshop" && fn.id==="craft" && chosen && chosen.craftItem){
  appendToWarehouse(chosen.craftItem, 1, "", "Workshop");
  log("Order Completed", `${label} → Crafted: ${chosen.craftItem}.`);
  return;
}

  // Generic craft/harvest/trade → warehouse (if option chosen)
  if(optionLabel){
    appendToWarehouse(optionLabel, 1, "", fac.name);
    log("Order Completed", `${label} → Added to Warehouse.`);
    return;
  }

  log("Order Completed", `${label} → Completed.`);
}

  // ---------- Render ----------
  function render(){
    ui.turnPill.textContent = `Turn ${state.turn}`;
    ui.defendersValue.textContent = String(state.defenders.count);
    ui.defendersMeta.textContent =
      state.defenders.count === 0 ? "None recruited"
      : state.defenders.armed ? "Armed"
      : "Unarmed";

    renderList(ui.militaryList, state.military, "No military recruited yet.");
     renderList(ui.defenderRoster, state.defenderBeasts, "No beasts recruited yet.");
    renderWarehouse();
     renderArtisanTools();

    renderEventBox();
    renderFacilities();
    renderLog();

    // update treasury input (in case actions changed it)
    ui.treasuryInput.value = String(state.treasuryGP);
  }

  function renderList(el, arr, emptyText){
    if(!arr || arr.length===0){
      el.innerHTML = `<div class="small muted">${escapeHtml(emptyText)}</div>`;
      return;
    }
    el.innerHTML = arr.map((it, idx) => `
      <div class="item">
        <div>
          <div class="item__name">${escapeHtml(it.name)}</div>
          <div class="item__meta">${escapeHtml(metaLine(it))}</div>
        </div>
        <button class="item__btn" data-remove="${idx}">Remove</button>
      </div>
    `).join("");
    el.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = clampInt(btn.getAttribute("data-remove"), 0);
        arr.splice(i,1);
        saveState();
        render();
      });
    });
  }

  function metaLine(it){
    const parts = [];
    if(it.qty && it.qty !== 1) parts.push(`x${it.qty}`);
    if(it.source) parts.push(it.source);
    return parts.join(" • ") || "—";
  }

  function renderEventBox(){
    const le = state.lastEvent;
    if(!le){
      ui.eventBox.classList.add("muted");
      ui.eventBox.innerHTML = `Click <b>Roll Bastion Event</b> to generate a 1d100 event.`;
      return;
    }
    ui.eventBox.classList.remove("muted");
    const lines = (le.lines || []).slice(0, 12);
    ui.eventBox.innerHTML = `
      <div class="evTitle">${escapeHtml(le.name)}</div>
      <div class="evRoll">Roll: ${escapeHtml(String(le.roll))}</div>
      ${lines.length ? `<ul>${lines.map(l=>`<li>${escapeHtml(String(l))}</li>`).join("")}</ul>` : `<div class="small muted">No description text found in data.</div>`}
      <div class="small muted" style="margin-top:10px">DM note: Some events reference tables from the DMG / Bastion rules. Add your own roll results into the warehouse or log.</div>
    `;
  }

  // ---------------- Warehouse (table) ----------------
// State shape: [{ id, item, qty, gp, notes }]

function ensureWarehouseShape(){
  if(!Array.isArray(state.warehouse)) state.warehouse = [];

  // If old warehouse items exist ({name, qty, source}) convert them once
  const looksOld = state.warehouse.some(x => x && typeof x === "object" && ("name" in x) && !("item" in x));
  if(looksOld){
    state.warehouse = state.warehouse.map(x => ({
      id: uid(),
      item: String(x.name ?? "New Item"),
      qty: clampInt(x.qty ?? 1, 0),
      gp: "",
      notes: x.source ? String(x.source) : ""
    }));
    saveState();
  }
}

function uid(){
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function renderWarehouse(){
  ensureWarehouseShape();
  if(!whTableBody) return;

  whTableBody.innerHTML = "";

  if(state.warehouse.length === 0){
    state.warehouse.push({ id: uid(), item: "New Item", qty: 1, gp: "", notes: "" });
  }

  for(const row of state.warehouse){
    const el = document.createElement("div");
    el.className = "whRow";
    el.dataset.id = row.id;

    el.innerHTML = `
      <input class="whItem" type="text" value="${escapeHtml(String(row.item ?? ""))}" />
      <input class="whQty" type="number" min="0" step="1" value="${clampInt(row.qty ?? 0, 0)}" />
      <input class="whGp" type="text" value="${escapeHtml(String(row.gp ?? ""))}" placeholder="-" />
      <input class="whNotes" type="text" value="${escapeHtml(String(row.notes ?? ""))}" placeholder="notes..." />
      <button class="btn whBtn" data-act="remove">Remove</button>
    `;
    whTableBody.appendChild(el);
  }
}

function readWarehouseFromUI(){
  ensureWarehouseShape();
  if(!whTableBody) return;

  const rows = Array.from(whTableBody.querySelectorAll(".whRow"));
  const next = [];

  for(const r of rows){
    const id = r.dataset.id || uid();
    const item = r.querySelector(".whItem")?.value?.trim() || "New Item";
    const qty = clampInt(r.querySelector(".whQty")?.value ?? 0, 0);
    const gp = r.querySelector(".whGp")?.value?.trim() || "";
    const notes = r.querySelector(".whNotes")?.value?.trim() || "";

    // keep meaningful rows
    if(item || qty || gp || notes){
      next.push({ id, item, qty, gp, notes });
    }
  }

  state.warehouse = next;
}

function addWarehouseRow(prefill){
  readWarehouseFromUI();
  state.warehouse.push({
    id: uid(),
    item: prefill?.item ?? "New Item",
    qty: prefill?.qty ?? 1,
    gp: prefill?.gp ?? "",
    notes: prefill?.notes ?? ""
  });
  renderWarehouse();
}

function removeWarehouseRow(id){
  readWarehouseFromUI();
  state.warehouse = state.warehouse.filter(x => x.id !== id);
  renderWarehouse();
}

function saveWarehouse(){
  readWarehouseFromUI();
  saveState();
  log("Warehouse", "Saved warehouse.");
  renderLog();
}

// Append/merge outputs into warehouse
function appendToWarehouse(itemName, qty=1, gp="", notes=""){
  readWarehouseFromUI();

  const name = String(itemName || "").trim();
  if(!name) return;

  const q = clampInt(qty, 1);

  const found = state.warehouse.find(x => String(x.item||"").toLowerCase() === name.toLowerCase());
  if(found){
    found.qty = clampInt((found.qty ?? 0) + q, 0);
    if(notes && !String(found.notes||"").includes(notes)){
      found.notes = (found.notes ? (found.notes + " | ") : "") + notes;
    }
  } else {
    state.warehouse.push({ id: uid(), item: name, qty: q, gp: gp ?? "", notes: notes ?? "" });
  }

  saveState();
  renderWarehouse();
}

// Warehouse UI wiring
if(addWarehouseRowBtn){
  addWarehouseRowBtn.addEventListener("click", () => addWarehouseRow());
}
if(saveWarehouseBtn){
  saveWarehouseBtn.addEventListener("click", () => saveWarehouse());
}
if(clearWarehouseBtn){
  clearWarehouseBtn.addEventListener("click", () => {
    state.warehouse = [];
    saveState();
    log("Warehouse", "Cleared warehouse.");
    renderWarehouse();
    renderLog();
  });
}
if(whTableBody){
  whTableBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act='remove']");
    if(!btn) return;
    const row = e.target.closest(".whRow");
    if(!row) return;
    removeWarehouseRow(row.dataset.id);
  });
}

   function constructionSlotsForLevel(level){
  const lvl = clampInt(level, 1, 20);
  if(lvl >= 17) return 6;
  if(lvl >= 13) return 5;
  if(lvl >= 9)  return 4;
  if(lvl >= 5)  return 2;
  return 0;
}

function allBuiltFacilityIds(){
  const base = Array.isArray(state.builtFacilities) ? state.builtFacilities : [];
  const extra = Array.isArray(state.builtExtras) ? state.builtExtras : [];
  // unique
  return Array.from(new Set([...base, ...extra]));
}

   function renderPendingOrders(){
  const p = Array.isArray(state.pendingOrders) ? state.pendingOrders : [];
  if(!p.length){
    ui.pendingList.innerHTML = `<div class="small muted">No pending orders.</div>`;
    return;
  }
  ui.pendingList.innerHTML = p.map(o => `
    <div class="item">
      <div>
        <div class="item__name">${escapeHtml(o.label)}</div>
        <div class="item__meta">Completes on Turn ${escapeHtml(String(o.completeTurn))}</div>
      </div>
      <button class="item__btn" data-cancel="${escapeHtml(String(o.id))}">Cancel</button>
    </div>
  `).join("");

  ui.pendingList.querySelectorAll("[data-cancel]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-cancel");
      state.pendingOrders = state.pendingOrders.filter(x => String(x.id) !== String(id));
      saveState();
      log("Orders", "Cancelled an order.");
      render();
    });
  });
}

   function issueOrder(facId, fnId){
  const fac = DATA.facilities.find(f => f.id === facId);
  if(!fac) return;
  const fn = (fac.functions || []).find(x => x.id === fnId);
  if(!fn) return;

  // Prevent duplicate pending same facility+function
  if(state.pendingOrders.some(o => o.facId === facId && o.fnId === fnId)){
    alert("That order is already pending.");
    return;
  }

  // Resolve chosen option (same logic you already had)
  let chosen = null;
  let optionLabel = null;

  if(fn.options && fn.options.length){
    const sel = document.getElementById(`sel_${fac.id}__${fn.id}`);
    const idx = clampInt(sel ? sel.value : 0, 0);
    chosen = fn.options[idx] || null;
    optionLabel = chosen && chosen.label ? chosen.label : String(chosen || "");
  } else if(fac.id==="workshop" && fn.id==="craft"){
  const sel = document.getElementById(`sel_${fac.id}__${fn.id}`);
  const idx = clampInt(sel ? sel.value : 0, 0);

  const chosenTables = (state.artisanTools || []).filter(Boolean);
  const set = new Set();
  for(const t of chosenTables){
    for(const item of (DATA.tools[t] || [])) set.add(String(item));
  }
  const items = Array.from(set).sort((a,b)=>a.localeCompare(b));
  const picked = items[idx] || "";

  chosen = { label: picked, craftItem: picked };
  optionLabel = picked;
}

  const { costGP } = computeFnCost(fac, fn, chosen);

  if(costGP > state.treasuryGP){
    alert(`Not enough gp. Need ${costGP}gp, you have ${state.treasuryGP}gp.`);
    return;
  }

  // Pay cost up front when order is issued
  state.treasuryGP -= costGP;

  const id = uid();
  const label = `${fac.name}: ${fn.label}${optionLabel ? ` (${optionLabel})` : ""}`;

  state.pendingOrders.push({
    id,
    facId,
    fnId,
    chosen,
    optionLabel,
    label,
    costGP,
    issuedTurn: state.turn,
    completeTurn: state.turn + 1
  });

  saveState();
  log("Order Issued", label);
  render();
}

   function toolTableNames(){
  return Object.keys(DATA.tools || {}).filter(k => k.endsWith("Tools") || k.endsWith("Supplies"));
}

function renderArtisanTools(){
  if(!ui.artisanToolGrid) return;

  const tables = toolTableNames();
  // ensure shape
  if(!Array.isArray(state.artisanTools)) state.artisanTools = ["","","","","",""];
  while(state.artisanTools.length < 6) state.artisanTools.push("");

  ui.artisanToolGrid.innerHTML = Array.from({length:6}, (_,i)=>{
    const current = state.artisanTools[i] || "";
    return `
      <label class="field">
        <span>Set ${i+1}</span>
        <select id="artisanSel_${i}">
          <option value="">(None)</option>
          ${tables.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
        </select>
      </label>
    `;
  }).join("");

  for(let i=0;i<6;i++){
    const sel = document.getElementById(`artisanSel_${i}`);
    if(sel) sel.value = state.artisanTools[i] || "";
  }
}

function readArtisanToolsFromUI(){
  if(!Array.isArray(state.artisanTools)) state.artisanTools = ["","","","","",""];
  for(let i=0;i<6;i++){
    const sel = document.getElementById(`artisanSel_${i}`);
    state.artisanTools[i] = sel ? (sel.value || "") : "";
  }
  saveState();
}

   function renderFacilities(){
  const lvl = state.partyLevel;

  // --- Slots UI (construction) ---
  normalizeBuiltExtras();

  const maxSlots = constructionSlotsForLevel(lvl);

  // Ensure builtExtras has exactly maxSlots entries
  while(state.builtExtras.length < maxSlots) state.builtExtras.push("");
  if(state.builtExtras.length > maxSlots) state.builtExtras = state.builtExtras.slice(0, maxSlots);

  // Meta text
  const used = state.builtExtras.filter(x => x && typeof x === "object" && x.facId).length;
  ui.slotMeta.textContent = `Level ${lvl} → ${maxSlots} slot(s). Used: ${used}/${maxSlots}`;

  ui.slotList.innerHTML = "";

  // Buildable facilities = everything except starters
  const buildable = DATA.facilities.filter(f => !STARTING_BUILT.includes(f.id));

  // Reserved = already built OR currently building in any slot + starters
  const reserved = reservedFacilityIds();

  // Build each slot row
  for(let slotIndex = 0; slotIndex < maxSlots; slotIndex++){
    const current = state.builtExtras[slotIndex];

    const row = document.createElement("div");
    row.className = "slotRow";

    // If slot occupied (building or built), show locked label
    if(current && typeof current === "object" && current.facId){
      const fac = DATA.facilities.find(f=>f.id===current.facId);
      const name = fac ? fac.name : current.facId;

      const statusText = (current.status === "building")
        ? `Under construction • ${Number(current.remaining||0)} turn(s) remaining`
        : `Built • Active`;

      row.innerHTML = `
        <div class="slotLocked">
          <div class="slotLocked__name">${escapeHtml(name)}</div>
          <div class="small muted">${escapeHtml(statusText)}</div>
        </div>
      `;
      ui.slotList.appendChild(row);
      continue;
    }

    // Empty slot: dropdown + build button
    const optionsHtml = buildable.map(f=>{
      const isTaken = reserved.includes(f.id);
      const req = Number(f.requiredLevel || 0);
      const isLockedByLevel = lvl < req;
      const disabled = isTaken || isLockedByLevel;

      const lockLabel = isLockedByLevel ? ` (Locked: Lvl ${req})` : "";
      const takenLabel = isTaken ? " (Already chosen)" : "";

      return `<option value="${escapeHtml(f.id)}" ${disabled ? "disabled" : ""}>
        ${escapeHtml(f.name)}${escapeHtml(lockLabel)}${escapeHtml(takenLabel)}
      </option>`;
    }).join("");

    row.innerHTML = `
      <select id="slot_${slotIndex}">
        <option value="">(Empty slot)</option>
        ${optionsHtml}
      </select>
      <button class="btn btn--small" data-slot="${slotIndex}">Build</button>
    `;

    ui.slotList.appendChild(row);
  }

  // Slot Build button wiring
  ui.slotList.querySelectorAll("button[data-slot]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const slotIndex = clampInt(btn.getAttribute("data-slot"), 0);
      const sel = document.getElementById(`slot_${slotIndex}`);
      const val = sel ? sel.value : "";

      if(!val) return;

      const fac = DATA.facilities.find(f=>f.id===val);
      const req = Number(fac?.requiredLevel || 0);

      // Level gate (hard enforcement)
      if(lvl < req){
        alert(`Locked. ${fac?.name || val} requires party level ${req}.`);
        return;
      }

      // Duplicate prevention (built OR building)
      if(reservedFacilityIds().includes(val)){
        alert("That facility is already built or under construction.");
        return;
      }

      const turns = buildTurnsForRequiredLevel(req);

      if(turns <= 0){
        state.builtExtras[slotIndex] = { facId: val, status: "built" };
        log("Construction", `${fac?.name || val} built instantly.`);
      }else{
        state.builtExtras[slotIndex] = { facId: val, status: "building", remaining: turns };
        log("Construction Started", `${fac?.name || val} is under construction (${turns} turns).`);
      }

      saveState();
      render();
    });
  });

  // --- Pending Orders list ---
  renderPendingOrders();

  // --- Facilities grid: ONLY built facilities ---
  const builtIds = builtFacilityIds();
  const builtFacilities = DATA.facilities.filter(f => builtIds.includes(f.id));

  ui.facilitiesGrid.innerHTML = builtFacilities.map(fac => {
    const fns = (fac.functions || []).map(fn => renderFunction(fac, fn, false)).join("");

    const imgFile = FACILITY_IMG[fac.id];
    const imgHtml = imgFile
      ? `<div class="facImgWrap"><img class="facImg" src="${withBase(`assets/facilities/${imgFile}`)}" alt="${escapeHtml(fac.name)}" /></div>`
      : "";

    return `
      <div class="fac">
        ${imgHtml}
        <div class="facTop">
          <div>
            <div class="facName">${escapeHtml(fac.name)}</div>
            <div class="small muted">Built • Functions take 1 Bastion Turn</div>
          </div>
          <div class="facMeta"><span class="tag tag--ok">Active</span></div>
        </div>
        <div class="facFns">${fns || `<div class="small muted">No functions listed.</div>`}</div>
      </div>
    `;
  }).join("");

  // attach events to function buttons
  ui.facilitiesGrid.querySelectorAll("[data-action='runFn']").forEach(btn => {
    btn.addEventListener("click", () => {
      const facId = btn.getAttribute("data-fac");
      const fnId = btn.getAttribute("data-fn");
      issueOrder(facId, fnId);
    });
  });
}


  function renderFunction(fac, fn, locked){
    const key = `${fac.id}__${fn.id}`;
    const needsOption = (fn.options && fn.options.length>0);

    // Workshop's Craft function is special: it depends on "tools installed".
    // For MVP we let the DM pick ANY tool list from the spreadsheet tables.
    let options = fn.options || [];
    if(fac.id === "workshop" && fn.id === "craft"){
  // Build craftable items from the saved Artisan Tools selections
  const chosenTables = (state.artisanTools || []).filter(Boolean);
  const set = new Set();

  for(const t of chosenTables){
    const list = DATA.tools[t] || [];
    for(const item of list){
      set.add(String(item));
    }
  }

  const items = Array.from(set).sort((a,b)=>a.localeCompare(b));
  options = items.map(name => ({ label: name, craftItem: name }));
}

    const selectHtml = needsOption || (fac.id==="workshop" && fn.id==="craft")
      ? `<select id="sel_${escapeHtml(key)}">
          ${(options || []).map((o,idx)=>{
            const label = o.label || o;
            const cost = (o.costGP!=null) ? ` (${o.costGP}gp)` : "";
            return `<option value="${idx}">${escapeHtml(label)}${escapeHtml(cost)}</option>`;
          }).join("")}
        </select>`
      : "";

    const costText = computeFnCostText(fac, fn, null);

    const notes = (fac.id==="workshop" && fn.id==="craft") ? "" : (fn.notes ? `<div class="fnNotes">${escapeHtml(fn.notes)}</div>` : "");

    return `
      <div class="fnRow">
        <div class="fnHeader">
          <div class="fnName">${escapeHtml(fn.label)}</div>
          <div class="fnCost" id="cost_${escapeHtml(key)}">${escapeHtml(costText)}</div>
        </div>
        ${selectHtml}
        <button class="btn btn--small" data-action="runFn" data-fac="${escapeHtml(fac.id)}" data-fn="${escapeHtml(fn.id)}" ${locked ? "disabled" : ""}>
          Issue Order
        </button>
        ${notes}
      </div>
    `;
  }

  // ---------- Actions ----------
  function runFacilityFunction(facId, fnId){
    const fac = DATA.facilities.find(f => f.id === facId);
    if(!fac) return;
    const fn = (fac.functions || []).find(x => x.id === fnId);
    if(!fn) return;

    // Resolve option
    let chosen = null;
    if(fn.options && fn.options.length){
      const sel = document.getElementById(`sel_${fac.id}__${fn.id}`);
      const idx = clampInt(sel ? sel.value : 0, 0);
      chosen = fn.options[idx] || null;
    } else if(fac.id==="workshop" && fn.id==="craft"){
      const sel = document.getElementById(`sel_${fac.id}__${fn.id}`);
      const idx = clampInt(sel ? sel.value : 0, 0);
      const toolTables = Object.keys(DATA.tools || {}).filter(k => k.endsWith("Tools") || k.endsWith("Supplies"));
      const tableName = toolTables[idx];
      chosen = { label: tableName, toolTable: tableName };
    }

    const { costGP, costText } = computeFnCost(fac, fn, chosen);

    if(costGP > state.treasuryGP){
      alert(`Not enough gp. Need ${costGP}gp, you have ${state.treasuryGP}gp.`);
      return;
    }

    // Pay cost
    state.treasuryGP -= costGP;

    // Apply effects (simple, DM-friendly)
    const label = `${fac.name}: ${fn.label}`;
    const optionLabel = chosen && chosen.label ? chosen.label : null;

    // Special: Barracks recruit defenders
    if(fac.id==="barracks" && fn.id==="recruit_defenders"){
      const r = d(4);
      state.defenders.count += r;
      log(label, `Recruited ${r} defenders.`);
      saveState(); render(); return;
    }

    // Special: Watchtower patrol buff
    if(fac.id==="watchtower" && fn.id==="patrol"){
      state.defenders.patrolAdvantage = true;
      log(label, "Patrol active. Defenders have Advantage on bastion defense rolls until the next turn advance.");
      saveState(); render(); return;
    }

    // Special: Armoury arm defenders (dynamic cost)
    if(fac.id==="armoury" && fn.id==="arm_defenders"){
      state.defenders.armed = (state.defenders.count > 0);
      log(label, `Armed defenders. Cost paid: ${costGP}gp.`);
      saveState(); render(); return;
    }

    // War Room recruit -> military list
    if(fac.id==="war_room" && fn.id==="recruit"){
      const unit = optionLabel || "Unit";
      addToList(state.military, unit, { source: "War Room" });
      log(label, `Recruited: ${unit}.`);
      saveState(); render(); return;
    }

    // Menagerie recruit -> defenders roster as items
    if(fac.id==="menagerie" && fn.id==="recruit_beast"){
      const beast = optionLabel || "Beast";
      addToList(state.military, beast, { source: "Menagerie" });
      log(label, `Recruited beast: ${beast}.`);
      saveState(); render(); return;
    }

    // Dock charter -> warehouse
    if(fac.id==="dock" && fn.id==="charter_berth"){
      appendToWarehouse(optionLabel || "Chartered vessel", 1, "", "Dock");
      log(label, optionLabel ? `Chartered: ${optionLabel}.` : "Chartered a vessel.");
      saveState(); render(); return;
    }

    // Craft / Harvest / Trade -> warehouse
    if(["arcane_study","sanctuary","garden","greenhouse","laboratory","scriptorium","library","smithy","storehouse","gaming_hall","workshop"].includes(fac.id)){
      if(fac.id==="workshop" && fn.id==="craft" && chosen && chosen.toolTable){
        // pick an item from that tool table at random
        const list = DATA.tools[chosen.toolTable] || [];
        if(list.length){
          const item = list[Math.floor(Math.random()*list.length)];
          appendToWarehouse(item, 1, "", chosen.toolTable);
          log(label, `Crafted: ${item} (from ${chosen.toolTable}).`);
        }else{
          log(label, `No items found for table: ${chosen.toolTable}.`);
        }
        saveState(); render(); return;
      }

      if(optionLabel){
        appendToWarehouse(optionLabel, 1, "", fac.name);
        log(label, `Added to warehouse: ${optionLabel}.`);
      }else{
        log(label, "Completed.");
      }
      saveState(); render(); return;
    }

    // Default
    log(label, optionLabel ? `Completed: ${optionLabel}.` : "Completed.");
    saveState();
    render();
  }

  function computeFnCost(fac, fn, chosen){
    // Dynamic: Armoury 'Arm Defenders'
    if(fac.id==="armoury" && fn.id==="arm_defenders"){
      const base = 100;
      const per = 100;
      const dyn = base + (state.defenders.count * per);
      return { costGP: dyn, costText: `${dyn}gp (100 + defenders×100)` };
    }

    // Options with costs
    if(chosen && chosen.costGP != null){
      return { costGP: Number(chosen.costGP) || 0, costText: `${Number(chosen.costGP) || 0}gp` };
    }

    // Fixed cost on function
    if(fn.costGP != null){
      return { costGP: Number(fn.costGP) || 0, costText: `${Number(fn.costGP)||0}gp` };
    }

    // Text-only cost (unparsed)
    if(fn.costText){
      // Try parse first integer
      const m = String(fn.costText).replace(/,/g,"").match(/(\d+)/);
      const gp = m ? Number(m[1]) : 0;
      return { costGP: gp, costText: fn.costText };
    }

    return { costGP: 0, costText: "0gp" };
  }

  function computeFnCostText(fac, fn){
    const { costText } = computeFnCost(fac, fn, null);
    return costText || "0gp";
  }

  // ---------- Events ----------
  function resolveEvent(roll, table){
    for(const row of (table||[])){
      const [a,b] = String(row.range).split("-").map(x=>parseInt(x,10));
      const min = isNaN(a) ? 1 : a;
      const max = isNaN(b) ? min : b;
      if(roll>=min && roll<=max) return row;
    }
    return { range: "??", name: "Unknown" };
  }

  // ---------- State ----------
  function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);

  // Defaults (first ever load)
  const DEFAULT_STATE = {
    treasuryGP: 0,
    partyLevel: 7,

    // starting built facilities (your requested 5)
    builtFacilities: ["barracks","armoury","watchtower","workshop","dock"],
    builtExtras: [],

    // 1-turn pending orders
    pendingOrders: [],

    // defenders core + menagerie beasts
    defenders: { count:0, armed:false, patrolAdvantage:false },
    defenderBeasts: [],

    // lists
    military: [],
    warehouse: [],

    // artisan tool selections (6 dropdowns)
    artisanTools: ["","","","","",""],

    // turns + events + log
    turn: 1,
    lastEvent: null,
    log: [],
  };

  if(!raw) return DEFAULT_STATE;

  try{
    const s = JSON.parse(raw);

    // Merge saved state into defaults safely
    const merged = {
      ...DEFAULT_STATE,
      treasuryGP: clampInt(s.treasuryGP ?? DEFAULT_STATE.treasuryGP, 0),
      partyLevel: clampInt(s.partyLevel ?? DEFAULT_STATE.partyLevel, 1, 20),

      builtFacilities: Array.isArray(s.builtFacilities) ? s.builtFacilities : DEFAULT_STATE.builtFacilities,
      builtExtras: Array.isArray(s.builtExtras) ? s.builtExtras : DEFAULT_STATE.builtExtras,

      pendingOrders: Array.isArray(s.pendingOrders) ? s.pendingOrders : DEFAULT_STATE.pendingOrders,

      defenders: {
        count: clampInt(s.defenders?.count ?? DEFAULT_STATE.defenders.count, 0),
        armed: !!s.defenders?.armed,
        patrolAdvantage: !!s.defenders?.patrolAdvantage,
      },

      defenderBeasts: Array.isArray(s.defenderBeasts) ? s.defenderBeasts : DEFAULT_STATE.defenderBeasts,

      military: Array.isArray(s.military) ? s.military : DEFAULT_STATE.military,
      warehouse: Array.isArray(s.warehouse) ? s.warehouse : DEFAULT_STATE.warehouse,

      artisanTools: Array.isArray(s.artisanTools) ? s.artisanTools : DEFAULT_STATE.artisanTools,

      turn: clampInt(s.turn ?? DEFAULT_STATE.turn, 1),
      lastEvent: s.lastEvent || null,
      log: Array.isArray(s.log) ? s.log : DEFAULT_STATE.log,
    };

    return merged;
  }catch(e){
    console.warn("Bad state JSON, resetting.", e);
    return DEFAULT_STATE;
  }
}

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function log(title, body){
    state.log.unshift({ title, body, at: Date.now() });
  }

  function renderLog(){
    if(!state.log.length){
      ui.logList.innerHTML = `<div class="small muted">No log entries yet.</div>`;
      return;
    }
    ui.logList.innerHTML = state.log.slice(0, 80).map(e => `
      <div class="logEntry">
        <div class="logEntry__top">
          <div class="logEntry__title">${escapeHtml(e.title)}</div>
          <div class="logEntry__time">${escapeHtml(formatTime(e.at))}</div>
        </div>
        <div class="logEntry__body">${escapeHtml(e.body || "")}</div>
      </div>
    `).join("");
  }

  function addToList(list, name, meta={}){
    // Merge duplicates by name
    const idx = list.findIndex(x => x.name === name);
    if(idx>=0){
      list[idx].qty = (list[idx].qty || 1) + 1;
      list[idx].source = meta.source || list[idx].source;
    }else{
      list.push({ name, qty: 1, source: meta.source || "" });
    }
  }

  // ---------- Utils ----------
  function d(sides){ return 1 + Math.floor(Math.random()*sides); }

  function clampInt(v, min, max){
    const n = parseInt(String(v), 10);
    const x = isNaN(n) ? (min ?? 0) : n;
    if(max!=null) return Math.max(min ?? 0, Math.min(max, x));
    return Math.max(min ?? 0, x);
  }

  function formatTime(ms){
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
})();
