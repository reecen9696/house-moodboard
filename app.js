import { config } from "./config.js";
import { createStore } from "./store.js";
import { SEED } from "./seed.js";

/* ---------------- constants & helpers ---------------- */

const ROOMS = {
  living: "Living", kitchen: "Kitchen", dining: "Dining", bedroom: "Bedroom", bathroom: "Bathroom",
  laundry: "Laundry", study: "Study", hallway: "Hallway", facade: "Facade", garden: "Garden",
  outdoor: "Outdoor", pool: "Pool", floorplan: "Floor plan", other: "Other",
};
const ROOM_ORDER = Object.keys(ROOMS);
// Target tile width per zoom level (level 0 = one column). Levels ≥3 switch to a square grid.
const ZOOM = [0, 200, 140, 100, 70, 46];
const MAX_IDEA_IMAGES = 6;

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TRACKING = /^(utm_|fbclid|gclid|mc_|igshid|si$|ref$|ref_src)/i;
function cleanUrl(u) {
  try {
    const url = new URL(u.trim());
    for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
    url.hash = "";
    return url.href;
  } catch { return u.trim(); }
}
const sameUrl = (a, b) => a && b && cleanUrl(a).replace(/\/$/, "").toLowerCase() === cleanUrl(b).replace(/\/$/, "").toLowerCase();
const firstUrl = (text) => text?.match(/https?:\/\/\S+/)?.[0]?.replace(/[)\].,'"]+$/, "") || null;

// "property-details-21-Heller-Street-Brunswick" → "21 Heller Street Brunswick"
function addressFromUrl(u) {
  try {
    for (let seg of new URL(u).pathname.split("/")) {
      seg = seg.replace(/^property-(?:details|house|unit|apartment|townhouse|villa|land)-/i, "");
      const m = seg.match(/^(\d+[a-z]?(?:-\d+[a-z]?)?)-([a-z]+(?:-[a-z]+)*?)(?:-(?:vic|nsw|qld|wa|sa|tas|act|nt))?(?:-\d{4})?(?:-\d+)?$/i);
      if (m && /[a-z]{3,}/i.test(m[2])) {
        return `${m[1].replace("-", "/")} ${m[2].replace(/-/g, " ")}`.replace(/\b[a-z]/g, (c) => c.toUpperCase());
      }
    }
  } catch { /* not a URL */ }
  return null;
}

function cssColor(name) {
  const n = String(name).toLowerCase().replace(/[^a-z ]/g, "").trim();
  for (const c of [n.replace(/ /g, ""), n.split(" ").pop()]) if (c && CSS.supports("color", c)) return c;
  return "transparent";
}

const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  paste: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
};

/* ---------------- state ---------------- */

const state = {
  items: [],
  properties: [],
  view: "photos", // photos | houses | ideas | rooms
  group: ls.get("group", "date"), // date | property | room
  zoom: ls.get("zoom", 1),
  filter: { property: null, room: null, fav: false, tag: null },
  q: "",
  pending: new Set(), // item ids waiting on AI
  selecting: false,
  selected: new Set(),
};
let store;
const propById = (id) => state.properties.find((p) => p.id === id);
const itemsOf = (pid) => state.items.filter((i) => i.property_id === pid);
const isListing = (p) => (p.kind || "listing") === "listing";
const loaded = new Set(); // image srcs already decoded, so re-renders don't flash
window.__l = (img) => { img.classList.add("loaded"); loaded.add(img.getAttribute("src")); };

/* ---------------- modal stack (Android back / browser back closes the top layer) ---------------- */

const modals = [];
function pushModal(close) { modals.push(close); history.pushState({ modal: modals.length }, ""); }
window.addEventListener("popstate", () => { const close = modals.pop(); if (close) close(); });
const popModal = () => history.back();

/* ---------------- toast ---------------- */

let toastTimer;
function toast(msg, { action, onAction, ms = 3200, sticky = false } = {}) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ""}`;
  el.hidden = false;
  if (action) el.querySelector("button").onclick = () => { el.hidden = true; onAction?.(); };
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => (el.hidden = true), ms);
}
const hideToast = () => ($("#toast").hidden = true);

/* ---------------- rendering ---------------- */

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderNow(); });
}

function renderNow() {
  const { view, filter } = state;
  const titles = { photos: "Photos", houses: "Houses", ideas: "Ideas", rooms: "Rooms" };
  $("#title").textContent = titles[view];
  for (const b of document.querySelectorAll("#tabs button")) b.classList.toggle("on", b.dataset.view === view);
  $("#toolbar").hidden = view !== "photos";
  if (view !== "photos" && state.selecting) exitSelect(false);
  renderSelectBar();
  for (const b of document.querySelectorAll("#groupSeg button")) b.classList.toggle("on", b.dataset.group === state.group);
  $("#banner").innerHTML = view === "photos" && filter.property ? bannerHtml(propById(filter.property)) : "";
  if (view === "photos") { renderChips(); $("#view").innerHTML = photosHtml(); }
  if (view === "houses") $("#view").innerHTML = cardsHtml(state.properties.filter(isListing), "houses");
  if (view === "ideas") $("#view").innerHTML = cardsHtml(state.properties.filter((p) => !isListing(p)), "ideas");
  if (view === "rooms") $("#view").innerHTML = roomsHtml();
}

function visibleItems() {
  const { property, room, fav, tag } = state.filter;
  const q = state.q.trim().toLowerCase();
  return state.items.filter((i) =>
    (!property || i.property_id === property) && (!room || i.room === room) && (!fav || i.fav) &&
    (!tag || i.tags?.includes(tag)) && (!q || haystack(i).includes(q)));
}
function haystack(i) {
  const p = propById(i.property_id);
  return [i.note, i.style, ROOMS[i.room], ...(i.tags || []), ...(i.features || []), ...(i.palette || []),
    p?.title, p?.summary, p?.description, ...(p?.tags || [])].join(" ").toLowerCase();
}

function renderChips() {
  const base = state.items.filter((i) => !state.filter.property || i.property_id === state.filter.property);
  const counts = {};
  for (const i of base) if (i.room) counts[i.room] = (counts[i.room] || 0) + 1;
  const tags = [...new Set(base.flatMap((i) => i.tags || []))].sort();
  const f = state.filter;
  const chip = (act, val, label, on, n) =>
    `<button class="chip${on ? " on" : ""}" data-act="${act}" data-val="${esc(val)}">${label}${n ? ` <span class="n">${n}</span>` : ""}</button>`;
  $("#chips").innerHTML = [
    chip("filter-all", "", "All", !f.room && !f.fav && !f.tag),
    base.some((i) => i.fav) ? chip("filter-fav", "", "♥ Favourites", f.fav) : "",
    ...ROOM_ORDER.filter((r) => counts[r]).map((r) => chip("filter-room", r, ROOMS[r], f.room === r, counts[r])),
    ...tags.map((t) => chip("filter-tag", t, `#${esc(t)}`, f.tag === t)),
  ].join("");
}

