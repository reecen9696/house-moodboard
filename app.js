import { config } from "./config.js";
import { createStore } from "./store.js";
import { SEED } from "./seed.js";

/* ---------------- constants & helpers ---------------- */

const ROOMS = {
  living: "Living", kitchen: "Kitchen", dining: "Dining", bedroom: "Bedroom", bathroom: "Bathroom",
  laundry: "Laundry", study: "Study", hallway: "Hallway", facade: "Facade", garden: "Garden",
  outdoor: "Outdoor", pool: "Pool", floorplan: "Floor plan", other: "Other",
};
const ROW_HEIGHT = [360, 200, 120, 72]; // target row height per zoom level; pinch moves between them
const GAP = 2; // hairline between photos; keep in sync with --gap in styles.css
const MAX_AUTO_IMAGES = 6; // photos saved automatically from an article or product page

// Google Material icons (filled)
const svg = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const ICON = {
  home: svg("M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"),
  link: svg("M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"),
  sofa: svg("M21 10c-1.1 0-2 .9-2 2v3H5v-3c0-1.1-.9-2-2-2s-2 .9-2 2v5c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2v-5c0-1.1-.9-2-2-2zm-3-5H6c-1.1 0-2 .9-2 2v2.15c1.16.41 2 1.51 2 2.82V14h12v-2.03c0-1.3.84-2.4 2-2.82V7c0-1.1-.9-2-2-2z"),
  add: svg("M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"),
  close: svg("M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"),
  trash: svg("M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"),
  paste: svg("M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"),
  image: svg("M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"),
  go: svg("M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"),
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const photos = (n) => `${n} photo${n === 1 ? "" : "s"}`;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const firstUrl = (text) => text?.match(/https?:\/\/\S+/)?.[0]?.replace(/[)\].,'"]+$/, "") || null;
function cleanUrl(u) { // drop tracking junk like utm_source and fbclid
  try {
    const url = new URL(u.trim());
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|igshid|si$|ref$|ref_src)/i.test(k)) url.searchParams.delete(k);
    url.hash = "";
    return url.href;
  } catch { return u.trim(); }
}
const sameUrl = (a, b) => !!a && !!b && cleanUrl(a).replace(/\/$/, "").toLowerCase() === cleanUrl(b).replace(/\/$/, "").toLowerCase();
// "property-details-21-Heller-Street-Brunswick" → "21 Heller Street Brunswick"
function addressFromUrl(u) {
  try {
    for (let seg of new URL(u).pathname.split("/")) {
      seg = seg.replace(/^property-(?:details|house|unit|apartment|townhouse|villa|land)-/i, "");
      const m = seg.match(/^(\d+[a-z]?(?:-\d+[a-z]?)?)-([a-z]+(?:-[a-z]+)*?)(?:-(?:vic|nsw|qld|wa|sa|tas|act|nt))?(?:-\d{4})?(?:-\d+)?$/i);
      if (m && /[a-z]{3,}/i.test(m[2])) return `${m[1].replace("-", "/")} ${m[2].replace(/-/g, " ")}`.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    }
  } catch { /* not a URL */ }
  return null;
}

/* ---------------- state ---------------- */

const state = {
  items: [],
  sources: [], // pasted links: listings, articles, products
  view: ["home", "rooms", "links"].includes(ls.get("view")) ? ls.get("view") : "home",
  zoom: clamp(ls.get("zoom", 1), 0, ROW_HEIGHT.length - 1),
  selected: null, // Set of item ids while selecting
  armed: false, // bulk delete waiting for its confirming tap
  pending: new Set(), // item ids waiting on AI
  busy: new Set(), // source ids still importing photos
};
let store;
const sourceOf = (item) => state.sources.find((s) => s.id === item.source_id);
const loaded = new Set(); // image srcs already shown, so re-renders don't flash
window.__l = (img) => { img.classList.add("loaded"); loaded.add(img.getAttribute("src")); };

/* ---------------- layers (browser back closes the top one) ---------------- */

