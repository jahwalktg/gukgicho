import { compute, withExtraIncome, fmtMan, fmtWon, REGIONS, medianIncome, thresholds } from "./engine.js?v=8";
import { parseFreeText } from "./parse.js?v=6";
import { loadSearch, search, pageRef, SOURCES } from "./search.js?v=6";

const VERSION = "v0.6";
const CONTACT = { mail: "jahwalktg@gmail.com" };   // 2026-10-26 전화번호는 뺌(메일만)
// 의견 설문(구글 설문 「국기초 가늠표 — 의견 보내기」, jahwalktg 계정, 2026-10-26). 미리 채우기: 종류·내용·쓰던 화면
const FB_FORM = { url: "https://docs.google.com/forms/d/e/1FAIpQLSe3RkitFOW0kYWmdlF8xSf4tufd_9ZS-uC0OaRBpyVcdclE_w/viewform", type: "entry.390376584", text: "entry.1630338836", ctx: "entry.531365058" };
// 종류 보기는 설문 보기와 글자까지 같아야 미리 채워진다
const FB_TYPES = ["숫자나 계산이 틀렸어요", "근거 쪽수나 지침 내용이 다른 것 같아요", "쉬운 말 풀이가 이상하거나 어려워요", "글로 쓴 상황을 잘못 읽어요", "화면이 불편해요 (휴대폰·인쇄·버튼)", "이런 기능이 있으면 좋겠어요", "고맙다는 말 / 그 밖"];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const man = (v) => (v == null || v === "" ? 0 : Math.round(parseFloat(String(v).replace(/,/g, "")) * 10000));
const toMan = (w) => (w ? Math.round(w / 10000) : "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = { D: null, EASY: {}, input: freshInput(), step: 0, skipFilled: false, agreed: false, change: { reg: 0, jah: 0, mem: "0" }, view: "gate" };
function freshInput() { return { region: null, members: [{ role: "본인", age: null }], housing: null, financial: null, cars: null, debt: null, obligorHigh: null, unknown: [] }; }

// ---------- 화면 전환 ----------
function go(v) {
  if (!state.agreed && !["gate", "search", "about", "terms", "table", "jahwal", "cases"].includes(v)) v = "gate";
  if (v === "mode") { state.caseId = null; state.caseMode = null; }
  state.view = v;
  $$(".view").forEach((x) => x.classList.toggle("on", x.id === "v-" + v));
  $$("nav.tabs button").forEach((b) => b.classList.toggle("on", b.dataset.go === v || (b.dataset.go === "gate" && ["mode", "free", "interview", "result", "change", "cases"].includes(v))));
  hidePop(); window.scrollTo({ top: 0 });
  if (v === "interview") renderStep();
  if (v === "search") loadSearch().then(renderExamples);
  if (v === "terms") renderTerms();
  if (v === "change") renderChange();
  if (v === "table") renderTable();
  if (v === "jahwal") renderJahwal();
  if (v === "cases") renderCases();
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b && !e.target.closest(".term")) go(b.dataset.go); });
$("#agree").onclick = () => { state.agreed = true; go("mode"); };
$("#restart").onclick = () => { state.caseId = null; state.caseMode = null; state.input = freshInput(); state.step = 0; state.skipFilled = false; go("mode"); };
$("#edit-back").onclick = () => { state.step = 0; state.skipFilled = false; go("interview"); };
$("#print").onclick = () => { $$("#sheet details").forEach((d) => (d.open = true)); window.print(); };
$("#to-change").onclick = () => go("change");

// ---------- 쉬운 말 ----------
function termRegex() {
  const terms = Object.keys(state.EASY).sort((a, b) => b.length - a.length);
  if (!terms.length) return null;
  return new RegExp("(" + terms.map((t) => { const e = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return t.length <= 2 ? `(?<![가-힣])${e}(?![가-힣])` : e; }).join("|") + ")");
}
function wrapTerms(root) {
  const re = termRegex(); if (!re || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => {
    const p = n.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
    if (p.closest(".term, script, style, svg, input, textarea, select, button, .ref, .pop, .no-term, .glossary, h1, h2")) return NodeFilter.FILTER_REJECT;
    return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  const seen = new Set();
  for (const n of nodes) {
    const parts = n.nodeValue.split(re); if (parts.length < 2) continue;
    const frag = document.createDocumentFragment();
    parts.forEach((part, k) => {
      if (k % 2 === 1 && !seen.has(part)) { seen.add(part); const s = document.createElement("span"); s.className = "term"; s.dataset.term = part; s.textContent = part; frag.appendChild(s); }
      else frag.appendChild(document.createTextNode(part));
    });
    n.parentNode.replaceChild(frag, n);
  }
}
/** 글 속에 나온 용어들의 쉬운 풀이 목록(질문 아래 주석용) */
function glossaryHTML(text, max = 6) {
  const re = termRegex(); if (!re) return "";
  const found = []; const g = new RegExp(re.source, "g"); let m;
  while ((m = g.exec(text)) && found.length < max) if (!found.includes(m[1])) found.push(m[1]);
  if (!found.length) return "";
  return `<div class="glossary"><div class="gt">📖 이 질문에 나온 말, 쉽게 풀면</div><dl>${found.map((t) => `<dt>${esc(t)}</dt><dd>${esc(state.EASY[t])}</dd>`).join("")}</dl></div>`;
}
function showPop(el) {
  const t = el.dataset.term, txt = state.EASY[t]; if (!txt) return;
  const pop = $("#pop"); pop.innerHTML = `<button class="x" aria-label="닫기">✕</button><b>${esc(t)}</b>${esc(txt)}<div class="small" style="margin-top:6px;opacity:.75">쉬운 풀이예요. 정확한 뜻은 사업안내 원문이 기준.</div>`;
  pop.hidden = false;
  const r = el.getBoundingClientRect(); const top = window.scrollY + r.bottom + 8; let left = window.scrollX + r.left;
  left = Math.min(left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12);
  pop.style.top = top + "px"; pop.style.left = Math.max(8, left) + "px";
  $(".x", pop).onclick = hidePop;
}
function hidePop() { const p = $("#pop"); if (p) p.hidden = true; }
document.addEventListener("click", (e) => { const t = e.target.closest(".term"); if (t) { e.stopPropagation(); showPop(t); } else if (!e.target.closest("#pop")) hidePop(); });
// 마우스를 올리기만 해도 풀이가 뜬다(폰은 터치)
let popTimer = null;
document.addEventListener("mouseover", (e) => { const t = e.target.closest(".term"); if (t) { clearTimeout(popTimer); showPop(t); } });
document.addEventListener("mouseout", (e) => { const t = e.target.closest(".term"); if (t) { clearTimeout(popTimer); popTimer = setTimeout(() => { if (!$("#pop").matches(":hover")) hidePop(); }, 350); } });
$("#pop").addEventListener("mouseenter", () => clearTimeout(popTimer));
$("#pop").addEventListener("mouseleave", () => { popTimer = setTimeout(hidePop, 250); });
const TIP = `<div class="tip">💡 점선 밑줄 말에 마우스를 올리면(폰은 톡 누르면) 쉬운 풀이가 떠요</div>`;

// ---------- 기준표(가구원 수별) ----------
function tableRows() { const D = state.D; const rows = []; for (let n = 1; n <= 7; n++) { const T = thresholds(D, n); rows.push({ n, median: medianIncome(D, n), ...T }); } return rows; }
function tableSVG() {
  const rows = tableRows(), W = 960, rowH = 44, top = 96, H = top + rowH * rows.length + 70;
  const cols = [["가구원", 70], ["기준 중위소득 100%", 190], ["생계 32%", 150], ["의료 40%", 150], ["주거 48%", 150], ["교육 50%", 150]];
  let x0 = 28; const xs = cols.map(([, w]) => { const x = x0; x0 += w; return x; });
  const won = (v) => Math.round(v).toLocaleString();
  const colors = ["#15223F", "#15223F", "#19B394", "#F5A524", "#1A6EFF", "#7C5CFF"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="IBM Plex Sans KR, Malgun Gothic, sans-serif">
    <rect width="${W}" height="${H}" fill="#fff"/>
    <text x="28" y="40" font-size="24" font-weight="700" fill="#15223F">${state.D.year}년 기준 중위소득과 급여별 선정기준</text>
    <text x="28" y="64" font-size="13" fill="#6B7280">월 소득인정액 기준(원) · 이 선 이하면 그 급여를 받을 수 있어요 · 보건복지부 고시 제2025-135호</text>
    <rect x="20" y="${top - 26}" width="${W - 40}" height="30" rx="8" fill="#F4F6FB"/>
    ${cols.map(([c], k) => `<text x="${xs[k] + (k === 0 ? 0 : cols[k][1] - 12)}" y="${top - 6}" font-size="13" font-weight="700" fill="${colors[k]}" text-anchor="${k === 0 ? "start" : "end"}">${c}</text>`).join("")}
    ${rows.map((r, i) => { const y = top + rowH * i + 28; const vals = [r.n + "인", won(r.median), won(r.saenggye), won(r.uiryo), won(r.jugeo), won(r.gyoyuk)];
      return `${i % 2 ? `<rect x="20" y="${y - 28}" width="${W - 40}" height="${rowH}" fill="#FAFBFE"/>` : ""}<line x1="20" y1="${y + 14}" x2="${W - 20}" y2="${y + 14}" stroke="#E6EAF2"/>
        ${vals.map((v, k) => `<text x="${xs[k] + (k === 0 ? 0 : cols[k][1] - 12)}" y="${y}" font-size="${k === 0 ? 16 : 15}" font-weight="${k <= 1 ? 700 : 500}" fill="${k === 0 ? "#15223F" : colors[k]}" text-anchor="${k === 0 ? "start" : "end"}">${v}</text>`).join("")}`; }).join("")}
    <text x="28" y="${H - 34}" font-size="12" fill="#6B7280">8인 이상: 기준 중위소득은 1인 늘 때 ${won(state.D.median_income.step_8plus)}원씩, 급여별 선은 7인 기준 + (7인 − 6인 차액). 생계급여는 선정기준이 곧 최대 지급액.</text>
    <text x="28" y="${H - 14}" font-size="12" fill="#9AA3B2">국기초 가늠표 · 참고용 · 확정은 시·군·구 담당자 · 보건복지상담센터 129</text>
    <circle cx="${W - 60}" cy="${H - 26}" r="14" fill="#1A6EFF"/><text x="${W - 60}" y="${H - 21}" font-size="12" fill="#fff" text-anchor="middle" font-weight="700">굿</text>
  </svg>`;
}
function renderTable() {
  if (!state.D) return setTimeout(renderTable, 100);
  const rows = tableRows(); const won = (v) => Math.round(v).toLocaleString();
  const mine = state.last ? state.last.n : null;
  let n = state.kN || mine || 1;
  const maxV = rows[rows.length - 1].median; // 7인 중위소득을 100으로 두고 막대를 그린다 → 가구원이 늘면 막대가 자란다
  const BARS = [["기준 중위소득 100%", "median", "#15223F"], ["생계급여 선 32%", "saenggye", "#19B394"], ["의료급여 선 40%", "uiryo", "#F5A524"], ["주거급여 선 48%", "jugeo", "#1A6EFF"], ["교육급여 선 50%", "gyoyuk", "#7C5CFF"]];
  $("#ktable").innerHTML = `
    <div class="card k-card">
      <div class="k-top"><div class="step">가구원 수를 눌러 보세요</div>
        <div class="chips" id="k-n">${rows.map((r) => `<button class="chip ${r.n === n ? "on" : ""}" data-kn="${r.n}">${r.n}인${r.n === mine ? " ★" : ""}</button>`).join("")}</div></div>
      <div class="k-live">
        <div class="k-med"><div class="lab"><span id="k-nlab">${n}</span>인 가구 기준 중위소득</div><div class="num" id="k-med">${won(rows[n - 1].median)}원</div><div class="small muted">한 달, 100%</div></div>
        <div class="k-bars">${BARS.map(([name, k, c]) => `<div class="k-row"><div class="k-name" style="color:${c}">${name}</div><div class="k-bar"><i data-k="${k}" style="width:${(rows[n - 1][k] / maxV) * 100}%;background:${c}"></i></div><div class="k-amt" data-amt="${k}">${won(rows[n - 1][k])}원</div></div>`).join("")}</div>
      </div>
      <div class="small muted" style="margin-top:8px">막대 길이는 7인 가구 기준 중위소득을 100으로 둔 것. 가구원이 늘면 기준 중위소득이 커지고 네 선도 같이 올라가요. 선 이하면 그 급여를 받을 수 있어요(${state.D.year}년 고시 제2025-135호).</div>
    </div>
    <div class="btns"><button id="k-png">🖼️ 전체 표(1~7인) 그림으로 저장</button>${mine ? `<button class="ghost" data-go="result">← 우리 집(${mine}인) 가늠표로</button>` : ""}</div>
    <div id="ksvg" hidden></div>`;
  const prevVals = { ...rows[n - 1] };
  const pick = (k) => {
    n = k; state.kN = k; const r = rows[k - 1];
    $$("[data-kn]").forEach((b) => b.classList.toggle("on", +b.dataset.kn === k));
    $("#k-nlab").textContent = k;
    tween($("#k-med"), prevVals.median, r.median); prevVals.median = r.median;
    for (const [, key] of BARS) {
      const bar = $(`#ktable i[data-k="${key}"]`); bar.style.width = (r[key] / maxV) * 100 + "%";
      const amt = $(`#ktable [data-amt="${key}"]`); tween(amt, prevVals[key], r[key]); prevVals[key] = r[key];
    }
  };
  $$("[data-kn]").forEach((b) => (b.onclick = () => pick(+b.dataset.kn)));
  $("#k-png").onclick = () => { $("#ksvg").innerHTML = tableSVG(); savePNG($("#ksvg svg"), `국기초_기준표_${state.D.year}.png`); };
}
function savePNG(svg, name) {
  const xml = new XMLSerializer().serializeToString(svg); const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" }); const url = URL.createObjectURL(blob);
  const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); const s = 2; c.width = svg.viewBox.baseVal.width * s; c.height = svg.viewBox.baseVal.height * s; const ctx = c.getContext("2d"); ctx.scale(s, s); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url);
    c.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); }); };
  img.src = url;
}
/** 결과 뒤: 우리 가구 기준표 + 기본 급여 내역 */
function householdTableHTML(r) {
  const D = state.D, T = r.thresholds, won = (v) => Math.round(v).toLocaleString();
  const rows = [["기준 중위소득 100%", r.median, "#15223F", null], ["생계급여 선 32%", T.saenggye, "#19B394", "saenggye"], ["의료급여 선 40%", T.uiryo, "#F5A524", "uiryo"], ["주거급여 선 48%", T.jugeo, "#1A6EFF", "jugeo"], ["교육급여 선 50%", T.gyoyuk, "#7C5CFF", "gyoyuk"]];
  const max = r.median;
  const barHTML = (v, color, k) => { const rec = k === "uiryo" ? r.recognizedMed : r.recognized; return `<div class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%;background:${color};opacity:.35"></i><b style="left:${Math.min(100, (rec / max) * 100)}%"></b></div>`; };
  const verdict = (k) => { if (!k) return `내 소득인정액 ${fmtMan(r.recognized)}`; const b = r.benefits[k]; return b.eligible ? (b.conditional ? "△ 소득은 맞음·부양의무자 확인" : `○ 여유 ${fmtMan(b.margin)}`) : `× ${fmtMan(-b.margin)} 초과`; };
  const grade = D.housing_rent_cap.grade_by_region[r.region]; const rent = D.housing_rent_cap[String(grade)][String(Math.min(7, r.n))];
  const E = D.education_support, M = D.medical_copay;
  return `<div class="sec"><div class="ico">📊</div><h3>우리 가구(${r.n}인) 기준표와 비교</h3></div>
    <table class="ktable"><tr><th>기준</th><th>금액(월)</th><th class="bar-td">내 소득인정액 위치 ▏</th><th>가늠</th></tr>
    ${rows.map(([name, v, color, k]) => `<tr><td style="color:${color};font-weight:700">${name}</td><td>${won(v)}원</td><td class="bar-td">${barHTML(v, color, k)}</td><td>${verdict(k)}</td></tr>`).join("")}</table>
    <p class="small muted" style="margin:6px 0 0">막대는 가구 기준 중위소득을 100으로 봤을 때 각 선의 길이, 검은 세로선이 우리 집 소득인정액 자리예요. <span class="ref" data-ref="guide2026:51">안내 p.51~52</span> · 전체 가구원 수 표는 위 「기준표」 탭.</p>
    <div class="sec"><div class="ico">🧾</div><h3>${r.n}인 가구 기본 급여 내역 (2026 기준)</h3></div>
    <div class="benefit-basics">
      <div class="bb"><div class="h">생계급여 — 최대 월</div><div class="big">${won(T.saenggye)}원</div>선정기준이 곧 최대액. 우리 집 가늠: <b>${r.benefits.saenggye.eligible ? won(r.benefits.saenggye.amount) + "원" : "대상 아님"}</b>(선 − 소득인정액)</div>
      <div class="bb"><div class="h">의료급여 — 병원비 본인부담</div>1종: 입원 없음 · 외래 의원 ${M.type1.clinic.toLocaleString()}원/병원 ${M.type1.hospital.toLocaleString()}원/상급 ${M.type1.tertiary.toLocaleString()}원 · 약국 ${M.type1.pharmacy}원<br>2종: 입원 ${M.type2.inpatient} · 외래 의원 ${M.type2.clinic.toLocaleString()}원/병원·상급 ${M.type2.hospital} · 약국 ${M.type2.pharmacy}원<div class="small muted">1종·2종은 근로능력 등으로 담당자가 정해요. 부양의무자 확인 필요.</div></div>
      <div class="bb"><div class="h">주거급여 — 집세 지원 상한(기준임대료)</div><div class="big">${won(rent)}원</div>${REGIONS[r.region]} = ${grade}급지${r.region === "metro_sejong_changwon" ? "(인천은 2급지)" : ""} · ${Math.min(7, r.n)}인 기준. 실제 월세가 이보다 적으면 실제 월세까지. <span class="ref" data-ref="guide2026:253">안내 p.253</span></div>
      <div class="bb"><div class="h">교육급여 — 교육활동지원비(연)</div>초 <b>${won(E.elementary)}원</b> · 중 <b>${won(E.middle)}원</b> · 고 <b>${won(E.high)}원</b><div class="small muted">고등학생은 교과서비·입학금·수업료도 실비. 학생이 있을 때만 의미가 있어요.</div></div>
    </div>`;
}
function renderTerms(filter = "") {
  const list = Object.entries(state.EASY).filter(([k, v]) => !filter || k.includes(filter) || v.includes(filter));
  $("#tlist").innerHTML = `<div class="tlist">${list.map(([k, v]) => `<div class="t"><b>${esc(k)}</b><div>${esc(v)}</div></div>`).join("") || '<p class="muted">없어요. 다른 말로 찾아 보세요.</p>'}</div>`;
}
$("#tq").addEventListener("input", (e) => renderTerms(e.target.value.trim()));

