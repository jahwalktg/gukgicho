// 자산형성 길잡이 — 계산만 하는 부분 (화면·저장 없음)
// 근거: 『2026년 자활사업안내(Ⅱ) 자산형성지원 통장사업 안내』 (data/2026.json 의 asset)

export const won = (x) => Math.round(Number(x) || 0);
export const fmtWon = (x) => won(x).toLocaleString("ko-KR") + "원";
export const fmtMan = (x) => {
  const v = won(x);
  if (Math.abs(v) >= 10000) { const m = v / 10000; return (Math.round(m * 10) / 10).toLocaleString("ko-KR") + "만원"; }
  return v.toLocaleString("ko-KR") + "원";
};

/** 가구원 수별 기준 중위소득 (8인 이상은 1인마다 더함) */
export function median(D, n) {
  const M = D.median_income;
  if (n <= 7) return M[String(Math.max(1, n))];
  return M["7"] + M.step_8plus * (n - 7);
}

/** 유지기준(소득상한): 1·2·3인은 3인 가구 기준 중위소득 100%, 4인 이상은 그 가구 100% */
export function cap(D, n) {
  const A = D.asset;
  return median(D, Math.max(n, A.cap_min_household)) * A.cap_ratio;
}

/** 가구원 수별 기준표 한 줄 */
export function lines(D, n) {
  const m = median(D, n);
  return {
    n, median: m,
    hope1Recognized: won(m * 0.4),
    hope1Earned: won(m * 0.4 * 0.6),
    half: won(m * 0.5),
    cap: won(cap(D, n)),
  };
}

/**
 * 가입 자격 가늠
 * f = { n, benefits:{s,u,j,g,c}(생계·의료·주거·교육·차상위 — true/false), recognized(원|null), earned(가구 근로·사업소득 세전 합계, 원),
 *       special(특례 가구원 있음), jahwal:'none'|'ok'|'excluded'(자활근로 사업단 참여), youths:[{age, earned}] }
 * 돌려줌: { hope1, hope2, youth:[...] } — 각 { status:'ok'|'check'|'no', checks:[{ok:true|false|null, t}], notes:[] }
 */
