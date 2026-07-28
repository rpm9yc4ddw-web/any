"use strict";
/* 端末管理 スタンドアロン版 (ver16.6) */

// ---- ユーティリティ ----
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysSince = (s) => {
  if (!s) return null;
  return Math.floor((new Date(todayStr() + "T00:00:00") - new Date(s + "T00:00:00")) / 86400000);
};
const fmtMD = (s) => {
  if (!s) return "—";
  const p = s.split("-");
  return `${Number(p[1])}/${Number(p[2])}`;
};
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const calcRe = (row) => {
  if (!row.resetDate) return null;
  if (row.passStatus) {
    const end = row.passDate || todayStr();
    return Math.floor((new Date(end + "T00:00:00") - new Date(row.resetDate + "T00:00:00")) / 86400000);
  }
  return daysSince(row.resetDate);
};
const reColor = (n) => (n === null ? "#6b7280" : n >= 7 ? "#f0b95c" : "#7dd3a8");
const ciLabel = (v) => (v === true ? "可" : v === false ? "否" : "—");

// ---- 状態 ----
const KEY = "device-manager-v7";
let S = { rows: [], parentList: [], nameHistory: [], parentHistory: [], domainList: [], eventList: [], activityLog: [] };
const U = {
  open: {}, openRec: {}, showPw: {}, confirmDel: {}, accShowPw: false,
  panels: { stats: false, cal: false, acc: false, bk: false },
  orgDev: false, orgPar: false,
  searchQ: "", sortMode: "default", filterMode: "all",
  domAdd: null, evAdd: null, flash: {},
  calYM: { y: new Date().getFullYear(), m: new Date().getMonth() },
  calSel: todayStr(),
};
let past = [], future = [];

const newDevice = (name) => ({
  id: uid(), name, accType: "g", email: "", accCreated: "", pw: "",
  resetDate: todayStr(), firstCheckin: null,
  ciDays: 0, taskDays: 0, lastCiAt: todayStr(),
  ciError: false, ciErrorNote: "", taskError: false, taskErrorNote: "",
  parentName: "", parentNote: "", passStatus: null, passDate: todayStr(),
  runTime: 0, reward14: "", rewardLeft: "", eventName: "", memo: "", records: [], archived: false,
});

// ---- 保存/読込 ----
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      S.rows = d.rows || [];
      S.parentList = d.parentList || [];
      S.nameHistory = [...new Set([...(d.nameHistory || []), ...S.rows.map((x) => x.name)])];
      S.parentHistory = [...new Set([...(d.parentHistory || []), ...S.parentList])];
      S.domainList = d.domainList || [];
      S.eventList = d.eventList || [];
      S.activityLog = d.activityLog || [];
    }
  } catch (e) {
    setMsg("saveState", "読込失敗");
  }
}
let saveTimer = null;
function persist() {
  const el = document.getElementById("saveState");
  el.textContent = "…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      el.textContent = "✓";
      setTimeout(() => { el.textContent = ""; }, 1200);
    } catch (e) {
      el.textContent = "保存失敗";
    }
  }, 400);
}
function setMsg(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }

// ---- 元に戻す/やり直し ----
function snapshot(key) {
  const top = past[past.length - 1];
  if (key && top && top.key === key) return;
  past.push({ key, data: JSON.stringify(S) });
  if (past.length > 50) past.shift();
  future = [];
}
function undo() {
  if (!past.length) return;
  future.push({ data: JSON.stringify(S) });
  S = JSON.parse(past.pop().data);
  persist(); render();
}
function redo() {
  if (!future.length) return;
  past.push({ key: null, data: JSON.stringify(S) });
  S = JSON.parse(future.pop().data);
  persist(); render();
}

// ---- 行動ログ ----
function logAct(name, action) {
  S.activityLog.push({ d: todayStr(), n: name, a: action });
  if (S.activityLog.length > 8000) S.activityLog = S.activityLog.slice(-8000);
}

// ---- 操作 ----
const findRow = (id) => S.rows.find((x) => x.id === id);
function commit() { persist(); render(); }

function upd(id, key, val, coalesceKey) {
  snapshot(coalesceKey || null);
  const r = findRow(id);
  if (r) r[key] = val;
  commit();
}
function bump(id, key, delta) {
  snapshot(null);
  const r = findRow(id);
  if (r) {
    r[key] = Math.max(0, (r[key] || 0) + delta);
    if (key === "ciDays") r.lastCiAt = todayStr();
  }
  commit();
}
function ciOk(id) { snapshot(null); const r = findRow(id); if (r) { logAct(r.name, "CI◯"); r.ciDays = (r.ciDays || 0) + 1; r.lastCiAt = todayStr(); } commit(); }
function ciNg(id) { snapshot(null); const r = findRow(id); if (r) { if (!r.ciError) logAct(r.name, "CIエラー"); r.ciError = !r.ciError; } commit(); }
function taskOk(id) { snapshot(null); const r = findRow(id); if (r) { logAct(r.name, "タスク◯"); r.taskDays = (r.taskDays || 0) + 1; } commit(); }
function taskNg(id) { snapshot(null); const r = findRow(id); if (r) { if (!r.taskError) logAct(r.name, "タスクエラー"); r.taskError = !r.taskError; } commit(); }