// ---------- 질문(갈래 B) ----------
const GG = { n: ["듣기.png", "식구부터 셀게요. 평소 같이 사는 분으로요."], m: ["듣기.png", "한 분씩만 여쭤 볼게요. 대략이면 돼요."], region: ["전신_궁금.png", "지역마다 '없는 셈 치는 재산'이 달라요."], housing: ["전신_생각중.png", "살고 있는 집은 다른 재산보다 훨씬 낮게 계산해요."], financial: ["전신_생각중.png", "500만원은 빼 드려요. 모르면 모름!"], car: ["전신_놀람.png", "차는 조건에 따라 0%, 4.17%, 100%로 갈려요."], debt: ["듣기.png", "금융기관 빚만요. 지인 돈은 안 쳐요."], obligor: ["전신_궁금.png", "생계급여는 예외 하나만 봐요. 의료는 담당자가."] };
const STEPS = [
  { id: "n", title: "같이 사는 분은 몇 분인가요? (본인 포함)",
    hint: "주민등록과 다르게 세는 경우가 있어요. 군대 간 자녀, 학업 때문에 따로 사는 미혼 자녀, 직업 때문에 따로 사는 자녀, 30세 이상 장애 자녀는 보장가구 규정이 따로 있어요(사업안내 p.31~). 일단 평소 같이 사는 분으로 세고, 애매하면 담당자와 확인하세요.",
    filled: (i) => i.members.length >= 1 && i.nConfirmed,
    render: (i) => `<div class="chips" id="nchips">${[1, 2, 3, 4, 5, 6, 7].map((k) => `<button class="chip ${i.members.length === k ? "on" : ""}" data-n="${k}">${k}명</button>`).join("")}</div>`,
    bind: (i, box) => { $$("[data-n]", box).forEach((b) => (b.onclick = () => { setN(i, +b.dataset.n); i.nConfirmed = true; next(); })); },
    collect: (i) => { i.nConfirmed = true; } },
  { id: "members", title: "", dynamic: true },
  { id: "region", title: "사는 지역은요?", hint: "기본재산액과 주거용재산 한도가 지역마다 달라요(사업안내 p.165).",
    filled: (i) => !!i.region,
    render: (i) => `<div class="chips">${Object.entries(REGIONS).map(([k, v]) => `<button class="chip ${i.region === k ? "on" : ""}" data-r="${k}">${v}</button>`).join("")}</div><div class="hint">광역시 = 부산·대구·인천·광주·대전·울산. 세종·창원도 같은 묶음. 경기도의 광주시는 '경기'.</div>`,
    bind: (i, box) => $$("[data-r]", box).forEach((b) => (b.onclick = () => { i.region = b.dataset.r; next(); })) },
  { id: "housing", title: "집은요?", hint: "살고 있는 집의 보증금이나 집값은 주거용재산이에요. 지역별 한도까지는 1.04%, 넘는 부분은 4.17%로 환산해요. 자가는 시가표준액(재산세 고지서의 과세표준 근처)을 대략 넣으세요.",
    filled: (i) => i.housing && (i.housing.type === "free" || i.housing.type === "none" || i.housing.value != null),
    render: (i) => { const h = i.housing || {}; return `
      <div class="chips">${[["own", "자가"], ["jeonse", "전세"], ["monthly", "월세(보증금 있음)"], ["free", "무상·보증금 없음"]].map(([k, v]) => `<button class="chip ${h.type === k ? "on" : ""}" data-h="${k}">${v}</button>`).join("")}</div>
      <div id="hfields">${housingFields(h)}</div>`; },
    bind: (i, box) => {
      $$("[data-h]", box).forEach((b) => (b.onclick = () => { i.housing = { type: b.dataset.h, living: true, value: i.housing?.value ?? null, rent: i.housing?.rent ?? null }; $("#hfields", box).innerHTML = housingFields(i.housing); $$("[data-h]", box).forEach((x) => x.classList.toggle("on", x === b)); }));
    },
    collect: (i, box) => { const h = i.housing || { type: "none" }; const v = $("#h-value", box), r = $("#h-rent", box), lv = $("#h-living", box);
      if (v) h.value = $("#h-unk", box)?.checked ? 0 : man(v.value); if (r) h.rent = man(r.value); if (lv) h.living = lv.value !== "no";
      if ($("#h-unk", box)?.checked) addUnknown(i, "집 금액"); i.housing = h; } },
  { id: "financial", title: "통장·적금·보험·주식을 다 더하면 얼마쯤인가요?", hint: "가구 전체 합계로요. 가구당 500만원(생활준비금)은 빼 줘요. 3년 이상 된 적금·저축성 보험·펀드·ISA는 따로 적으면 연 500만원·총 1,500만원까지 더 빼 줘요(사업안내 p.148). 희망저축계좌 같은 자산형성 통장 적립금은 넣지 마세요.",
    filled: (i) => !!i.financial,
    render: (i) => { const f = i.financial || {}; return `<label>전체 합계 (만원)</label><input type="number" id="f-gen" value="${toMan(f.general)}" placeholder="예) 300">
      <label>그중 3년 이상 장기저축 (만원, 없으면 비움)</label><input type="number" id="f-long" value="${toMan(f.longTerm)}">
      <label class="unk"><input type="checkbox" id="f-unk"> 모름 (0으로 계산하고 표시해 둘게요)</label>`; },
    collect: (i, box) => { i.financial = { general: $("#f-unk", box).checked ? 0 : man($("#f-gen", box).value), longTerm: man($("#f-long", box).value) }; if ($("#f-unk", box).checked) addUnknown(i, "금융재산"); } },
  { id: "car", title: "자동차가 있나요?", hint: "원칙은 차량가액 100%가 그달 소득으로 잡혀요. 2,000cc 미만이면서 10년 이상 됐거나 500만원 미만이면 일반재산(4.17%)이에요. 2026년부터 자녀 2명 이상 가구의 7인승, 소형 승합·화물차도 완화됐어요(사업안내 p.152~155). 가액은 보험 기준가액 근처를 대략.",
    filled: (i) => Array.isArray(i.cars),
    render: (i) => { const c = (i.cars && i.cars[0]) || null; return `
      <div class="chips"><button class="chip ${i.cars && !i.cars.length ? "on" : ""}" data-car="no">없음</button><button class="chip ${c ? "on" : ""}" data-car="yes">있음</button></div>
      <div id="cfields" style="display:${c ? "block" : "none"}">${carFields(c || {})}</div>`; },
    bind: (i, box) => $$("[data-car]", box).forEach((b) => (b.onclick = () => { if (b.dataset.car === "no") { i.cars = []; next(); } else { $("#cfields", box).style.display = "block"; $$("[data-car]", box).forEach((x) => x.classList.toggle("on", x === b)); } })),
    collect: (i, box) => { if ($("#cfields", box).style.display === "none") { i.cars = i.cars || []; return; }
      i.cars = [{ kind: $("#c-kind", box).value, cc: +$("#c-cc", box).value || 0, year: +$("#c-year", box).value || 0, value: man($("#c-value", box).value), use: $("#c-use", box).value, seats: +$("#c-seats", box).value || 5, small: $("#c-small", box).checked }]; } },
  { id: "debt", title: "빚이 있나요? (금융기관 대출·카드 연체·임대보증금)", hint: "개인끼리 빌린 돈은 부채로 인정되지 않아요. 임대보증금은 여러 채면 1채만(2026).",
    filled: (i) => i.debt != null,
    render: (i) => `<label>합계 (만원, 없으면 0)</label><input type="number" id="d-val" value="${toMan(i.debt)}" placeholder="0"><label class="unk"><input type="checkbox" id="d-unk"> 모름</label>`,
    collect: (i, box) => { i.debt = $("#d-unk", box).checked ? 0 : man($("#d-val", box).value); if ($("#d-unk", box).checked) addUnknown(i, "부채"); } },
  { id: "obligor", title: "따로 사는 부모님·자녀(와 그 배우자) 중에 소득이 아주 높은 분이 있나요?", hint: "생계급여는 부양의무자 기준이 없어졌지만 예외가 하나 있어요. 부양의무자가 연 소득 1억 3천만원(월 1,084만원) 또는 일반재산 12억원을 넘으면 생계급여 대상에서 빠져요(사업안내 p.52). 의료급여는 부양의무자 기준을 담당자가 따로 봐요.",
    filled: (i) => i.obligorHigh !== null,
    render: (i) => `<div class="chips">${[[false, "아니오 / 그 정도는 아님"], [true, "예, 넘는 분이 있음"], ["unk", "모름"]].map(([k, v]) => `<button class="chip ${String(i.obligorHigh) === String(k) ? "on" : ""}" data-o="${k}">${v}</button>`).join("")}</div>`,
    bind: (i, box) => $$("[data-o]", box).forEach((b) => (b.onclick = () => { i.obligorHigh = b.dataset.o === "true"; if (b.dataset.o === "unk") addUnknown(i, "부양의무자 소득"); finish(); })) },
];
function housingFields(h) {
  if (!h.type || h.type === "free" || h.type === "none") return "";
  return `<label>${h.type === "own" ? "집값(시가표준액, 만원)" : "보증금 (만원)"}</label><input type="number" id="h-value" value="${toMan(h.value)}" placeholder="예) 5000">
    ${h.type === "monthly" ? `<label>월세 (만원)</label><input type="number" id="h-rent" value="${toMan(h.rent)}">` : ""}
    ${h.type === "own" ? `<label>그 집에 살고 있나요?</label><select id="h-living"><option value="yes">예</option><option value="no">아니오(거주하지 않음 → 일반재산)</option></select>` : ""}
    <label class="unk"><input type="checkbox" id="h-unk"> 금액 모름</label>`;
}
function carFields(c) {
  return `<div class="row"><div><label>종류</label><select id="c-kind"><option value="passenger" ${c.kind === "passenger" ? "selected" : ""}>승용차</option><option value="van" ${c.kind === "van" ? "selected" : ""}>승합차</option><option value="truck" ${c.kind === "truck" ? "selected" : ""}>화물차</option><option value="motorcycle" ${c.kind === "motorcycle" ? "selected" : ""}>이륜차</option></select></div>
    <div><label>배기량 (cc)</label><input type="number" id="c-cc" value="${c.cc || ""}" placeholder="예) 1598"></div>
    <div><label>연식 (년)</label><input type="number" id="c-year" value="${c.year || ""}" placeholder="예) 2014"></div>
    <div><label>대략 가액 (만원)</label><input type="number" id="c-value" value="${toMan(c.value)}" placeholder="예) 450"></div></div>
    <div class="row"><div><label>용도</label><select id="c-use"><option value="normal">일반</option><option value="livelihood" ${c.use === "livelihood" ? "selected" : ""}>생업용(영업·배달·화물 일)</option><option value="disabled" ${c.use === "disabled" ? "selected" : ""}>장애 정도가 심한 가구원 이동용</option></select></div>
    <div><label>승차 정원</label><input type="number" id="c-seats" value="${c.seats || 5}"></div></div>
    <label class="unk"><input type="checkbox" id="c-small" ${c.small ? "checked" : ""}> 승합·화물차가 '소형 이하'(승합 15인 이하·길이 4.7m·너비 1.7m·높이 2.0m 이하 / 화물 적재량 1톤·총중량 3.5톤 이하)</label>`;
}
function setN(i, n) { while (i.members.length < n) i.members.push({ role: "가구원", age: null }); i.members.length = n; }
function addUnknown(i, k) { if (!i.unknown.includes(k)) i.unknown.push(k); }
function memberStep(idx) {
  return { id: "m" + idx, title: `${idx + 1}번째 분${idx === 0 ? "(본인)" : ""}은요?`, hint: idx === 0 ? "나이는 근로소득공제(34세 이하·65세 이상)와 자녀 수(18세 미만) 계산에 쓰여요. 금액은 세전 월 금액을 대략. 일해서 버는 돈은 근로소득, 나라에서 받는 연금은 공적이전소득, 가족이 매달 주는 돈은 사적이전소득이에요." : "",
    filled: (i) => i.members[idx] && i.members[idx].age != null && i.members[idx].done,
    render: (i) => { const m = i.members[idx]; const e = m.earned || {}; return `
      <div class="member">
        <div class="row"><div><label>나이</label><input type="number" id="m-age" value="${m.age ?? ""}" placeholder="예) 44"></div>
        <div><label>해당하면 체크</label><label class="unk"><input type="checkbox" id="m-dis" ${m.disabled ? "checked" : ""}> 등록장애인</label><label class="unk"><input type="checkbox" id="m-preg" ${m.pregnant ? "checked" : ""}> 임신 중·출산 6개월 미만</label><label class="unk"><input type="checkbox" id="m-stu" ${m.student ? "checked" : ""}> 대학생(휴학 포함)</label></div></div>
        <label>일해서 버는 돈이 있나요?</label>
        <div class="chips" id="m-type">${[["", "없음"], ["regular", "직장·일용·알바"], ["jahwal", "자활근로"], ["business", "장사·사업"], ["public", "공공일자리"]].map(([k, v]) => `<button class="chip ${(e.type || "") === k ? "on" : ""}" data-t="${k}">${v}</button>`).join("")}</div>
        <div id="m-amt" style="display:${e.type ? "block" : "none"}"><label>월 금액 (만원, 세전 대략)</label><input type="number" id="m-earn" value="${toMan(e.amount)}" placeholder="예) 120"></div>
        <label>연금 등 나라에서 매달 받는 돈 (만원: 국민연금·기초연금·장애인연금 등)</label><input type="number" id="m-pub" value="${toMan(m.publicTransfer)}" placeholder="0">
        <label>가족·지인이 <b>매달 정기적으로</b> 주는 돈 (만원, 명절 용돈은 제외)</label><input type="number" id="m-priv" value="${toMan(m.privateTransfer)}" placeholder="0">
      </div>`; },
    bind: (i, box) => $$("[data-t]", box).forEach((b) => (b.onclick = () => { $$("[data-t]", box).forEach((x) => x.classList.toggle("on", x === b)); $("#m-amt", box).style.display = b.dataset.t ? "block" : "none"; box.dataset.type = b.dataset.t; })),
    collect: (i, box) => { const m = i.members[idx]; m.age = $("#m-age", box).value === "" ? null : +$("#m-age", box).value; m.disabled = $("#m-dis", box).checked; m.pregnant = $("#m-preg", box).checked; m.student = $("#m-stu", box).checked;
      const t = box.dataset.type ?? (m.earned?.type || ""); m.earned = t ? { type: t, amount: man($("#m-earn", box).value) } : null;
      m.publicTransfer = man($("#m-pub", box).value); m.privateTransfer = man($("#m-priv", box).value); m.done = true; } };
}
function allSteps() { const i = state.input; const out = []; for (const s of STEPS) { if (s.dynamic) i.members.forEach((_, k) => out.push(memberStep(k))); else out.push(s); } return out; }
let cur = null;
function renderStep() {
  const steps = allSteps();
  if (state.skipFilled) while (state.step < steps.length && steps[state.step].filled(state.input)) state.step++;
  if (state.step >= steps.length) return finish();
  cur = steps[state.step];
  $("#prog").style.width = Math.round((state.step / steps.length) * 100) + "%";
  const box = $("#iv");
  box.innerHTML = `${caseNoteHTML()}<div class="step">${state.step + 1} / ${steps.length}</div><div class="q">${cur.title}</div>${cur.hint ? `<div class="hint">${cur.hint}</div>${TIP}` : ""}<div id="stepbody">${cur.render(state.input)}</div>
    ${glossaryHTML(cur.title + " " + (cur.hint || ""))}
    <div class="btns">${state.step > 0 ? '<button class="ghost" id="prev">이전</button>' : '<button class="ghost" data-go="mode">뒤로</button>'}${cur.collect ? '<button id="nextb">다음</button>' : ""}</div>`;
  const body = $("#stepbody", box);
  if (cur.id.startsWith("m")) body.dataset.type = state.input.members[+cur.id.slice(1)]?.earned?.type || "";
  cur.bind && cur.bind(state.input, body);
  wrapTerms($(".hint", box));
  const g = GG[cur.id.startsWith("m") ? "m" : cur.id] || GG.n; $("#gg-img").src = "img/" + g[0]; $("#gg-say").textContent = g[1];
  $("#prev") && ($("#prev").onclick = () => { state.step = Math.max(0, state.step - 1); state.skipFilled = false; renderStep(); });
  $("#nextb") && ($("#nextb").onclick = () => { cur.collect(state.input, body); next(); });
}
function next() { state.step++; renderStep(); }
function finish() { state.change = { reg: 0, jah: 0, mem: "0" }; go("result"); renderResult(); }