export function judge(f, D) {
  const A = D.asset, n = Math.max(1, f.n || 1), L = lines(D, n);
  const b = f.benefits || {};
  const su = !!(b.s || b.u), anyChosen = !!(b.s || b.u || b.j || b.g || b.c);
  const R = f.recognized == null || f.recognized === "" ? null : won(f.recognized);
  const E = won(f.earned);
  const capOk = E <= L.cap;
  const st = (checks) => checks.some((c) => c.ok === false) ? "no" : checks.every((c) => c.ok === true) ? "ok" : "check";

  // ---------- 희망저축계좌Ⅰ ----------
  const h1 = [], h1n = [];
  if (su) h1.push({ ok: true, t: "생계·의료급여 수급 가구예요." });
  else if (f.special) h1.push({ ok: true, t: "특례 가구원(자활급여특례·의료급여특례 등)이 있는 가구예요 → 소득기준특례로 볼 수 있어요." });
  else if (!anyChosen && R != null && R <= L.hope1Recognized) h1.push({ ok: null, t: `소득인정액은 40% 선 안이에요. 생계·의료급여를 실제로 받고 있는지 확인해요.` });
  else h1.push({ ok: false, t: "생계·의료급여 수급 가구가 아니에요. 주거·교육·차상위 가구는 희망저축계좌Ⅱ를 봐요." });
  if (R == null) h1.push({ ok: su ? true : null, t: `소득인정액 기준(40%, ${fmtWon(L.hope1Recognized)} 이하)${su ? "은 생계·의료 수급이면 맞아요." : " — 소득인정액을 넣으면 따져 볼게요."}` });
  else if (R <= L.hope1Recognized) h1.push({ ok: true, t: `소득인정액 ${fmtWon(R)} ≤ 기준 중위소득 40% ${fmtWon(L.hope1Recognized)}` });
  else if (f.special && capOk) h1.push({ ok: true, t: `소득인정액이 40%(${fmtWon(L.hope1Recognized)})를 넘지만, 특례 가구라 근로·사업소득이 소득상한(${fmtWon(L.cap)}) 안이면 대상에 들어요.` });
  else h1.push({ ok: false, t: `소득인정액 ${fmtWon(R)} > 기준 중위소득 40% ${fmtWon(L.hope1Recognized)}` });
  if (E <= 0) h1.push({ ok: false, t: "지금 일해서 버는 근로·사업소득이 있어야 해요." });
  else if (E >= L.hope1Earned) h1.push({ ok: true, t: `가구 근로·사업소득 ${fmtWon(E)} ≥ 기준 중위소득 40%의 60% ${fmtWon(L.hope1Earned)}` });
  else h1.push({ ok: false, t: `가구 근로·사업소득 ${fmtWon(E)} < 기준 중위소득 40%의 60% ${fmtWon(L.hope1Earned)} (모자란 금액 ${fmtWon(L.hope1Earned - E)})` });
  if (E > 0 && !capOk) h1.push({ ok: false, t: `근로·사업소득이 소득상한 ${fmtWon(L.cap)}을 넘어요(통장 유지 기준).` });
  h1n.push("근로·사업소득은 공제 전 금액(세전 총액)이고, 자활근로 소득도 근로소득으로 들어가요. 보장기관 확인소득은 빼요.");

  // ---------- 희망저축계좌Ⅱ ----------
  const h2 = [], h2n = [];
  const jahwalIn = f.jahwal === "ok" || f.jahwal === "excluded";
  if (su) h2.push({ ok: false, t: "생계·의료급여 수급 가구는 희망저축계좌Ⅰ 대상이에요(별도가구로 생계·의료를 받는 가구도 Ⅱ는 안 돼요)." });
  else if (b.j || b.g || b.c) h2.push({ ok: true, t: `${[b.j && "주거급여", b.g && "교육급여", b.c && "차상위"].filter(Boolean).join("·")} 가구예요.` });
  else h2.push({ ok: null, t: "주거·교육급여나 차상위에 해당하는지 확인해요(법정 차상위로 관리되지 않아도 법이 정한 범위면 가입 가능)." });
  if (R == null) h2.push({ ok: (b.j || b.g || b.c) && !su ? true : null, t: `소득인정액 기준(50%, ${fmtWon(L.half)} 이하)${(b.j || b.g || b.c) ? "은 주거·교육·차상위 가구면 대개 맞아요." : " — 소득인정액을 넣으면 따져 볼게요."}` });
  else if (R <= L.half) h2.push({ ok: true, t: `소득인정액 ${fmtWon(R)} ≤ 기준 중위소득 50% ${fmtWon(L.half)}` });
  else if (jahwalIn && capOk) h2.push({ ok: true, t: `소득인정액이 50%를 넘지만, 자활사업 참여 뒤 생긴 소득 때문이면 근로·사업소득이 소득상한(${fmtWon(L.cap)}) 안일 때 예외로 가입돼요.` });
  else h2.push({ ok: false, t: `소득인정액 ${fmtWon(R)} > 기준 중위소득 50% ${fmtWon(L.half)}` });
  h2.push(E > 0 ? { ok: true, t: `일하는 가구예요(근로·사업소득 ${fmtWon(E)}). 소액이라도 실제 소득이 있으면 돼요.` } : { ok: false, t: "지금 일해서 버는 근로·사업소득이 있어야 해요." });
  if (E > 0 && !capOk) h2.push({ ok: false, t: `근로·사업소득이 소득상한 ${fmtWon(L.cap)}을 넘어요(통장 유지 기준).` });
  h2n.push("2025년 이후 가입자는 정부지원이 1년차 10만원 → 2년차 20만원 → 3년차 30만원으로 늘어요.");

  // ---------- 청년내일저축계좌 (청년마다) ----------
  const [a0, a1] = A.accounts.youth.age;
  const youth = (f.youths || []).map((y, i) => {
    const c = [], notes = [];
    const age = y.age === "" || y.age == null ? null : Number(y.age);
    const own = won(y.earned);
    if (age == null) c.push({ ok: null, t: "나이를 넣어 주세요." });
    else c.push(age >= a0 && age <= a1 ? { ok: true, t: `만 ${age}세 (만 ${a0}~${a1}세)` } : { ok: false, t: `만 ${age}세 — 만 ${a0}~${a1}세만 가입할 수 있어요.` });
    c.push(own >= A.accounts.youth.own_earned_min ? { ok: true, t: `청년 본인 근로·사업소득 ${fmtWon(own)} ≥ 월 10만원 (세전 100%로 봐요)` } : { ok: false, t: `청년 본인 근로·사업소득이 월 10만원 이상이어야 해요(지금 ${fmtWon(own)}). 근로장학금·무급근로·실업급여·육아휴직급여는 안 돼요.` });
    if (R == null) c.push({ ok: anyChosen ? true : null, t: anyChosen ? "수급·차상위 가구라 가구 소득인정액 50% 기준은 대개 맞아요." : `가구 소득인정액이 기준 중위소득 50%(${fmtWon(L.half)}) 이하인지 확인해요.` });
    else c.push(R <= L.half ? { ok: true, t: `가구 소득인정액 ${fmtWon(R)} ≤ 50% ${fmtWon(L.half)}` } : { ok: false, t: `가구 소득인정액 ${fmtWon(R)} > 50% ${fmtWon(L.half)} — 2026년부터 50% 넘는 가구 청년은 새로 가입할 수 없어요.` });
    if (own > L.cap) c.push({ ok: false, t: `청년 본인 근로·사업소득이 소득상한 ${fmtWon(L.cap)}을 넘어요.` });
    if (b.s && own > A.extras.gongje.monthly) notes.push("생계급여 수급 가구의 청년이라 근로소득공제금 월 10만원이 더 쌓여요.");
    if (su) notes.push("가입 당시 생계·의료 수급 가구라, 해지 때 생계·의료에서 벗어나 있으면 탈수급장려금도 받아요.");
    return { i, age, own, status: st(c), checks: c, notes };
  });

  const naeil = f.jahwal === "ok";
  return {
    L, naeil,
    hope1: { status: st(h1), checks: h1, notes: h1n },
    hope2: { status: st(h2), checks: h2, notes: h2n },
    youth,
    both: youth.some((y) => y.status !== "no") && (st(h1) !== "no" || st(h2) !== "no"),
  };
}