function addDeviceByName(name) {
  const n = (name || "").trim();
  if (!n) return;
  if (S.rows.some((x) => x.name === n && !x.archived)) { document.getElementById("newName").value = ""; return; }
  snapshot(null);
  S.rows.push(newDevice(n));
  if (!S.nameHistory.includes(n)) S.nameHistory.push(n);
  logAct(n, "端末追加");
  document.getElementById("newName").value = "";
  commit();
}
function addParentByName(name) {
  const n = (name || "").trim();
  if (!n || S.parentList.includes(n)) { document.getElementById("newParent").value = ""; return; }
  snapshot(null);
  S.parentList.push(n);
  if (!S.parentHistory.includes(n)) S.parentHistory.push(n);
  document.getElementById("newParent").value = "";
  commit();
}
function saveRecord(id) {
  const row = findRow(id);
  if (!row) return;
  snapshot(null);
  row.records = [{
    id: uid(), savedAt: todayStr(),
    accType: row.accType, email: row.email, accCreated: row.accCreated, pw: row.pw,
    resetDate: row.resetDate, re: calcRe(row), firstCheckin: row.firstCheckin,
    ciDays: row.ciDays, taskDays: row.taskDays || 0,
    ciError: row.ciError || false, ciErrorNote: row.ciErrorNote || "",
    taskError: row.taskError || false, taskErrorNote: row.taskErrorNote || "",
    runTime: row.runTime || 0, parentName: row.parentName, parentNote: row.parentNote,
    passStatus: row.passStatus, passDate: row.passDate,
    reward14: row.reward14, rewardLeft: row.rewardLeft,
    eventName: row.eventName || "", memo: row.memo || "",
  }, ...(row.records || [])];
  logAct(row.name, "レコード保存");
  U.flash[id] = true;
  setTimeout(() => { U.flash[id] = false; render(); }, 1200);
  commit();
}

// ---- 重複判定 ----
const accKey = (x) => {
  const em = (x.email || "").trim().toLowerCase();
  return em ? x.accType + "|" + em : null;
};
function dupInfo() {
  const cnt = {};
  S.rows.forEach((x) => { const k = accKey(x); if (k) cnt[k] = (cnt[k] || 0) + 1; });
  return {
    isDup: (x) => { const k = accKey(x); return !!k && cnt[k] > 1; },
    partners: (x) => S.rows.filter((y) => y.id !== x.id && accKey(y) && accKey(y) === accKey(x)).map((y) => y.name),
  };
}