// ---------- 갈래 A: 자유 글 ----------
$("#free-read").onclick = () => {
  const { fields, found, missing } = parseFreeText($("#free-text").value);
  const box = $("#free-card");
  if (!found.length) { box.innerHTML = `<div class="card"><p>제가 읽어 낸 항목이 없어요. 괜찮아요, 질문으로 하나씩 여쭤 볼게요.</p><div class="btns"><button data-go="interview">질문으로</button></div></div>`; state.input = freshInput(); state.step = 0; return; }
  box.innerHTML = `<div class="card soft"><h3>이렇게 읽었어요</h3><table class="rc">${found.map((f) => `<tr><td>${esc(f.label)}</td><td><b>${esc(f.value)}</b></td><td class="muted small">"${esc(f.text)}"</td></tr>`).join("")}</table>
    ${fields.regionAsk ? `<div class="notice soft">${fields.regionAsk} 질문에서 다시 여쭐게요.</div>` : ""}
    <p class="muted small">틀린 것은 다음 질문 화면에서 그 자리에서 고치면 돼요. 아직 못 읽은 것: <b>${missing.map(missingLabel).join(", ") || "없음"}</b></p>
    <div class="btns"><button id="free-go">맞아요, 빠진 것만 물어봐 주세요</button><button class="ghost" id="free-all">전부 다시 질문으로</button></div></div>`;
  $("#free-go").onclick = () => { state.input = toInput(fields); state.step = 0; state.skipFilled = true; go("interview"); };
  $("#free-all").onclick = () => { state.input = toInput(fields); state.input.members.forEach((m) => (m.done = false)); state.step = 0; state.skipFilled = false; go("interview"); };
};
function missingLabel(k) { return { region: "지역", housing: "집", "housing.value": "집 금액", ages: "가구원 나이", earned: "일해서 버는 돈", "earned.amount": "소득 금액", financial: "통장·보험", car: "자동차 유무", debt: "빚", obligor: "부양의무자" }[k] || k; }
function toInput(f) {
  const i = freshInput();
  i.region = f.region || null; i.nConfirmed = true;
  i.members = f.members.map((m) => ({ ...m, done: m.age != null && (m.role !== "본인" || (m.earned && m.earned.amount != null) || m.noIncome) }));
  if (f.housing) { i.housing = { living: true, ...f.housing }; if (i.housing.type === "free") i.housing.value = 0; }
  i.financial = f.financial || null; i.cars = f.noCar ? [] : (f.cars && f.cars.length ? f.cars : null); i.debt = f.debt ?? null; i.obligorHigh = f.obligorHigh ?? null;
  if (i.members[0].earned && i.members[0].earned.amount == null) i.members[0].done = false;
  return i;
}