function bannerHtml(p) {
  if (!p) return "";
  const cover = p.cover_url || (itemsOf(p.id)[0] && store.src(itemsOf(p.id)[0]));
  return `<div class="banner">
    ${cover ? `<img src="${esc(cover)}" alt="">` : ""}
    <div class="meta">
      <b>${esc(p.title)}</b>
      <small>${esc(p.summary || p.description || host(p.url))}</small>
      <div class="row">
        ${p.url ? `<a class="pill" href="${esc(p.url)}" target="_blank" rel="noopener">${ICON.ext}${esc(host(p.url))}</a>` : ""}
        ${p.url && isListing(p) ? `<button class="pill" data-act="reimport" data-id="${p.id}">${ICON.plus}Photos</button>` : ""}
        <button class="pill" data-act="edit-prop" data-id="${p.id}">Edit</button>
      </div>
    </div>
    <button class="close-x" data-act="clear-prop" aria-label="Close">${ICON.close}</button>
  </div>`;
}

function photosHtml() {
  const list = visibleItems();
  if (!list.length) return emptyHtml();
  const width = $("#main").clientWidth - 32;
  const z = clamp(state.zoom, 0, ZOOM.length - 1);
  const cols = z === 0 ? 1 : Math.max(2, Math.round(width / ZOOM[z]));
  const masonry = z <= 2;
  return groupItems(list).map((g) => `
    <section class="group">
      <div class="group-head"><h2>${esc(g.label)}</h2>${groupLink(g)}</div>
      ${masonry ? masonryHtml(g.items, cols, z) : gridHtml(g.items, cols, z)}
    </section>`).join("");
}

function groupItems(list) {
  const map = new Map();
  const thisYear = new Date().getFullYear();
  for (const i of list) {
    let key, label, extra = {};
    if (state.group === "date") {
      const d = new Date(i.created_at);
      key = `${d.getFullYear()}-${d.getMonth()}`;
      label = d.toLocaleDateString(undefined, d.getFullYear() === thisYear ? { month: "long" } : { month: "long", year: "numeric" });
    } else if (state.group === "property") {
      const p = propById(i.property_id);
      key = p?.id || "_";
      label = p ? p.title : "My uploads";
      extra = { property: p };
    } else {
      key = i.room || "_";
      label = ROOMS[i.room] || "Unsorted";
      extra = { room: i.room };
    }
    if (!map.has(key)) map.set(key, { key, label, items: [], ...extra });
    map.get(key).items.push(i);
  }
  const groups = [...map.values()];
  if (state.group === "room") groups.sort((a, b) => (ROOM_ORDER.indexOf(a.room) + 1 || 99) - (ROOM_ORDER.indexOf(b.room) + 1 || 99));
  return groups;
}

function groupLink(g) {
  const n = `<span class="count">${g.items.length}</span>`;
  if (state.selecting) {
    const all = g.items.every((i) => state.selected.has(i.id));
    return `<button data-act="sel-group" data-val="${esc(g.key)}">${all ? "Deselect" : "Select all"}</button>`;
  }
  if (g.property && !state.filter.property) return `<button data-act="open-prop" data-id="${g.property.id}">${n}&nbsp; View →</button>`;
  if (g.room && !state.filter.room && state.group === "room") return `<button data-act="filter-room" data-val="${g.room}">${n}&nbsp; View →</button>`;
  return n;
}

function tileHtml(i, style, z) {
  const src = store.src(i, z === 0 ? "full" : "thumb");
  const isLoaded = loaded.has(src);
  return `<button class="tile${state.pending.has(i.id) ? " pending" : ""}${state.selected.has(i.id) ? " sel" : ""}" data-id="${i.id}" style="${style}">
    <img src="${esc(src)}" alt="" decoding="async" loading="lazy" ${isLoaded ? 'class="loaded"' : 'onload="__l(this)"'} onerror="this.classList.add('loaded')">
    ${i.fav ? `<span class="fav">${ICON.heart}</span>` : ""}
    ${z <= 1 && i.room && state.group !== "room" ? `<span class="room">${ROOMS[i.room] || i.room}</span>` : ""}
  </button>`;
}

function masonryHtml(items, cols, z) {
  const columns = Array.from({ length: cols }, () => ({ h: 0, html: "" }));
  for (const i of items) {
    const ratio = i.w && i.h ? i.h / i.w : 0.75;
    const c = columns.reduce((a, b) => (b.h < a.h - 0.01 ? b : a));
    c.h += ratio;
    c.html += tileHtml(i, `aspect-ratio:${i.w || 4}/${i.h || 3}`, z);
  }
  return `<div class="masonry${z === 0 ? " zoom-1" : ""}">${columns.map((c) => `<div class="col">${c.html}</div>`).join("")}</div>`;
}

function gridHtml(items, cols, z) {
  return `<div class="grid${z >= 4 ? " dense" : ""}" style="grid-template-columns:repeat(${cols},1fr)">${items.map((i) => tileHtml(i, "", z)).join("")}</div>`;
}

function emptyHtml() {
  if (state.items.length) {
    return `<div class="empty"><h3>Nothing matches</h3><p>Try another filter or search.</p>
      <button class="btn ghost" data-act="filter-all">Show everything</button></div>`;
  }
  return `<div class="empty"><h3>Start your board</h3>
    <p>Paste a link to a listing, article or product, or add photos. AI sorts them by room for you.</p>
    <button class="btn" data-act="add">Add something</button></div>`;
}

