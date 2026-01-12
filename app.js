/* DM Session Hub
   - Upload a PDF
   - Split into scenes from PDF bookmarks (Outline): "Scene 1", "Scene 2", etc
   - Extract scene text (per page range) into a readable pane
   - Detect roll lines like: "Roll Persuasion check (DC 12)"
   - If you click SUCCESS, it adds the reveal text (if found) + roll to Session Summary
   - Loot notes are appended when you complete a scene
   - Summary can be exported to PDF
*/

const el = (id) => document.getElementById(id);

const screenUpload = el("screenUpload");
const screenMain = el("screenMain");
const screenSummary = el("screenSummary");

const pdfInput = el("pdfInput");
const uploadHint = el("uploadHint");
const subTitle = el("subTitle");

const sceneBar = el("sceneBar");
const sceneTitle = el("sceneTitle");
const sceneMeta = el("sceneMeta");
const reader = el("reader");

const lootNotes = el("lootNotes");

const btnPrev = el("btnPrev");
const btnNext = el("btnNext");
const btnReset = el("btnReset");

const summaryBody = el("summaryBody");
const btnBackToScenes = el("btnBackToScenes");
const btnDownloadSummary = el("btnDownloadSummary");

let pdfDoc = null;

const state = {
  fileName: "",
  scenes: [], // { title, startPage, endPage, textBlocks: [], rolls: [] }
  current: 0,
  perSceneLootDraft: {}, // idx -> string
  summary: {
    reveals: [], // { sceneTitle, rollText, revealText }
    loot: []     // { sceneTitle, lootText }
  }
};

// ---------- Helpers ----------
function show(which){
  screenUpload.hidden = which !== "upload";
  screenMain.hidden = which !== "main";
  screenSummary.hidden = which !== "summary";
}

function esc(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function normalizeSceneTitle(t){
  return (t || "").trim();
}

// Matches: "Roll Persuasion check (DC 12)" and variants
const rollRegex = /(Roll\s+([A-Za-z ]+?)\s*(?:check|save|test)\s*\(DC\s*(\d+)\))/i;

// Reveal convention (recommended in your notes):
// Put one of these right after the roll line:
// "REVEAL: ...", "SUCCESS: ...", "ON SUCCESS: ..."
// We’ll pull the next such line/paragraph if it exists.
const revealRegex = /^(REVEAL|SUCCESS|ON SUCCESS)\s*:\s*(.+)$/i;

async function pageText(pageNumber){
  const page = await pdfDoc.getPage(pageNumber);
  const content = await page.getTextContent();
  const strings = content.items.map(it => it.str).filter(Boolean);
  // Soft join, then re-chunk into “paragraph-ish” lines
  const raw = strings.join(" ").replace(/\s+/g, " ").trim();
  return raw;
}

async function pageLines(pageNumber){
  const page = await pdfDoc.getPage(pageNumber);
  const content = await page.getTextContent();
  // pdf.js gives fragments; we stitch into lines-ish by keeping the original order and
  // splitting on some common “line break” artifacts (not perfect, but workable).
  const strings = content.items.map(it => (it.str || "").trim()).filter(Boolean);
  const joined = strings.join("\n");
  const lines = joined
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map(s => s.trim())
    .filter(s => s.length);

  return lines;
}

// ---------- Outline -> Scenes ----------
async function resolveDestToPageIndex(dest){
  // Returns 1-based page number
  const resolved = await pdfDoc.getDestination(dest);
  if (!resolved) return null;
  const ref = resolved[0];
  const pageIndex = await pdfDoc.getPageIndex(ref);
  return pageIndex + 1;
}

async function flattenOutline(outline, out = []){
  if (!outline) return out;
  for (const item of outline){
    out.push(item);
    if (item.items?.length) await flattenOutline(item.items, out);
  }
  return out;
}

function isSceneBookmark(title){
  return /^scene\s*\d+/i.test(title || "");
}

async function buildScenesFromOutline(){
  const outline = await pdfDoc.getOutline();
  const flat = await flattenOutline(outline || []);
  const sceneMarks = flat
    .filter(it => isSceneBookmark(it.title))
    .map(it => ({ title: normalizeSceneTitle(it.title), dest: it.dest }))
    .filter(it => it.title);

  // If no bookmarks, fallback to a single scene = whole PDF
  if (!sceneMarks.length){
    return [{
      title: "Scene 1",
      startPage: 1,
      endPage: pdfDoc.numPages,
      textBlocks: [],
      rolls: []
    }];
  }

  // Resolve bookmark destinations to pages
  const marksWithPages = [];
  for (const m of sceneMarks){
    const p = await resolveDestToPageIndex(m.dest);
    if (p) marksWithPages.push({ ...m, page: p });
  }

  // Sort by page asc
  marksWithPages.sort((a,b) => a.page - b.page);

  // Build ranges
  const scenes = marksWithPages.map((m, i) => {
    const start = m.page;
    const next = marksWithPages[i+1]?.page ?? (pdfDoc.numPages + 1);
    const end = Math.max(start, next - 1);
    return {
      title: m.title,
      startPage: start,
      endPage: end,
      textBlocks: [],
      rolls: []
    };
  });

  return scenes;
}

// ---------- Extract + parse rolls ----------
function parseSceneLinesIntoBlocks(lines){
  const blocks = [];
  const rolls = [];

  for (let i = 0; i < lines.length; i++){
    const line = lines[i];

    const rollMatch = line.match(rollRegex);
    if (rollMatch){
      // Look ahead for a reveal line
      let revealText = "";
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++){
        const r = lines[j].match(revealRegex);
        if (r){
          revealText = r[2].trim();
          break;
        }
      }

      const rollObj = {
        rollText: line,
        revealText: revealText
      };
      rolls.push(rollObj);

      blocks.push({ type: "roll", ...rollObj });
      continue;
    }

    blocks.push({ type: "p", text: line });
  }

  return { blocks, rolls };
}

