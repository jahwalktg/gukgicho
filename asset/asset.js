// 자산형성 길잡이 — 화면. 저장하지 않는다(서버·브라우저 저장 없음).
import { judge, project, schedule, nextDeadline, lines, fmtWon, fmtMan, won } from "./asset-engine.js?v=3";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const P = (p) => `<span class="aref">자산형성 안내 p.${p}</span>`;
const MAN = 10000;

const state = { D: null, view: "judge", r: null, from: false,
  f: freshForm(), calc: { kind: null, self: 10, naeil: null, suik: 0, stop: 0, gongje: false, hope2Old: false },
  keep: { kind: "hope1", ym: "", special: false } };
function freshForm() { return { n: 1, benefits: { s: false, u: false, j: false, g: false, c: false }, recognized: null, earned: 0, special: false, jahwal: "none", youths: [] }; }

const KIND = { hope1: "희망저축계좌Ⅰ", hope2: "희망저축계좌Ⅱ", youth: "청년내일저축계좌" };
const STATUS = { ok: ["ok", "가입 가늠 ○"], check: ["cond", "확인 필요 △"], no: ["no", "어려워 보여요 ×"] };
const MARK = (ok) => ok === true ? '<span class="mk y">✓</span>' : ok === false ? '<span class="mk n">✕</span>' : '<span class="mk q">?</span>';

// ---------- 쉬운 말 (점선 밑줄 → 풀이) — 가늠표 app.js 와 같은 방식 ----------
const TIP = `<div class="tip">💡 점선 밑줄 말에 마우스를 올리면(폰은 톡 누르면) 쉬운 풀이가 떠요</div>`;
let TERM_RE = null;
function termRegex() {
  if (TERM_RE) return TERM_RE;
  const terms = Object.keys(state.EASY || {}).sort((a, b) => b.length - a.length);
  if (!terms.length) return null;
  TERM_RE = new RegExp("(" + terms.map((t) => { const e = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return t.length <= 2 ? `(?<![가-힣])${e}(?![가-힣])` : e; }).join("|") + ")");
  return TERM_RE;
}
/** 한 덩어리 안에서 말마다 처음 나온 곳에만 밑줄 */
function wrapTerms(root) {
  const re = termRegex(); if (!re || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
    const p = n.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
    if (p.closest(".term, script, style, input, textarea, select, button, .aref, .pop, .no-term, h1, h2, .tlist b")) return NodeFilter.FILTER_REJECT;
    return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  const seen = new Set();
  for (const n of nodes) {
    const parts = n.nodeValue.split(re); if (parts.length < 2) continue;
    const frag = document.createDocumentFragment();
    parts.forEach((part, k) => {
      if (k % 2 === 1 && !seen.has(part)) { seen.add(part); const sp = document.createElement("span"); sp.className = "term"; sp.dataset.term = part; sp.textContent = part; frag.appendChild(sp); }
      else frag.appendChild(document.createTextNode(part));
    });
    n.parentNode.replaceChild(frag, n);
  }
}
const wrapAll = (...sel) => sel.forEach((x) => $$(x).forEach(wrapTerms));
function showPop(el) {
  const t = el.dataset.term, txt = state.EASY[t]; if (!txt) return;
  const pop = $("#pop"); pop.innerHTML = `<button class="x" aria-label="닫기">✕</button><b>${esc(t)}</b>${esc(txt)}<div class="small" style="margin-top:6px;opacity:.75">쉬운 풀이예요. 정확한 뜻은 지침 원문이 기준.</div>`;
  pop.hidden = false;
  const r = el.getBoundingClientRect(); let left = window.scrollX + r.left;
  left = Math.min(left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12);
  pop.style.top = window.scrollY + r.bottom + 8 + "px"; pop.style.left = Math.max(8, left) + "px";
  $(".x", pop).onclick = hidePop;
}
function hidePop() { const p = $("#pop"); if (p) p.hidden = true; }
document.addEventListener("click", (e) => { const t = e.target.closest(".term"); if (t) { e.stopPropagation(); showPop(t); } else if (!e.target.closest("#pop")) hidePop(); });
let popTimer = null;
document.addEventListener("mouseover", (e) => { const t = e.target.closest(".term"); if (t) { clearTimeout(popTimer); showPop(t); } });
document.addEventListener("mouseout", (e) => { const t = e.target.closest(".term"); if (t) { clearTimeout(popTimer); popTimer = setTimeout(() => { if (!$("#pop").matches(":hover")) hidePop(); }, 350); } });

/** 쉬운 말 탭: 자산형성에 나오는 말 모음 */
function renderTerms(q = "") {
  const list = state.TERMS.filter(([t, e]) => !q || t.includes(q) || e.includes(q));
  $("#tlist").innerHTML = `<div class="tlist">${list.map(([t, e]) => `<div class="t"><b>${esc(t)}</b><div>${esc(e)}</div></div>`).join("") || '<p class="muted">없어요. 다른 말로 찾아 보세요.</p>'}</div>`;
}

// ---------- 화면 전환 ----------
function go(v) {
  state.view = v;
  $$(".view").forEach((x) => x.classList.toggle("on", x.id === "v-" + v));
  $$("nav.tabs button").forEach((b) => b.classList.toggle("on", b.dataset.go === v));
  window.scrollTo({ top: 0 });
  if (v === "compare") renderCompare();
  if (v === "keep") renderKeep();
  if (v === "counsel") renderCounsel();
  if (v === "terms") renderTerms($("#tq") ? $("#tq").value.trim() : "");
  hidePop();
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) { e.preventDefault(); go(b.dataset.go); } });

// ---------- 국기초 가늠표에서 이어받기 (#from=gauge&n=..&r=..&e=..&b=su&j=ok&sp=1&y=25:1200000,31:0) ----------
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("from") !== "gauge") return;
  const f = freshForm();
  f.n = Math.min(8, Math.max(1, +h.get("n") || 1));
  if (h.get("r") !== null && h.get("r") !== "") f.recognized = won(h.get("r"));
  f.earned = won(h.get("e"));
  const b = h.get("b") || ""; for (const k of "sujgc") f.benefits[k] = b.includes(k);
  f.special = h.get("sp") === "1";
  f.jahwal = ["ok", "excluded"].includes(h.get("j")) ? h.get("j") : "none";
  f.youths = (h.get("y") || "").split(",").filter(Boolean).map((x) => { const [a, e] = x.split(":"); return { age: +a, earned: won(e) }; });
  state.f = f; state.from = true;
  history.replaceState(null, "", location.pathname);   // 주소창에 숫자를 남기지 않음
}