function cardsHtml(props, kind) {
  const loose = kind === "houses" ? state.items.filter((i) => !i.property_id) : [];
  if (!props.length && !loose.length) {
    return `<div class="empty"><h3>No ${kind} yet</h3>
      <p>${kind === "houses" ? "Paste a listing link from any agent site." : "Paste a link to anything you like: an article, Pinterest pin, product or post."}</p>
      <button class="btn" data-act="add">Paste a link</button></div>`;
  }
  const card = (id, title, sub, summary, thumbs, cover) => {
    const imgs = thumbs.length ? thumbs.slice(0, 3) : cover ? [cover] : [];
    return `<button class="card" data-act="open-prop" data-id="${id}">
      <div class="cover${imgs.length < 3 ? " single" : ""}">${imgs.map((s) => `<img src="${esc(s)}" alt="" loading="lazy">`).join("")}</div>
      <div class="body"><b>${esc(title)}</b>${summary ? `<p class="note" style="margin:4px 0 6px">${esc(summary)}</p>` : ""}<small>${esc(sub)}</small></div>
    </button>`;
  };
  return `<div class="cards">${props.map((p) => {
    const its = itemsOf(p.id);
    const sub = [host(p.url), its.length ? `${its.length} photo${its.length === 1 ? "" : "s"}` : "", ROOMS[p.room] && p.room !== "other" ? ROOMS[p.room] : ""].filter(Boolean).join(" · ");
    return card(p.id, p.title, sub, kind === "ideas" ? p.summary : "", its.map((i) => store.src(i)), p.cover_url);
  }).join("")}${loose.length ? card("_mine", "My uploads", `${loose.length} photos`, "", loose.map((i) => store.src(i))) : ""}</div>`;
}

function roomsHtml() {
  const counts = {};
  for (const i of state.items) counts[i.room || "_"] = (counts[i.room || "_"] || 0) + 1;
  const firstOf = (fn) => state.items.find(fn);
  const album = (act, val, label, n, item) => `<button class="album" data-act="${act}" data-val="${esc(val)}">
    <div class="thumb">${item ? `<img src="${esc(store.src(item))}" alt="" loading="lazy">` : ""}</div>
    <b>${esc(label)}</b><small>${n}</small></button>`;
  const favs = state.items.filter((i) => i.fav);
  const rooms = ROOM_ORDER.filter((r) => counts[r]);
  if (!rooms.length && !favs.length) return `<div class="empty"><h3>No rooms yet</h3><p>Photos are sorted into rooms automatically as you add them.</p></div>`;
  return `<div class="albums">
    ${favs.length ? album("open-fav", "", "Favourites", favs.length, favs[0]) : ""}
    ${rooms.map((r) => album("open-room", r, ROOMS[r], counts[r], firstOf((i) => i.room === r))).join("")}
    ${counts._ ? album("open-room", "_", "Unsorted", counts._, firstOf((i) => !i.room)) : ""}
  </div>`;
}

/* ---------------- zoom (pinch, ctrl+wheel, keys) ---------------- */

function setZoom(z, anchorId) {
  z = clamp(z, 0, ZOOM.length - 1);
  if (z === state.zoom) return;
  const anchorEl = anchorId && document.querySelector(`.tile[data-id="${anchorId}"]`);
  const before = anchorEl?.getBoundingClientRect().top;
  state.zoom = z;
  ls.set("zoom", z);
  renderNow();
  const after = anchorId && document.querySelector(`.tile[data-id="${anchorId}"]`);
  if (after && before !== undefined) window.scrollBy(0, after.getBoundingClientRect().top - before);
}

function setupPinch() {
  const main = $("#main"), view = $("#view");
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let pinch = null;
  main.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 2 || state.view !== "photos") return;
    const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const tile = document.elementFromPoint(mx, my)?.closest(".tile");
    const r = view.getBoundingClientRect();
    view.style.transformOrigin = `${mx - r.left}px ${my - r.top}px`;
    view.classList.add("pinching");
    pinch = { d0: dist(e.touches), s: 1, anchor: tile?.dataset.id };
  }, { passive: true });
  main.addEventListener("touchmove", (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    pinch.s = dist(e.touches) / pinch.d0;
    view.style.transform = `scale(${clamp(pinch.s, 0.5, 2)})`;
  }, { passive: false });
  const end = (e) => {
    if (!pinch || e.touches.length >= 2) return;
    const { s, anchor } = pinch;
    pinch = null;
    view.style.transform = "";
    view.classList.remove("pinching");
    const steps = s > 1.15 ? -(s > 1.7 ? 2 : 1) : s < 0.87 ? (s < 0.6 ? 2 : 1) : 0;
    if (steps) setZoom(state.zoom + steps, anchor);
  };
  main.addEventListener("touchend", end);
  main.addEventListener("touchcancel", end);
  document.addEventListener("gesturestart", (e) => e.preventDefault()); // stop iOS page zoom

  // Trackpad pinch arrives as ctrl+wheel
  let acc = 0, accTimer;
  window.addEventListener("wheel", (e) => {
    if (!e.ctrlKey || state.view !== "photos") return;
    e.preventDefault();
    acc += e.deltaY;
    clearTimeout(accTimer);
    accTimer = setTimeout(() => (acc = 0), 250);
    if (Math.abs(acc) > 40) {
      const tile = document.elementFromPoint(e.clientX, e.clientY)?.closest(".tile");
      setZoom(state.zoom + Math.sign(acc), tile?.dataset.id);
      acc = 0;
    }
  }, { passive: false });
}

/* ---------------- multi-select ---------------- */

function enterSelect(firstId) {
  state.selecting = true;
  state.selected = new Set(firstId ? [firstId] : []);
  navigator.vibrate?.(10);
  renderNow();
}
function exitSelect(rerender = true) {
  state.selecting = false;
  state.selected.clear();
  if (rerender) renderNow();
}
function toggleSelected(id) {
  state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
  document.querySelector(`.tile[data-id="${id}"]`)?.classList.toggle("sel", state.selected.has(id));
  renderSelectBar();
}
function renderSelectBar() {
  const on = state.selecting && state.view === "photos";
  document.body.classList.toggle("select-mode", on);
  $("#view").classList.toggle("selecting", on);
  $("#selectBar").hidden = !on;
  $("#selectBtn").textContent = on ? "Done" : "Select";
  if (!on) return;
  const n = state.selected.size;
  $("#selCount").textContent = n ? `${n} selected` : "Tap photos";
  const del = $('#selectBar [data-b="delete"]');
  del.textContent = "Delete";
  del.dataset.armed = "";
  for (const b of $("#selectBar").querySelectorAll(".sel-actions .pill")) b.style.opacity = n ? 1 : 0.4;
  $('#selectBar [data-b="room"]').innerHTML = `<option value="" disabled selected>Room</option>${ROOM_ORDER.map((r) => `<option value="${r}">${ROOMS[r]}</option>`).join("")}`;
}
const selectedItems = () => state.items.filter((i) => state.selected.has(i.id));