const layers = [];
let skipPop = 0;
function pushLayer(close) { layers.push(close); history.pushState({ layer: layers.length }, ""); }
function popLayer() {
  const close = layers.pop();
  if (!close) return;
  close();
  skipPop++;
  history.back();
}
window.addEventListener("popstate", () => { if (skipPop) skipPop--; else layers.pop()?.(); });

let toastTimer;
function toast(msg, sticky = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

/* ---------------- the wall ---------------- */

// Home is one wall of every photo; Rooms splits it into labelled groups
function sections() {
  if (state.view === "rooms") {
    return [...Object.keys(ROOMS), ""]
      .map((room) => ({ id: room, title: ROOMS[room] || "Unsorted", items: state.items.filter((i) => (ROOMS[i.room] ? i.room : "") === room) }))
      .filter((s) => s.items.length);
  }
  return state.items.length ? [{ id: "all", title: null, items: state.items }] : [];
}

// Google Photos-style rows: every photo keeps its shape, every row fills the width
function justify(items, width, target) {
  const ratio = (i) => clamp(i.w && i.h ? i.w / i.h : 1.5, 0.5, 2.5);
  const height = (n, sum) => (width - GAP * (n - 1)) / sum;
  const rows = [];
  let row = [], sum = 0;
  const close = (h, loose = false) => { rows.push({ items: row.map((i) => ({ item: i, ratio: ratio(i) })), h, loose }); row = []; sum = 0; };
  for (const item of items) {
    const r = ratio(item);
    if (row.length) {
      // Would adding this photo squash the row further from the target than leaving it out?
      const without = height(row.length, sum), withIt = height(row.length + 1, sum + r);
      if (withIt < target && without - target < target - withIt) close(without);
    }
    row.push(item);
    sum += r;
    if (height(row.length, sum) <= target) close(height(row.length, sum));
  }
  if (row.length) {
    const h = height(row.length, sum);
    const prev = rows.at(-1);
    const prevSum = prev ? prev.items.reduce((a, x) => a + x.ratio, 0) : 0;
    const merged = prev && height(prev.items.length + row.length, prevSum + sum);
    if (h <= target * 1.6) close(h);
    else if (merged >= target * 0.6) { // fold the stragglers into the row above rather than leave a gap
      prev.items.push(...row.map((i) => ({ item: i, ratio: ratio(i) })));
      prev.h = merged;
    } else close(target * 1.25, true); // too few to fill the width: leave the rest empty
  }
  return rows;
}

function sectionHtml(s, width) {
  const body = justify(s.items, width, ROW_HEIGHT[state.zoom]).map((row) =>
    `<div class="row" style="height:${row.h.toFixed(2)}px">${row.items.map(({ item, ratio }) => tileHtml(item, ratio, row)).join("")}</div>`).join("");
  if (!s.title) return `<section class="group">${body}</section>`;
  const text = `<b>${esc(s.title)}</b><small>${state.selected ? "Select all" : photos(s.items.length)}</small>`;
  const label = state.selected ? `<button data-act="select-all" data-id="${esc(s.id)}">${text}</button>` : `<span>${text}</span>`;
  return `<section class="group"><div class="label">${label}</div>${body}</section>`;
}

function linksHtml() {
  if (!state.sources.length) return `<div class="empty"><b>No links yet</b>Tap + and paste a listing, article or product.</div>`;
  return `<h1 class="title">Links</h1><ul class="links">${state.sources.map((s) => {
    const its = state.items.filter((i) => i.source_id === s.id);
    const thumb = its[0] && store.src(its[0]);
    const meta = [host(s.url), state.busy.has(s.id) ? "adding photos…" : its.length ? photos(its.length) : ""].filter(Boolean).join(" · ");
    return `<li>
      <a href="${esc(s.url)}" target="_blank" rel="noopener">
        <span class="thumb">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : ICON.link}</span>
        <span class="text"><b>${esc(s.title)}</b>${s.summary ? `<span>${esc(s.summary)}</span>` : ""}<small>${esc(meta)}</small></span>
      </a>
      <button data-act="remove-source" data-id="${esc(s.id)}" aria-label="Remove link">${ICON.close}</button>
    </li>`;
  }).join("")}</ul>`;
}