// ---------- 공통 그림 ----------
const COLORS = { saenggye: "#19B394", uiryo: "#F5A524", jugeo: "#1A6EFF", gyoyuk: "#7C5CFF" };
const NAMES = { saenggye: "생계 32%", uiryo: "의료 40%", jugeo: "주거 48%", gyoyuk: "교육 50%" };
function rulerSVG(r, id = "ruler") {
  const T = r.thresholds, W = 760, H = 108, pad = 20, y = 58;
  const max = Math.max(r.median * 0.62, r.recognized * 1.15, r.recognizedMed * 1.15);
  const x = (v) => pad + (Math.min(v, max) / max) * (W - pad * 2);
  const segs = [[0, T.saenggye, "#DFF5EE"], [T.saenggye, T.uiryo, "#FFF1D6"], [T.uiryo, T.jugeo, "#E3EDFF"], [T.jugeo, T.gyoyuk, "#ECE6FF"], [T.gyoyuk, max, "#EEF0F4"]];
  const ticks = ["saenggye", "uiryo", "jugeo", "gyoyuk"];
  return `<svg id="${id}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans KR, sans-serif" font-size="15">
    ${segs.map(([a, b, c], k) => `<rect x="${x(a)}" y="${y - 9}" width="${Math.max(0, x(b) - x(a))}" height="18" fill="${c}" ${k === 0 ? 'rx="9"' : ""}/>`).join("")}
    ${ticks.map((k, idx) => { const px = x(T[k]); const prev = idx ? x(T[ticks[idx - 1]]) : -999; const dy = px - prev < 36 ? y + 44 : y + 30; return `<line x1="${px}" y1="${y - 16}" x2="${px}" y2="${dy - 10}" stroke="${COLORS[k]}" stroke-width="2.5"/><text x="${px}" y="${dy}" text-anchor="middle" fill="${COLORS[k]}" font-weight="700">${NAMES[k].split(" ")[1]}</text>`; }).join("")}
    <text x="${pad}" y="${y + 30}" fill="#6B7280">0</text>
    <g class="pt" style="transform:translate(${x(r.recognized)}px,0)">
      ${r.recognizedMed !== r.recognized ? `<circle cx="${x(r.recognizedMed) - x(r.recognized)}" cy="${y}" r="7" fill="#fff" stroke="#F5A524" stroke-width="2.5"/>` : ""}
      <line x1="0" y1="${y - 26}" x2="0" y2="${y}" stroke="#1A6EFF" stroke-width="2"/>
      <circle cx="0" cy="${y}" r="10" fill="#1A6EFF" stroke="#fff" stroke-width="3"/>
      <rect x="-62" y="2" width="124" height="22" rx="11" fill="#15223F"/><text x="0" y="17" text-anchor="middle" fill="#fff" font-weight="700" class="ptlabel" font-size="13">우리 집 ${fmtMan(r.recognized)}</text>
    </g></svg>`;
}
function legendHTML(r) { const T = r.thresholds; return `<div class="legend">${["saenggye", "uiryo", "jugeo", "gyoyuk"].map((k) => `<span><i style="background:${COLORS[k]}"></i>${NAMES[k]} 선 <b>${fmtMan(T[k])}</b></span>`).join("")}${r.recognizedMed !== r.recognized ? `<span><i style="background:#fff;border:2px solid #F5A524"></i>의료급여용 소득인정액 ${fmtMan(r.recognizedMed)}</span>` : ""}</div>`; }
function ringSVG(pct, color, ico) {
  const R = 36, C = 2 * Math.PI * R, off = C * (1 - Math.min(100, pct) / 100);
  return `<div class="ring"><svg viewBox="0 0 84 84"><circle class="c" cx="42" cy="42" r="${R}"/><circle class="v" cx="42" cy="42" r="${R}" stroke="${color}" stroke-dasharray="${C}" stroke-dashoffset="${off}"/></svg><div class="ico">${ico}</div></div>`;
}
function donutSVG(a, b) {
  const tot = a + b; if (!tot) return `<svg class="donut" viewBox="0 0 92 92"><circle cx="46" cy="46" r="36" fill="none" stroke="#E6EAF2" stroke-width="14"/></svg>`;
  const R = 36, C = 2 * Math.PI * R, pa = a / tot;
  return `<svg class="donut" viewBox="0 0 92 92" style="transform:rotate(-90deg)"><circle cx="46" cy="46" r="${R}" fill="none" stroke="#7C5CFF" stroke-width="14"/><circle cx="46" cy="46" r="${R}" fill="none" stroke="#1A6EFF" stroke-width="14" stroke-dasharray="${C * pa} ${C}"/></svg>`;
}
function benefitCards(r) {
  const T = r.thresholds, B = r.benefits;
  const one = (k, name) => { const b = B[k], cls = b.eligible ? (b.conditional ? "cond" : "ok") : "no"; const rec = k === "uiryo" ? r.recognizedMed : r.recognized; const pct = Math.min(100, Math.round((rec / T[k]) * 100));
    return `<div class="bc ${cls}">${ringSVG(pct, b.eligible ? (b.conditional ? "#F5A524" : COLORS[k]) : "#B7BECC", b.eligible ? (b.conditional ? "⚠️" : "✅") : "⬜")}<div class="name">${name}</div>
      <div class="sub">${b.eligible ? (b.conditional ? "소득 기준은 맞아요 · 부양의무자 확인" : `선까지 여유 ${fmtMan(b.margin)}`) : `선을 ${fmtMan(-b.margin)} 넘어요`}</div><div class="sub">선의 ${pct}% 지점</div></div>`; };
  return `<div class="cards4">${one("saenggye", "생계급여")}${one("uiryo", "의료급여")}${one("jugeo", "주거급여")}${one("gyoyuk", "교육급여")}</div>`;
}
function kpiHTML(r) {
  const s = r.benefits.saenggye;
  return `<div class="kpis">
    <div class="kpi"><div><div class="lab">나라의 기준에서 본 우리 집 한 달 소득 (소득인정액)</div><div class="num" data-num="rec">${fmtWon(r.recognized)}</div>
      <div class="sub"><span style="color:#1A6EFF">●</span> 버는 돈(공제 뒤) ${fmtMan(r.income.evalStd)} · <span style="color:#7C5CFF">●</span> 재산을 달 소득으로 바꾼 것 ${fmtMan(r.property.total)}${r.income.dedStd ? `<br>실제 소득 ${fmtMan(r.income.actual)}에서 공제로 ${fmtMan(r.income.dedStd)}을 빼 줬어요` : ""}</div></div>${donutSVG(r.income.evalStd, r.property.total)}</div>
    <div class="kpi ${s.eligible ? "good" : "none"}"><div><div class="lab">생계급여 대략 (선 − 소득인정액)</div><div class="num" data-num="amt">${s.eligible ? fmtWon(s.amount) : "—"}</div>
      <div class="sub">${s.eligible ? `${fmtMan(r.thresholds.saenggye)} − ${fmtMan(r.recognized)}. 실제 지급액은 조사 결과에 따라 달라요.` : (s.note || "선정기준을 넘어 생계급여 대상이 아닌 것으로 가늠돼요.")}</div></div><div style="font-size:2.2rem">${s.eligible ? "💙" : "🌱"}</div></div>
  </div>`;
}