async function bulkDelete() {
  const items = selectedItems();
  if (!items.length) return;
  toast(`Deleting ${items.length}…`, { sticky: true });
  try {
    await store.deleteItems(items);
    const ids = new Set(items.map((i) => i.id));
    state.items = state.items.filter((i) => !ids.has(i.id));
    toast(`Deleted ${items.length} photo${items.length === 1 ? "" : "s"}`);
    exitSelect();
  } catch (e) { toast(`Couldn't delete: ${e.message}`); }
}

async function bulkPatch(patchFor) {
  const items = selectedItems();
  await Promise.all(items.map((i) => patchItem(i.id, patchFor(i))));
  exitSelect();
}

function onSelectBar(e) {
  const b = e.target.closest("[data-b]")?.dataset.b;
  if (b === "cancel") return exitSelect();
  if (!state.selected.size) return;
  if (b === "fav") {
    const allFav = selectedItems().every((i) => i.fav);
    bulkPatch(() => ({ fav: !allFav }));
  }
  if (b === "delete") {
    const btn = e.target.closest("[data-b]");
    if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = `Delete ${state.selected.size}?`; return; }
    bulkDelete();
  }
}

// Long-press a tile to start selecting (like Google Photos)
function setupLongPress() {
  let timer = null, start = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  document.addEventListener("pointerdown", (e) => {
    const tile = e.target.closest?.("#view .tile");
    if (!tile || state.selecting || e.button > 0) return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      timer = null;
      suppressClick = true;
      enterSelect(tile.dataset.id);
    }, 450);
  });
  document.addEventListener("pointermove", (e) => {
    if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  });
  document.addEventListener("pointerup", cancel);
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest?.(".tile")) e.preventDefault(); });
}
let suppressClick = false;

/* ---------------- viewer ---------------- */

const viewer = { list: [], index: 0, open: false, expanded: false };

function openViewer(list, index) {
  const el = $("#viewer");
  viewer.list = list;
  viewer.index = index;
  el.innerHTML = `
    <div class="vtop">
      <button class="vbtn" data-v="close" aria-label="Close">${ICON.close}</button>
      <div class="right">
        <button class="vbtn" data-v="info" aria-label="Details">${ICON.info}</button>
        <button class="vbtn" data-v="fav" aria-label="Favourite">${ICON.heart}</button>
        <button class="vbtn" data-v="delete" aria-label="Delete">${ICON.trash}</button>
      </div>
    </div>
    <div class="strip">${list.map((i) => `<div class="slide"><img src="${esc(store.src(i, "full"))}" alt="" loading="lazy" decoding="async"></div>`).join("")}</div>
    <div class="info${viewer.expanded ? "" : " collapsed"}"></div>`;
  el.hidden = false;
  document.body.style.overflow = "hidden";
  const strip = $(".strip", el);
  requestAnimationFrame(() => { strip.scrollLeft = index * strip.clientWidth; renderInfo(); });
  let t;
  strip.addEventListener("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const i = Math.round(strip.scrollLeft / strip.clientWidth);
      if (i !== viewer.index) { viewer.index = i; renderInfo(); }
    }, 60);
  });
  if (!viewer.open) { viewer.open = true; pushModal(closeViewerNow); }
}

function closeViewerNow() {
  viewer.open = false;
  $("#viewer").hidden = true;
  $("#viewer").innerHTML = "";
  document.body.style.overflow = "";
}