// ---------- ① 가입 자격 ----------
function renderForm() {
  const f = state.f, b = f.benefits;
  const chip = (k, t) => `<button class="chip ${b[k] ? "on" : ""}" data-b="${k}">${t}</button>`;
  $("#form").innerHTML = `
  <div class="fgrid">
    <label><span>가구원 수<small>국기초 보장 가구 기준</small></span>
      <select id="f-n">${[1, 2, 3, 4, 5, 6, 7, 8].map((x) => `<option value="${x}" ${f.n === x ? "selected" : ""}>${x}인${x === 8 ? " 이상" : ""}</option>`).join("")}</select></label>
    <label><span>소득인정액<small>한 달, 만원 · 모르면 비워 두세요</small></span>
      <input type="number" id="f-r" min="0" step="0.1" inputmode="decimal" value="${f.recognized == null ? "" : f.recognized / MAN}" placeholder="예: 150"></label>
    <label><span>가구 근로·사업소득 합계<small>한 달, 만원 · 공제 전 · 자활근로 포함</small></span>
      <input type="number" id="f-e" min="0" step="0.1" inputmode="decimal" value="${f.earned ? f.earned / MAN : ""}" placeholder="예: 161.4"></label>
  </div>
  <div class="frow"><span class="lab">지금 받는 것 <small>여러 개 고를 수 있어요</small></span><div class="chips" id="f-b">${chip("s", "생계급여")}${chip("u", "의료급여")}${chip("j", "주거급여")}${chip("g", "교육급여")}${chip("c", "차상위")}</div></div>
  <div class="frow"><label class="chk"><input type="checkbox" id="f-sp" ${f.special ? "checked" : ""}><span>가구원 중 <b>특례 수급자</b>가 있어요 <small class="muted">(자활급여특례·의료급여특례 등)</small></span></label></div>
  <div class="frow"><span class="lab">자활근로 참여</span>
    <select id="f-j">
      <option value="none" ${f.jahwal === "none" ? "selected" : ""}>참여하지 않음</option>
      <option value="ok" ${f.jahwal === "ok" ? "selected" : ""}>사업단 참여 — 시장진입형·사회서비스형·시간제·청년자립도전</option>
      <option value="excluded" ${f.jahwal === "excluded" ? "selected" : ""}>Gateway·인턴·도우미형·근로유지형</option>
    </select></div>
  <div class="frow"><span class="lab">만 15~39세 청년 가구원 <small>청년내일저축계좌 가늠용</small></span>
    <div id="f-y">${f.youths.map((y, i) => `<div class="yrow" data-i="${i}"><input type="number" class="y-a" min="0" max="99" value="${y.age ?? ""}" placeholder="나이"><span>세</span><input type="number" class="y-e" min="0" step="0.1" value="${y.earned ? y.earned / MAN : ""}" placeholder="본인 근로·사업소득"><span>만원</span><button class="ghost sm y-x" title="빼기">✕</button></div>`).join("")}</div>
    <button class="ghost sm" id="y-add">＋ 청년 넣기</button></div>
  <p class="small muted">소득인정액을 모르면 <a href="../">국기초 가늠표</a>로 먼저 가늠해 보세요. 가늠표 결과 화면의 「💰 자산형성 길잡이로」를 누르면 숫자가 여기로 그대로 넘어와요.</p>`;
  const num = (el) => (el.value === "" ? null : Math.max(0, Number(el.value)) * MAN);
  $("#f-n").onchange = (e) => { f.n = +e.target.value; update(); };
  $("#f-r").oninput = (e) => { f.recognized = num(e.target); update(); };
  $("#f-e").oninput = (e) => { f.earned = num(e.target) || 0; update(); };
  $$("#f-b .chip").forEach((c) => (c.onclick = () => { b[c.dataset.b] = !b[c.dataset.b]; c.classList.toggle("on", b[c.dataset.b]); update(); }));
  $("#f-sp").onchange = (e) => { f.special = e.target.checked; update(); };
  $("#f-j").onchange = (e) => { f.jahwal = e.target.value; state.calc.naeil = null; update(); };
  $("#y-add").onclick = () => { f.youths.push({ age: null, earned: 0 }); renderForm(); update(); };
  $$("#f-y .yrow").forEach((row) => {
    const y = f.youths[+row.dataset.i];
    $(".y-a", row).oninput = (e) => { y.age = e.target.value === "" ? null : +e.target.value; update(); };
    $(".y-e", row).oninput = (e) => { y.earned = (num(e.target) || 0); update(); };
    $(".y-x", row).onclick = () => { f.youths.splice(+row.dataset.i, 1); renderForm(); update(); };
  });
}

function card(kind, res, title, sub, ref, extra = "") {
  const [cls, label] = STATUS[res.status];
  return `<div class="acard ${cls}">
    <div class="ahead"><div><b>${title}</b><div class="small muted">${sub}</div></div><span class="pill ${cls}">${label}</span></div>
    <ul class="checks">${res.checks.map((c) => `<li>${MARK(c.ok)}<span>${esc(c.t)}</span></li>`).join("")}</ul>
    ${(res.notes || []).map((t) => `<p class="small note">💡 ${esc(t)}</p>`).join("")}
    ${extra}
    <div class="small">근거 ${ref}</div>
  </div>`;
}

function update() {
  const r = judge(state.f, state.D); state.r = r;
  const A = state.D.asset;
  const naeilTxt = r.naeil ? `<p class="small plus">➕ 자활근로 사업단 참여자라 <b>내일키움장려금 월 20만원</b> + <b>내일키움수익금 월 15만원 이내</b>가 더 쌓일 수 있어요(전월 12일 이상 실근무 + 그달 10만원 이상 저축). ${P(24)}</p>`
    : state.f.jahwal === "excluded" ? `<p class="small note">💡 Gateway·인턴·도우미형·근로유지형은 내일키움장려금·수익금 대상이 아니에요. 사업단으로 옮기면 그때부터 붙어요. ${P(24)}</p>` : "";
  const h1 = card("hope1", r.hope1, "희망저축계좌Ⅰ", A.accounts.hope1.who, P("35~36"), r.hope1.status !== "no" ? naeilTxt : "");
  const h2 = card("hope2", r.hope2, "희망저축계좌Ⅱ", A.accounts.hope2.who, P("48~49"), r.hope2.status !== "no" ? naeilTxt : "");
  const ys = r.youth.length
    ? r.youth.map((y) => card("youth", y, "청년내일저축계좌", `<b class="who">청년 ${y.i + 1}${y.age != null ? ` · 만 ${y.age}세` : ""}</b> · ${A.accounts.youth.who}`, P("61~62"), y.status !== "no" ? naeilTxt : "")).join("")
    : `<div class="acard none"><div class="ahead"><div><b>청년내일저축계좌</b><div class="small muted">${A.accounts.youth.who}</div></div><span class="pill">청년 없음</span></div><p class="small">만 15~39세 가구원이 있으면 위 「＋ 청년 넣기」로 넣어 보세요. 희망저축계좌Ⅰ·Ⅱ 가구의 청년은 <b>함께 가입</b>할 수 있어요. ${P(3)}</p></div>`;
  const picks = [r.hope1.status !== "no" && "희망저축계좌Ⅰ", r.hope2.status !== "no" && "희망저축계좌Ⅱ", r.youth.some((y) => y.status !== "no") && "청년내일저축계좌"].filter(Boolean);
  $("#judgeOut").innerHTML = `
    <div class="sec"><div class="ico">💰</div><h3>우리 집이면 — 통장마다 가늠</h3></div>
    <div class="summary ${picks.length ? "" : "none"}">${picks.length ? `가늠으로 들어갈 수 있어 보이는 통장: <b>${picks.join(" + ")}</b>${r.both ? " (가구 통장과 청년 통장은 함께 가입할 수 있어요)" : ""}` : "지금 넣은 숫자로는 들어갈 수 있는 통장이 보이지 않아요. ✕ 줄을 보고 무엇이 모자란지 확인해 보세요."}
      <div class="btns"><button data-go="compare">🧮 3년 모으면 얼마쯤? (비교·고르기)</button><button class="ghost" data-go="keep">가입 뒤 지킬 것</button></div></div>
    <div class="acards">${h1}${h2}${ys}</div>`;
  renderBand(); renderLTable();
  wrapAll("#judgeOut .acard", "#judgeOut .summary", "#band", "#ltable", "#v-judge .intro");
}