// ---------- 가늠표 ----------
// ---------- 자산형성 길잡이로 넘겨주기 (v0.6) — 숫자만 주소 뒤 #에 실어 새 창으로. #뒤는 서버로 가지 않고, 길잡이가 읽은 뒤 주소에서 지운다 ----------
function assetHref(r, i) {
  if (!r) return "asset/";
  const B = r.benefits, b = (B.saenggye.eligible ? "s" : "") + (B.uiryo.eligible ? "u" : "") + (B.jugeo.eligible ? "j" : "") + (B.gyoyuk.eligible ? "g" : "");
  const c = !b && r.recognized <= r.median * 0.5 ? "c" : "";
  const ys = (i.members || []).filter((m) => m.age != null && m.age >= 15 && m.age <= 39)
    .map((m) => `${m.age}:${Math.round((+(m.earned && m.earned.amount) || 0) + (+(m.earned2 && m.earned2.amount) || 0))}`);
  const q = new URLSearchParams({ from: "gauge", n: r.n, r: Math.round(r.recognized), e: Math.round(r.income.earned), b: b + c, j: r.jahwal.hasJahwal ? "ok" : "none" });
  if (r.jahwal.special) q.set("sp", "1");
  if (ys.length) q.set("y", ys.join(","));
  return "asset/#" + q.toString();
}
const assetGet = () => `<b>자산형성 통장</b> — 일하는 수급·차상위 가구가 매달 10만원을 모으면 나라가 10~30만원을 더 얹어 주는 통장(희망저축계좌Ⅰ·Ⅱ, 청년내일저축계좌). <a class="ref-like" href="${assetHref(state.last, state.input)}" target="_blank" rel="noopener">💰 자산형성 길잡이로 — 가입 자격·3년 모이는 돈·지킬 것 (새 창) →</a>`;
function renderResult() {
  const i = state.input, D = state.D;
  const r = compute(i, D); state.last = r;
  const na = $("#nav-asset"); if (na) na.href = assetHref(r, i);   // 위 「자산형성 ↗」도 우리 집 숫자를 들고 가게
  const today = new Date().toLocaleDateString("ko-KR");
  const members = i.members.map((m) => `${m.age ?? "?"}세${m.earned && m.earned.amount ? (m.earned.type === "jahwal" ? " 자활" : " 일함") : ""}`).join(" · ");
  const anyOk = ["saenggye", "jugeo", "gyoyuk"].some((k) => r.benefits[k].eligible);
  const gets = [];
  const G = (cls, ico, txt) => gets.push(`<div class="get ${cls}"><div class="i">${ico}</div><div>${txt}</div></div>`);
  if (r.benefits.saenggye.eligible) G("ok", "✅", `<b>생계급여</b> 대략 월 ${fmtWon(r.benefits.saenggye.amount)}. 근로능력이 있으면 자활사업 참여가 조건이 될 수 있어요(조건부수급자).`); else G("", "⬜", `<b>생계급여</b> 대상 아님으로 가늠.${r.benefits.saenggye.note ? " " + r.benefits.saenggye.note : ""}`);
  if (r.benefits.uiryo.eligible) G("cond", "⚠️", `<b>의료급여</b> 소득 기준은 맞아요 → <b>부양의무자 확인</b>이 남았어요(부모·자녀와 그 배우자, 판정식 사업안내 p.196~197). 1종·2종은 근로능력 등으로 나뉘어요.`); else G("", "⬜", `<b>의료급여</b> 소득 기준 초과로 가늠.`);
  if (r.benefits.jugeo.eligible) G("ok", "✅", `<b>주거급여</b> 월세면 급지별 기준임대료 안에서 임차급여(국토교통부·LH 1600-0777).`); else G("", "⬜", `<b>주거급여</b> 기준 초과로 가늠.`);
  if (r.benefits.gyoyuk.eligible) G("ok", "✅", `<b>교육급여</b> 초·중·고 학생이 있으면 교육활동지원비·교과서·수업료(교육부).`); else G("", "⬜", `<b>교육급여</b> 기준 초과로 가늠.`);
  if (r.jahwal.special) G("cond", "🛟", r.jahwal.special);
  if (r.jahwal.hope1) G("info", "💰", r.jahwal.hope1Why);
  if (r.jahwal.hope2) G("info", "💰", r.jahwal.hope2Why);
  if (r.jahwal.youth) G("info", "💰", r.jahwal.youthWhy);
  if (r.income.earned > 0 && r.recognized <= r.median * 0.5) G("info", "🏦", assetGet());
  G("info", "🧩", jahwalGetHTML(r));
  G("info", "📣", `수급자가 되면 <b>꼭 신고</b>: 이사 · 같이 사는 가족 변동 · 취업·아르바이트 등 소득 발생(자활근로 포함) · 전월세 조건 변경 · 자동차 구입 등 재산 증가. 결정이 억울하면 통지받은 날부터 90일 안에 이의신청.`);

  $("#sheet").innerHTML = `
  <div class="sheet">
    ${caseBandHTML()}<div class="band"><b>참고용 결과</b><span>수급 여부와 급여액은 시·군·구 담당자가 조사·결정해요.</span><span class="muted">기준 ${D.year}년 사업안내 · 계산 ${today}</span></div>
    ${TIP}
    <div class="rhead"><div><h2 style="margin:.8rem 0 .2rem">국기초 가늠표</h2>
      <div class="who"><span>${r.n}인 가구</span><span>${members}</span><span>${REGIONS[r.region]}</span><span>기준 중위소득 ${fmtMan(r.median)}</span></div></div>
      <img src="img/${anyOk ? "박수.png" : "머쓱.png"}" alt=""></div>
    <div class="ptcap">● 우리 집 소득인정액 <b>${fmtMan(r.recognized)}</b>${r.recognizedMed !== r.recognized ? ` · ○ 의료급여용 ${fmtMan(r.recognizedMed)}` : ""}</div>
    <div class="ruler">${rulerSVG(r)}</div>${legendHTML(r)}
    ${kpiHTML(r)}
    ${caseCompareHTML(r)}
    <div class="sec"><div class="ico">🧭</div><h3>급여별 가늠</h3></div>${benefitCards(r)}
    <div class="small muted" style="margin-top:6px">${r.benefits.uiryo.note}</div>
    ${r.notes.length ? `<div class="notice soft small">${r.notes.map(esc).join("<br>")}</div>` : ""}
    ${householdTableHTML(r)}
    <div class="sec"><div class="ico">🎁</div><h3>받을 수 있는 것 · 자활 접점 (가늠)</h3></div>
    <div class="gets">${gets.join("")}</div>
    <div class="btns noprint"><button class="big-cta" data-go="change">🎛️ 무엇이 바뀌면 어떻게 달라질까요? → 움직여 보기</button></div>

    <details><summary>🧾 계산 가늠 내역 — 숫자마다 근거 쪽수 (누르면 근거 찾기로)</summary>
      <h3>버는 돈 (소득평가액)</h3>
      <table class="rc"><tr><th>항목</th><th class="n">금액</th><th class="n">공제(생계·주거·교육)</th><th class="n">공제(의료)</th><th></th></tr>
      ${r.income.lines.map((l) => `<tr><td>${l.who} · ${l.kind}${l.dedStdLabel ? `<div class="small muted">${l.dedStdLabel}${l.dedMedLabel && l.dedMedLabel !== l.dedStdLabel ? ` / 의료: ${l.dedMedLabel}` : ""}</div>` : ""}</td><td class="n">${fmtWon(l.amount)}</td><td class="n">−${fmtWon(l.dedStd)}</td><td class="n">−${fmtWon(l.dedMed)}</td><td>${refLink(l.ref)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">소득 없음</td></tr>`}
      <tr class="sum"><td>소득평가액</td><td class="n">${fmtWon(r.income.actual)}</td><td class="n">${fmtWon(r.income.evalStd)}</td><td class="n">${fmtWon(r.income.evalMed)}</td><td>${refLink("안내 p.51·105")}</td></tr></table>
      <h3>재산을 달 소득으로 (재산의 소득환산액)</h3>
      <table class="rc"><tr><th>항목</th><th class="n">금액</th><th></th></tr>
      ${r.property.lines.map((l) => `<tr><td>${esc(l.kind)}</td><td class="n">${l.amount < 0 ? "−" : ""}${fmtWon(Math.abs(l.amount))}${l.full ? " (100%)" : ""}</td><td>${refLink(l.ref)}</td></tr>`).join("")}
      <tr><td>공제 후 남은 재산 × 환산율: 주거용 ${fmtMan(r.property.remainAfter.housingRem)}×1.04% + 일반 ${fmtMan(r.property.remainAfter.generalRem)}×4.17% + 금융 ${fmtMan(r.property.remainAfter.financialRem)}×6.26%${r.property.carFull ? ` + 자동차 ${fmtMan(r.property.carFull)}×100%` : ""}</td><td class="n">${fmtWon(r.property.total)}</td><td>${refLink("안내 p.166")}</td></tr>
      <tr class="sum"><td>소득인정액 = ${fmtWon(r.income.evalStd)} + ${fmtWon(r.property.total)}</td><td class="n">${fmtWon(r.recognized)}</td><td>${refLink("안내 p.51")}</td></tr></table>
    </details>

    <div class="sec"><div class="ico">🚶</div><h3>다음 할 일</h3></div>
    <ol class="todo small">
      <li>주소지 읍·면·동 행정복지센터에 신청(본인·가족·관계인). 신청 → 소득·재산·부양의무자 조사 → 30일(길면 60일) 안에 결정 통지 → 급여.</li>
      <li>궁금한 것은 보건복지상담센터 <b>129</b>. 공식 모의계산은 <a href="https://www.bokjiro.go.kr" target="_blank" rel="noopener">복지로</a>에서도 할 수 있어요.</li>
      <li>이 가늠표를 인쇄해 담당자와 같이 보면서 어디가 다른지 확인해 보세요.</li>
    </ol>
    <div class="tail"><b>이 결과로 신청·포기·이의 여부를 결정하지 마세요.</b> 실제 조사에서 확인되는 소득·재산·가구 정보는 여기 입력과 다를 수 있고, 여기서 다루지 않은 규정(가구특성별 지출비용, 재산 특례, 부양의무자 세부 판정 등)이 적용될 수 있어요. 반드시 시·군·구 담당자에게 확인하세요. 기준: ${D.year}년 국민기초생활보장 사업안내 · 고시 제2025-135호.</div>
  </div>`;
  wrapTerms($("#sheet"));
}
function refLink(ref) { if (!ref) return ""; const m = String(ref).match(/p\.\s*(\d+)/); const doc = /자활사업안내\s*p\./.test(ref) || (/자활사업안내/.test(ref) && !/안내 p/.test(ref)) ? "jahwal2026" : "guide2026"; return `<span class="ref" data-ref="${doc}:${m ? m[1] : ""}" title="근거 찾기로">${esc(ref)}</span>`; }
document.addEventListener("click", (e) => { const s = e.target.closest(".ref"); if (!s) return; const [doc, p] = s.dataset.ref.split(":"); go("search"); loadSearch().then(() => { $("#sq").value = ""; renderPage(doc, +p); }); });

// ---------- 변화 보기 ----------
function changedInput(opts = {}) {
  const base = JSON.parse(JSON.stringify(state.input)); const c = opts.noIncome ? { ...state.change, reg: 0, jah: 0 } : state.change;
  if (c.mem === "-1" && base.members.length > 1) { const idx = base.members.map((m, j) => j).reverse().find((j) => !(base.members[j].earned && base.members[j].earned.amount)) ?? base.members.length - 1; base.members.splice(idx, 1); }
  else if (c.mem === "1") base.members.push({ age: 40 }); else if (c.mem === "c") base.members.push({ age: 5 });
  let inp = base;
  if (c.reg) inp = withExtraIncome(inp, c.reg * 10000, false);
  if (c.jah) inp = withExtraIncome(inp, c.jah * 10000, true);
  return inp;
}
function changedInputBase() { return changedInput({ noIncome: true }); }
function renderChange() {
  const base = state.last || compute(state.input, state.D);
  const c = state.change;
  $("#change").innerHTML = `
  <div class="live">
    <div class="band"><b>가정에 따른 모의 변화</b><span>손잡이를 움직이면 가늠표가 바로 바뀌어요. 실제 결정은 담당자가 해요.</span></div>
    <div class="live-head"><div><h2 style="margin:.8rem 0 .2rem">무엇이 바뀌면, 어떻게 달라질까요?</h2><p class="muted" style="margin:0">일반 소득·자활소득·가구원 변동을 겹쳐서 볼 수 있어요.</p></div><img src="img/guide_change_t.png" alt=""></div>
    <div class="ptcap" id="c-cap">● 우리 집 소득인정액 <b>${fmtMan(base.recognized)}</b></div>
    <div class="ruler" id="c-ruler">${rulerSVG(base, "ruler2")}</div><div id="c-legend">${legendHTML(base)}</div>
    <div id="c-kpi">${kpiHTML(base)}</div>
    <div id="c-cards">${benefitCards(base)}</div>
    <div id="c-flags" class="gets" style="margin-top:10px"></div>
    <div class="row" style="margin-top:12px">
      <div class="ctrl"><div class="lab">일반 근로소득이 늘면 <span id="c-reg-v">+${c.reg}만원</span></div><input type="range" id="c-reg" min="0" max="150" step="5" value="${c.reg}"><div class="small muted">직장·일용·알바 소득. 생계급여 기준으로는 30% 공제, 의료급여 기준으로는 공제가 없어요.</div></div>
      <div class="ctrl"><div class="lab">자활근로 소득이 늘면 <span id="c-jah-v">+${c.jah}만원</span></div><input type="range" id="c-jah" min="0" max="150" step="5" value="${c.jah}"><div class="small muted">자활근로 소득공제 30%는 의료급여 기준에도 적용돼요. 선을 넘으면 자활급여특례(5년).</div></div>
    </div>
    <div class="ctrl"><div class="lab">가구원이 바뀌면</div><div class="chips">${[["-1", "한 명 줄면"], ["0", "지금 그대로"], ["1", "성인 한 명 늘면"], ["c", "아이가 한 명 늘면"]].map(([k, v]) => `<button class="chip ${c.mem === k ? "on" : ""}" data-dn="${k}">${v}</button>`).join("")}</div><div class="small muted">가구원 수가 바뀌면 기준 중위소득 자체가 바뀌어 선 네 개가 같이 움직여요.</div></div>
    <div class="chart" id="chart"></div>
    <div class="small muted">선은 '생계급여 대략 금액'. 세로 점선은 생계급여가 0이 되는 지점과 의료급여 선을 넘는 지점(일반 소득 / 자활소득 따로).</div>
    <div class="btns"><button class="ghost" data-go="result">← 가늠표로</button><button class="ghost" id="c-reset">처음 상태로</button></div>
  </div>`;
  const apply = () => {
    const r = compute(changedInput(), state.D);
    const prev = state.liveLast || base; state.liveLast = r;
    const sameT = JSON.stringify(r.thresholds) === JSON.stringify(prev.thresholds) && Math.abs(r.recognizedMed - r.recognized) === Math.abs(prev.recognizedMed - prev.recognized);
    if (sameT && $("#ruler2 .pt")) {
      const W = 760, pad = 20; const max = Math.max(r.median * 0.62, r.recognized * 1.15, r.recognizedMed * 1.15);
      if (max !== Math.max(prev.median * 0.62, prev.recognized * 1.15, prev.recognizedMed * 1.15)) $("#c-ruler").innerHTML = rulerSVG(r, "ruler2");
      else { const x = pad + (Math.min(r.recognized, max) / max) * (W - pad * 2); $("#ruler2 .pt").style.transform = `translate(${x}px,0)`; $("#ruler2 .ptlabel").textContent = `우리 집 ${fmtMan(r.recognized)}`; }
    } else $("#c-ruler").innerHTML = rulerSVG(r, "ruler2");
    $("#c-legend").innerHTML = legendHTML(r);
    $("#c-cap").innerHTML = `● 우리 집 소득인정액 <b>${fmtMan(r.recognized)}</b>${r.recognizedMed !== r.recognized ? ` · ○ 의료급여용 ${fmtMan(r.recognizedMed)}` : ""}`;
    $("#c-kpi").innerHTML = kpiHTML(r); $("#c-cards").innerHTML = benefitCards(r);
    $$("#c-kpi .num").forEach((el, k) => { const from = k === 0 ? prev.recognized : (prev.benefits.saenggye.eligible ? prev.benefits.saenggye.amount : 0); const to = k === 0 ? r.recognized : (r.benefits.saenggye.eligible ? r.benefits.saenggye.amount : 0); if (k === 1 && !r.benefits.saenggye.eligible) return; tween(el, from, to); });
    const flags = [];
    const d = r.recognized - base.recognized;
    flags.push(`<div class="get ${d > 0 ? "cond" : "ok"}"><div class="i">${d > 0 ? "📈" : d < 0 ? "📉" : "➖"}</div><div>처음보다 소득인정액 <b>${d >= 0 ? "+" : "−"}${fmtMan(Math.abs(d))}</b> · 생계급여 ${base.benefits.saenggye.eligible ? fmtMan(base.benefits.saenggye.amount) : "—"} → <b>${r.benefits.saenggye.eligible ? fmtMan(r.benefits.saenggye.amount) : "—"}</b></div></div>`);
    ["saenggye", "uiryo", "jugeo", "gyoyuk"].forEach((k) => { if (base.benefits[k].eligible !== r.benefits[k].eligible) flags.push(`<div class="get ${r.benefits[k].eligible ? "ok" : "cond"}"><div class="i">${r.benefits[k].eligible ? "🔓" : "🔒"}</div><div><b>${NAMES[k].split(" ")[0]}급여</b>가 ${r.benefits[k].eligible ? "범위 안으로 들어와요" : "범위 밖으로 나가요"}</div></div>`); });
    if (r.jahwal.special) flags.push(`<div class="get info"><div class="i">🛟</div><div>${r.jahwal.special}</div></div>`);
    if (r.jahwal.hope1 && !base.jahwal.hope1) flags.push(`<div class="get info"><div class="i">💰</div><div>${r.jahwal.hope1Why}</div></div>`);
    $("#c-flags").innerHTML = flags.join("");
    $("#c-flags").classList.remove("flash"); void $("#c-flags").offsetWidth; $("#c-flags").classList.add("flash");
    $("#chart").innerHTML = chartSVG(compute(changedInputBase(), state.D));
    wrapTerms($("#c-flags"));
  };
  $("#c-reg").oninput = (e) => { c.reg = +e.target.value; $("#c-reg-v").textContent = `+${c.reg}만원`; apply(); };
  $("#c-jah").oninput = (e) => { c.jah = +e.target.value; $("#c-jah-v").textContent = `+${c.jah}만원`; apply(); };
  $$("[data-dn]").forEach((b) => (b.onclick = () => { c.mem = b.dataset.dn; $$("[data-dn]").forEach((x) => x.classList.toggle("on", x === b)); apply(); }));
  $("#c-reset").onclick = () => { state.change = { reg: 0, jah: 0, mem: "0" }; state.liveLast = null; renderChange(); };
  state.liveLast = null; apply();
}
function tween(el, from, to) {
  const t0 = performance.now(), dur = 500;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur); const v = from + (to - from) * (1 - Math.pow(1 - k, 3)); el.textContent = fmtWon(Math.round(v)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function chartSVG(base) {
  const i = changedInputBase(), D = state.D, W = 760, H = 220, L = 60, B = 36;
  const xs = []; for (let d = 0; d <= 150; d += 5) xs.push(d);
  const reg = xs.map((d) => compute(withExtraIncome(i, d * 10000, false), D)), jh = xs.map((d) => compute(withExtraIncome(i, d * 10000, true), D));
  const ymax = Math.max(base.thresholds.saenggye, 1);
  const x = (d) => L + (d / 150) * (W - L - 20), y = (v) => H - B - (v / ymax) * (H - B - 20);
  const path = (arr) => arr.map((r, k) => `${k ? "L" : "M"}${x(xs[k])},${y(r.benefits.saenggye.eligible ? r.benefits.saenggye.amount : 0)}`).join(" ");
  const firstIdx = (arr, f) => arr.findIndex(f);
  const z = firstIdx(reg, (r) => !r.benefits.saenggye.eligible || r.benefits.saenggye.amount === 0);
  const mReg = firstIdx(reg, (r) => !r.benefits.uiryo.eligible), mJh = firstIdx(jh, (r) => !r.benefits.uiryo.eligible);
  const mark = (idx, label, color, dy) => idx > 0 ? `<line x1="${x(xs[idx])}" y1="20" x2="${x(xs[idx])}" y2="${H - B}" stroke="${color}" stroke-dasharray="4 3"/><text x="${Math.min(x(xs[idx]), W - 70)}" y="${dy}" font-size="11" fill="${color}" text-anchor="middle">${label} +${xs[idx]}만</text>` : "";
  const now = state.change.reg + state.change.jah;
  const area = path(reg) + ` L${x(150)},${y(0)} L${x(0)},${y(0)} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans KR, sans-serif" font-size="12">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A6EFF" stop-opacity=".25"/><stop offset="1" stop-color="#1A6EFF" stop-opacity="0"/></linearGradient></defs>
    <line x1="${L}" y1="${H - B}" x2="${W - 20}" y2="${H - B}" stroke="#CBD2E0"/><line x1="${L}" y1="20" x2="${L}" y2="${H - B}" stroke="#CBD2E0"/>
    <text x="${L - 6}" y="${y(ymax) + 4}" text-anchor="end" fill="#6B7280">${fmtMan(ymax)}</text><text x="${L - 6}" y="${H - B + 4}" text-anchor="end" fill="#6B7280">0</text>
    ${[0, 50, 100, 150].map((d) => `<text x="${x(d)}" y="${H - 12}" text-anchor="middle" fill="#6B7280">+${d}만</text>`).join("")}
    <text x="${W - 20}" y="${H - 2}" text-anchor="end" fill="#6B7280" font-size="11">월 소득 증가 → 생계급여</text>
    <path d="${area}" fill="url(#ag)"/><path d="${path(reg)}" fill="none" stroke="#1A6EFF" stroke-width="3"/>
    ${now > 0 && now <= 150 ? `<circle cx="${x(now)}" cy="${y((reg[Math.round(now / 5)] || reg[0]).benefits.saenggye.eligible ? reg[Math.round(now / 5)].benefits.saenggye.amount : 0)}" r="7" fill="#1A6EFF" stroke="#fff" stroke-width="3"/>` : ""}
    ${mark(z, "생계 0", "#15223F", 16)}${mark(mReg, "의료 선(일반)", "#E63946", 30)}${mark(mJh, "의료 선(자활)", "#19B394", 44)}
  </svg>`;
}

// ---------- 근거 찾기 ----------
function renderExamples() {
  $("#sq-examples").innerHTML = ["군대 간 아들", "용돈", "통장", "차", "자활근로 공제", "부양의무자", "기본재산액", "이의신청", "희망저축"].map((q) => `<button class="chip" data-q="${q}">${q}</button>`).join("");
  $$("[data-q]").forEach((b) => (b.onclick = () => { $("#sq").value = b.dataset.q; doSearch(); }));
}
$("#sgo").onclick = doSearch; $("#sq").addEventListener("keydown", (e) => e.key === "Enter" && doSearch());
async function doSearch() {
  await loadSearch();
  const q = $("#sq").value; const res = search(q);
  $("#sres").innerHTML = `${res.topics.map((t) => `<div class="topic"><div class="q">${esc(t.q)}</div><div>${esc(t.a)}</div><div class="small" style="margin-top:6px">근거: ${t.refs.map(([d, p]) => `<span class="ref" data-ref="${d}:${p}">${SOURCES[d].short} p.${p}</span>`).join(" · ")}</div><div class="small muted">↑ 이 설명은 이 도구가 쓴 요약이에요. 원문은 쪽수를 열어 확인하세요.</div></div>`).join("")}
    ${res.pages.length ? `<div class="card"><div class="muted small">찾은 말: ${res.terms.map(esc).join(", ")}</div>${res.pages.map(pageHTML).join("")}</div>` : (q.trim() ? `<div class="card muted">색인에서 못 찾았어요. 다른 말로(예: '통장' 대신 '금융재산') 다시 쳐 보거나, 사업안내 목차를 열어 보세요.</div>` : "")}`;
  wrapTerms($("#sres"));
}
function renderPage(doc, p) { const pg = pageRef(doc, p); $("#sres").innerHTML = `<div class="card">${pageHTML(pg)}</div>`; }
function pageHTML(pg) {
  const S = SOURCES[pg.doc];
  return `<div class="result"><div class="where">${S.short} <b>p.${pg.p}</b> <span class="muted small">(PDF ${pg.pdf}쪽)</span></div>
    <div class="heads no-term">${pg.heads.length ? pg.heads.map(esc).join(" · ") : "제목 줄 없음(표·예시 쪽)"}</div>
    <div class="small"><a href="${S.local}#page=${pg.pdf}" target="_blank" rel="noopener">내 PC의 PDF 열기(pdf 폴더에 두었을 때)</a> · <a href="${S.external}" target="_blank" rel="noopener">${S.externalName}</a></div></div>`;
}

// ---------- 의견 보내기 ----------
$("#fb-open").onclick = openFeedback;
function openFeedback() {
  const ctx = `화면: ${state.view} · ${VERSION} · ${navigator.userAgent.replace(/\).*$/, ")")} · ${new Date().toLocaleString("ko-KR")}`;
  $("#modal").hidden = false;
  $("#modal").innerHTML = `<div class="modal-bg"><div class="modal">
    <button class="x" id="fb-x">✕</button>
    <h3>💌 의견 보내기</h3>
    <p class="muted small" style="margin:0 0 8px">틀린 숫자, 이상한 계산, 안 되는 것, 있었으면 하는 것. 무엇이든요. <b>설문으로 보내기</b>는 이름 없이 바로 보낼 수 있고(적은 글이 설문 칸에 미리 들어가요), 메일로도 받아요(${CONTACT.mail}).</p>
    <label>종류</label><select id="fb-type">${FB_TYPES.map((t) => `<option>${t}</option>`).join("")}</select>
    <label>내용</label><textarea id="fb-text" placeholder="어느 화면에서, 무엇을 넣었더니, 어떻게 나왔는지 적어 주시면 고치기 쉬워요. 개인정보는 적지 마세요."></textarea>
    <div class="small muted" style="margin-top:6px">자동으로 붙는 정보: ${esc(ctx)}</div>
    <div class="btns"><button id="fb-form">설문으로 보내기</button><button class="ghost" id="fb-mail">메일 앱으로 보내기</button><button class="ghost" id="fb-copy">내용 복사</button></div>
    <div id="fb-msg" class="small muted" style="margin-top:8px"></div>
  </div></div>`;
  const body = () => `[국기초 가늠표 ${VERSION} · ${$("#fb-type").value}]\n\n${$("#fb-text").value}\n\n---\n${ctx}`;
  $("#fb-form").onclick = () => {   // 새 창에 설문을 미리 채워 연다 — 제출은 설문 창에서 직접
    const q = new URLSearchParams({ usp: "pp_url", [FB_FORM.type]: $("#fb-type").value, [FB_FORM.text]: $("#fb-text").value.slice(0, 1500), [FB_FORM.ctx]: ctx });
    window.open(FB_FORM.url + "?" + q.toString(), "_blank", "noopener");
    $("#fb-msg").textContent = "새 창의 설문에서 내용을 확인하고 「제출」을 눌러 주세요. 창이 안 열리면 '내용 복사' 뒤 메일로 보내 주세요.";
  };
  $("#fb-x").onclick = closeFeedback; $(".modal-bg").onclick = (e) => { if (e.target.classList.contains("modal-bg")) closeFeedback(); };
  $("#fb-mail").onclick = () => { location.href = `mailto:${CONTACT.mail}?subject=${encodeURIComponent("[국기초 가늠표] " + $("#fb-type").value)}&body=${encodeURIComponent(body())}`; $("#fb-msg").textContent = "메일 앱이 열리지 않으면 '내용 복사'를 눌러 " + CONTACT.mail + " 로 보내 주세요."; };
  $("#fb-copy").onclick = async () => { try { await navigator.clipboard.writeText(body()); $("#fb-msg").textContent = "복사했어요. " + CONTACT.mail + " 로 붙여 넣어 보내 주세요."; } catch { prompt("아래 내용을 복사해 " + CONTACT.mail + " 로 보내 주세요", body()); } };
}
function closeFeedback() { $("#modal").hidden = true; $("#modal").innerHTML = ""; }

// ---------- 가상 사례 (v0.4) ----------
const MARK = { saenggye: "생계", uiryo: "의료", jugeo: "주거", gyoyuk: "교육" };
const K4 = ["saenggye", "uiryo", "jugeo", "gyoyuk"];
function caseById(id) { return (state.CASES || []).find((c) => c.id === id); }
function marksOf(e) { return K4.map((k) => `${MARK[k]} ${e[k]}`).join(" · "); }
function marksOfResult(r) { return K4.map((k) => `${MARK[k]} ${r.benefits[k].eligible ? (k === "uiryo" ? "△" : "○") : "×"}`).join(" · "); }
function renderCases() {
  const box = $("#cases");
  box.innerHTML = `<h2>가상 사례로 연습하기</h2>
  <div class="notice soft">다섯 사례의 <b>인물·숫자는 전부 가상</b>이에요(교육용). 상담일지를 읽고 <b>직접 입력해 보는 훈련</b>과, 정답 가늠표를 바로 보는 길이 있어요. 상담일지에는 도구가 묻는 것보다 많은 말이 섞여 있어요 — 무엇을 골라 넣을지가 연습 포인트.</div>
  ${TIP}
  ${(state.CASES || []).map((c) => `<div class="card case-card"><div class="case-head"><span class="case-id">${c.id}</span><h3>${esc(c.title)}</h3></div>
    <div class="note-paper"><div class="np-title">📋 상담일지 (가상)</div>${esc(c.note)}</div>
    <details><summary>💡 이 사례의 포인트 (먼저 풀고 나서 열어 보세요)</summary><p class="small">${esc(c.lesson)}</p>${c.expected ? `<p class="small muted">정답 가늠표: ${c.expected.n}인 · 소득인정액 ${fmtMan(c.expected.recognized)} · ${marksOf(c.expected)}</p>` : ""}</details>
    <div class="btns"><button data-case="${c.id}" data-do="ask">📝 질문으로 직접 입력 (훈련)</button><button class="ghost" data-case="${c.id}" data-do="free">✍️ 상담일지를 글로 붙여 읽히기</button><button class="ghost" data-case="${c.id}" data-do="answer">✅ 정답 가늠표 바로 보기</button></div></div>`).join("")}
  <p class="muted small">주소로 바로 열기: <code>?case=A</code>(정답 가늠표) · <code>?case=A&amp;do=ask</code>(훈련) · <code>?case=A&amp;do=free</code>(글로 붙이기). 교육 때 큰 화면과 폰 QR에 쓰는 용도예요.</p>`;
  $$("[data-case]", box).forEach((b) => (b.onclick = () => startCase(b.dataset.case, b.dataset.do)));
  wrapTerms(box);
}
function startCase(id, mode = "answer") {
  const c = caseById(id); if (!c) { go("cases"); return; }
  state.agreed = true; state.caseId = id; state.caseMode = mode; state.change = { reg: 0, jah: 0, mem: "0" };
  if (mode === "answer") {
    state.input = JSON.parse(JSON.stringify(c.input));
    state.input.members.forEach((m, k) => { m.role = k ? "가구원" : "본인"; m.done = true; }); state.input.nConfirmed = true;
    go("result"); renderResult(); return;
  }
  state.input = freshInput(); state.step = 0; state.skipFilled = false;
  if (mode === "free") { $("#free-text").value = c.note; $("#free-card").innerHTML = ""; go("free"); return; }
  go("interview");
}
function caseNoteHTML() {
  const c = state.caseId && caseById(state.caseId); if (!c || state.caseMode !== "ask") return "";
  return `<div class="note-paper small sticky-note"><div class="np-title">📋 상담일지 (가상 사례 ${c.id}) — 읽고, 도구가 묻는 것만 골라 넣어요</div>${esc(c.note)}</div>`;
}
function caseBandHTML() {
  const c = state.caseId && caseById(state.caseId); if (!c) return "";
  return `<div class="band case"><b>🎓 가상 사례 ${c.id}</b><span>${esc(c.title)} — 인물·숫자는 전부 가상(교육용)</span></div>`;
}
function caseCompareHTML(r) {
  const c = state.caseId && caseById(state.caseId); if (!c || !c.expected) return "";
  const e = c.expected;
  if (state.caseMode === "answer") return `<div class="notice soft case-point">💡 <b>이 사례의 포인트</b> — ${esc(c.lesson)}</div>`;
  const same = Math.abs(e.recognized - r.recognized) < 1000 && marksOf(e) === marksOfResult(r);
  return `<div class="notice ${same ? "soft" : ""} case-point">${same ? "✅ <b>정답 가늠표와 같아요.</b>" : "🔍 <b>정답 가늠표와 다르게 나왔어요.</b> 어디서 갈렸는지 아래 「계산 가늠 내역」을 열어 비교해 보세요."}<br>정답: 소득인정액 <b>${fmtMan(e.recognized)}</b> · ${marksOf(e)}<br>내 입력: <b>${fmtMan(r.recognized)}</b> · ${marksOfResult(r)}
    <details style="margin-top:8px"><summary>💡 이 사례의 포인트</summary><p class="small">${esc(c.lesson)}</p></details></div>`;
}

// ---------- 자활 탭 (v0.4) ----------
const JTYPES = [["market", "시장진입형"], ["social", "사회서비스형"], ["maintain", "근로유지형"]];
function refLink2(doc, p) { return `<span class="ref" data-ref="${doc}:${p}" title="근거 찾기로">${SOURCES[doc] ? SOURCES[doc].short : doc} p.${p}</span>`; }
/** 가늠표 결과로 자활사업 참여 자격을 가늠한다(나이 기준의 근로능력은 '있을 수 있음' 수준) */
function jahwalFit(r) {
  const i = state.input, B = r.benefits;
  const workAge = i.members.some((m) => m.age != null && m.age >= 18 && m.age <= 64 && !m.disabled);
  const highEarner = i.members.some((m) => m.earned && m.earned.type !== "jahwal" && (m.earned.amount || 0) >= 900000);
  let type, why, ref;
  if (B.saenggye.eligible) {
    if (workAge) { type = "조건부수급자로 가늠"; why = "생계급여 수급 + 근로능력 있는 가구원 → 자활사업 참여가 생계급여의 조건이 돼요. 다만 유예 사유가 있으면 달라요: 미취학 자녀 양육·간병·대학생·임신과 출산 뒤 6개월·월 90만원 넘게 주 3일 이상 일함 등은 조건부과유예, 질병·부상·시험 준비·취업 준비 등은 조건제시유예."; ref = "자활사업안내 p.24"; if (highEarner) why += " 이 집에는 월 90만원이 넘는 근로소득자가 있어 조건부과유예 검토 대상이에요."; }
    else { type = "일반수급자로 가늠"; why = "생계급여 수급이지만 18~64세 가구원이 없어 조건부수급자는 아닐 것으로 보여요. 참여를 희망하면 시·군·구 판단으로 참여할 수 있어요."; ref = "자활사업안내 p.15"; }
  } else if (B.uiryo.eligible || B.jugeo.eligible || B.gyoyuk.eligible) { type = "일반수급자로 가늠"; why = "의료·주거·교육급여 수급(권)자 → 참여를 희망하면 지역 여건을 보아 시·군·구청장 판단으로 참여할 수 있어요. 조건은 붙지 않아요."; ref = "자활사업안내 p.15"; }
  else if (r.recognized <= r.median * 0.5) { type = "차상위자로 가늠"; why = "수급자는 아니지만 소득인정액이 기준 중위소득 50% 이하 → 근로능력이 있으면 자활사업에 참여할 수 있어요."; ref = "자활사업안내 p.15"; }
  else { type = "참여 자격 범위 밖으로 가늠"; why = `소득인정액이 기준 중위소득 50%(${fmtMan(r.median * 0.5)})를 넘어요. 자활급여특례·이행급여특례 가구원이면 달라질 수 있어요.`; ref = "자활사업안내 p.15"; }
  return { type, why, ref };
}
function jahwalGetHTML(r) { const f = jahwalFit(r); return `<b>자활에서 보면</b> — ${esc(f.type)}. ${esc(f.why)} <span class="ref-like" data-go="jahwal">자활 탭에서 자활근로 유형별 가늠 →</span>`; }
/** 자활근로 월 표준소득을 넣어 본다: 자활 소득이 있는 가구원은 그 금액을 바꾸고, 없으면 소득 없는 성인에게 */
function withJahwalPay(input, monthly) {
  const i = JSON.parse(JSON.stringify(input));
  const m = i.members.find((x) => x.earned && x.earned.type === "jahwal") || i.members.find((x) => (x.age == null || (x.age >= 18 && x.age <= 64)) && !(x.earned && x.earned.amount)) || i.members[0];
  m.earned = { type: "jahwal", amount: monthly }; delete m.noIncome; return i;
}
function renderJahwal() {
  const D = state.D, W = D.jahwal.work_pay_2026, r = state.last, box = $("#jahwal");
  const typeRows = JTYPES.map(([k, name]) => {
    const t = W.types[k], after = Math.round(t.monthly_standard * 0.7);
    let cell = `<td class="n muted">—</td><td class="muted small">가늠표를 먼저 만들면 우리 집에 적용해 보여요</td><td class="n muted">—</td>`;
    if (r) { const x = compute(withJahwalPay(state.input, t.monthly_standard), D); const s = x.benefits.saenggye, u = x.benefits.uiryo;
      const hand = x.income.actual + (s.eligible ? s.amount : 0);   // 손에 쥐는 합계 = 가구가 버는 돈(이 유형의 자활급여 포함)·받는 연금 등 + 생계급여 가늠 (2026-10-26 태균님: 생계 칸만 보면 근로유지형이 나아 보이는 오해를 막으려고)
      cell = `<td class="n"><b>${fmtMan(x.recognized)}</b></td><td class="small">생계 ${s.eligible ? `○ 약 ${fmtMan(s.amount)}` : "×"} · 의료 ${u.eligible ? "△" : "×"}${x.jahwal.special ? " · 🛟 자활급여특례" : ""}${x.jahwal.hope1 ? " · 💰 희망저축Ⅰ" : ""}</td><td class="n hand"><b>약 ${fmtMan(hand)}</b></td>`; }
    return `<tr><td><b>${name}</b><div class="small muted">하루 ${t.hours}시간</div></td><td class="n">${fmtWon(t.daily)}</td><td class="n">${fmtWon(t.monthly_standard)}</td><td class="n">${fmtWon(after)}</td>${cell}</tr>`;
  }).join("");
  const fit = r ? jahwalFit(r) : null;
  box.innerHTML = `<h2>국기초 속 자활 — 자활센터가 매일 만나는 쪽만</h2>
  <div class="notice soft">『국민기초생활보장 사업안내』 545쪽 가운데 자활센터 실무자가 매일 만나는 부분만 떼어 <b>참여 자격 → 자활근로 → 소득공제 → 특례 → 자산형성</b> 순서로 모았어요. 숫자와 쪽수는 『2026년 자활사업안내』 기준. 확정은 시·군·구 담당자가 해요.</div>
  ${TIP}
  <div class="sec"><div class="ico">🧩</div><h3>우리 집, 자활에서 보면</h3></div>
  ${fit ? `<div class="card fit"><div class="fit-type">${esc(fit.type)}</div><p>${esc(fit.why)}</p><div class="small">근거 ${refLink(fit.ref)}</div>
      <div class="gets">${r.jahwal.special ? `<div class="get cond"><div class="i">🛟</div><div>${esc(r.jahwal.special)}</div></div>` : ""}${r.jahwal.hope1 ? `<div class="get info"><div class="i">💰</div><div>${esc(r.jahwal.hope1Why)}</div></div>` : ""}${r.jahwal.hope2 ? `<div class="get info"><div class="i">💰</div><div>${esc(r.jahwal.hope2Why)}</div></div>` : ""}${r.jahwal.youth ? `<div class="get info"><div class="i">💰</div><div>${esc(r.jahwal.youthWhy)}</div></div>` : ""}</div>
      <div class="get info"><div class="i">🏦</div><div>${assetGet()}</div></div><div class="btns"><button class="ghost" data-go="result">← 가늠표로</button><button class="ghost" data-go="change">🎛️ 자활소득이 늘면? (움직여 보기)</button></div></div>`
    : `<div class="card soft"><p>아직 가늠표가 없어요. <b>가늠해 보기</b>에서 우리 집을 먼저 가늠하면, 여기에 참여 자격(조건부·일반·차상위)과 자활근로 유형별 가늠이 떠요.</p><div class="btns"><button data-go="gate">가늠해 보기</button><button class="ghost" data-go="cases">가상 사례로 연습</button></div></div>`}
  <div class="sec"><div class="ico">💼</div><h3>자활근로 유형별 가늠 — 참여하면 소득이 어떻게 잡히나</h3></div>
  <div class="card"><div class="tbl"><table class="rc jt"><tr><th>유형</th><th class="n">일당 (2026)</th><th class="n">월 표준소득액</th><th class="n">30% 공제 뒤</th><th class="n">${r ? "우리 집 소득인정액" : ""}</th><th>${r ? "네 칸 가늠" : ""}</th><th class="n">${r ? "손에 쥐는 합계" : ""}</th></tr>${typeRows}</table></div>
    <p class="small muted"><b>손에 쥐는 합계</b> = 이 유형으로 받는 자활급여를 포함해 집이 버는 돈·받는 연금 등 + 생계급여 가늠. 생계급여 칸만 보면 돈을 덜 버는 유형이 나아 보이지만, 합계로 보면 달라요(실비·주거·교육급여는 뺀 숫자). 월 표준소득액 = 일당 × 26일(자활사업안내 vi). 실비(교통비·식대)는 소득이 아니에요. 자활근로 소득은 30%를 빼고 보며(의료급여 기준에도 적용), 다른 공제가 더 유리하면 그 하나만 적용해요. 이미 자활근로 소득이 있는 집이면 그 금액을 바꿔 넣어 계산해요. 근거 ${refLink("자활사업안내 p.72")} · ${refLink("자활사업안내 p.157")}</p></div>
  <div class="sec"><div class="ico">🗺️</div><h3>참여 자격이 정해지는 길</h3></div>
  <div class="card flow">
    <div class="fl"><span class="fs">생계급여 수급(권)자</span><span class="fa">→</span><span class="fs">근로능력 있음</span><span class="fa">→</span><span class="fs on">조건부수급자</span><span class="muted small">자활사업 참여가 생계급여의 조건 ${refLink("자활사업안내 p.24")}</span></div>
    <div class="fl sub"><span class="fs alt">조건부과유예</span><span class="small">미취학 자녀 양육·간병·보호, 대학생(누적 6년), 임신·출산 뒤 6개월, 사회복무, 월 90만원 넘게 주 3일 이상 일함 등 → 유예 기간에는 조건부수급자로 보지 않음 ${refLink("자활사업안내 p.25")}</span></div>
    <div class="fl sub"><span class="fs alt">조건제시유예</span><span class="small">질병·부상(해당 연도 6개월까지), 섬·벽지, 북한이탈주민 첫 6개월, 생후 12개월 이하 영아 양육, 시험·취업 준비(34세 이하, 누적 2년) 등 → 잠시 미룸 ${refLink("자활사업안내 p.30")}</span></div>
    <div class="fl"><span class="fs">자활지원계획 (결정 뒤 1개월 안 상담)</span><span class="fa">→</span><span class="fs">자활역량평가</span><span class="fa">→</span><span class="fs">55점 미만 근로유지형 · 55~85점 자활근로 · 85점 이상 국민취업지원제도</span><span class="muted small">${refLink("자활사업안내 p.39")} · ${refLink("자활사업안내 p.46")}</span></div>
    <div class="fl"><span class="fs">Gateway (2개월, 1개월 연장)</span><span class="fa">→</span><span class="fs">사업단 배치</span><span class="fa">→</span><span class="fs">참여 최대 5년</span><span class="fa">→</span><span class="fs on">취·창업 · 자활기업 · 탈수급</span><span class="muted small">${refLink("자활사업안내 p.62")}</span></div>
    <div class="fl"><span class="fs alt">의료·주거·교육 수급자 · 차상위(중위 50% 이하)</span><span class="fa">→</span><span class="fs">일반수급자·차상위자로 참여 희망</span><span class="muted small">조건 없음, 시·군·구 판단 ${refLink("자활사업안내 p.15")}</span></div>
    <div class="fl"><span class="fs alt">자활소득으로 의료 선(40%)을 넘으면</span><span class="fa">→</span><span class="fs on">자활급여특례 5년</span><span class="muted small">의료급여 유지, 생계는 중지, 주거 수급권 유지 ${refLink("안내 p.56")}</span></div>
  </div>
  <div class="sec"><div class="ico">📖</div><h3>자활 용어, 쉽게</h3></div>
  <div class="card"><input type="text" id="jq" placeholder="찾을 말 (예: 유예, 게이트웨이, 특례, 희망저축, 자활기업)"><div class="btns"><button class="ghost" id="j-print">🖨️ 이 화면 A4로 인쇄</button></div></div>
  <div id="jlist"></div>`;
  renderJTerms(); $("#jq").addEventListener("input", (e) => renderJTerms(e.target.value.trim())); $("#j-print").onclick = () => window.print();
  wrapTerms($(".notice", box)); wrapTerms($(".flow", box)); wrapTerms($(".fit", box));
}
function renderJTerms(f = "") {
  const list = (state.JT || []).filter((t) => !f || t.t.includes(f) || t.e.includes(f));
  $("#jlist").innerHTML = `<div class="tlist">${list.map((t) => `<div class="t"><b>${esc(t.t)}</b><div>${esc(t.e)}</div>${t.ref ? `<div class="small" style="margin-top:4px">${t.ref.map(([d, p]) => refLink2(d, p)).join(" · ")}</div>` : ""}</div>`).join("") || '<p class="muted">없어요. 다른 말로 찾아 보세요.</p>'}</div>`;
}
$("#t-print").onclick = () => window.print();


// ---------- 히어로 '국기초 한눈에' (v0.4.1, 태균님: 틀 안에 뜻이 있는 그림을) ----------
function renderHeroArt() {
  const D = state.D, box = $("#hero-art .ha-card"); if (!D || !box) return;
  const n = 1, med = medianIncome(D, n), T = thresholds(D, n);
  const row = (lab, sub, pct, won, color) => `<div class="ha-row"><span class="lab">${lab}<small>${sub}</small></span><div class="ha-bar"><i data-w="${pct}" style="background:${color}"></i></div><b>${fmtMan(won)}</b></div>`;
  box.innerHTML = `<div class="ha-title">국기초 한눈에 <span>${D.year}년 · 1인 가구 기준</span></div>
    ${row("기준 중위소득", "줄 세워 가운데", 100, med, "linear-gradient(90deg,#1A2B50,#4C6BA8)")}
    ${row("교육급여", "중위소득의 50%", 50, T.gyoyuk, COLORS.gyoyuk)}
    ${row("주거급여", "48%", 48, T.jugeo, COLORS.jugeo)}
    ${row("의료급여", "40%", 40, T.uiryo, COLORS.uiryo)}
    ${row("생계급여", "32%", 32, T.saenggye, COLORS.saenggye)}
    <div class="ha-formula"><b>소득인정액</b>(나라의 기준에서 본 우리 집 한 달 소득) = 버는 돈(공제 뒤) + 재산을 달 소득으로 바꾼 것 → <b>이 선 아래면 그 급여</b>. 식구 수마다 선이 달라요.</div>`;
  requestAnimationFrame(() => $$("#hero-art .ha-bar i").forEach((i) => (i.style.width = i.dataset.w + "%")));
}
// ---------- 시작 ----------
Promise.all([fetch("data/2026.json").then((r) => r.json()), fetch("data/dict.json").then((r) => r.json()), fetch("data/cases.json").then((r) => r.json()).catch(() => ({ cases: [] }))]).then(([D, dict, cases]) => {
  state.D = D; state.EASY = dict.easy || {}; state.JT = dict.jahwal || []; state.CASES = cases.cases || [];
  for (const t of state.JT) if (!state.EASY[t.t]) state.EASY[t.t] = t.e;
  renderHeroArt();
  wrapTerms($("#v-gate .gate")); wrapTerms($("#v-about")); wrapTerms($("#v-mode .pick p"));
  const q = new URLSearchParams(location.search);
  if (q.get("case")) startCase(q.get("case").toUpperCase(), q.get("do") || "answer");
  else if (q.get("tab")) go(q.get("tab"));
});