function renderInfo() {
  const item = state.items.find((i) => i.id === viewer.list[viewer.index]?.id);
  const el = $("#viewer .info");
  if (!item || !el) return;
  $('#viewer [data-v="fav"]').classList.toggle("on", !!item.fav);
  const p = propById(item.property_id);
  const pending = state.pending.has(item.id);
  el.innerHTML = `
    ${p ? `<a class="src" href="${esc(p.url || "#")}" target="_blank" rel="noopener">
      <div><b>${esc(p.title)}</b><small>${esc([ROOMS[item.room], host(p.url)].filter(Boolean).join(" · "))}</small></div><span class="go">${ICON.ext}</span></a>`
      : `<div class="src"><div><b>${esc(ROOMS[item.room] || (pending ? "Sorting…" : "My upload"))}</b><small>${esc(new Date(item.created_at).toLocaleDateString())}</small></div></div>`}
    <div class="more">
      ${p?.summary && !isListing(p) ? `<p class="note" style="margin:10px 0 0">${esc(p.summary)}</p>` : ""}
      <label class="lbl">Room</label>
      <select class="field" data-i="room">
        <option value="">${pending ? "Sorting…" : "Unsorted"}</option>
        ${ROOM_ORDER.map((r) => `<option value="${r}"${item.room === r ? " selected" : ""}>${ROOMS[r]}</option>`).join("")}
      </select>
      ${item.features?.length || item.style ? `<label class="lbl">Details</label>
        <div class="tagrow">${[item.style, ...(item.features || [])].filter(Boolean).map((f) => `<button class="chip" data-i="search" data-val="${esc(f)}">${esc(f)}</button>`).join("")}</div>` : ""}
      ${item.palette?.length ? `<label class="lbl">Palette</label>
        <div class="palette">${item.palette.map((c) => `<span><i style="background:${cssColor(c)}"></i>${esc(c)}</span>`).join("")}</div>` : ""}
      <label class="lbl">Your tags</label>
      <div class="tagrow">
        ${(item.tags || []).map((t) => `<button class="chip on" data-i="untag" data-val="${esc(t)}">#${esc(t)} ×</button>`).join("")}
        <button class="chip add" data-i="tag">+ Tag</button>
      </div>
      <label class="lbl">Note</label>
      <textarea class="field" data-i="note" rows="2" placeholder="Why you like it…">${esc(item.note)}</textarea>
      ${store.mode === "cloud" ? `<div class="actions"><button class="btn ghost" data-i="ai">${pending ? "Sorting…" : "Re-run AI"}</button></div>` : ""}
    </div>`;
}

async function onViewerClick(e) {
  const v = e.target.closest("[data-v]")?.dataset.v;
  const i = e.target.closest("[data-i]");
  const item = state.items.find((x) => x.id === viewer.list[viewer.index]?.id);
  if (v === "close") return popModal();
  if (v === "info") { viewer.expanded = !viewer.expanded; return $("#viewer .info").classList.toggle("collapsed", !viewer.expanded); }
  if (v === "delete" && item) {
    const btn = e.target.closest("[data-v]");
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.classList.add("armed");
      btn.innerHTML = "Delete?";
      return;
    }
    return deleteFromViewer(item);
  }
  if (v === "fav" && item) { await patchItem(item.id, { fav: !item.fav }); return renderInfo(); }
  if (!i || !item) return;
  const act = i.dataset.i;
  if (act === "search") { popModal(); openSearch(i.dataset.val); }
  if (act === "untag") { await patchItem(item.id, { tags: item.tags.filter((t) => t !== i.dataset.val) }); renderInfo(); }
  if (act === "tag") {
    i.outerHTML = `<input class="field" style="height:34px;width:140px;border-radius:999px" data-i="tag-input" placeholder="tag" enterkeyhint="done" autocapitalize="off">`;
    const input = $('#viewer [data-i="tag-input"]');
    input.focus();
    const save = async () => {
      const t = input.value.trim().toLowerCase().replace(/^#/, "");
      if (t && !item.tags?.includes(t)) await patchItem(item.id, { tags: [...(item.tags || []), t] });
      renderInfo();
    };
    input.addEventListener("keydown", (ev) => ev.key === "Enter" && input.blur());
    input.addEventListener("blur", save, { once: true });
  }
  if (act === "ai") { queueClassify(item, { force: true }); renderInfo(); }
}

async function deleteFromViewer(item) {
  await removeItem(item);
  viewer.list = viewer.list.filter((x) => x.id !== item.id);
  if (!viewer.list.length) return popModal();
  viewer.index = Math.min(viewer.index, viewer.list.length - 1);
  openViewer(viewer.list, viewer.index);
}

/* ---------------- sheet ---------------- */

let sheetOpen = false;
function openSheet(html, mount) {
  const el = $("#sheet");
  el.innerHTML = `<div class="grab"></div>${html}`;
  el.hidden = false;
  $("#sheetBackdrop").hidden = false;
  el.scrollTop = 0;
  if (!sheetOpen) { sheetOpen = true; pushModal(hideSheet); }
  mount?.(el);
}
function hideSheet() {
  sheetOpen = false;
  $("#sheet").hidden = true;
  $("#sheetBackdrop").hidden = true;
  $("#sheet").innerHTML = "";
}
const closeSheet = () => sheetOpen && popModal();

function openAddSheet() {
  const canPaste = !!navigator.clipboard?.readText;
  openSheet(`
    <h3>Add to board</h3>
    ${canPaste ? `<button class="btn block" data-s="paste" style="height:58px;font-size:16px">${ICON.paste} Paste link</button>
      <p class="note" style="text-align:center;margin:8px 0 0">Listings, articles, products, Pinterest… AI files it for you.</p>` : ""}
    <label class="lbl">${canPaste ? "Or type a link" : "Link"}</label>
    <form class="link-row" data-s="link-form">
      <input class="field" type="url" name="url" placeholder="https://…" inputmode="url" autocomplete="off" required>
      <button class="btn">Add</button>
    </form>
    <label class="lbl">Photos</label>
    <div class="big-actions">
      <button class="big-action" data-s="upload">${ICON.image}Upload<small>From your library</small></button>
      <button class="big-action" data-s="camera">${ICON.camera}Camera<small>Snap an idea</small></button>
    </div>`, (el) => {
    el.onclick = async (e) => {
      const s = e.target.closest("[data-s]")?.dataset.s;
      if (s === "upload") $("#fileInput").click();
      if (s === "camera") $("#cameraInput").click();
      if (s === "paste") {
        try {
          const text = await navigator.clipboard.readText();
          const url = firstUrl(text);
          if (!url) return toast("No link on the clipboard");
          closeSheet();
          addLink(url);
        } catch { toast("Clipboard blocked. Paste into the box instead"); }
      }
    };
    $('[data-s="link-form"]', el).onsubmit = (e) => {
      e.preventDefault();
      const url = firstUrl(e.target.url.value) || e.target.url.value;
      closeSheet();
      addLink(url);
    };
  });
}

/* ---------------- adding links ---------------- */

async function addLink(rawUrl, existing = null) {
  const url = cleanUrl(rawUrl);
  existing ||= state.properties.find((p) => sameUrl(p.url, url));
  toast("Reading link…", { sticky: true });
  let page;
  try {
    page = await store.analyze(url);
  } catch (e) {
    return toast(`Couldn't read that link: ${e.message}`, { ms: 5000 });
  }
  hideToast();
  if (page.kind === "listing" && page.images.length > 1) return openListingPicker(url, page, existing);
  await saveIdea(url, page, existing);
}

async function saveIdea(url, page, existing) {
  const picked = (page.picked?.length ? page.picked : page.limited ? page.images : []).slice(0, MAX_IDEA_IMAGES);
  const prop = existing || await addProperty({
    url: cleanUrl(page.url || url),
    title: page.title,
    description: page.description || "",
    summary: page.summary || "",
    kind: page.kind || "idea",
    room: page.room || null,
    tags: page.tags || [],
    cover_url: picked[0] || page.image || null,
  });
  if (!prop) return;
  const had = new Set(itemsOf(prop.id).map((i) => i.source_url));
  const fresh = picked.filter((u) => !had.has(u));
  toast(`Saved “${prop.title}”`, { action: "View", onAction: () => openProperty(prop.id) });
  const room = page.room && page.room !== "other" ? page.room : null;
  await importRemote(fresh, prop.id, Object.fromEntries(fresh.map((u) => [u, room])), { quiet: true });
}