function renderBand() {
  const f = state.f, L = lines(state.D, f.n);
  const max = 1.0, pct = (v) => Math.min(100, Math.max(0, (v / L.median) * 100 / max));
  const mk = [
    [0.24, "Ⅰ 근로·사업소득 하한", "40%의 60% = 24%", L.hope1Earned, "e"],
    [0.32, "생계급여 선", "32%", won(L.median * 0.32), "g"],
    [0.40, "Ⅰ 소득인정액 상한 (의료급여 선)", "40%", L.hope1Recognized, "r"],
    [0.50, "Ⅱ·청년내일 소득인정액 상한", "50%", L.half, "r"],
  ];
  const our = [];
  if (f.recognized != null) our.push(["우리 집 소득인정액", f.recognized, "ourR"]);
  if (f.earned) our.push(["우리 집 근로·사업소득", f.earned, "ourE"]);
  $("#band").innerHTML = `
    <p><b>희망저축계좌Ⅰ은 두 줄을 함께 봐요.</b> ① 받는 쪽(소득인정액)은 기준 중위소득의 <b>40% 아래</b>, ② 일해서 버는 쪽(근로·사업소득)은 그 40%의 <b>60% 위</b>(= 기준 중위소득의 24%). 쉽게 말해 "<b>생계·의료급여를 받을 만큼 어렵지만, 일해서 버는 돈은 어느 정도 있는</b> 가구"예요. 희망저축계좌Ⅱ·청년내일저축계좌는 소득인정액 <b>50% 아래</b>가 기준이고요.</p>
    <div class="aband">
      <div class="bar"><div class="z z1" style="width:${pct(L.hope1Recognized)}%"></div><div class="z z2" style="left:${pct(L.hope1Recognized)}%;width:${pct(L.half) - pct(L.hope1Recognized)}%"></div></div>
      ${mk.map(([r, t, p, v, c], i) => `<div class="tick ${c} ${i % 2 ? "dn" : "up"}" style="left:${r * 100}%"><i></i><span><b>${p}</b><em> ${t}<br>${fmtWon(v)}</em><b class="sh">${Math.round(r * 100)}%</b></span></div>`).join("")}
      ${our.map(([t, v, c]) => `<div class="our ${c}" style="left:${pct(v)}%"><i></i><span><em>${t}<br></em><b>${fmtMan(v)}</b>${v > L.median ? " (100% 넘음)" : ""}</span></div>`).join("")}
      <div class="lower"></div><div class="scale"><span>0</span><span>기준 중위소득 ${f.n}인 ${fmtWon(L.median)} (100%)</span></div>
    </div>
    <ul class="bandlist small">${mk.map(([r, t, p, v, c]) => `<li class="${c}"><b>${p}</b> ${t} — ${fmtWon(v)}</li>`).join("")}${our.map(([t, v, c]) => `<li class="${c}"><b>▲</b> ${t} — ${fmtWon(v)}</li>`).join("")}</ul>
    <p class="small legend"><i class="lg g"></i>희망저축계좌Ⅰ 소득인정액 범위(40% 이하) <i class="lg b"></i>Ⅱ·청년내일까지(50% 이하) <i class="lg e"></i>Ⅰ 근로·사업소득은 이 선 위 <span class="tri r">▲</span>우리 집 소득인정액 <span class="tri e">▲</span>우리 집 근로·사업소득</p>
    <p class="small muted">통장을 <b>유지</b>하는 동안에는 근로·사업소득이 <b>월 10만원 아래로 6개월 연속</b> 떨어지면 안 되고(희망저축계좌Ⅰ), 위로는 소득상한 ${fmtWon(L.cap)}(1~3인 가구는 3인 가구 기준 중위소득 100%)까지예요. ${P("35~36")}</p>`;
}

function renderLTable() {
  const n = state.f.n;
  const rows = [1, 2, 3, 4, 5, 6, 7].map((k) => { const L = lines(state.D, k); return `<tr class="${k === Math.min(n, 7) ? "me" : ""}"><td>${k}인</td><td class="n">${fmtWon(L.median)}</td><td class="n">${fmtWon(L.hope1Recognized)}</td><td class="n">${fmtWon(L.hope1Earned)}</td><td class="n">${fmtWon(L.half)}</td><td class="n">${fmtWon(L.cap)}</td></tr>`; }).join("");
  $("#ltable").innerHTML = `<div class="tbl"><table class="rc"><tr><th>가구</th><th class="n">기준 중위소득</th><th class="n">Ⅰ 가입: 소득인정액<br>(40% 이하)</th><th class="n">Ⅰ 가입: 근로·사업소득<br>(40%의 60% 이상)</th><th class="n">Ⅱ·청년내일 가입<br>(소득인정액 50% 이하)</th><th class="n">유지: 소득상한<br>(근로·사업소득)</th></tr>${rows}</table></div>
  <p class="small muted">8인 이상은 1인마다 기준 중위소득 959,198원씩 더해요. 유지 기준의 소득하한은 월 10만원이에요. 청년내일저축계좌는 <b>청년 본인</b>의 근로·사업소득이 월 10만원 이상이어야 해요. 근거 ${P(35)} · ${P(49)} · ${P(62)}</p>`;
}

// ---------- ② 통장 비교·고르기 ----------
function renderCompare() {
  const A = state.D.asset, X = A.extras;
  const has = (k, e) => A.accounts[k].extras.includes(e) ? "○" : "—";
  $("#cmpTable").innerHTML = `<div class="tbl"><table class="rc cmp">
    <tr><th></th><th>희망저축계좌Ⅰ</th><th>희망저축계좌Ⅱ</th><th>청년내일저축계좌</th></tr>
    <tr><th>누가</th><td>일하는 <b>생계·의료</b> 수급 가구</td><td>일하는 <b>주거·교육</b> 수급 가구, <b>차상위</b> 가구</td><td>수급·차상위(중위 50% 이하) 가구의 <b>만 15~39세</b> 일하는 청년</td></tr>
    <tr><th>소득 기준</th><td>소득인정액 ≤ 중위 40%<br>가구 근로·사업소득 ≥ 40%의 60%</td><td>소득인정액 ≤ 중위 50%<br>근로·사업소득이 조금이라도 있으면</td><td>가구 소득인정액 ≤ 중위 50%<br>청년 본인 근로·사업소득 ≥ 월 10만원</td></tr>
    <tr><th>본인 저축</th><td colspan="3" class="c">월 10만원 이상 (최대 50만원까지 자유롭게)</td></tr>
    <tr><th>정부지원<br><small>(근로소득장려금)</small></th><td><b>월 30만원</b></td><td><b>1년차 10만 → 2년차 20만 → 3년차 30만원</b><br><small>('22~'24 가입자는 월 10만원)</small></td><td><b>월 30만원</b></td></tr>
    <tr><th>${X.gongje.name}</th><td class="c">—</td><td class="c">—</td><td class="c">○ <small>(가입 때 생계수급 청년, 월 10만)</small></td></tr>
    <tr><th>${X.tal.name}</th><td class="c">○</td><td class="c">—</td><td class="c">○ <small>(가입 때 생계·의료)</small></td></tr>
    <tr><th>${X.naeil.name}</th><td class="c">${has("hope1", "naeil")} <small>월 20만</small></td><td class="c">${has("hope2", "naeil")} <small>월 20만</small></td><td class="c">${has("youth", "naeil")} <small>월 20만</small></td></tr>
    <tr><th>${X.suik.name}</th><td class="c">○ <small>월 15만 이내</small></td><td class="c">○ <small>월 15만 이내</small></td><td class="c">○ <small>월 15만 이내</small></td></tr>
    <tr><th>3년 모이는 돈<br><small>(월 10만 저축, 이자 빼고)</small></th><td><b>1,440만원</b> <small>(본인 360만)</small></td><td><b>1,080만원</b> <small>('25 이후 가입, 본인 360만)</small></td><td><b>1,440만원</b> <small>(본인 360만)</small></td></tr>
    <tr><th>받는 조건</th><td>3년 만기 뒤 <b>6개월 안에 생계·의료급여에서 벗어나기</b>(탈수급)</td><td>3년간 <b>일 계속</b> + 자립역량교육 <b>10시간</b> + <b>자금사용계획서</b></td><td>3년간 <b>일 계속</b> + 자립역량교육 <b>10시간</b> + <b>자금사용계획서</b></td></tr>
    <tr><th>근거</th><td>${P("35~45")}</td><td>${P("48~57")}</td><td>${P("61~74")}</td></tr>
  </table></div>
  <p class="small muted">정책대상별 추가지원금은 매달 10만원 이상 저축하고 각 기준을 채운 달에만 쌓여요. 내일키움장려금·수익금은 자활근로 <b>사업단</b>(시장진입형·시간제·청년자립도전·사회서비스형)에 전월 12일 이상 실제로 일한 달에 붙고, Gateway·인턴·도우미형·근로유지형은 빠져요. 근거 ${P(3)} · ${P("22~25")}</p>`;
  renderCalc(); renderChoose();
  wrapAll("#cmpTable", "#choose li");
}