function tileHtml(item, ratio, row) {
  const w = ratio * row.h;
  const src = store.src(item, w > 300 ? "full" : "thumb");
  const cls = `tile${state.pending.has(item.id) ? " pending" : ""}${state.selected?.has(item.id) ? " sel" : ""}`;
  return `<button class="${cls}" data-id="${item.id}" style="${row.loose ? `flex:none;width:${w.toFixed(1)}px` : `flex:${ratio.toFixed(4)} 1 0`}">
    <img src="${esc(src)}" alt="" decoding="async" loading="lazy" ${loaded.has(src) ? 'class="loaded"' : 'onload="__l(this)"'} onerror="this.classList.add('loaded')"></button>`;
}

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderNow(); });
}
function renderNow() {
  const view = $("#view"), width = $("#main").clientWidth;
  view.classList.toggle("selecting", !!state.selected);
  if (state.view === "links") view.innerHTML = linksHtml();
  else {
    const secs = sections();
    view.innerHTML = secs.length ? secs.map((s) => sectionHtml(s, width)).join("")
      : `<div class="empty"><b>Your mood board is empty</b>Tap + to paste a link or add photos.</div>`;
  }
  renderNav();
}

function renderNav() {
  const sel = state.selected;
  if (!sel) {
    const tab = (val, icon, name) => `<button data-act="view" data-val="${val}" class="${state.view === val ? "on" : ""}" aria-label="${name}">${icon}</button>`;
    $("#nav").innerHTML = `<div class="side">${tab("home", ICON.home, "All photos")}${tab("rooms", ICON.sofa, "By room")}</div>
      <button data-act="add" class="add" aria-label="Add">${ICON.add}</button>
      <div class="side">${tab("links", ICON.link, "Links")}</div>`;
    return;
  }
  const n = sel.size;
  $("#nav").innerHTML = `<button data-act="cancel" class="act" aria-label="Cancel">${ICON.close}</button>
    <span class="count">${n}</span>
    <label class="act${n ? "" : " off"}" aria-label="Move to room">${ICON.sofa}<select data-act="room">
      <option value="" disabled selected>Move to room</option>
      ${Object.entries(ROOMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
    <button data-act="delete" class="act${state.armed ? " armed" : ""}" aria-label="Delete" ${n ? "" : "disabled"}>${ICON.trash}</button>`;
}

/* ---------------- zoom (pinch, ctrl+wheel, + / −) ---------------- */

function setZoom(z, anchorId) {
  z = clamp(z, 0, ROW_HEIGHT.length - 1);
  if (z === state.zoom) return;
  const top = (id) => id && document.querySelector(`.tile[data-id="${id}"]`)?.getBoundingClientRect().top;
  const before = top(anchorId);
  state.zoom = z;
  ls.set("zoom", z);
  renderNow();
  const after = top(anchorId);
  if (before !== undefined && after !== undefined) window.scrollBy(0, after - before); // keep the pinched photo under your fingers
}