// ---- バックアップ ----
function restoreFrom(txt) {
  try {
    const d = JSON.parse(txt);
    if (!d.rows) throw new Error();
    snapshot(null);
    S.rows = d.rows;
    S.parentList = d.parentList || [];
    S.nameHistory = [...new Set([...(d.nameHistory || []), ...d.rows.map((x) => x.name)])];
    S.parentHistory = [...new Set([...(d.parentHistory || []), ...S.parentList])];
    S.domainList = d.domainList || [];
    S.eventList = d.eventList || [];
    S.activityLog = d.activityLog || [];
    setMsg("bkMsg", "復元した ✓");
    document.getElementById("bkText").value = "";
    commit();
    return true;
  } catch (e) { return false; }
}
async function bkCopy() {
  const txt = JSON.stringify(S);
  try {
    await navigator.clipboard.writeText(txt);
    setMsg("bkMsg", "コピーした ✓ メモ等に貼って保管してください");
  } catch (e) {
    document.getElementById("bkText").value = txt;
    setMsg("bkMsg", "自動コピー不可。↓を全選択して手動コピーしてください");
  }
}
async function bkPaste() {
  try {
    const txt = await navigator.clipboard.readText();
    if (!restoreFrom(txt)) setMsg("bkMsg", "コピー中の内容がバックアップではありません。↓に貼って手動復元を押してください");
  } catch (e) {
    setMsg("bkMsg", "ペースト許可が得られませんでした。↓に貼って手動復元を押してください");
  }
}
function bkManual() {
  if (!restoreFrom(document.getElementById("bkText").value)) {
    setMsg("bkMsg", "読めませんでした。バックアップの文字列を丸ごと貼ってください");
  }
}
function bkFileSave() {
  const blob = new Blob([JSON.stringify(S)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = "端末管理BK_" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  setMsg("bkMsg", "ファイルに書き出した ✓(「ファイル」Appやicloudに保存推奨)");
}
function bkFileLoad() { document.getElementById("bkFile").click(); }

// ---- 描画 ----
function render() {
  const dup = dupInfo();
  document.getElementById("undoBtn").disabled = !past.length;
  document.getElementById("redoBtn").disabled = !future.length;

  // パネル表示切替
  for (const p of ["stats", "cal", "acc", "bk"]) {
    document.getElementById(p + "Panel").classList.toggle("hidden", !U.panels[p]);
  }
  if (U.panels.stats) renderStats();
  if (U.panels.cal) renderCal();
  if (U.panels.acc) renderAcc(dup);

  // 端末登録プルダウン
  const devSel = document.getElementById("devSel");
  devSel.innerHTML = '<option value="">過去の端末▼</option>' + S.nameHistory.map((n) => {
    const active = S.rows.some((x) => x.name === n && !x.archived);
    const hasArch = S.rows.some((x) => x.name === n && x.archived);
    return `<option value="${active ? "" : esc(n)}" ${active ? "disabled" : ""}>${esc(n)}${active ? "(登録中)" : hasArch ? "(新規で追加)" : ""}</option>`;
  }).join("");
  devSel.value = "";

  // 整理チップ(端末)
  const devChips = document.getElementById("devChips");
  devChips.classList.toggle("hidden", !U.orgDev);
  if (U.orgDev) {
    devChips.innerHTML = (S.nameHistory.length ? S.nameHistory : []).map((n) => {
      const active = S.rows.some((x) => x.name === n && !x.archived);
      const nArch = S.rows.filter((x) => x.name === n && x.archived).length;
      return `<span class="chip">${esc(n)}${active ? "(登録中)" : ""}${nArch ? `(ア×${nArch})` : ""}<span data-act="delNameHist" data-n="${esc(n)}">✕</span></span>`;
    }).join("") || '<span class="chip">履歴なし</span>';
  }

  // 親機登録プルダウン
  const parSel = document.getElementById("parSel");
  parSel.innerHTML = '<option value="">過去の親機▼</option>' + S.parentHistory.map((n) => {
    const active = S.parentList.includes(n);
    return `<option value="${active ? "" : esc(n)}" ${active ? "disabled" : ""}>${esc(n)}${active ? "(登録中)" : ""}</option>`;
  }).join("");
  parSel.value = "";

  // 親機 現役チップ / 整理チップ
  document.getElementById("parActiveChips").innerHTML = S.parentList.map((n) =>
    `<span class="chip">親機: ${esc(n)}<span data-act="delParent" data-n="${esc(n)}">✕</span></span>`).join("");
  const parChips = document.getElementById("parChips");
  parChips.classList.toggle("hidden", !U.orgPar);
  if (U.orgPar) {
    parChips.innerHTML = (S.parentHistory.length ? S.parentHistory : []).map((n) =>
      `<span class="chip">${esc(n)}${S.parentList.includes(n) ? "(登録中)" : ""}<span data-act="delParHist" data-n="${esc(n)}">✕</span></span>`).join("") || '<span class="chip">履歴なし</span>';
  }

  // 今日やること
  const act = S.rows.filter((x) => !x.archived);
  const c30 = act.filter((x) => { const i = daysSince(x.lastCiAt); return i !== null && i >= 30; }).length;
  const cErr = act.filter((x) => x.ciError).length;
  const cTErr = act.filter((x) => x.taskError).length;
  const tdItem = (v, k, mode, color) =>
    `<div class="td ${U.filterMode === mode ? "on" : ""}" data-act="todayFilter" data-m="${mode}">
      <div class="td-v num" style="color:${v ? color : "#3a4454"}">${v}</div><span class="td-k">${k}</span></div>`;
  document.getElementById("today").innerHTML =
    tdItem(c30, "復帰対象 30+", "30", "#5cd6e0") + tdItem(cErr, "CIエラー", "err", "#a78bfa") + tdItem(cTErr, "タスクエラー", "terr", "#f08cc8");

  // 検索プルダウン
  const searchSel = document.getElementById("searchSel");
  searchSel.innerHTML = '<option value="">全端末▼</option>' + S.rows.filter((x) => !x.archived).map((x) =>
    `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join("");
  searchSel.value = U.searchQ;
  document.getElementById("sortSel").value = U.sortMode;
  document.getElementById("filterSel").value = U.filterMode === "arch" ? "all" : U.filterMode;

  document.getElementById("archNote").classList.toggle("hidden", U.filterMode !== "arch");

  // 一覧
  let rows = S.rows.filter((x) => {
    if (U.filterMode === "arch") return !!x.archived;
    if (x.archived) return false;
    if (U.searchQ && x.name !== U.searchQ) return false;
    const re = calcRe(x);
    if (U.filterMode === "7" && !(re !== null && re >= 7)) return false;
    if (U.filterMode === "14" && !((x.ciDays || 0) >= 14)) return false;
    if (U.filterMode === "err" && !x.ciError) return false;
    if (U.filterMode === "terr" && !x.taskError) return false;
    if (U.filterMode === "pass" && x.passStatus !== "pass") return false;
    if (U.filterMode === "fail" && x.passStatus !== "fail") return false;
    if (U.filterMode === "30") {
      const idle = daysSince(x.lastCiAt);
      if (!(idle !== null && idle >= 30)) return false;
    }
    return true;
  });
  if (U.sortMode === "re") rows = [...rows].sort((a, b) => (calcRe(b) ?? -1) - (calcRe(a) ?? -1));
  if (U.sortMode === "ci") rows = [...rows].sort((a, b) => (b.ciDays || 0) - (a.ciDays || 0));

  const list = document.getElementById("list");
  if (S.rows.length === 0) list.innerHTML = '<div class="empty">端末名を登録してください</div>';
  else if (rows.length === 0) list.innerHTML = '<div class="empty">該当なし</div>';
  else list.innerHTML = rows.map((row) => renderCard(row, dup)).join("");

  // アーカイブバー
  const nArch = S.rows.filter((x) => x.archived).length;
  const bar = document.getElementById("archBar");
  if (U.filterMode === "arch") { bar.classList.remove("hidden"); bar.textContent = "← 通常一覧に戻る"; }
  else if (nArch > 0) { bar.classList.remove("hidden"); bar.textContent = `📦 アーカイブを見る(${nArch}台)`; }
  else bar.classList.add("hidden");
}

function renderCard(row, dup) {
  const re = calcRe(row);
  const isOpen = !!U.open[row.id];
  const warn7 = re !== null && re >= 7;
  const is14 = (row.ciDays || 0) >= 14;
  const idle = daysSince(row.lastCiAt);
  const rings = [];
  if (row.ciError) rings.push("#6d5bb8");
  if (row.taskError) rings.push("#8a3f6a");
  if (warn7) rings.push("#8a6420");
  const style = rings.length
    ? `border-color:${rings[0]};box-shadow:${rings.slice(1).map((c, i) => `0 0 0 ${(i + 1) * 2}px ${c}`).join(",") || "none"}`
    : "";
  const baseDot = row.passStatus === "pass" ? "#4ade80" : row.passStatus === "fail" ? "#f06a6a"
    : (row.records || [])[0]?.passStatus === "pass" ? "#4ade80"
    : (row.records || [])[0]?.passStatus === "fail" ? "#f06a6a" : "#3a4454";
  return `<div class="card" style="${style}">
    <div class="sum">
      <div class="sum-tap" data-act="toggleOpen" data-id="${row.id}">
        <div class="dots">
          <span class="sdot" style="background:${baseDot}"></span>
          ${row.ciError ? '<span class="sdot" style="background:#a78bfa"></span>' : ""}
          ${row.taskError ? '<span class="sdot" style="background:#f08cc8"></span>' : ""}
        </div>
        <div style="min-width:0">
          <div class="sum-name">${esc(row.name)}
            ${is14 ? '<span class="tag14" style="margin-left:6px">14</span>' : ""}
            ${dup.isDup(row) ? '<span class="tagdup" style="margin-left:6px">垢重複</span>' : ""}
            ${idle !== null && idle >= 30 ? '<span class="tag30" style="margin-left:6px">30+</span>' : ""}
          </div>
        </div>
        <div class="kv"><div class="kv-v num" style="color:${reColor(re)}">${re === null ? "—" : re}</div><span class="kv-k">re</span></div>
        <div class="kv"><div class="kv-v num">${row.ciDays || 0}</div><span class="kv-k">ci</span></div>
        <div class="kv"><div class="kv-v num">${row.taskDays || 0}</div><span class="kv-k">task</span></div>
        <span class="chev">${isOpen ? "▲" : "▼"}</span>
      </div>
      <div class="qcol">
        <div class="qrow"><span class="qlab">CI</span>
          <button class="qbtn qok" data-act="ciOk" data-id="${row.id}">◯</button>
          <button class="qbtn qng ${row.ciError ? "on" : ""}" data-act="ciNg" data-id="${row.id}">✕</button></div>
        <div class="qrow"><span class="qlab">タ</span>
          <button class="qbtn qok" data-act="taskOk" data-id="${row.id}">◯</button>
          <button class="qbtn qtng ${row.taskError ? "on" : ""}" data-act="taskNg" data-id="${row.id}">✕</button></div>
      </div>
    </div>
    ${isOpen ? renderBody(row, dup, re) : ""}
  </div>`;
}

function renderBody(row, dup, re) {
  const id = row.id;
  const em = row.email || "";
  const at = em.indexOf("@");
  const local = at === -1 ? em : em.slice(0, at);
  const dom = at === -1 ? "@gmail.com" : em.slice(at);
  const doms = [...new Set(["@gmail.com", "@outlook.jp", ...S.domainList])];
  if (!doms.includes(dom)) doms.push(dom);
  const adding = U.domAdd && U.domAdd.id === id;
  const ci14names = [...new Set(S.rows.filter((x) => (x.ciDays || 0) >= 14).map((x) => x.name))];
  const parentOptions = [...new Set([...S.parentList, ...ci14names])].filter((n) => n !== row.name);
  if (row.parentName && !parentOptions.includes(row.parentName)) parentOptions.push(row.parentName);

  const recsHtml = (row.records || []).length ? `
    <div class="sec">保存済み(${row.records.length})</div>
    ${row.records.map((rc) => {
      const cls = rc.passStatus === "pass" ? "rec-pass" : rc.passStatus === "fail" ? "rec-fail" : rc.ciError ? "rec-err" : rc.taskError ? "rec-terr" : "";
      const rOpen = !!U.openRec[rc.id];
      return `<div class="rec ${cls}">
        <div class="rec-sum" data-act="toggleRec" data-id="${rc.id}">
          <span>${rc.passStatus === "pass" ? "✓" : rc.passStatus === "fail" ? "✗" : "・"}</span>
          <span class="num">${fmtMD(rc.passDate || rc.savedAt)}</span>
          <span class="num">re${rc.re ?? "—"}</span>
          <span class="num">ci${rc.ciDays}</span>
          <span>${esc(rc.accType)}</span>
          ${rc.ciError ? '<span class="etag">E</span>' : ""}
          ${rc.taskError ? '<span class="ttag">T</span>' : ""}
          <span class="rec-x" data-act="delRec" data-id="${id}" data-rec="${rc.id}">✕</span>
        </div>
        ${rOpen ? `<div class="rec-body"><div class="rec-grid">
          <div><div class="rec-k">垢メール</div><div class="rec-v">${esc(rc.email) || "—"}</div></div>
          <div><div class="rec-k">垢作成日</div><div class="rec-v num">${fmtMD(rc.accCreated)}</div></div>
          <div><div class="rec-k">パス</div><div class="rec-v">${esc(rc.pw) || "—"}</div></div>
          <div><div class="rec-k">リセット日</div><div class="rec-v num">${fmtMD(rc.resetDate)}</div></div>
          <div><div class="rec-k">初日CI</div><div class="rec-v">${ciLabel(rc.firstCheckin)}</div></div>
          <div><div class="rec-k">稼働時間</div><div class="rec-v num">${rc.runTime}</div></div>
          <div><div class="rec-k">CIエラー</div><div class="rec-v">${rc.ciError ? "あり" : "—"}</div></div>
          <div><div class="rec-k">CIエラー内容</div><div class="rec-v">${esc(rc.ciErrorNote) || "—"}</div></div>
          <div><div class="rec-k">task日数</div><div class="rec-v num">${rc.taskDays ?? "—"}</div></div>
          <div><div class="rec-k">タスクエラー</div><div class="rec-v">${rc.taskError ? "あり" : "—"}</div></div>
          <div><div class="rec-k">タスクエラー内容</div><div class="rec-v">${esc(rc.taskErrorNote) || "—"}</div></div>
          <div><div class="rec-k">親機</div><div class="rec-v">${esc(rc.parentName) || "—"}</div></div>
          <div><div class="rec-k">親機内容</div><div class="rec-v">${esc(rc.parentNote) || "—"}</div></div>
          <div><div class="rec-k">通過日</div><div class="rec-v num">${fmtMD(rc.passDate)}</div></div>
          <div><div class="rec-k">対象イベント</div><div class="rec-v">${esc(rc.eventName) || "—"}</div></div>
          <div><div class="rec-k">14日報酬</div><div class="rec-v">${esc(rc.reward14) || "—"}</div></div>
          <div><div class="rec-k">残報酬</div><div class="rec-v">${esc(rc.rewardLeft) || "—"}</div></div>
          <div class="full" style="grid-column:1/-1"><div class="rec-k">備考</div><div class="rec-v">${esc(rc.memo) || "—"}</div></div>
        </div></div>` : ""}
      </div>`;
    }).join("")}` : "";

  const inp = (label, field, type, value, extra = "", cls = "") =>
    `<div class="${cls}"><span class="label">${label}</span>
     <input class="num" type="${type}" value="${esc(value)}" data-f="${field}" data-id="${id}" ${extra}></div>`;
  const txt = (label, field, value, cls = "") =>
    `<div class="${cls}"><span class="label">${label}</span>
     <input value="${esc(value)}" data-f="${field}" data-id="${id}" autocomplete="off"></div>`;
  const counter = (label, field, val, step) =>
    `<div><span class="label">${label}</span>
     <div class="counter" style="justify-content:flex-start">
       <button class="cbtn" data-act="bump" data-id="${id}" data-k="${field}" data-d="${-step}">−</button>
       <span class="cval num">${val || 0}</span>
       <button class="cbtn" data-act="bump" data-id="${id}" data-k="${field}" data-d="${step}">＋</button>
     </div></div>`;

  return `<div class="body">
    ${recsHtml}
    <div class="sec">入力</div>
    <div class="grid2">
      <div><span class="label">端末名(変更可)</span>
        <input value="${esc(row.name)}" data-f="name" data-id="${id}" autocomplete="off"></div>
      <div><span class="label">対象イベント</span>
        ${U.evAdd && U.evAdd.id === id
          ? `<div style="display:flex;gap:6px">
               <input style="min-width:0" value="${esc(U.evAdd.text)}" placeholder="イベント名" autocomplete="off" id="evAddInput" data-f="evAddText" data-id="${id}">
               <button class="mini" data-act="evCommit" data-id="${id}">追加</button>
             </div>`
          : `<div style="display:flex;gap:6px">
               <select style="min-width:0" data-f="eventName" data-id="${id}">
                 <option value="">選択</option>
                 ${[...new Set([...S.eventList, ...(row.eventName ? [row.eventName] : [])])].map((n) =>
                   `<option value="${esc(n)}" ${n === row.eventName ? "selected" : ""}>${esc(n)}</option>`).join("")}
               </select>
               <button class="mini" data-act="evAdd" data-id="${id}">＋</button>
             </div>`}
      </div>
      <div><span class="label">垢</span><div class="seg">
        <button class="${row.accType === "g" ? "on-g" : ""}" data-act="setAcc" data-id="${id}" data-v="g">g</button>
        <button class="${row.accType === "f" ? "on-f" : ""}" data-act="setAcc" data-id="${id}" data-v="f">f</button>
      </div></div>
      ${inp("垢作成日", "accCreated", "date", row.accCreated)}
      <div class="full"><span class="label">垢メール</span>
        <div style="display:flex;gap:6px">
          <input value="${esc(local)}" placeholder="アドレス" autocomplete="off" data-f="emailLocal" data-id="${id}" style="min-width:0">
          ${adding
            ? `<input style="width:110px;flex:none" value="${esc(U.domAdd.text)}" placeholder="@xxx.com" autocomplete="off" id="domAddInput" data-f="domAddText" data-id="${id}">
               <button class="mini" data-act="domCommit" data-id="${id}">追加</button>`
            : `<select style="width:auto;flex:none" data-f="emailDom" data-id="${id}">
                 ${doms.map((d) => `<option value="${esc(d)}" ${d === dom ? "selected" : ""}>${esc(d)}</option>`).join("")}
               </select>
               <button class="mini" data-act="domAdd" data-id="${id}">＋</button>`}
        </div>
        ${dup.isDup(row) ? `<div class="dupwarn">⚠ 垢が完全一致: ${dup.partners(row).map(esc).join("、")} と同じ${row.accType}垢・同じアドレスです</div>` : ""}
      </div>
      <div class="full"><span class="label">パス</span><div class="pwrow">
        <input type="${U.showPw[id] ? "text" : "password"}" value="${esc(row.pw)}" autocomplete="off" data-f="pw" data-id="${id}" style="min-width:0">
        <button class="mini" data-act="togglePw" data-id="${id}">${U.showPw[id] ? "隠す" : "表示"}</button>
      </div></div>
      ${inp("リセット日", "resetDate", "date", row.resetDate)}
      <div><span class="label">${row.passStatus ? "re(通過日で停止中)" : "re(経過日数)"}</span>
        <div class="ro num" style="color:${reColor(re)}">${re === null ? "—" : re + "日"}</div></div>
      <div><span class="label">初日CI</span><div class="seg">
        <button class="${row.firstCheckin === true ? "on-ok" : ""}" data-act="setFirstCi" data-id="${id}" data-v="1">可</button>
        <button class="${row.firstCheckin === false ? "on-ng" : ""}" data-act="setFirstCi" data-id="${id}" data-v="0">否</button>
      </div></div>
      ${inp("最終CI日(◯/±で自動更新)", "lastCiAt", "date", row.lastCiAt || "")}
      ${counter("ci(±)", "ciDays", row.ciDays, 1)}
      ${counter("task(±)", "taskDays", row.taskDays, 1)}
      ${counter("稼働時間(±10)", "runTime", row.runTime, 10)}
      <div><span class="label">CIエラー</span><div class="seg">
        <button class="${row.ciError ? "on-err" : ""}" data-act="toggleCiErr" data-id="${id}">${row.ciError ? "あり" : "なし"}</button>
      </div></div>
      ${txt("CIエラー内容", "ciErrorNote", row.ciErrorNote || "")}
      <div><span class="label">タスクエラー</span><div class="seg">
        <button class="${row.taskError ? "on-terr" : ""}" data-act="toggleTaskErr" data-id="${id}">${row.taskError ? "あり" : "なし"}</button>
      </div></div>
      ${txt("タスクエラー内容", "taskErrorNote", row.taskErrorNote || "")}
      <div><span class="label">親機</span>
        <select data-f="parentName" data-id="${id}">
          <option value="">選択</option>
          ${parentOptions.map((n) => `<option value="${esc(n)}" ${n === row.parentName ? "selected" : ""}>${esc(n)}</option>`).join("")}
        </select></div>
      ${txt("親機内容", "parentNote", row.parentNote || "")}
      <div><span class="label">通過可否</span><div class="seg">
        <button class="${row.passStatus === "pass" ? "on-ok" : ""}" data-act="setPass" data-id="${id}" data-v="pass">通過</button>
        <button class="${row.passStatus === "fail" ? "on-ng" : ""}" data-act="setPass" data-id="${id}" data-v="fail">否</button>
      </div></div>
      ${inp("通過日", "passDate", "date", row.passDate || "")}
      ${txt("14日報酬", "reward14", row.reward14 || "")}
      ${txt("残報酬", "rewardLeft", row.rewardLeft || "")}
      ${txt("備考", "memo", row.memo || "", "full")}
    </div>
    <button class="savebtn ${U.flash[id] ? "flash" : ""}" data-act="saveRec" data-id="${id}">${U.flash[id] ? "保存した ✓" : "この内容を保存"}</button>
    <div class="delrow">
      <button class="archbtn" data-act="toggleArchived" data-id="${id}">${row.archived ? "アーカイブから戻す" : "アーカイブ"}</button>
      ${U.confirmDel[id]
        ? `<button class="del-yes" data-act="reallyDel" data-id="${id}">本当に削除する</button>
           <button class="mini" data-act="cancelDel" data-id="${id}">やめる</button>`
        : `<button class="del" data-act="askDel" data-id="${id}">この端末を削除</button>`}
    </div>
  </div>`;
}

function renderStats() {
  const allRecs = S.rows.flatMap((r) => r.records || []);
  const judged = allRecs.filter((rc) => rc.passStatus === "pass" || rc.passStatus === "fail");
  const rate = (list) => {
    if (!list.length) return null;
    const p = list.filter((rc) => rc.passStatus === "pass").length;
    return { n: list.length, p, pct: Math.round((p / list.length) * 100) };
  };
  const buckets = [
    { label: "re 0–6", f: (rc) => rc.re != null && rc.re <= 6 },
    { label: "re 7–9", f: (rc) => rc.re >= 7 && rc.re <= 9 },
    { label: "re 10–13", f: (rc) => rc.re >= 10 && rc.re <= 13 },
    { label: "re 14+", f: (rc) => rc.re >= 14 },
  ];
  let html = `<div class="stats-title">通過率(判定済みレコード ${judged.length}件)</div>`;
  if (!judged.length) html += '<div style="font-size:12px;color:#5b6675">保存レコードが溜まると表示されます</div>';
  else {
    for (const t of ["g", "f"]) {
      const r = rate(judged.filter((rc) => rc.accType === t));
      if (r) html += `<div class="stats-row"><span>${t}垢</span><span class="stats-v num">${r.pct}%(${r.p}/${r.n})</span></div>`;
    }
    for (const b of buckets) {
      const r = rate(judged.filter(b.f));
      if (r) html += `<div class="stats-row"><span class="num">${b.label}</span><span class="stats-v num">${r.pct}%(${r.p}/${r.n})</span></div>`;
    }
  }
  document.getElementById("statsPanel").innerHTML = html;
}

function renderCal() {
  const pad = (v) => String(v).padStart(2, "0");
  const { y, m } = U.calYM;
  const first = new Date(y, m, 1).getDay();
  const nDays = new Date(y, m + 1, 0).getDate();
  const dstr = (d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const daySet = new Set(S.activityLog.map((e) => e.d));
  const agg = {};
  S.activityLog.filter((e) => e.d === U.calSel).forEach((e) => {
    const k = e.n + "|" + e.a;
    agg[k] = (agg[k] || 0) + 1;
  });
  const items = Object.entries(agg).map(([k, c]) => {
    const [n, a] = k.split("|");
    return { n, a, c };
  });
  const sp = U.calSel.split("-");
  let cells = ["日", "月", "火", "水", "木", "金", "土"].map((w) => `<div class="calwd">${w}</div>`).join("");
  for (let i = 0; i < first; i++) cells += "<div></div>";
  for (let d = 1; d <= nDays; d++) {
    const ds = dstr(d);
    cells += `<div class="calcell ${ds === U.calSel ? "sel" : ""} ${ds === todayStr() ? "tdy" : ""}" data-act="calSel" data-d="${ds}">
      <span class="num">${d}</span><div class="caldot ${daySet.has(ds) ? "" : "off"}"></div></div>`;
  }
  document.getElementById("calPanel").innerHTML = `
    <div class="calhead">
      <button class="calnav" data-act="calPrev">‹</button>
      <span class="calttl num">${y}年${m + 1}月</span>
      <button class="calnav" data-act="calNext">›</button>
    </div>
    <div class="calgrid">${cells}</div>
    <div style="margin-top:10px">
      <div class="stats-title num">${Number(sp[1])}/${Number(sp[2])} のアクション</div>
      ${items.length ? items.map((it) => `<div class="calact"><span class="calact-n">${esc(it.n)}</span><span class="calact-a">${esc(it.a)}${it.c > 1 ? ` ×${it.c}` : ""}</span></div>`).join("") : '<div style="font-size:12px;color:#5b6675">記録なし</div>'}
    </div>`;
}

function renderAcc(dup) {
  const sorted = [...S.rows].sort((a, b) => (daysSince(b.lastCiAt) ?? -1) - (daysSince(a.lastCiAt) ?? -1));
  let html = `<div class="stats-title" style="display:flex;align-items:center">垢一覧(放置が長い順)
    <button class="mini" style="margin-left:auto" data-act="toggleAccPw">${U.accShowPw ? "パス隠す" : "パス表示"}</button></div>`;
  if (!S.rows.length) html += '<div style="font-size:12px;color:#5b6675">端末がまだありません</div>';
  html += sorted.map((row) => {
    const idle = daysSince(row.lastCiAt);
    return `<div class="acc-row">
      <div class="acc-l1">${esc(row.name)}
        <span class="acc-tag ${row.accType === "g" ? "acc-g" : "acc-f"}">${row.accType}</span>
        ${idle !== null && idle >= 30 ? '<span class="tag30">復帰30日+</span>' : ""}
        ${dup.isDup(row) ? '<span class="tagdup">垢重複</span>' : ""}
        ${row.archived ? '<span class="chip" style="padding:1px 5px">ア</span>' : ""}
        <span class="acc-idle num">${idle === null ? "CI記録なし" : `放置${idle}日`}</span>
      </div>
      <div class="acc-l2">
        <span>${esc(row.email) || "メール未入力"}</span>
        <span class="num">${row.pw ? (U.accShowPw ? esc(row.pw) : "•".repeat(Math.min(row.pw.length, 10))) : "パス未入力"}</span>
      </div>
    </div>`;
  }).join("");
  document.getElementById("accPanel").innerHTML = html;
}

// ---- イベント委譲 ----
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  switch (act) {
    case "undo": undo(); break;
    case "redo": redo(); break;
    case "togglePanel": U.panels[el.dataset.p] = !U.panels[el.dataset.p]; if (el.dataset.p === "bk") setMsg("bkMsg", ""); render(); break;
    case "addDevice": addDeviceByName(document.getElementById("newName").value); break;
    case "addParent": addParentByName(document.getElementById("newParent").value); break;
    case "toggleOrgDev": U.orgDev = !U.orgDev; render(); break;
    case "toggleOrgPar": U.orgPar = !U.orgPar; render(); break;
    case "delNameHist": snapshot(null); S.nameHistory = S.nameHistory.filter((x) => x !== el.dataset.n); commit(); break;
    case "delParHist": snapshot(null); S.parentHistory = S.parentHistory.filter((x) => x !== el.dataset.n); S.parentList = S.parentList.filter((x) => x !== el.dataset.n); commit(); break;
    case "delParent": snapshot(null); S.parentList = S.parentList.filter((x) => x !== el.dataset.n); commit(); break;
    case "todayFilter": U.filterMode = U.filterMode === el.dataset.m ? "all" : el.dataset.m; render(); break;
    case "toggleArch": U.filterMode = U.filterMode === "arch" ? "all" : "arch"; render(); break;
    case "toggleOpen": U.open[id] = !U.open[id]; render(); break;
    case "toggleRec": U.openRec[id] = !U.openRec[id]; render(); break;
    case "ciOk": ciOk(id); break;
    case "ciNg": ciNg(id); break;
    case "taskOk": taskOk(id); break;
    case "taskNg": taskNg(id); break;
    case "bump": bump(id, el.dataset.k, Number(el.dataset.d)); break;
    case "setAcc": upd(id, "accType", el.dataset.v); break;
    case "setFirstCi": {
      const r = findRow(id);
      const v = el.dataset.v === "1";
      upd(id, "firstCheckin", r && r.firstCheckin === v ? null : v);
      break;
    }
    case "toggleCiErr": { const r = findRow(id); if (r && !r.ciError) logAct(r.name, "CIエラー"); upd(id, "ciError", !(r && r.ciError)); break; }
    case "toggleTaskErr": { const r = findRow(id); if (r && !r.taskError) logAct(r.name, "タスクエラー"); upd(id, "taskError", !(r && r.taskError)); break; }
    case "setPass": {
      const r = findRow(id);
      const nv = r && r.passStatus === el.dataset.v ? null : el.dataset.v;
      if (nv && r) logAct(r.name, nv === "pass" ? "通過" : "否");
      upd(id, "passStatus", nv);
      break;
    }
    case "togglePw": U.showPw[id] = !U.showPw[id]; render(); break;
    case "toggleAccPw": U.accShowPw = !U.accShowPw; render(); break;
    case "domAdd": U.domAdd = { id, text: "" }; render(); document.getElementById("domAddInput")?.focus(); break;
    case "evAdd": U.evAdd = { id, text: "" }; render(); document.getElementById("evAddInput")?.focus(); break;
    case "evCommit": {
      const v = (U.evAdd?.text || document.getElementById("evAddInput")?.value || "").trim();
      const r = findRow(id);
      if (v && r) {
        snapshot(null);
        if (!S.eventList.includes(v)) S.eventList.push(v);
        r.eventName = v;
      }
      U.evAdd = null;
      commit();
      break;
    }
    case "domCommit": {
      let d = (U.domAdd?.text || document.getElementById("domAddInput")?.value || "").trim();
      const r = findRow(id);
      if (d && r) {
        if (!d.startsWith("@")) d = "@" + d;
        snapshot(null);
        if (!S.domainList.includes(d)) S.domainList.push(d);
        const em = r.email || "";
        const at2 = em.indexOf("@");
        r.email = (at2 === -1 ? em : em.slice(0, at2)) + d;
      }
      U.domAdd = null;
      commit();
      break;
    }
    case "saveRec": saveRecord(id); break;
    case "delRec": {
      e.stopPropagation();
      snapshot(null);
      const r = findRow(id);
      if (r) r.records = r.records.filter((rc) => rc.id !== el.dataset.rec);
      commit();
      break;
    }
    case "toggleArchived": {
      const r = findRow(id);
      if (r) { logAct(r.name, r.archived ? "アーカイブ復帰" : "アーカイブ"); upd(id, "archived", !r.archived); }
      break;
    }
    case "askDel": U.confirmDel[id] = true; render(); break;
    case "cancelDel": U.confirmDel[id] = false; render(); break;
    case "reallyDel": snapshot(null); S.rows = S.rows.filter((x) => x.id !== id); U.confirmDel[id] = false; commit(); break;
    case "calPrev": U.calYM = U.calYM.m === 0 ? { y: U.calYM.y - 1, m: 11 } : { y: U.calYM.y, m: U.calYM.m - 1 }; renderCal(); break;
    case "calNext": U.calYM = U.calYM.m === 11 ? { y: U.calYM.y + 1, m: 0 } : { y: U.calYM.y, m: U.calYM.m + 1 }; renderCal(); break;
    case "calSel": U.calSel = el.dataset.d; renderCal(); break;
    case "bkCopy": bkCopy(); break;
    case "bkPaste": bkPaste(); break;
    case "bkManual": bkManual(); break;
    case "bkFileSave": bkFileSave(); break;
    case "bkFileLoad": bkFileLoad(); break;
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  // ファイル読込
  if (el.id === "bkFile") {
    const file = el.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      if (!restoreFrom(r.result)) setMsg("bkMsg", "ファイルが読めませんでした。ファイル保存で作ったJSONを選んでください");
    };
    r.readAsText(file);
    el.value = "";
    return;
  }
  // ツールバー・登録プルダウン
  const act2 = el.dataset.act2;
  if (act2 === "devSelPick") { if (el.value) addDeviceByName(el.value); return; }
  if (act2 === "parSelPick") { if (el.value) addParentByName(el.value); return; }
  if (act2 === "setSearch") { U.searchQ = el.value; render(); return; }
  if (act2 === "setSort") { U.sortMode = el.value; render(); return; }
  if (act2 === "setFilter") { U.filterMode = el.value; render(); return; }
  // カード内フィールド
  const f = el.dataset.f;
  const id = el.dataset.id;
  if (!f || !id) return;
  const r = findRow(id);
  if (!r) return;
  if (f === "name") {
    const v = el.value.trim();
    if (!v) { render(); return; }
    if (v !== r.name && S.rows.some((x) => x.id !== id && x.name === v && !x.archived)) {
      alert("同じ名前の現役端末があるため変更できません");
      render();
      return;
    }
    snapshot(null);
    r.name = v;
    if (!S.nameHistory.includes(v)) S.nameHistory.push(v);
    commit();
  } else if (f === "evAddText") {
    if (U.evAdd) U.evAdd.text = el.value;
  } else if (f === "emailLocal") {
    const em = r.email || "";
    const at = em.indexOf("@");
    const dom = at === -1 ? "@gmail.com" : em.slice(at);
    upd(id, "email", el.value + dom, `upd:${id}:email`);
  } else if (f === "emailDom") {
    const em = r.email || "";
    const at = em.indexOf("@");
    upd(id, "email", (at === -1 ? em : em.slice(0, at)) + el.value, `upd:${id}:email`);
  } else if (f === "domAddText") {
    if (U.domAdd) U.domAdd.text = el.value;
  } else {
    upd(id, f, el.value, `upd:${id}:${f}`);
  }
});

// Enterで追加
document.getElementById("newName").addEventListener("keydown", (e) => { if (e.key === "Enter") addDeviceByName(e.target.value); });
document.getElementById("newParent").addEventListener("keydown", (e) => { if (e.key === "Enter") addParentByName(e.target.value); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "domAddInput") {
    const id = e.target.dataset.id;
    if (U.domAdd) U.domAdd.text = e.target.value;
    document.querySelector(`[data-act="domCommit"][data-id="${id}"]`)?.click();
  }
  if (e.key === "Enter" && e.target.id === "evAddInput") {
    const id = e.target.dataset.id;
    if (U.evAdd) U.evAdd.text = e.target.value;
    document.querySelector(`[data-act="evCommit"][data-id="${id}"]`)?.click();
  }
});

// 日付跨ぎでreを更新
setInterval(() => render(), 60000);

// PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

load();
render();
