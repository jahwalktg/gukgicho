// 국기초 가늠표 — 계산 엔진 (브라우저·Node 공용 ES 모듈)
// 모든 숫자는 data/<연도>.json 에서 읽는다. 여기에는 규칙(순서·공식)만 있다.
// 결과는 '대략'이다. 확정은 시·군·구 담당자가 한다.

export const REGIONS = {
  seoul: "서울", gyeonggi: "경기", metro_sejong_changwon: "광역시·세종·창원", other: "그 외 지역",
};

const won = (v) => Math.max(0, Math.round(v || 0));

/** 가구원 수에 따른 기준 중위소득 */
export function medianIncome(D, n) {
  const m = D.median_income;
  if (n <= 7) return m[String(n)];
  return m["7"] + m.step_8plus * (n - 7);
}

/** 급여별 선정기준(8인 이상은 7인+차액 산식) */
export function thresholds(D, n) {
  const out = {};
  for (const k of ["saenggye", "uiryo", "jugeo", "gyoyuk"]) {
    const t = D.selection[k];
    if (n <= 7) out[k] = t[String(n)];
    else out[k] = t["7"] + (t["7"] - t["6"]) * (n - 7);
  }
  return out;
}

/** 한 사람의 근로·사업소득 공제. mode: 'standard'(생계·주거·교육) | 'medical'(의료) */
export function earnedDeduction(D, member, mode) {
  const E = won(member.earned && member.earned.amount);
  if (!E) return { ded: 0, label: null, ref: null };
  const R = D.earned_income_deduction;
  const fixedRate = (rule) => Math.min(E, rule.fixed) + Math.max(0, E - rule.fixed) * rule.rate;
  const cands = [];
  const isJahwal = member.earned && member.earned.type === "jahwal";
  if (mode === "standard") cands.push({ ded: E * R.default.rate, label: "일반 공제 30%", ref: "안내 p.105" });
  if (isJahwal) cands.push({ ded: E * R.jahwal_work.rate, label: "자활근로 소득공제 30%", ref: "안내 p.105 · 자활사업안내 Ⅳ" });
  if ((member.age != null && member.age <= 34) || member.student)
    cands.push({ ded: fixedRate(R.youth_34_student), label: "34세 이하·대학생 60만원 공제 후 30%", ref: "안내 p.105~106" });
  if ((member.age != null && member.age >= 65) || member.disabled)
    cands.push({ ded: fixedRate(R.senior65_disabled_nk), label: "65세 이상·등록장애인 20만원 공제 후 30%", ref: "안내 p.105~106" });
  if (member.pregnant) cands.push({ ded: E * R.pregnant.rate, label: "임신·출산 6개월 30%", ref: "안내 p.106" });
  if (!cands.length) return { ded: 0, label: "의료급여 기준: 해당 추가 공제 없음", ref: "안내 p.105" };
  // 가장 유리한 하나. 공제액이 같으면 자활근로 소득공제 우선.
  cands.sort((a, b) => b.ded - a.ded || (b.label.startsWith("자활") ? 1 : 0) - (a.label.startsWith("자활") ? 1 : 0));
  return { ded: won(cands[0].ded), label: cands[0].label, ref: cands[0].ref };
}

/** 자동차 1대 분류 → { rate: 0 | 'general' | 'full', why } */
export function classifyCar(D, car, ctx) {
  const yearNow = D.year;
  const age = car.year ? yearNow - car.year : 0;
  const value = won(car.value);
  const oldOrCheap = age >= 10 || value < 5000000;
  const kind = car.kind || "passenger";
  if (car.use === "livelihood") return { rate: 0, why: "생업용 자동차(가구별 1대) → 재산 산정 제외", ref: "안내 p.153" };
  if (car.use === "disabled" && (car.cc || 0) < 2000) return { rate: 0, why: "장애인 사용 자동차 2,000cc 미만(가구별 1대) → 제외", ref: "안내 p.152" };
  if (kind === "motorcycle") return (car.cc || 0) <= 260
    ? { rate: "general", why: "260cc 이하 이륜차 → 일반재산 환산율", ref: "안내 p.155" }
    : { rate: "full", why: "260cc 초과 이륜차 → 100%", ref: "안내 p.152" };
  if (kind === "passenger") {
    if ((car.cc || 0) < 2000 && oldOrCheap)
      return { rate: "general", why: "2,000cc 미만 + (10년 이상 또는 500만원 미만) → 일반재산 환산율 4.17%", ref: "안내 p.154" };
    if ((ctx.childrenUnder18 >= 2 || ctx.n >= 6) && (car.cc || 0) < 2500 && (car.seats || 0) >= 7 && oldOrCheap)
      return { rate: "general", why: "자녀 2명 이상(또는 6인 이상) 가구의 7인승·2,500cc 미만 + (10년 이상 또는 500만원 미만) → 4.17%", ref: "안내 p.154 · 2026 완화" };
    return { rate: "full", why: "일반재산 환산율 요건에 안 맞음 → 차량가액 100%가 월 소득으로", ref: "안내 p.152" };
  }
  // van / truck
  if (car.small && oldOrCheap)
    return { rate: "general", why: "소형 이하 승합·화물 + (10년 이상 또는 500만원 미만) → 4.17%", ref: "안내 p.154 · 2026 완화" };
  return { rate: "full", why: "소형 이하·10년·500만원 요건에 안 맞는 승합·화물 → 100%", ref: "안내 p.152" };
}