function bestKind() {
  const r = state.r; if (!r) return "hope1";
  if (r.hope1.status === "ok") return "hope1"; if (r.hope2.status === "ok") return "hope2";
  if (r.youth.some((y) => y.status === "ok")) return "youth";
  if (r.hope1.status !== "no") return "hope1"; if (r.hope2.status !== "no") return "hope2";
  return "hope1";
}
function renderCalc() {
  const c = state.calc, A = state.D.asset;
  if (!c.kind) c.kind = bestKind();
  if (c.naeil === null) c.naeil = state.f.jahwal === "ok";
  if (c.kind === "youth" && !c._g) { c.gongje = !!state.f.benefits.s; c._g = true; }
  const o = { ...c, self: c.self * MAN, suik: c.suik * MAN, suOrigin: state.f.benefits.s || state.f.benefits.u };
  const p = project(o, state.D);
  const k = c.kind;
  const bar = p.sum ? Math.round((p.self / p.sum) * 100) : 0;
  $("#calc").innerHTML = `
  <div class="chips" id="c-kind">${Object.entries(KIND).map(([key, t]) => `<button class="chip ${key === k ? "on" : ""}" data-k="${key}">${t}</button>`).join("")}</div>
  <div class="fgrid c3">
    <label><span>매달 저축 <b>${c.self}만원</b><small>10~50만원</small></span><input type="range" id="c-self" min="10" max="50" step="5" value="${c.self}"></label>
    <label><span>적립중지 <b>${c.stop}개월</b><small>3년 중 최대 12개월</small></span><input type="range" id="c-stop" min="0" max="12" step="1" value="${c.stop}"></label>
    <label class="${c.naeil ? "" : "dim"}"><span>내일키움수익금 <b>월 ${c.suik}만원</b><small>사업단 매출에 따라 0~15만원</small></span><input type="range" id="c-suik" min="0" max="15" step="1" value="${c.suik}" ${c.naeil ? "" : "disabled"}></label>
  </div>
  <div class="frow">
    <label class="chk"><input type="checkbox" id="c-naeil" ${c.naeil ? "checked" : ""}><span>자활근로 <b>사업단</b>에서 일해요 (내일키움장려금·수익금)</span></label>
    ${k === "youth" ? `<label class="chk"><input type="checkbox" id="c-gongje" ${c.gongje ? "checked" : ""}><span>가입 때 <b>생계급여</b> 수급 가구 청년 (근로소득공제금)</span></label>` : ""}
    ${k === "hope2" ? `<label class="chk"><input type="checkbox" id="c-old" ${c.hope2Old ? "checked" : ""}><span>2022~2024년에 가입했어요 (정부지원 월 10만원)</span></label>` : ""}
  </div>
  <div class="proj">
    <div class="tbl"><table class="rc">${p.rows.map((r) => `<tr><td>${r.k}</td><td class="n">${fmtWon(r.v)}</td></tr>`).join("")}
      <tr class="sum"><td>3년 만기에 받는 돈 (이자 빼고, ${p.months}개월 적립)</td><td class="n">${fmtWon(p.sum)}</td></tr></table></div>
    <div class="ratio"><div class="rbar"><i style="width:${bar}%"></i></div><div class="small">내가 넣은 돈 <b>${fmtMan(p.self)}</b> · 나라·사업단이 얹은 돈 <b>${fmtMan(p.support)}</b> — 내 돈 1에 <b>${p.self ? (p.support / p.self).toFixed(1) : "0"}</b>이 더 붙어요</div></div>
    ${p.tal ? `<p class="small plus">➕ 해지 때 생계·의료급여에서 벗어나 있으면 <b>탈수급장려금</b>이 더 있어요(금액은 가입 연도마다 달라 담당자 확인). ${P(24)}</p>` : ""}
  </div>
  <div class="sec sm"><h4>조건을 못 지키면 받는 돈이 이렇게 달라져요</h4></div>
  <div class="tbl"><table class="rc">
    <tr><td><b>만기 지급</b> — ${k === "hope1" ? "만기 뒤 6개월 안에 탈수급" : "3년 유지 + 교육 10시간 + 자금사용계획서"}</td><td class="n"><b>${fmtWon(p.sum)}</b> + 이자</td></tr>
    ${k === "hope1" ? `<tr><td><b>일부지급</b> — 유예기간(만기 뒤 6개월) 안에 탈수급 못 함 (처음 한 번, 다시 가입 가능)</td><td class="n">${fmtWon(p.partial)} + 이자<br><small>본인 저축 + 근로소득장려금의 5%(만기성공금)</small></td></tr>` : ""}
    <tr><td><b>환수</b> — ${k === "hope1" ? "근로소득 6개월 연속 10만원 미만, 저축 12개월 누적 미납, 압류, 본인 요청 등" : "일을 그만둠, 저축 12개월 누적 미납, 교육 미달, 계획서 미제출, 압류, 본인 요청 등"}</td><td class="n">${fmtWon(p.refund)} + 이자<br><small>내가 넣은 돈만</small></td></tr>
  </table></div>
  <p class="small muted">어림이에요. 정부지원은 저축액과 상관없이 정해진 금액이라 <b>10만원만 넣어도 지원은 다 붙고</b>, 더 넣는 돈은 내 저축이 늘 뿐이에요. 적립중지 달에는 지원금이 쌓이지 않아요. 실제 금액은 행복e음·자활정보시스템·은행 기준이에요. 근거 ${P(k === "hope1" ? "43~45" : k === "hope2" ? "55~57" : "73~74")} · ${P(15)}</p>
  <p class="small">만기 날짜와 받는 순서는 <span class="ref-like" data-go="keep">가입 뒤 유지·만기 →</span></p>`;
  $$("#c-kind .chip").forEach((b) => (b.onclick = () => { c.kind = b.dataset.k; renderCalc(); }));
  // 슬라이더는 끄는 동안 글자만 바꾸고, 손을 떼면 다시 계산(다시 그리면 끌기가 끊김)
  const bind = (id, key) => { const el = $(id); if (!el) return;
    if (el.type === "range") el.oninput = () => { const b = el.closest("label").querySelector("b"); if (b) b.textContent = b.textContent.replace(/\d+/, el.value); };
    el.onchange = (e) => { c[key] = el.type === "checkbox" ? e.target.checked : +e.target.value; renderCalc(); }; };
  bind("#c-self", "self"); bind("#c-stop", "stop"); bind("#c-suik", "suik"); bind("#c-naeil", "naeil"); bind("#c-gongje", "gongje"); bind("#c-old", "hope2Old");
  wrapAll("#calc .proj", "#calc .tbl:last-of-type", "#calc > p");
}