function openListingPicker(url, page, existing) {
  const had = new Set(existing ? itemsOf(existing.id).map((i) => i.source_url) : []);
  const title = existing?.title || (page.title && page.title.length < 60 && /^\d/.test(page.title) ? page.title : addressFromUrl(page.url || url) || page.title);
  let showOthers = false;
  const selected = new Set();
  const draw = () => {
    const imgs = showOthers ? [...page.images, ...page.others] : page.images;
    openSheet(`
      <h3>${esc(title)}</h3>
      <p class="sub">${esc(page.summary || page.description || host(url))}</p>
      <div class="pick-head"><b>Tap the photos you like</b><button data-s="all">${selected.size === imgs.filter((u) => !had.has(u)).length ? "Clear" : "Select all"}</button></div>
      <div class="pick">${imgs.map((u) => `<button data-u="${esc(u)}" class="${selected.has(u) ? "sel" : ""}${had.has(u) ? " had" : ""}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("")}</div>
      ${page.others?.length && !showOthers ? `<p style="text-align:center"><button class="pill" data-s="more">Show ${page.others.length} more images from the page</button></p>` : ""}
      <div class="sheet-actions">
        ${existing ? "" : `<button class="btn ghost" data-s="link">Just the link</button>`}
        <button class="btn" data-s="add" ${selected.size ? "" : "disabled"}>Add ${selected.size || ""} photo${selected.size === 1 ? "" : "s"}</button>
      </div>`, (el) => {
      el.onclick = async (e) => {
        const u = e.target.closest("[data-u]");
        const s = e.target.closest("[data-s]")?.dataset.s;
        if (u) {
          const key = u.dataset.u;
          selected.has(key) ? selected.delete(key) : selected.add(key);
          u.classList.toggle("sel", selected.has(key));
          const btn = $('[data-s="add"]', el);
          btn.disabled = !selected.size;
          btn.textContent = `Add ${selected.size || ""} photo${selected.size === 1 ? "" : "s"}`;
          return;
        }
        if (s === "all") {
          const avail = imgs.filter((x) => !had.has(x));
          if (selected.size === avail.length) selected.clear(); else avail.forEach((x) => selected.add(x));
          return draw();
        }
        if (s === "more") { showOthers = true; return draw(); }
        if (s === "link" || s === "add") {
          closeSheet();
          const prop = existing || await addProperty({
            url: cleanUrl(page.url || url), title, description: page.description || "", summary: page.summary || "",
            kind: "listing", room: null, tags: page.tags || [], cover_url: page.images[0] || page.image,
          });
          if (!prop) return;
          if (s === "add") {
            openProperty(prop.id);
            await importRemote([...selected], prop.id);
          } else toast(`Saved “${prop.title}”`, { action: "View", onAction: () => openProperty(prop.id) });
        }
      };
    });
  };
  draw();
}

async function addProperty(row) {
  try {
    const p = await store.addProperty(row);
    state.properties.unshift(p);
    render();
    return p;
  } catch (e) {
    toast(`Couldn't save: ${e.message}`, { ms: 5000 });
    return null;
  }
}

/* ---------------- images in ---------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.referrerPolicy = "no-referrer";
    img.src = src;
  });
}

function toJpeg(img, w, h, max, quality) {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't encode image"))), "image/jpeg", quality));
}

// Makes a ~2000px copy and a ~640px thumbnail (orientation is applied by the browser when decoding)
async function processImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    const [full, thumb] = await Promise.all([toJpeg(img, w, h, 2000, 0.85), toJpeg(img, w, h, 640, 0.8)]);
    return { full, thumb, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function runLimited(list, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) { const i = next++; await fn(list[i], i); }
  }));
}

function addItemToState(item) {
  state.items.unshift(item);
  state.items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  render();
}

// Copies remote images into storage (via the backend proxy) so they survive the listing coming down.
async function importRemote(urls, propertyId, rooms = {}, { quiet = false } = {}) {
  if (!urls.length) return;
  let done = 0, failed = 0;
  const progress = () => !quiet && toast(`Adding photos… ${done}/${urls.length}`, { sticky: true });
  progress();
  await runLimited(urls, 3, async (url) => {
    const base = { property_id: propertyId, source_url: url, room: rooms[url] || null };
    let item;
    try {
      const processed = await processImage(await store.fetchImage(url));
      item = await store.addPhoto({ ...processed, ...base });
    } catch (e) {
      console.warn("copy failed, linking instead", url, e);
      try {
        const img = await loadImage(url);
        item = await store.addRemotePhoto({ ...base, remote_url: url, w: img.naturalWidth, h: img.naturalHeight });
      } catch { failed++; }
    }
    done++;
    if (item) { addItemToState(item); queueClassify(item); }
    progress();
  });
  if (!quiet) toast(failed ? `Added ${done - failed} photos, ${failed} failed` : `Added ${done} photo${done === 1 ? "" : "s"}`);
}

function openUploadSheet(files) {
  const previews = files.map((f) => URL.createObjectURL(f));
  let propertyId = state.filter.property || "";
  openSheet(`
    <h3>Add ${files.length} photo${files.length === 1 ? "" : "s"}</h3>
    <div class="pick">${previews.map((u) => `<button class="sel" style="pointer-events:none"><img src="${u}" alt=""></button>`).join("")}</div>
    <label class="lbl">Which house or idea?</label>
    <select class="field" data-s="prop">
      <option value="">My uploads</option>
      ${state.properties.map((p) => `<option value="${p.id}"${p.id === propertyId ? " selected" : ""}>${esc(p.title)}</option>`).join("")}
    </select>
    <div class="sheet-actions"><button class="btn" data-s="go">Upload</button></div>`, (el) => {
    $('[data-s="prop"]', el).onchange = (e) => (propertyId = e.target.value);
    $('[data-s="go"]', el).onclick = async () => {
      closeSheet();
      let done = 0, failed = 0;
      toast(`Uploading… 0/${files.length}`, { sticky: true });
      await runLimited(files, 2, async (file) => {
        try {
          const processed = await processImage(file);
          const item = await store.addPhoto({ ...processed, property_id: propertyId || null });
          addItemToState(item);
          queueClassify(item);
        } catch (e) { console.warn(e); failed++; }
        done++;
        toast(`Uploading… ${done}/${files.length}`, { sticky: true });
      });
      previews.forEach(URL.revokeObjectURL);
      toast(failed ? `${failed} photo${failed === 1 ? "" : "s"} couldn't be read (HEIC needs Safari)` : `Added ${done} photo${done === 1 ? "" : "s"}`, { ms: 4500 });
    };
  });
}

/* ---------------- AI classification queue ---------------- */

const aiQueue = [];
let aiRunning = 0, aiOff = false;
function queueClassify(item, { force = false } = {}) {
  if (store.mode !== "cloud" || aiOff) return;
  state.pending.add(item.id);
  aiQueue.push({ id: item.id, force });
  render();
  pumpAi();
}
function pumpAi() {
  while (aiRunning < 3 && aiQueue.length) {
    const { id, force } = aiQueue.shift();
    const item = state.items.find((i) => i.id === id);
    if (!item) { state.pending.delete(id); continue; }
    aiRunning++;
    store.classify(item)
      .then((r) => {
        if (!r) { aiOff = true; aiQueue.length = 0; return; }
        const current = state.items.find((i) => i.id === id);
        return patchItem(id, {
          room: force || !current?.room ? r.room : current.room,
          features: r.features, style: r.style, palette: r.palette,
        });
      })
      .catch((e) => console.warn("classify failed", e))
      .finally(() => {
        aiRunning--;
        state.pending.delete(id);
        if (aiOff) state.pending.clear();
        render();
        if (viewer.open) renderInfo();
        pumpAi();
      });
  }
}

/* ---------------- mutations ---------------- */

async function patchItem(id, patch) {
  const idx = state.items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const prev = state.items[idx];
  state.items[idx] = { ...prev, ...patch };
  render();
  try {
    const saved = await store.updateItem(id, patch);
    const j = state.items.findIndex((i) => i.id === id);
    if (j >= 0) state.items[j] = { ...saved };
  } catch (e) {
    state.items[idx] = prev;
    render();
    toast(`Couldn't save: ${e.message}`);
  }
}

async function removeItem(item) {
  try {
    await store.deleteItem(item);
    state.items = state.items.filter((i) => i.id !== item.id);
    render();
  } catch (e) { toast(`Couldn't delete: ${e.message}`); }
}

function openPropertyEditor(p) {
  openSheet(`
    <h3>Edit</h3>
    <label class="lbl">Name</label><input class="field" data-s="title" value="${esc(p.title)}">
    <label class="lbl">Summary</label><textarea class="field" data-s="summary" rows="3">${esc(p.summary || p.description)}</textarea>
    <label class="lbl">Type</label>
    <select class="field" data-s="kind">${["listing", "idea", "product", "other"].map((k) => `<option${(p.kind || "listing") === k ? " selected" : ""}>${k}</option>`).join("")}</select>
    <label class="lbl">Link</label><input class="field" data-s="url" value="${esc(p.url)}" inputmode="url">
    <div class="sheet-actions">
      <button class="btn danger" data-s="delete">Delete</button>
      <button class="btn" data-s="save">Save</button>
    </div>`, (el) => {
    el.onclick = async (e) => {
      const s = e.target.closest("[data-s]")?.dataset.s;
      if (s === "save") {
        const patch = { title: $('[data-s="title"]', el).value.trim() || p.title, summary: $('[data-s="summary"]', el).value.trim(), kind: $('[data-s="kind"]', el).value, url: $('[data-s="url"]', el).value.trim() };
        try {
          const saved = await store.updateProperty(p.id, patch);
          state.properties = state.properties.map((x) => (x.id === p.id ? saved : x));
          closeSheet();
          render();
        } catch (err) { toast(`Couldn't save: ${err.message}`); }
      }
      if (s === "delete") {
        const btn = e.target.closest("[data-s]");
        const n = itemsOf(p.id).length;
        if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = n ? `Delete + ${n} photos?` : "Tap again"; return; }
        try {
          await store.deleteProperty(p, itemsOf(p.id));
          state.items = state.items.filter((i) => i.property_id !== p.id);
          state.properties = state.properties.filter((x) => x.id !== p.id);
          state.filter.property = null;
          closeSheet();
          render();
        } catch (err) { toast(`Couldn't delete: ${err.message}`); }
      }
    };
  });
}