/**
 * 메인 계산.
 * input = { region, members:[{age, disabled, pregnant, student, earned:{type, amount}, publicTransfer, privateTransfer}],
 *           housing:{type:'own'|'jeonse'|'monthly'|'free'|'none', value, rent, living},
 *           financial:{general, longTerm}, generalProperty, cars:[...], debt, obligorHigh, unknown:[] }
 */
export function compute(input, D) {
  const notes = [], refs = new Set();
  const members = input.members || [];
  const n = Math.max(1, members.length);
  const region = input.region || "other";
  const median = medianIncome(D, n);
  const T = thresholds(D, n);
  refs.add("기준 중위소득·선정기준: 고시 제2025-135호, 안내 p.51~52");

  // ---------- 소득평가액 ----------
  const incomeLines = [];
  let earnedTotal = 0, transferTotal = 0, dedStd = 0, dedMed = 0;
  members.forEach((m, i) => {
    const pub = won(m.publicTransfer), priv = won(m.privateTransfer);
    transferTotal += pub + priv;
    // 한 사람에게 소득 항목이 둘일 수 있다(earned + earned2: 변화 보기에서 '일반 소득 추가'에 씀)
    for (const item of [m.earned, m.earned2].filter((x) => x && won(x.amount) > 0)) {
      const E = won(item.amount);
      earnedTotal += E;
      const mm = { ...m, earned: item };
      const ds = earnedDeduction(D, mm, "standard");
      const dm = earnedDeduction(D, mm, "medical");
      dedStd += ds.ded; dedMed += dm.ded;
      incomeLines.push({ who: `가구원 ${i + 1}`, kind: item.type === "jahwal" ? "자활근로 소득" : "근로·사업소득", amount: E,
        dedStd: ds.ded, dedStdLabel: ds.label, dedMed: dm.ded, dedMedLabel: dm.label, ref: ds.ref });
      if (ds.ref) refs.add("근로·사업소득 공제: " + ds.ref);
    }
    if (pub) incomeLines.push({ who: `가구원 ${i + 1}`, kind: "공적이전소득(연금 등)", amount: pub, dedStd: 0, dedMed: 0, ref: "안내 p.99~" });
    if (priv) incomeLines.push({ who: `가구원 ${i + 1}`, kind: "사적이전소득(정기적으로 받는 돈)", amount: priv, dedStd: 0, dedMed: 0, ref: "안내 p.99~" });
  });
  const actualIncome = earnedTotal + transferTotal;
  const incomeEvalStd = won(actualIncome - dedStd);
  const incomeEvalMed = won(actualIncome - dedMed);
  if (dedStd !== dedMed) notes.push("의료급여는 일반 공제 30%가 적용되지 않아(추가 공제만) 의료급여용 소득인정액이 따로 계산됩니다. [안내 p.105]");

  // ---------- 재산의 소득환산액 ----------
  const propLines = [];
  const h = input.housing || { type: "none" };
  let housingAsset = 0, general = won(input.generalProperty);
  if (["own", "jeonse", "monthly"].includes(h.type)) {
    const v = won(h.value);
    if (h.living === false && h.type === "own") { general += v; propLines.push({ kind: "거주하지 않는 주택 → 일반재산", amount: v, ref: "안내 재산조사 '주거용재산'" }); }
    else housingAsset = v;
  }
  const cap = D.housing_property_cap[region];
  let housing = Math.min(housingAsset, cap);
  const excess = housingAsset - housing;
  if (excess > 0) { general += excess; propLines.push({ kind: `주거용재산 한도(${REGIONS[region]} ${fmtMan(cap)}) 초과분 → 일반재산`, amount: excess, ref: "안내 '주거용재산 적용한도'" }); }
  if (housingAsset) propLines.push({ kind: h.type === "own" ? "주거용재산(살고 있는 집, 한도 내)" : "주거용재산(임차보증금, 한도 내)", amount: housing, ref: "안내 '주거용재산'" });

  // 자동차
  let carFull = 0;
  const childrenUnder18 = members.filter((m) => m.age != null && m.age < 18).length;
  (input.cars || []).forEach((c, i) => {
    const r = classifyCar(D, c, { n, childrenUnder18 });
    const v = won(c.value);
    if (r.rate === 0) propLines.push({ kind: `자동차 ${i + 1}: ${r.why}`, amount: 0, ref: r.ref });
    else if (r.rate === "general") { general += v; propLines.push({ kind: `자동차 ${i + 1}: ${r.why}`, amount: v, ref: r.ref }); }
    else { carFull += v; propLines.push({ kind: `자동차 ${i + 1}: ${r.why}`, amount: v, full: true, ref: r.ref }); }
    refs.add("자동차 기준: " + r.ref);
  });
  if (general) propLines.push({ kind: "일반재산 합계(기타 재산·한도 초과분·일반재산 환산 자동차)", amount: general, ref: "안내 p.166" });

  // 금융재산
  const f = input.financial || {};
  const finTotal = won(f.general) + won(f.longTerm);
  const finDed = (finTotal ? D.financial_deduction.living_reserve_per_household : 0) + Math.min(won(f.longTerm), D.financial_deduction.long_term_savings.total_cap);
  let financial = won(finTotal - finDed);
  if (finTotal) propLines.push({ kind: `금융재산 ${fmtMan(finTotal)} − 생활준비금 500만원${f.longTerm ? " − 장기저축 공제" : ""}`, amount: financial, ref: "안내 p.148" });

  // 기본재산액·부채 공제: 주거용 → 일반 → 금융 순
  const basic = D.basic_property[region];
  let remain = basic + won(input.debt);
  const take = (x) => { const t = Math.min(x, remain); remain -= t; return x - t; };
  const housingRem = take(housing), generalRem = take(general), financialRem = take(financial);
  propLines.push({ kind: `기본재산액(${REGIONS[region]}) ${fmtMan(basic)}${input.debt ? ` + 부채 ${fmtMan(won(input.debt))}` : ""} 공제 (주거용 → 일반 → 금융 순, 100% 자동차에는 공제 없음)`, amount: -(basic + won(input.debt) - remain), ref: "안내 p.165" });
  const C = D.conversion_rate_monthly;
  const conv = {
    housing: won(housingRem * C.housing), general: won(generalRem * C.general),
    financial: won(financialRem * C.financial), car: won(carFull * C.car_full),
  };
  const propertyConv = conv.housing + conv.general + conv.financial + conv.car;
  refs.add("환산율·기본재산액·한도액: 안내 p.165~166");

  // ---------- 소득인정액 · 판정 ----------
  const recognized = incomeEvalStd + propertyConv;
  const recognizedMed = incomeEvalMed + propertyConv;
  const obligorHigh = input.obligorHigh === true;
  const benefits = {
    saenggye: { eligible: recognized <= T.saenggye && !obligorHigh, amount: won(T.saenggye - recognized), margin: T.saenggye - recognized,
      note: obligorHigh ? "부양의무자 연 소득 1.3억·일반재산 12억 초과 → 생계급여 제외 [안내 p.52]" : null },
    uiryo: { eligible: recognizedMed <= T.uiryo, margin: T.uiryo - recognizedMed, conditional: true,
      note: "소득 기준만 본 것입니다. 의료급여는 부양의무자 기준(없음·있음 판정)을 담당자가 따로 봅니다. [안내 p.52, 196~197]" },
    jugeo: { eligible: recognized <= T.jugeo, margin: T.jugeo - recognized, note: "임차급여는 급지·기준임대료에 따라 금액이 정해집니다(국토교통부)." },
    gyoyuk: { eligible: recognized <= T.gyoyuk, margin: T.gyoyuk - recognized, note: "초·중·고 재학생이 있을 때 의미가 있습니다(교육부)." },
  };

  // ---------- 자활 접점 ----------
  const J = D.jahwal;
  const hasJahwal = members.some((m) => m.earned && m.earned.type === "jahwal" && won(m.earned.amount) > 0);
  const working = earnedTotal > 0;
  const jahwal = {
    hasJahwal,
    special: hasJahwal && recognizedMed > T.uiryo ? "자활근로 소득으로 의료급여 선정기준을 넘었다면 자활급여특례(5년) 검토 대상입니다. [안내 p.56~58]" : null,
    hope1: working && (benefits.saenggye.eligible || benefits.uiryo.eligible) && earnedTotal >= median * 0.4 * 0.6,
    hope1Why: `희망저축계좌Ⅰ: 생계·의료 수급 가구 + 가구 근로·사업소득(공제 전, 자활근로 포함) ≥ 기준 중위소득 40%의 60%(${fmtMan(median * 0.4 * 0.6)}) [자산형성 안내 p.35]`,
    hope2: working && !(benefits.saenggye.eligible || benefits.uiryo.eligible) && recognized <= median * 0.5,
    hope2Why: `희망저축계좌Ⅱ: 주거·교육 수급 또는 차상위 + 소득인정액 ≤ 기준 중위소득 50%(${fmtMan(median * 0.5)}) [자산형성 안내 p.48]`,
    // 청년내일저축계좌: 만 15~39세 + 청년 본인 근로·사업소득 월 10만원 이상(세전) + 가구 소득인정액 ≤ 중위 50% [자산형성 안내 p.61~62]
    youth: members.some((m) => m.age != null && m.age >= J.youth_tomorrow_savings.age[0] && m.age <= J.youth_tomorrow_savings.age[1]
      && won(m.earned && m.earned.amount) + won(m.earned2 && m.earned2.amount) >= 100000) && recognized <= median * 0.5,
    youthWhy: "청년내일저축계좌: 만 15~39세 일하는 청년(본인 근로·사업소득 월 10만원 이상) + 가구 소득인정액 ≤ 기준 중위소득 50% [자산형성 안내 p.61]",
  };

  const unknown = input.unknown || [];
  if (unknown.length) notes.push(`'모름'으로 둔 항목(${unknown.join(", ")})은 0으로 계산했습니다. 실제 소득인정액은 이보다 높을 수 있습니다.`);

  return {
    year: D.year, n, region, median, thresholds: T,
    income: { actual: actualIncome, earned: earnedTotal, transfer: transferTotal, dedStd, dedMed, evalStd: incomeEvalStd, evalMed: incomeEvalMed, lines: incomeLines },
    property: { housing, general, financial, carFull, basic, remainAfter: { housingRem, generalRem, financialRem }, conv, total: propertyConv, lines: propLines },
    recognized, recognizedMed, benefits, jahwal, notes, refs: [...refs],
  };
}