/**
 * 3년 적립 어림 (이자 빼고)
 * o = { kind:'hope1'|'hope2'|'youth', self(월 본인저축), naeil(사업단 참여), suik(월 수익금), stop(적립중지 개월), gongje(생계수급 청년), hope2Old('22~'24 가입) }
 */
export function project(o, D) {
  const A = D.asset, total = A.months, stop = Math.min(Math.max(0, won(o.stop)), A.rules.stop_general_months);
  const m = total - stop;
  const self = Math.min(Math.max(won(o.self), A.self_monthly[0]), A.self_monthly[1]);
  const acc = A.accounts[o.kind];
  let match = 0;
  if (o.kind === "hope2") {
    if (o.hope2Old) match = acc.match_before_2025 * m;
    else { const per = acc.match_by_year; const s = stop / 3; match = per.reduce((t, x) => t + x * (12 - s), 0); }
  } else match = acc.match_monthly * m;
  const rows = [{ k: "본인 저축", v: self * m }, { k: "근로소득장려금(정부지원)", v: won(match) }];
  if (o.kind === "youth" && o.gongje) rows.push({ k: "근로소득공제금", v: A.extras.gongje.monthly * m });
  if (o.naeil && acc.extras.includes("naeil")) rows.push({ k: "내일키움장려금", v: A.extras.naeil.monthly * m });
  if (o.naeil && acc.extras.includes("suik") && won(o.suik) > 0) rows.push({ k: "내일키움수익금(어림)", v: Math.min(won(o.suik), A.extras.suik.monthly_max) * m });
  const sum = rows.reduce((t, r) => t + r.v, 0);
  const support = sum - self * m;
  return {
    months: m, rows, sum, self: self * m, support,
    // 희망저축Ⅰ: 탈수급 못 하면 일부지급 = 본인적립금 + 근로소득장려금 누적액의 5%(만기성공금), 나머지 환수
    partial: o.kind === "hope1" ? self * m + won(match * 0.05) : null,
    refund: self * m,
    tal: acc.extras.includes("tal") && (o.kind === "hope1" || o.suOrigin),
  };
}

/** 가입(첫 적립) 연월 → 만기·유예 끝 (YYYY-MM) */
export function schedule(ym, kind, D, opt = {}) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(ym || ""); if (!m) return null;
  const add = (y, mo, k) => { const t = y * 12 + (mo - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
  const y = +m[1], mo = +m[2];
  const extra = kind === "youth" && opt.special ? 24 : 0;   // 청년 특별 적립중지(2년) → 가입기간 5년
  const end = add(y, mo, D.asset.months + extra - 1);
  return { start: `${y}-${String(mo).padStart(2, "0")}`, end, grace: kind === "hope1" ? add(y, mo, D.asset.months + D.asset.accounts.hope1.grace_months - 1) : null, years: (D.asset.months + extra) / 12 };
}

/** 오늘 기준 이번 저축 마감일(22일, 주말이면 다음 월요일 — 공휴일은 따로 확인) */
export function nextDeadline(today = new Date()) {
  let y = today.getFullYear(), mo = today.getMonth();
  if (today.getDate() > 22) mo += 1;
  let d = new Date(y, mo, 22);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