async function hydrateScenesText(){
  for (const scene of state.scenes){
    const allLines = [];
    for (let p = scene.startPage; p <= scene.endPage; p++){
      const lines = await pageLines(p);
      // Add a blank spacer between pages
      allLines.push(...lines, "");
    }
    const parsed = parseSceneLinesIntoBlocks(allLines);
    scene.textBlocks = parsed.blocks;
    scene.rolls = parsed.rolls;
  }
}

// ---------- UI Rendering ----------
function renderSceneTabs(){
  sceneBar.innerHTML = "";
  state.scenes.forEach((s, idx) => {
    const b = document.createElement("button");
    b.className = "sceneTab" + (idx === state.current ? " active" : "");
    b.textContent = s.title || `Scene ${idx+1}`;
    b.addEventListener("click", () => {
      stashLootDraft();
      state.current = idx;
      renderScene();
    });
    sceneBar.appendChild(b);
  });
}

function stashLootDraft(){
  state.perSceneLootDraft[state.current] = lootNotes.value || "";
}

function renderScene(){
  const s = state.scenes[state.current];
  renderSceneTabs();

  sceneTitle.textContent = s.title || `Scene ${state.current+1}`;
  sceneMeta.textContent = `Pages ${s.startPage}–${s.endPage}`;

  // Button label changes on final scene
  const isFinal = state.current === state.scenes.length - 1;
  btnNext.textContent = isFinal ? "Complete Session" : "Complete Scene - Next";

  btnPrev.disabled = state.current === 0;

  // Restore loot draft
  lootNotes.value = state.perSceneLootDraft[state.current] || "";

  // Render blocks
  reader.innerHTML = "";
  for (const block of s.textBlocks){
    if (block.type === "p"){
      if (!block.text) continue;
      const p = document.createElement("p");
      p.innerHTML = esc(block.text);
      reader.appendChild(p);
      continue;
    }

    if (block.type === "roll"){
      const wrap = document.createElement("div");
      wrap.className = "rollLine";

      const text = document.createElement("div");
      text.className = "rollText";
      text.innerHTML = `<b>${esc(block.rollText)}</b>` +
        (block.revealText ? `<div class="revealBox"><b>Reveal if success:</b> ${esc(block.revealText)}</div>` : "");

      const btns = document.createElement("div");
      btns.className = "rollBtns";

      const pass = document.createElement("button");
      pass.className = "smallBtn pass";
      pass.textContent = "SUCCESS";
      pass.addEventListener("click", () => {
        addRevealToSummary(s.title, block.rollText, block.revealText);
        pass.textContent = "SUCCESS ✓";
        pass.disabled = true;
        fail.disabled = true;
      });

      const fail = document.createElement("button");
      fail.className = "smallBtn fail";
      fail.textContent = "FAIL";
      fail.addEventListener("click", () => {
        // Not added to summary on fail
        fail.textContent = "FAIL ✓";
        pass.disabled = true;
        fail.disabled = true;
      });

      btns.appendChild(pass);
      btns.appendChild(fail);

      wrap.appendChild(text);
      wrap.appendChild(btns);
      reader.appendChild(wrap);
    }
  }
}