function setupZoom() {
  const main = $("#main"), view = $("#view");
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let pinch = null;
  main.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 2) return;
    const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const r = view.getBoundingClientRect();
    view.style.transformOrigin = `${mx - r.left}px ${my - r.top}px`;
    pinch = { d0: dist(e.touches), scale: 1, anchor: document.elementFromPoint(mx, my)?.closest(".tile")?.dataset.id };
  }, { passive: true });
  main.addEventListener("touchmove", (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    pinch.scale = dist(e.touches) / pinch.d0;
    view.style.transform = `scale(${clamp(pinch.scale, 0.5, 2)})`;
  }, { passive: false });
  const end = (e) => {
    if (!pinch || e.touches.length >= 2) return;
    const { scale, anchor } = pinch;
    pinch = null;
    view.style.transform = "";
    const steps = scale > 1.15 ? -(scale > 1.7 ? 2 : 1) : scale < 0.87 ? (scale < 0.6 ? 2 : 1) : 0;
    if (steps) setZoom(state.zoom + steps, anchor);
  };
  main.addEventListener("touchend", end);
  main.addEventListener("touchcancel", end);
  document.addEventListener("gesturestart", (e) => e.preventDefault()); // stop iOS zooming the page

  let acc = 0, accTimer; // trackpad pinch arrives as ctrl+wheel
  window.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    acc += e.deltaY;
    clearTimeout(accTimer);
    accTimer = setTimeout(() => (acc = 0), 250);
    if (Math.abs(acc) > 40) {
      setZoom(state.zoom + Math.sign(acc), document.elementFromPoint(e.clientX, e.clientY)?.closest(".tile")?.dataset.id);
      acc = 0;
    }
  }, { passive: false });
}

/* ---------------- select & delete ---------------- */

function setSelecting(on, firstId) {
  state.selected = on ? new Set(firstId ? [firstId] : []) : null;
  state.armed = false;
  renderNow();
}
function toggleSelected(id) {
  const sel = state.selected;
  sel.has(id) ? sel.delete(id) : sel.add(id);
  state.armed = false;
  document.querySelector(`.tile[data-id="${id}"]`)?.classList.toggle("sel", sel.has(id));
  renderNav();
}
const selectedItems = () => state.items.filter((i) => state.selected?.has(i.id));

async function deleteItems(items) {
  try {
    await store.deleteItems(items);
    const gone = new Set(items.map((i) => i.id));
    state.items = state.items.filter((i) => !gone.has(i.id));
    // A link whose photos are all deleted goes too
    for (const id of new Set(items.map((i) => i.source_id).filter(Boolean))) {
      if (!state.items.some((i) => i.source_id === id)) await removeSource(id);
    }
    return true;
  } catch (e) {
    toast(`Couldn't delete: ${e.message}`);
    return false;
  } finally {
    render();
  }
}
async function removeSource(id) {
  await store.deleteSource(id);
  state.sources = state.sources.filter((s) => s.id !== id);
}

// Long-press a photo to start selecting, like Google Photos
let suppressClick = false;
function setupLongPress() {
  let timer = null, start = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  document.addEventListener("pointerdown", (e) => {
    const tile = e.target.closest?.("#view .tile");
    if (!tile || state.selected || e.button > 0 || state.view === "links") return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      timer = null;
      suppressClick = true;
      navigator.vibrate?.(10);
      setSelecting(true, tile.dataset.id);
    }, 450);
  });
  document.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  // The release after a long-press may or may not fire a click (iOS doesn't): ignore it briefly either way
  document.addEventListener("pointerup", () => { cancel(); if (suppressClick) setTimeout(() => (suppressClick = false), 350); });
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest?.(".tile")) e.preventDefault(); });
}

/* ---------------- viewer ---------------- */

const viewer = { list: [], index: 0, open: false };
const currentItem = () => state.items.find((i) => i.id === viewer.list[viewer.index]?.id);