/* ---------------- navigation ---------------- */

function setView(view) {
  state.view = view;
  if (view === "photos") state.filter = { property: null, room: null, fav: false, tag: null };
  window.scrollTo(0, 0);
  renderNow();
}

function openProperty(id) {
  state.view = "photos";
  state.filter = { property: id === "_mine" ? null : id, room: null, fav: false, tag: null };
  if (id === "_mine") state.group = "property";
  else if (state.group === "property") state.group = "room";
  window.scrollTo(0, 0);
  renderNow();
}

function openSearch(q = "") {
  $("#searchBar").hidden = false;
  $("#searchBtn").classList.add("on");
  $("#searchInput").value = q;
  state.q = q;
  if (state.view !== "photos") setView("photos");
  render();
  if (!q) $("#searchInput").focus();
}

function openMenu() {
  const untagged = state.items.filter((i) => !i.room).length;
  openSheet(`
    <h3>Settings</h3>
    <p class="sub">${store.mode === "cloud" ? `Synced · ${esc(store.user?.email)}` : "Local mode: saved in this browser only"}</p>
    <div class="menu-list">
      ${store.mode === "cloud" && untagged ? `<button class="btn ghost" data-s="ai">${ICON.spark} Sort ${untagged} unsorted photo${untagged === 1 ? "" : "s"} with AI</button>` : ""}
      <button class="btn ghost" data-s="zoomin">${ICON.plus} Bigger photos</button>
      <button class="btn ghost" data-s="zoomout">${ICON.minus} Smaller photos</button>
      ${store.mode === "cloud" ? `<button class="btn ghost" data-s="signout">Sign out</button>` : ""}
    </div>
    <p class="note" style="margin-top:18px">Tip: pinch the gallery to zoom like Google Photos. On iPhone, Share → <b>Add to Home Screen</b> to use it like an app.
    ${store.mode === "local" ? "<br><br>To sync across devices and get AI sorting, add your Supabase keys to <code>config.js</code> (see README)." : ""}</p>`, (el) => {
    el.onclick = async (e) => {
      const s = e.target.closest("[data-s]")?.dataset.s;
      if (s === "ai") { closeSheet(); aiOff = false; state.items.filter((i) => !i.room).forEach((i) => queueClassify(i)); }
      if (s === "zoomin") setZoom(state.zoom - 1);
      if (s === "zoomout") setZoom(state.zoom + 1);
      if (s === "signout") { closeSheet(); await store.signOut(); location.reload(); }
    };
  });
}

/* ---------------- events ---------------- */