function renderChoose() {
  $("#choose").innerHTML = `<ul class="tips">
    <li><b>생계·의료급여를 받는 가구는 희망저축계좌Ⅰ만</b> 돼요(Ⅱ는 안 돼요). 핵심은 <b>3년 만기 뒤 6개월 안에 생계·의료에서 벗어나는 것</b>. 자활근로 소득이 늘어 기준 중위소득 40%를 넘고 <b>자활급여특례</b>가 되면 받을 조건을 채운 것으로 봐요. 못 벗어나도 <b>일부지급</b>(내 저축 + 근로소득장려금의 5%)은 받아요. ${P(43)}</li>
    <li><b>주거·교육·차상위 가구는 희망저축계좌Ⅱ</b>. 탈수급 조건은 없고, 대신 3년 동안 가구 중 누군가 일을 계속하고 자립역량교육 10시간을 듣고 자금사용계획서를 내야 해요. 중간에 생계·의료 수급자가 되면 그때까지 쌓인 돈을 <b>중도지급</b>으로 받아요. ${P("55~57")}</li>
    <li><b>만 15~39세 청년이 일하고 있으면 청년내일저축계좌</b>를 꼭 봐요. 정부지원 월 30만원으로 가장 크고, 희망저축계좌Ⅰ·Ⅱ와 <b>함께 가입</b>할 수 있어요(가구 통장 + 청년 통장). ${P(3)}</li>
    <li><b>자활센터 사업단 참여자라면</b> 세 통장 모두에 내일키움장려금 월 20만원과 수익금(월 15만원 이내)이 더 붙어 혜택이 가장 커요. 전월에 12일 이상 실제로 일해야 하니 결근이 잦으면 그달은 빠져요. ${P(24)}</li>
    <li><b>저축은 무리 없는 금액으로.</b> 월 10만원이면 지원은 다 받아요. 본인 저축을 12개월 누적 못 넣으면 지원금이 모두 사라지니(환수), 부담되는 금액을 정하지 않는 게 좋아요. ${P(45)}</li>
    <li><b>한 번뿐이에요.</b> 1가구(1인) 1회, 통장마다 1회이고, 지원금을 일부라도 받았으면 그 통장은 다시 가입할 수 없어요(희망저축계좌Ⅰ 일부지급·환수 뒤는 재가입 가능). ${P(3)} · ${P(45)}</li>
    <li><b>다른 지원 통장과 겹치는지</b> 확인해요. 같이 못 하는 예: 청년재직자 내일채움공제, 서울 희망두배청년통장, 경기 청년 노동자 통장 등. 같이 되는 예: 디딤씨앗통장, 청년도약계좌, 청년내일채움공제('23 신규부터). ${P("13~14")}</li>
    <li><b>통장 돈 때문에 수급이 깎이지 않아요.</b> 3년 적립 기간에 통장에 들어간 본인 저축과 근로소득장려금은 소득환산에서 빼요(기간이 끝나면 재산으로 봐요). 다만 본인적립금 통장은 압류방지가 안 돼요. ${P(36)} · ${P(31)}</li>
  </ul>`;
}

// ---------- ③ 가입 뒤 유지·만기 ----------
const PAY = {
  hope1: [
    ["만기 지급", "3년 만기 뒤 6개월(유예기간) 안에 생계·의료급여에서 모두 벗어나면", "본인 저축 + 근로소득장려금 + 추가지원금 + 이자 (다시 가입은 안 돼요)"],
    ["중도 지급", "만기 전에 탈수급하고 원할 때, 탈수급 뒤 최근 3개월 평균 소득이 상한(기준 중위소득 100%)을 넘을 때 등", "사유가 생긴 전달까지 쌓인 돈 전부"],
    ["일부 지급", "만기 뒤 유예기간 안에 탈수급을 못 했을 때 (처음 한 번)", "본인 저축 + 이자 + 근로소득장려금의 5%(만기성공금), 나머지는 환수 · 다시 가입 가능"],
    ["환수", "근로소득이 6개월 연속 월 10만원 미만, 본인 저축 12개월 누적 미납, 압류·가압류, 본인 요청, 만기성공금을 받고 다시 가입했는데 또 탈수급 못 함, 사유 생긴 뒤 6개월 안에 해지 신청서를 안 냄", "본인 저축 + 이자만"],
  ],
  hope2: [
    ["만기 지급", "3년 통장 유지 + 자립역량교육 10시간 + 자금사용계획서", "본인 저축 + 근로소득장려금 + 추가지원금 + 이자 (다시 가입은 안 돼요)"],
    ["중도 지급", "확인조사에서 가구 근로·사업소득이 상한을 넘음, 가구가 생계·의료 수급자로 책정됨(교육·계획서 갖추면), 본인 사망 뒤 가구원 요청", "사유가 생긴 전달까지 쌓인 돈 전부"],
    ["환수", "가구원 모두 일을 안 함(통보받고 1개월 안에 기간의 50% 이상 일했음을 소명하면 구제), 본인 저축 12개월 누적 미납, 교육 미달, 계획서 미제출, 압류·가압류, 본인 요청", "본인 저축 + 이자만"],
  ],
  youth: [
    ["만기 지급", "3년 통장 유지 + 일 계속 + 자립역량교육 10시간 + 자금사용계획서", "본인 저축 + 근로소득장려금 + 추가지원금 + 이자 (다시 가입은 안 돼요)"],
    ["중도 지급", "확인조사에서 청년 본인 근로·사업소득이 상한을 넘음 (교육·계획서 갖추면)", "사유가 생긴 전달까지 쌓인 돈 전부"],
    ["환수", "청년이 일을 안 함(통보받고 1개월 안에 기간의 50% 이상 일했음을 소명하면 구제), 본인 저축 12개월 누적 미납, 교육 미달, 계획서 미제출, 압류·가압류, 본인 요청, 본인 사망", "본인 저축 + 이자만"],
  ],
};
const PAYREF = { hope1: "43~45", hope2: "55~57", youth: "73~74" };