function openViewer(id) {
  viewer.list = sections().flatMap((s) => s.items);
  viewer.index = Math.max(0, viewer.list.findIndex((i) => i.id === id));
  drawViewer();
  if (!viewer.open) { viewer.open = true; pushLayer(hideViewer); }
}
function drawViewer() {
  const el = $("#viewer");
  el.innerHTML = `
    <div class="strip">${viewer.list.map((i) => `<div class="slide"><img src="${esc(store.src(i, "full"))}" alt="" loading="lazy" decoding="async"></div>`).join("")}</div>
    <button class="vbtn close" data-v="close" aria-label="Close">${ICON.close}</button>
    <button class="vbtn trash" data-v="delete" aria-label="Delete">${ICON.trash}</button>
    <div class="cap"></div>`;
  el.hidden = false;
  document.body.style.overflow = "hidden";
  const strip = $(".strip", el);
  strip.scrollLeft = viewer.index * strip.clientWidth;
  drawCaption();
  let t;
  strip.addEventListener("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const i = Math.round(strip.scrollLeft / strip.clientWidth);
      if (i !== viewer.index) { viewer.index = i; drawCaption(); }
    }, 60);
  });
}
function hideViewer() {
  viewer.open = false;
  $("#viewer").hidden = true;
  $("#viewer").innerHTML = "";
  document.body.style.overflow = "";
}
function drawCaption() {
  const item = currentItem(), cap = $("#viewer .cap");
  if (!item || !cap) return;
  const s = sourceOf(item);
  const trash = $("#viewer .trash");
  trash.classList.remove("armed");
  trash.innerHTML = ICON.trash;
  cap.innerHTML = `
    ${s ? `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener"><b>${esc(s.title)}</b>${s.summary ? `<p>${esc(s.summary)}</p>` : ""}<small>${esc(host(s.url))} ↗</small></a>` : `<div class="src"></div>`}
    <label class="roompill">${ICON.sofa}${ROOMS[item.room] || (state.pending.has(item.id) ? "Sorting…" : "Room")}
      <select>${ROOMS[item.room] ? "" : `<option value="" disabled selected>Room</option>`}${Object.entries(ROOMS).map(([k, v]) => `<option value="${k}"${item.room === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>`;
}
async function onViewerClick(e) {
  const btn = e.target.closest("[data-v]");
  if (btn?.dataset.v === "close") return popLayer();
  if (btn?.dataset.v !== "delete") return;
  if (!btn.classList.contains("armed")) { btn.classList.add("armed"); btn.textContent = "Delete?"; return; }
  const item = currentItem();
  if (!item || !(await deleteItems([item]))) return;
  viewer.list = viewer.list.filter((i) => i.id !== item.id);
  if (!viewer.list.length) return popLayer();
  viewer.index = Math.min(viewer.index, viewer.list.length - 1);
  drawViewer();
}

/* ---------------- sheet ---------------- */

let sheetOpen = false;
function openSheet(html, mount) {
  const el = $("#sheet");
  el.innerHTML = html;
  el.hidden = false;
  el.scrollTop = 0;
  $("#backdrop").hidden = false;
  if (!sheetOpen) { sheetOpen = true; pushLayer(hideSheet); }
  mount?.(el);
}
function hideSheet() {
  sheetOpen = false;
  $("#sheet").hidden = true;
  $("#sheet").innerHTML = "";
  $("#backdrop").hidden = true;
}
const closeSheet = () => sheetOpen && popLayer();

function openAdd() {
  openSheet(`
    <div class="choices">
      <button data-s="paste">${ICON.paste}Paste link</button>
      <button data-s="photos">${ICON.image}Photos</button>
    </div>
    <form class="linkform">
      <input name="url" type="url" inputmode="url" placeholder="or type a link" autocomplete="off" required>
      <button aria-label="Add link">${ICON.go}</button>
    </form>`, (el) => {
    el.onclick = async (e) => {
      const s = e.target.closest("[data-s]")?.dataset.s;
      if (s === "photos") { $("#files").click(); closeSheet(); }
      if (s === "paste") {
        const url = firstUrl(await navigator.clipboard?.readText().catch(() => ""));
        if (!url) { toast("No link on your clipboard"); return $("input", el).focus(); }
        closeSheet();
        addLink(url);
      }
    };
    $("form", el).onsubmit = (e) => {
      e.preventDefault();
      const url = e.target.url.value;
      closeSheet();
      addLink(url);
    };
  });
}

/* ---------------- adding links ---------------- */

async function addLink(raw) {
  const url = cleanUrl(raw);
  toast("Reading link…", true);
  let page;
  try {
    page = await store.analyze(url);
  } catch (e) {
    return toast(`Couldn't read that link: ${e.message}`);
  }
  $("#toast").hidden = true;
  const existing = state.sources.find((s) => sameUrl(s.url, url) || sameUrl(s.url, page.url));
  if (page.kind === "listing") {
    // Listings are named by address; agents' page titles are usually slogans
    if (!/^\d/.test(page.title)) page.title = addressFromUrl(page.url) || addressFromUrl(url) || page.title;
    if (page.images.length > 1) return pickPhotos(page, existing);
  }
  const urls = (page.picked?.length ? page.picked : page.images.slice(0, 1)).slice(0, MAX_AUTO_IMAGES);
  saveLink(page, existing, urls, ROOMS[page.room] && page.room !== "other" ? page.room : null);
}

// A listing can have dozens of photos: tap the ones worth keeping
function pickPhotos(page, existing) {
  const had = new Set(existing ? state.items.filter((i) => i.source_id === existing.id).map((i) => i.origin_url) : []);
  const fresh = page.images.filter((u) => !had.has(u));
  const picked = new Set();
  openSheet(`
    <h3>${esc(existing?.title || page.title)}</h3>
    <p class="sub"><span>Tap the photos you like</span><button data-s="all">Select all</button></p>
    <div class="pick">${page.images.map((u) => `<button data-u="${esc(u)}" class="${had.has(u) ? "had" : ""}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("")}</div>
    <div class="foot"><button class="primary" data-s="add" disabled>Add photos</button></div>`, (el) => {
    const sync = () => {
      for (const b of el.querySelectorAll("[data-u]")) b.classList.toggle("sel", picked.has(b.dataset.u));
      $('[data-s="all"]', el).textContent = picked.size === fresh.length ? "Clear" : "Select all";
      const add = $('[data-s="add"]', el);
      add.disabled = !picked.size;
      add.textContent = picked.size ? `Add ${photos(picked.size)}` : "Add photos";
    };
    el.onclick = (e) => {
      const u = e.target.closest("[data-u]")?.dataset.u;
      const s = e.target.closest("[data-s]")?.dataset.s;
      if (u) picked.has(u) ? picked.delete(u) : picked.add(u);
      if (s === "all") { if (picked.size === fresh.length) picked.clear(); else fresh.forEach((x) => picked.add(x)); }
      if (s === "add") { closeSheet(); return saveLink(page, existing, [...picked], null); }
      sync();
    };
  });
}

async function saveLink(page, existing, urls, room) {
  let source = existing;
  try {
    if (!source) {
      source = await store.addSource({ url: cleanUrl(page.url), title: page.title, summary: page.summary || "" });
      state.sources.unshift(source);
    }
  } catch (e) {
    return toast(`Couldn't save: ${e.message}`);
  }
  const had = new Set(state.items.filter((i) => i.source_id === source.id).map((i) => i.origin_url));
  state.busy.add(source.id);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  await importImages(urls.filter((u) => !had.has(u)), source.id, () => room);
  state.busy.delete(source.id);
  render();
}

/* ---------------- photos in ---------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.referrerPolicy = "no-referrer";
    img.src = src;
  });
}
function toJpeg(img, max, quality) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't encode image"))), "image/jpeg", quality));
}
// A ~2000px copy and a ~640px thumbnail
async function processImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const [full, thumb] = await Promise.all([toJpeg(img, 2000, 0.85), toJpeg(img, 640, 0.8)]);
    return { full, thumb, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Runs `add` over the list a few at a time, showing progress
async function addAll(list, limit, add) {
  if (!list.length) return;
  let next = 0, done = 0, failed = 0;
  toast(`Adding ${photos(list.length)}…`, true);
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      try {
        const item = await add(list[next++]);
        state.items.unshift(item);
        if (!item.room) queueClassify(item);
        render();
      } catch (e) { console.warn(e); failed++; }
      toast(`Adding ${++done}/${list.length}…`, true);
    }
  }));
  toast(failed ? `Added ${photos(done - failed)}, ${failed} failed` : `Added ${photos(done)}`);
}

// Copies remote images into storage so they survive the listing coming down; links to the original if that fails
const importImages = (urls, sourceId, roomOf = () => null) => addAll(urls, 3, async (url) => {
  const row = { source_id: sourceId, origin_url: url, room: roomOf(url) };
  try {
    return await store.addPhoto({ ...(await processImage(await store.fetchImage(url))), ...row });
  } catch (e) {
    console.warn("copy failed, linking instead", url, e);
    const img = await loadImage(url);
    return store.addRemotePhoto({ ...row, remote_url: url, w: img.naturalWidth, h: img.naturalHeight });
  }
});
const uploadFiles = (files) => addAll(files, 2, async (file) => store.addPhoto({ ...(await processImage(file)), source_id: null, origin_url: null, room: null }));

/* ---------------- AI room sorting ---------------- */

const aiQueue = [];
let aiRunning = 0, aiOff = false;
function queueClassify(item) {
  if (store.mode !== "cloud" || aiOff) return;
  state.pending.add(item.id);
  aiQueue.push(item.id);
  pumpAi();
}
function pumpAi() {
  while (aiRunning < 3 && aiQueue.length) {
    const id = aiQueue.shift();
    const item = state.items.find((i) => i.id === id);
    if (!item) { state.pending.delete(id); continue; }
    aiRunning++;
    store.classify(item)
      .then((room) => {
        if (room) return patchItem(id, { room });
        aiOff = true; // no key or no credit: stop asking until the next visit
        aiQueue.length = 0;
        state.pending.clear();
      })
      .catch((e) => console.warn("classify failed", e))
      .finally(() => {
        aiRunning--;
        state.pending.delete(id);
        render();
        if (viewer.open) drawCaption();
        pumpAi();
      });
  }
}

async function patchItem(id, patch) {
  const before = state.items.find((i) => i.id === id);
  if (!before) return;
  const swap = (v) => (state.items = state.items.map((i) => (i.id === id ? v : i)));
  swap({ ...before, ...patch });
  render();
  try {
    await store.updateItem(id, patch);
  } catch (e) {
    swap(before);
    render();
    toast(`Couldn't save: ${e.message}`);
  }
}

/* ---------------- events ---------------- */

async function onAct(act, el) {
  const sel = state.selected;
  if (act === "add") openAdd();
  if (act === "view") {
    state.view = el.dataset.val;
    ls.set("view", state.view);
    window.scrollTo(0, 0);
    renderNow();
  }
  if (act === "cancel") setSelecting(false);
  if (act === "select-all") {
    const items = sections().find((s) => String(s.id) === el.dataset.id)?.items || [];
    const all = items.every((i) => sel.has(i.id));
    for (const i of items) all ? sel.delete(i.id) : sel.add(i.id);
    state.armed = false;
    renderNow();
  }
  if (act === "delete" && sel?.size) {
    if (!state.armed) {
      state.armed = true;
      renderNav();
      return toast(`Tap again to delete ${photos(sel.size)}`);
    }
    const items = selectedItems();
    if (await deleteItems(items)) toast(`Deleted ${photos(items.length)}`);
    setSelecting(false);
  }
  if (act === "remove-source") {
    const its = state.items.filter((i) => i.source_id === el.dataset.id);
    if (!el.classList.contains("armed")) {
      el.classList.add("armed");
      el.textContent = its.length ? `Remove + ${photos(its.length)}` : "Remove";
      return;
    }
    try {
      if (its.length) await store.deleteItems(its);
      state.items = state.items.filter((i) => i.source_id !== el.dataset.id);
      await removeSource(el.dataset.id);
    } catch (e) { toast(`Couldn't remove: ${e.message}`); }
    render();
  }
}

function bindEvents() {
  document.addEventListener("click", (e) => {
    const tile = e.target.closest("#view .tile");
    if (suppressClick) { suppressClick = false; if (tile) return; }
    if (tile) return state.selected ? toggleSelected(tile.dataset.id) : openViewer(tile.dataset.id);
    const el = e.target.closest("[data-act]");
    if (el && el.tagName !== "SELECT") onAct(el.dataset.act, el);
  });
  $("#nav").addEventListener("change", async (e) => { // move the selection to a room
    if (e.target.dataset.act !== "room" || !e.target.value) return;
    const room = e.target.value, items = selectedItems();
    setSelecting(false);
    await Promise.all(items.map((i) => patchItem(i.id, { room })));
    toast(`Moved ${photos(items.length)} to ${ROOMS[room]}`);
  });
  $("#backdrop").onclick = closeSheet;
  $("#viewer").onclick = onViewerClick;
  $("#viewer").addEventListener("change", async (e) => {
    const item = currentItem();
    if (!item) return;
    await patchItem(item.id, { room: e.target.value });
    drawCaption();
  });
  $("#files").onchange = (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    uploadFiles(files);
  };
  // Desktop: paste a link anywhere to add it
  document.addEventListener("paste", (e) => {
    if (e.target.closest?.("input")) return;
    const url = firstUrl(e.clipboardData?.getData("text"));
    if (url) { e.preventDefault(); closeSheet(); addLink(url); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, select")) return;
    if (viewer.open) {
      const strip = $("#viewer .strip");
      if (e.key === "ArrowRight") strip.scrollBy({ left: strip.clientWidth, behavior: "smooth" });
      if (e.key === "ArrowLeft") strip.scrollBy({ left: -strip.clientWidth, behavior: "smooth" });
      if (e.key === "Escape") popLayer();
      return;
    }
    if (e.key === "Escape") state.selected ? setSelecting(false) : closeSheet();
    if (e.key === "+" || e.key === "=") setZoom(state.zoom - 1);
    if (e.key === "-") setZoom(state.zoom + 1);
  });
  let w = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth !== w) { w = innerWidth; render(); } });
  setupZoom();
  setupLongPress();
}