function bindEvents() {
  $("#tabs").onclick = (e) => { const v = e.target.closest("[data-view]")?.dataset.view; if (v) setView(v); };
  $("#groupSeg").onclick = (e) => {
    const g = e.target.closest("[data-group]")?.dataset.group;
    if (!g) return;
    state.group = g;
    ls.set("group", g);
    renderNow();
  };
  $("#fab").onclick = openAddSheet;
  $("#selectBtn").onclick = () => (state.selecting ? exitSelect() : enterSelect());
  $("#selectBar").onclick = onSelectBar;
  $("#selectBar").onchange = (e) => {
    if (e.target.dataset.b === "room" && e.target.value) { const room = e.target.value; bulkPatch(() => ({ room })); }
  };
  $("#menuBtn").onclick = openMenu;
  $("#searchBtn").onclick = () => {
    if ($("#searchBar").hidden) return openSearch();
    $("#searchBar").hidden = true;
    $("#searchBtn").classList.remove("on");
    state.q = "";
    render();
  };
  $("#searchInput").oninput = (e) => { state.q = e.target.value; render(); };
  $("#sheetBackdrop").onclick = closeSheet;
  $("#viewer").onclick = onViewerClick;
  $("#viewer").addEventListener("change", (e) => {
    const item = state.items.find((x) => x.id === viewer.list[viewer.index]?.id);
    if (item && e.target.dataset.i === "room") patchItem(item.id, { room: e.target.value || null });
    if (item && e.target.dataset.i === "note") patchItem(item.id, { note: e.target.value });
  });

  document.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; if (e.target.closest(".tile")) return; }
    const tile = e.target.closest(".tile");
    if (tile && state.selecting) return toggleSelected(tile.dataset.id);
    if (tile) {
      const list = visibleItems();
      // Viewer order follows the on-screen grouping
      const ordered = groupItems(list).flatMap((g) => g.items);
      return openViewer(ordered, Math.max(0, ordered.findIndex((i) => i.id === tile.dataset.id)));
    }
    const a = e.target.closest("[data-act]");
    if (!a || a.closest("#sheet") || a.closest("#viewer")) return;
    const { act, val, id } = a.dataset;
    const f = state.filter;
    if (act === "add") openAddSheet();
    if (act === "sel-group") {
      const g = groupItems(visibleItems()).find((x) => x.key === val);
      if (!g) return;
      const all = g.items.every((i) => state.selected.has(i.id));
      for (const i of g.items) all ? state.selected.delete(i.id) : state.selected.add(i.id);
      renderNow();
    }
    if (act === "filter-all") { Object.assign(f, { room: null, fav: false, tag: null }); state.q = ""; $("#searchInput").value = ""; render(); }
    if (act === "filter-fav") { f.fav = !f.fav; render(); }
    if (act === "filter-room") { f.room = f.room === val ? null : val; render(); }
    if (act === "filter-tag") { f.tag = f.tag === val ? null : val; render(); }
    if (act === "open-prop") openProperty(id);
    if (act === "clear-prop") { f.property = null; render(); }
    if (act === "edit-prop") openPropertyEditor(propById(id));
    if (act === "reimport") { const p = propById(id); addLink(p.url, p); }
    if (act === "open-room") {
      state.view = "photos";
      state.filter = { property: null, room: val === "_" ? null : val, fav: false, tag: null };
      if (state.group === "room") state.group = "property";
      renderNow();
    }
    if (act === "open-fav") { state.view = "photos"; state.filter = { property: null, room: null, fav: true, tag: null }; renderNow(); }
  });

  const onFiles = (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    closeSheet();
    setTimeout(() => openUploadSheet(files), 50);
  };
  $("#fileInput").onchange = onFiles;
  $("#cameraInput").onchange = onFiles;

  // Paste a link anywhere (desktop ⌘V) to add it
  document.addEventListener("paste", (e) => {
    if (e.target.closest?.("input, textarea")) return;
    const url = firstUrl(e.clipboardData?.getData("text"));
    if (url) { e.preventDefault(); addLink(url); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, select")) return;
    if (viewer.open) {
      const strip = $("#viewer .strip");
      if (e.key === "ArrowRight") strip.scrollBy({ left: strip.clientWidth, behavior: "smooth" });
      if (e.key === "ArrowLeft") strip.scrollBy({ left: -strip.clientWidth, behavior: "smooth" });
      return;
    }
    if (e.key === "Escape" && state.selecting) exitSelect();
    if (e.key === "+" || e.key === "=") setZoom(state.zoom - 1);
    if (e.key === "-") setZoom(state.zoom + 1);
  });

  let w = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth !== w) { w = innerWidth; render(); } });
  setupPinch();
  setupLongPress();
}

/* ---------------- login (cloud mode) ---------------- */

function showLogin() {
  const el = $("#login");
  el.hidden = false;
  el.innerHTML = `<form>
    <h1>Moodboard</h1>
    <p>Sign in to your design board.</p>
    <input class="field" name="email" type="email" placeholder="Email" autocomplete="email" required>
    <input class="field" name="password" type="password" placeholder="Password" autocomplete="current-password" minlength="6" required>
    <p class="err"></p>
    <button class="btn block" name="in">Sign in</button>
    <button class="btn ghost block" name="up" type="button">Create account</button>
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

/* ---------------- boot ---------------- */

async function seedIfEmpty() {
  const key = `seeded:${store.user?.id}`;
  if (state.items.length || state.properties.length || ls.get(key, false)) return;
  ls.set(key, true);
  const prop = await addProperty({ ...SEED.property, kind: "listing", summary: SEED.property.description, tags: [], room: null });
  if (!prop) return;
  await importRemote(SEED.photos.map((p) => p.url), prop.id, Object.fromEntries(SEED.photos.map((p) => [p.url, p.room])), { quiet: true });
}

function handleShareTarget() {
  const params = new URLSearchParams(location.search);
  const url = firstUrl(params.get("url")) || firstUrl(params.get("text")) || firstUrl(params.get("title"));
  if (!url) return;
  history.replaceState(null, "", location.pathname);
  addLink(url);
}

let started = false;
async function start() {
  if (started) return;
  started = true;
  try {
    const data = await store.load();
    state.items = data.items;
    state.properties = data.properties;
  } catch (e) {
    toast(`Couldn't load your board: ${e.message}`, { ms: 8000 });
  }
  renderNow();
  handleShareTarget();
  seedIfEmpty();
}

async function boot() {
  bindEvents();
  try {
    store = await createStore(config);
  } catch (e) {
    $("#view").innerHTML = `<div class="empty"><h3>Couldn't connect</h3><p>${esc(e.message)}</p></div>`;
    return;
  }
  if (store.mode === "cloud" && !store.user) showLogin();
  else start();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