function renderKeep() {
  const k = state.keep, D = state.D, A = D.asset;
  const sc = schedule(k.ym, k.kind, D, { special: k.special });
  const dl = nextDeadline();
  const ym = (s) => { const [y, m] = s.split("-"); return `${y}년 ${+m}월`; };
  let when = "";
  if (sc) {
    const now = new Date(), [sy, sm] = sc.start.split("-").map(Number);
    const passed = (now.getFullYear() - sy) * 12 + (now.getMonth() + 1 - sm) + 1, total = sc.years * 12;
    const pctDone = Math.max(0, Math.min(100, Math.round((passed / total) * 100)));
    when = `<div class="when">
      <div><span class="small muted">첫 적립</span><b>${ym(sc.start)}</b></div>
      <div><span class="small muted">만기 (${sc.years}년째 마지막 달)</span><b>${ym(sc.end)}</b></div>
      ${sc.grace ? `<div class="hl"><span class="small muted">탈수급 마감 (유예 6개월 끝)</span><b>${ym(sc.grace)}</b></div>` : ""}
      <div><span class="small muted">지금</span><b>${passed < 1 ? "시작 전" : passed > total ? "만기 지남" : `${passed}개월째 / ${total}개월`}</b></div>
    </div><div class="rbar prog"><i style="width:${pctDone}%"></i></div>
    <p class="small muted">달 수로 센 어림이에요. 적립중지를 쓴 달이 있어도 가입 기간은 그대로예요(청년내일저축계좌 특별 적립중지 2년만 가입 기간이 5년으로 늘어요). 정확한 만기일은 통장·자활정보시스템에서 확인해요. ${P(15)}</p>`;
  }
  $("#keep").innerHTML = `
  <div class="intro card soft"><p><b>가입보다 어려운 건 3년을 지키는 것</b>이에요. 통장이 깨지는 이유 대부분은 "몰라서"예요. 내 통장을 고르면 지킬 것과 받는 돈이 그 통장 기준으로 바뀌어요.</p></div>
  <div class="card">
    <div class="chips" id="k-kind">${Object.entries(KIND).map(([key, t]) => `<button class="chip ${key === k.kind ? "on" : ""}" data-k="${key}">${t}</button>`).join("")}</div>
    <div class="fgrid k2">
      <label><span>첫 적립(가입) 연월<small>통장에 처음 저축한 달</small></span><input type="month" id="k-ym" value="${k.ym}"></label>
      ${k.kind === "youth" ? `<label class="chk mt"><input type="checkbox" id="k-sp" ${k.special ? "checked" : ""}><span>특별 적립중지(2년) 신청 — 군입대·임신출산 퇴직·육아휴직</span></label>` : ""}
      <div class="dl"><span class="small muted">이번 저축 마감 (${dl.getMonth() + 1}월 몫)</span><b>${dl.getMonth() + 1}월 ${dl.getDate()}일</b><span class="small muted">(22일, 주말이면 다음 월요일 · 공휴일은 다음 영업일)</span></div>
    </div>
    ${when}
  </div>

  <div class="sec"><div class="ico">📅</div><h3>매달 지킬 것</h3></div>
  <div class="card"><ul class="tips">
    <li><b>매달 10만원 이상 저축.</b> 한 달 몫은 <b>전월 23일 ~ 이달 22일</b>이에요. 자동이체는 1~20일로 걸어 두는 게 원칙이고, 늦어도 22일까지 직접 넣으면 돼요. 22일을 넘기면 다음 달 몫으로 처리돼 <b>그달 지원금이 없어요</b>. ${P(18)}</li>
    <li><b>일을 계속하기.</b> ${k.kind === "hope1" ? "가구 근로·사업소득이 <b>월 10만원 아래로 6개월 연속</b> 떨어지면 통장이 환수돼요." : k.kind === "hope2" ? "가구원 중 누군가는 일을 계속해야 해요. 확인조사에서 아무도 일하지 않으면 환수돼요." : "청년 본인이 일을 계속해야 해요. 확인조사에서 일하지 않으면 환수돼요."} ${P(k.kind === "hope1" ? 36 : k.kind === "hope2" ? 49 : 73)}</li>
    <li><b>못 넣는 달이 생기면 미리 적립중지.</b> 실직·본인이나 부양가족의 질병·사고처럼 부득이할 때 3년 중 최대 12개월(2026.1.31. 이후 신청분), 희망일 7일 전까지 신청. 중지 기간엔 지원금이 쌓이지 않지만 <b>미납으로 세지 않아요</b>. 신청 없이 12개월 누적 미납이면 환수예요. ${P(15)}</li>
    ${`<li><b>자활근로 사업단 참여자</b>는 전월 12일 이상 실제로 일해야 그달 내일키움장려금(20만원)·수익금이 붙어요. 결근·지각이 쌓여 12일이 안 되면 그달은 빠져요. ${P(24)}</li>`}
  </ul></div>

  <div class="sec"><div class="ico">📞</div><h3>이럴 땐 바로 담당자(읍·면·동·자활센터)에게</h3></div>
  <div class="card"><ul class="tips">
    <li>일을 그만두었거나 소득이 크게 줄었어요 → 적립중지·구제(기간의 50% 이상 일했음을 1개월 안에 소명) 가능 여부</li>
    <li>소득이 크게 늘었어요 → 소득상한을 넘으면 <b>중도지급</b>(그 전달까지 쌓인 돈)${k.kind === "hope1" ? ". 탈수급했다면 언제 해지할지 상의" : ""}</li>
    ${k.kind === "hope2" ? "<li>가구가 생계·의료급여 수급자가 되었어요 → 중도지급 대상이에요. 교육 10시간·자금사용계획서를 갖춰야 받아요</li>" : ""}
    ${k.kind === "youth" ? "<li>군입대·임신출산으로 퇴직·육아휴직 → <b>특별 적립중지(2년)</b>, 가입 기간이 5년으로 늘어요(희망일 7일 전, 증빙 필요)</li>" : ""}
    <li>통장에 압류·가압류 통지가 왔어요 → 풀 수 없으면 중도환수예요</li>
    <li>이사(전출입)했어요 → 새 주소지에서 관리가 이어지는지 확인</li>
  </ul></div>

  <div class="sec"><div class="ico">🎓</div><h3>만기 때 할 것</h3></div>
  <div class="card"><ul class="tips">
    ${k.kind === "hope1"
      ? `<li><b>탈수급이 핵심</b>이에요. 만기(${sc ? ym(sc.end) : "3년째 마지막 달"}) 뒤 6개월(${sc ? ym(sc.grace) + "까지" : "유예기간"}) 안에 생계·의료급여에서 모두 벗어나야 전액을 받아요. 자활근로 소득으로 기준 중위소득 40%를 넘어 <b>자활급여특례</b>가 되면 조건을 채운 것으로 봐요. 받으려고 일부러 수급을 포기하는 건 인정되지 않아요. ${P(43)}</li>
         <li>해지 사유가 생기면 <b>6개월 안에 해지 신청서</b>를 내요. 안 내면 환수될 수 있어요. ${P(45)}</li>`
      : `<li><b>자립역량교육 10시간</b>을 만기 전에 다 들어 두세요. 모자라면 지원금이 환수돼요.</li>
         <li><b>자금사용계획서</b>를 해지 신청서·적립금 지급 요구서와 함께 내요. 지원금 쓰는 곳: 주택 구입·임대, 본인·자녀 고등교육·기술훈련, 창업·운영자금, 그 밖의 자활·자립. ${P(k.kind === "hope2" ? 56 : 74)}</li>`}
    <li>지원금을 받는 계좌(입출금계좌)를 지급 전에 해지하지 마세요. 해지하면 대체계좌를 다시 내야 해서 늦어져요. ${P(21)}</li>
  </ul></div>

  <div class="sec"><div class="ico">💸</div><h3>${KIND[k.kind]} — 끝나는 경우마다 받는 돈</h3></div>
  <div class="card"><div class="tbl"><table class="rc pay"><tr><th>구분</th><th>이럴 때</th><th>받는 돈</th></tr>${PAY[k.kind].map(([a, b, c]) => `<tr><td><b>${a}</b></td><td>${b}</td><td>${c}</td></tr>`).join("")}</table></div>
    <p class="small muted">근거 ${P(PAYREF[k.kind])} · 이자는 통장 약관의 최초 약정이율(본인 요청 등 중도환수는 중도해지 이율)</p>
    <div class="btns"><button class="ghost" id="k-print">🖨️ 이 화면 A4로 인쇄 (가입자에게 드리기)</button></div></div>`;
  $$("#k-kind .chip").forEach((b) => (b.onclick = () => { k.kind = b.dataset.k; renderKeep(); }));
  $("#k-ym").onchange = (e) => { k.ym = e.target.value; renderKeep(); };
  const sp = $("#k-sp"); if (sp) sp.onchange = (e) => { k.special = e.target.checked; renderKeep(); };
  $("#k-print").onclick = () => window.print();
  wrapAll("#keep .intro", "#keep .card li", "#keep table.pay", "#keep .when + .rbar + p");
}