function addRevealToSummary(sceneTitle, rollText, revealText){
  const cleanedReveal = (revealText || "").trim();
  state.summary.reveals.push({
    sceneTitle,
    rollText,
    revealText: cleanedReveal || "(No REVEAL/SUCCESS line found after this roll in your notes.)"
  });
}

function completeScene(){
  const s = state.scenes[state.current];
  stashLootDraft();

  const loot = (state.perSceneLootDraft[state.current] || "").trim();
  if (loot){
    state.summary.loot.push({ sceneTitle: s.title, lootText: loot });
  }

  const isFinal = state.current === state.scenes.length - 1;
  if (isFinal){
    renderSummary();
    show("summary");
    return;
  }

  state.current++;
  renderScene();
}

function renderSummary(){
  summaryBody.innerHTML = "";

  // Group reveals by scene
  const revealsByScene = new Map();
  for (const r of state.summary.reveals){
    if (!revealsByScene.has(r.sceneTitle)) revealsByScene.set(r.sceneTitle, []);
    revealsByScene.get(r.sceneTitle).push(r);
  }

  const lootByScene = new Map();
  for (const l of state.summary.loot){
    if (!lootByScene.has(l.sceneTitle)) lootByScene.set(l.sceneTitle, []);
    lootByScene.get(l.sceneTitle).push(l);
  }

  // Build sections in scene order
  for (const s of state.scenes){
    const section = document.createElement("div");
    section.className = "summarySection";
    section.innerHTML = `<h3>${esc(s.title)}</h3>`;

    const rs = revealsByScene.get(s.title) || [];
    const ls = lootByScene.get(s.title) || [];

    if (!rs.length && !ls.length){
      section.innerHTML += `<div class="muted">No reveals or loot notes recorded for this scene.</div>`;
    }

    if (rs.length){
      section.innerHTML += `<div class="muted"><b>Reveals (successful checks)</b></div>`;
      rs.forEach(item => {
        const div = document.createElement("div");
        div.className = "summaryItem";
        div.innerHTML =
          `<div><b>${esc(item.rollText)}</b></div>` +
          `<div style="margin-top:6px;">${esc(item.revealText)}</div>`;
        section.appendChild(div);
      });
    }

    if (ls.length){
      section.innerHTML += `<div class="muted" style="margin-top:10px;"><b>Loot notes</b></div>`;
      ls.forEach(item => {
        const div = document.createElement("div");
        div.className = "summaryItem";
        div.innerHTML = `<div>${esc(item.lootText)}</div>`;
        section.appendChild(div);
      });
    }

    summaryBody.appendChild(section);
  }
}

// ---------- PDF Export ----------
async function downloadSummaryPdf(){
  const filenameBase = state.fileName ? state.fileName.replace(/\.pdf$/i,"") : "session-summary";
  const element = summaryBody;

  const opt = {
    margin: 0.35,
    filename: `${filenameBase}-summary.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  await html2pdf().set(opt).from(element).save();
}

// ---------- Events ----------
pdfInput?.addEventListener("change", async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;

  uploadHint.textContent = file.name;
  subTitle.textContent = "Loading PDF…";

  if (!window.pdfjsLib){
    alert("pdf.js failed to load. Check your internet connection and refresh.");
    return;
  }

  // Reset state for a new session
  state.fileName = file.name;
  state.scenes = [];
  state.current = 0;
  state.perSceneLootDraft = {};
  state.summary = { reveals: [], loot: [] };

  const arrayBuffer = await file.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Build scenes from bookmarks
  state.scenes = await buildScenesFromOutline();

  // Extract text for each scene
  await hydrateScenesText();

  subTitle.textContent = `Loaded: ${file.name}`;
  show("main");
  renderScene();
});

btnPrev?.addEventListener("click", () => {
  if (state.current === 0) return;
  stashLootDraft();
  state.current--;
  renderScene();
});

btnNext?.addEventListener("click", () => completeScene());

btnBackToScenes?.addEventListener("click", () => {
  show("main");
  renderScene();
});

btnDownloadSummary?.addEventListener("click", () => downloadSummaryPdf());

btnReset?.addEventListener("click", () => {
  pdfDoc = null;
  pdfInput.value = "";
  uploadHint.textContent = "No file selected";
  subTitle.textContent = "Upload session notes to begin";
  state.fileName = "";
  state.scenes = [];
  state.current = 0;
  state.perSceneLootDraft = {};
  state.summary = { reveals: [], loot: [] };
  show("upload");
});

// Boot
show("upload");