/* ---------------- boot ---------------- */

function showLogin() {
  const el = $("#login");
  el.hidden = false;
  el.innerHTML = `<form>
    <h1>Moodboard</h1>
    <input name="email" type="email" placeholder="Email" autocomplete="email" required>
    <input name="password" type="password" placeholder="Password" autocomplete="current-password" minlength="6" required>
    <p class="err"></p>
    <button class="primary">Sign in</button>
    <button class="ghost" name="up" type="button">Create account</button>
  </form>`;
  const form = $("form", el);
  const go = async (fn) => {
    $(".err", el).textContent = "";
    if (!form.reportValidity()) return;
    try {
      await fn(form.email.value.trim(), form.password.value);
      el.hidden = true;
      start();
    } catch (e) { $(".err", el).textContent = e.message; }
  };
  form.onsubmit = (e) => { e.preventDefault(); go((a, b) => store.signIn(a, b)); };
  form.up.onclick = () => go((a, b) => store.signUp(a, b));
}

async function seedIfEmpty() {
  const key = `seeded:${store.user.id}`;
  if (state.items.length || state.sources.length || ls.get(key, false)) return;
  ls.set(key, true);
  const source = await store.addSource(SEED.source);
  state.sources.unshift(source);
  await importImages(SEED.photos.map((p) => p.url), source.id, (url) => SEED.photos.find((p) => p.url === url).room);
}

async function start() {
  try {
    Object.assign(state, await store.load());
  } catch (e) {
    toast(`Couldn't load your board: ${e.message}`);
  }
  renderNow();
  state.items.filter((i) => !i.room).forEach(queueClassify); // sort anything AI missed last time
  // Installed on Android, the share sheet opens the app with ?url= or ?text=
  const q = new URLSearchParams(location.search);
  const shared = firstUrl(q.get("url")) || firstUrl(q.get("text")) || firstUrl(q.get("title"));
  if (shared) { history.replaceState(null, "", location.pathname); addLink(shared); }
  else seedIfEmpty().catch((e) => console.warn("seed failed", e));
}

async function boot() {
  bindEvents();
  try {
    store = await createStore(config);
  } catch (e) {
    $("#view").innerHTML = `<div class="empty"><b>Couldn't connect</b>${esc(e.message)}</div>`;
    return;
  }
  if (store.mode === "cloud" && !store.user) showLogin(); else start();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