// ---------- ④ 상담·사례 ----------
const CHECK = [
  ["가구 구성과 받는 급여", "생계·의료면 Ⅰ, 주거·교육·차상위면 Ⅱ. 별도가구로 생계·의료를 받는 가구는 Ⅱ 불가. 자립지원 별도가구는 급여를 받는 가장 많은 가구원 수로 봐요.", "35·48"],
  ["예전에 자산형성 통장을 받은 적", "1가구(1인) 1회, 통장마다 1회. 지원금을 일부라도 받았으면 그 통장은 재가입 불가(Ⅰ 일부지급·환수 뒤는 가능).", "3"],
  ["소득인정액", "Ⅰ 40% 이하 / Ⅱ·청년내일 50% 이하. 특례 가구(Ⅰ)·자활 참여로 넘은 가구(Ⅱ)는 근로·사업소득이 상한 안이면 예외.", "35·48"],
  ["근로·사업소득 (공제 전)", "Ⅰ은 가구 합계가 40%의 60% 이상. 공적자료로 안 잡히는 근로는 고용·임금 확인서, 급여명세서·이체내역으로 보완.", "35·48"],
  ["만 15~39세 청년", "청년 본인 소득 월 10만원 이상(세전 100%). 근로장학금·무급근로·실업급여·육아휴직급여는 안 돼요. 가구 통장과 동시 가입 가능.", "61"],
  ["다른 자산형성 통장 가입 여부", "청년재직자 내일채움공제·지자체 청년통장 등은 중복 불가, 디딤씨앗·청년도약계좌 등은 가능.", "13~14"],
  ["매달 넣을 금액", "10만원이면 지원은 다 받아요. 12개월 누적 미납은 환수라 무리 없는 금액으로. 자동이체 1~20일.", "18"],
  ["자활근로 사업단 참여", "사업단(시장진입·시간제·청년자립도전·사회서비스형)이면 내일키움장려금 20만 + 수익금 15만 이내. 전월 12일 실근무.", "24"],
  ["받는 조건을 미리 약속", "Ⅰ은 3년+6개월 안 탈수급 계획, Ⅱ·청년은 교육 10시간·자금사용계획서. 못 지키면 받는 돈(일부지급·환수)도 설명.", "43·55·73"],
  ["서류와 모집 차수", "참여(변경) 신청서·저축동의서, 자가진단표, 개인정보 수집·이용·제공 동의서, 기타. 모집은 차수별 일정(2026 Ⅰ은 2·7·10월 차수, 변동 가능).", "37·140"],
];
const CASES = [
  { id: "A", t: "3인 생계수급, 엄마가 시장진입형 사업단", f: { n: 3, benefits: { s: true, u: true }, recognized: 900000, earned: 1614080, jahwal: "ok", youths: [] },
    point: "근로소득 161만원이 3인 하한(128.6만원)을 넘어 희망저축계좌Ⅰ. 사업단이라 내일키움장려금·수익금까지 — 월 10만 저축에 최대 월 75만원이 쌓여요. 핵심 상담은 '3년 안에 탈수급 계획'." },
  { id: "B", t: "1인 의료수급, 주 3일 아르바이트 50만원", f: { n: 1, benefits: { u: true }, recognized: 700000, earned: 500000, jahwal: "none", youths: [] },
    point: "1인 근로소득 하한은 61.5만원이라 지금은 Ⅰ이 어려워요. 11.5만원이 모자람 — 근무를 늘리거나 자활근로 참여를 함께 상담해 볼 만해요." },
  { id: "C", t: "2인 주거급여, 근로유지형 참여", f: { n: 2, benefits: { j: true }, recognized: 1500000, earned: 778440, jahwal: "excluded", youths: [] },
    point: "주거급여 가구라 희망저축계좌Ⅱ. 근로유지형은 내일키움장려금 대상이 아니라 사업단으로 옮기면 그달부터 붙는다는 점을 안내." },
  { id: "D", t: "4인 차상위, 25세 아들이 회사원", f: { n: 4, benefits: { c: true }, recognized: 3000000, earned: 3200000, jahwal: "none", youths: [{ age: 25, earned: 2100000 }] },
    point: "가구는 희망저축계좌Ⅱ, 아들은 청년내일저축계좌 — 함께 가입할 수 있어요. 아들 소득이 4인 소득상한(649만원) 안인지도 확인." },
  { id: "E", t: "1인 자활급여특례, 사회서비스형 사업단", f: { n: 1, benefits: { u: true }, special: true, recognized: 1150000, earned: 1399840, jahwal: "ok", youths: [] },
    point: "소득인정액이 40%(102.6만원)를 넘었지만 특례 가구라 근로·사업소득이 상한(535.9만원) 안이면 Ⅰ 가입 대상(소득기준특례). 특례로 가입했으면 특례에서도 벗어나야 지급 요건을 채워요." },
];
function renderCounsel() {
  $("#counsel").innerHTML = `
  <div class="intro card soft"><p>자산형성 담당자·자활센터 실무자용이에요. 상담 순서를 따라 확인하고, 가상 사례로 연습하고, 지금 넣은 내용으로 상담 결과 한 장을 뽑아 드릴 수 있어요. 사례의 인물·숫자는 모두 가상이에요.</p></div>
  <div class="sec"><div class="ico">✅</div><h3>상담 때 확인할 순서</h3></div>
  <div class="card"><ol class="clist">${CHECK.map(([t, d, p]) => `<li><label class="chk"><input type="checkbox"><span><b>${t}</b></span></label><div class="small">${d} ${P(p)}</div></li>`).join("")}</ol></div>
  <div class="sec"><div class="ico">🗂️</div><h3>가상 사례로 연습</h3></div>
  <div class="cases">${CASES.map((c) => `<div class="card case"><div class="cid">사례 ${c.id}</div><b>${c.t}</b>
    <div class="small muted">${c.f.n}인 · 소득인정액 ${fmtMan(c.f.recognized)} · 근로·사업소득 ${fmtMan(c.f.earned)}${c.f.youths.length ? ` · 청년 ${c.f.youths.map((y) => `${y.age}세 ${fmtMan(y.earned)}`).join(", ")}` : ""}</div>
    <details><summary>짚을 점</summary><p class="small">${c.point}</p></details>
    <div class="btns"><button class="ghost sm" data-case="${c.id}">이 사례 불러오기 →</button></div></div>`).join("")}</div>
  <div class="sec"><div class="ico">🖨️</div><h3>상담 결과 한 장</h3></div>
  <div class="card"><p class="small">「가입 자격」에 넣은 내용과 「비교·고르기」 어림을 묶어 A4 한 장으로 뽑아요. 이름 칸은 손으로 적게 비워 두었어요.</p>
    <div class="btns"><button id="sheet-print">🖨️ 상담 결과 인쇄</button></div></div>
  <div id="sheet" class="sheetbox"></div>`;
  $$("[data-case]").forEach((b) => (b.onclick = () => {
    const c = CASES.find((x) => x.id === b.dataset.case);
    state.f = Object.assign(freshForm(), JSON.parse(JSON.stringify(c.f)));
    state.f.benefits = Object.assign(freshForm().benefits, c.f.benefits);
    state.calc = { kind: null, self: 10, naeil: null, suik: 0, stop: 0, gongje: false, hope2Old: false };
    renderForm(); update(); go("judge");
    $("#handoff").innerHTML = `<div class="notice soft">가상 사례 ${c.id}를 불러왔어요 — ${esc(c.t)}. 짚을 점: ${esc(c.point)}</div>`;
  }));
  $("#sheet-print").onclick = printSheet;
  wrapAll("#counsel .intro", "#counsel ol.clist li", "#counsel .case");
}