/** 변화 보기: 소득을 delta 만큼 올린다. jahwal=true 면 자활근로 소득으로 */
export function withExtraIncome(input, delta, jahwal) {
  const copy = JSON.parse(JSON.stringify(input));
  const type = jahwal ? "jahwal" : "regular";
  const isType = (m) => m.earned && won(m.earned.amount) > 0 && (jahwal ? m.earned.type === "jahwal" : m.earned.type !== "jahwal");
  let target = copy.members.find(isType);
  if (target) { target.earned.amount = won(target.earned.amount) + delta; return copy; }
  // 같은 종류의 소득이 없으면: 소득 없는 성인에게 새로 , 그것도 없으면 첫 소득자에게 두 번째 소득 항목으로
  target = copy.members.find((m) => !(m.earned && won(m.earned.amount) > 0) && (m.age == null || (m.age >= 18 && m.age < 65)));
  if (target) { target.earned = { type, amount: delta }; return copy; }
  target = copy.members.find((m) => m.earned && won(m.earned.amount) > 0) || copy.members[0];
  target.earned2 = { type, amount: won(target.earned2 && target.earned2.amount) + delta };
  return copy;
}

export function fmtMan(v) {
  const sign = v < 0 ? "−" : "";
  v = Math.abs(Math.round(v));
  if (v >= 100000000) { const eok = Math.floor(v / 100000000); const man = Math.round((v % 100000000) / 10000); return `${sign}${eok}억${man ? " " + man.toLocaleString() + "만" : ""}원`; }
  if (v >= 10000) { const man = v / 10000; return `${sign}${(Math.round(man * 10) / 10).toLocaleString()}만원`; }
  return `${sign}${v.toLocaleString()}원`;
}
export function fmtWon(v) { return (v < 0 ? "−" : "") + Math.abs(Math.round(v)).toLocaleString() + "원"; }