function printSheet() {
  const f = state.f, r = state.r, b = f.benefits;
  const c = state.calc; if (!c.kind) c.kind = bestKind(); if (c.naeil === null) c.naeil = f.jahwal === "ok";
  const p = project({ ...c, self: c.self * MAN, suik: c.suik * MAN, suOrigin: b.s || b.u }, state.D);
  const st = (x) => STATUS[x.status][1];
  const list = (x) => `<ul>${x.checks.map((q) => `<li>${q.ok === true ? "✓" : q.ok === false ? "✕" : "?"} ${esc(q.t)}</li>`).join("")}</ul>`;
  $("#sheet").innerHTML = `<div class="sheet">
    <h2>자산형성 통장 상담 결과 <small>(참고용)</small></h2>
    <table class="rc meta"><tr><td>상담일 ${new Date().toLocaleDateString("ko-KR")}</td><td>성명 ____________</td><td>담당 ____________</td></tr>
      <tr><td colspan="3">${f.n}인 가구 · 받는 것: ${["s:생계", "u:의료", "j:주거", "g:교육", "c:차상위"].filter((x) => b[x[0]]).map((x) => x.slice(2)).join("·") || "없음/모름"}${f.special ? " · 특례 가구원" : ""} · 소득인정액 ${f.recognized == null ? "모름" : fmtWon(f.recognized)} · 근로·사업소득 ${fmtWon(f.earned)} · 자활근로 ${f.jahwal === "ok" ? "사업단" : f.jahwal === "excluded" ? "Gateway·근로유지형 등" : "없음"}</td></tr></table>
    <h3>희망저축계좌Ⅰ — ${st(r.hope1)}</h3>${list(r.hope1)}
    <h3>희망저축계좌Ⅱ — ${st(r.hope2)}</h3>${list(r.hope2)}
    ${r.youth.map((y) => `<h3>청년내일저축계좌 (청년 ${y.i + 1}${y.age != null ? `, 만 ${y.age}세` : ""}) — ${st(y)}</h3>${list(y)}`).join("")}
    <h3>${KIND[c.kind]} 3년 어림 (월 ${c.self}만원 저축${c.stop ? `, 적립중지 ${c.stop}개월` : ""})</h3>
    <table class="rc">${p.rows.map((x) => `<tr><td>${x.k}</td><td class="n">${fmtWon(x.v)}</td></tr>`).join("")}<tr class="sum"><td>만기에 받는 돈(이자 빼고)</td><td class="n">${fmtWon(p.sum)}</td></tr>${p.partial != null ? `<tr><td>탈수급 못 하면(일부지급)</td><td class="n">${fmtWon(p.partial)}</td></tr>` : ""}<tr><td>환수되면(내 저축만)</td><td class="n">${fmtWon(p.refund)}</td></tr></table>
    <h3>받는 조건 · 지킬 것</h3>
    <ul><li>매달 10만원 이상 저축 (전월 23일~당월 22일), 못 넣으면 미리 적립중지(최대 12개월)</li><li>${c.kind === "hope1" ? "3년 만기 뒤 6개월 안에 생계·의료급여에서 벗어나기(탈수급)" : "3년간 일 계속 + 자립역량교육 10시간 + 자금사용계획서"}</li><li>일을 그만두거나 소득이 크게 바뀌면 바로 담당자에게</li></ul>
    <p class="small">이 결과는 『2026년 자활사업안내(Ⅱ) 자산형성지원 통장사업 안내』의 기준으로 가늠한 참고 자료예요. 가입 여부는 공적 자료로 소득·재산을 조사해 시·군·구가 결정해요. 자산형성 길잡이 · jahwalktg.github.io/gukgicho/asset/</p>
  </div>`;
  document.body.classList.add("printing-sheet");
  window.print();
  setTimeout(() => document.body.classList.remove("printing-sheet"), 500);
}

// ---------- 시작 ----------
Promise.all(["../data/2026.json?v=7", "../data/dict.json?v=6", "../data/asset_terms.json?v=1"].map((u) => fetch(u).then((r) => r.json()))).then(([D, dict, AT]) => {
  state.D = D;
  // 쉬운 말: 가늠표 사전(easy·자활 용어) + 자산형성 사전(같은 말이면 자산형성 쪽)
  const jt = {}; (dict.jahwal || []).forEach((x) => { jt[x.t] = x.e; });
  const pick = ["시장진입형", "사회서비스형", "근로유지형", "인턴·도우미형", "시간제 자활근로", "청년자립도전자활사업단", "게이트웨이", "자활기업", "지역자활센터", "일반수급자", "차상위자", "희망저축계좌Ⅰ", "희망저축계좌Ⅱ"];
  state.EASY = { ...dict.easy, ...Object.fromEntries(pick.filter((k) => jt[k]).map((k) => [k, jt[k]])), ...AT.terms };
  const mine = ["희망저축계좌Ⅰ", "희망저축계좌Ⅱ", "청년내일저축계좌", ...Object.keys(AT.terms), "기준 중위소득", "소득인정액", "차상위", "생계급여", "의료급여", "주거급여", "교육급여", "자활급여특례", "확인조사", "가구원", "시장진입형", "사회서비스형", "근로유지형", "인턴·도우미형", "게이트웨이"];
  state.TERMS = [...new Set(mine)].filter((k) => state.EASY[k]).map((k) => [k, state.EASY[k]]);
  $("#tq").addEventListener("input", (e) => renderTerms(e.target.value.trim()));
  $$(".tipbox").forEach((x) => (x.innerHTML = TIP));
  readHash();
  if (state.from) $("#handoff").innerHTML = `<div class="notice soft">국기초 가늠표에서 우리 집 숫자를 이어받았어요(저장하지 않아요). 고칠 게 있으면 아래 칸에서 바로 고치세요.${state.f.jahwal === "ok" ? " 자활근로는 「사업단 참여」로 넣었어요 — Gateway·근로유지형이면 바꿔 주세요(내일키움장려금이 달라져요)." : ""}</div>`;
  wrapAll("#v-about .card");
  renderForm(); update();
  if (location.hash === "#keep") go("keep");
});
