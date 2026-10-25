// 자유 글 → 항목표. 규칙만 쓴다(AI 호출 없음). 못 읽은 것은 질문으로 넘긴다.
const KNUM = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6 };
const SEOUL_GU = "강남|강동|강북|강서|관악|광진|구로|금천|노원|도봉|동대문|동작|마포|서대문|서초|성동|성북|송파|양천|영등포|용산|은평|종로|중랑";
const GYEONGGI = "경기|수원|성남|고양|용인|부천|안산|안양|남양주|화성|평택|의정부|시흥|파주|김포|광명|군포|하남|오산|이천|양주|구리|안성|포천|의왕|여주|동두천|과천|가평|양평|연천";
const METRO = "부산|대구|인천|대전|울산|세종|창원|광주광역";

/** "1억 2천", "60만원", "1,500만", "500만", "천만원", "5백만" → 원 */
export function parseAmount(s) {
  if (!s) return null;
  s = s.replace(/,/g, "").replace(/\s+/g, "");
  let total = 0, hit = false;
  const eok = s.match(/(\d+(?:\.\d+)?)억/); if (eok) { total += parseFloat(eok[1]) * 1e8; hit = true; s = s.replace(eok[0], ""); }
  const cheonman = s.match(/(\d+(?:\.\d+)?)천(?:만)?/); if (cheonman) { total += parseFloat(cheonman[1]) * 1e7; hit = true; s = s.replace(cheonman[0], ""); }
  const baekman = s.match(/(\d+(?:\.\d+)?)백만?/); if (baekman) { total += parseFloat(baekman[1]) * 1e6; hit = true; s = s.replace(baekman[0], ""); }
  const man = s.match(/(\d+(?:\.\d+)?)만/); if (man) { total += parseFloat(man[1]) * 1e4; hit = true; s = s.replace(man[0], ""); }
  if (!hit) { const m = s.match(/천만원?/); if (m) { total += 1e7; hit = true; } }
  if (!hit) { const m = s.match(/(\d{5,})원?/); if (m) { total += parseInt(m[1], 10); hit = true; } }
  return hit ? Math.round(total) : null;
}
const AMT = "((?:\\d[\\d,\\.]*\\s*(?:억|천만|천|백만|백|만)\\s*(?:원)?\\s*)+|천만\\s*원?|\\d{5,}\\s*원?)";

/** 글 → { fields, found[], unknown[] } */
export function parseFreeText(text) {
  const t = (text || "").replace(/\s+/g, " ");
  const f = { members: [], cars: [] };
  const found = [];
  const note = (field, label, value, m) => found.push({ field, label, value, text: m });
  let m;

  // 지역
  if ((m = t.match(new RegExp(`(서울|${SEOUL_GU})`)))) { f.region = "seoul"; note("region", "지역", "서울", m[0]); }
  else if ((m = t.match(new RegExp(`(${GYEONGGI})`)))) { f.region = "gyeonggi"; note("region", "지역", "경기", m[0]); }
  else if ((m = t.match(new RegExp(`(${METRO})`)))) { f.region = "metro_sejong_changwon"; note("region", "지역", "광역시·세종·창원", m[0]); }
  else if ((m = t.match(/(광주)/)) && !/경기/.test(t)) { f.regionAsk = "광주광역시인지 경기 광주시인지"; note("region", "지역", "광주(어느 광주?)", m[0]); }
  else if ((m = t.match(/(시골|읍내|면 소재지|군에 살|군 소재)/))) { f.region = "other"; note("region", "지역", "그 외 지역(시골)", m[0]); }

  // 집
  if ((m = t.match(new RegExp(`월세\\s*(?:가|는|로)?\\s*${AMT}?`)))) {
    f.housing = Object.assign(f.housing || {}, { type: "monthly" }); if (m[1]) f.housing.rent = parseAmount(m[1]);
    note("housing", "집", `월세${m[1] ? " " + m[1].trim() : ""}`, m[0]);
  }
  if ((m = t.match(new RegExp(`보증금\\s*(?:은|이|도)?\\s*${AMT}`)))) { f.housing = Object.assign(f.housing || { type: "monthly" }, { value: parseAmount(m[1]) }); note("housing.value", "보증금", m[1].trim(), m[0]); }
  if ((m = t.match(new RegExp(`전세\\s*(?:가|는|로|금|보증금)?\\s*${AMT}?`)))) { f.housing = Object.assign(f.housing || {}, { type: "jeonse" }); if (m[1]) f.housing.value = parseAmount(m[1]); note("housing", "집", `전세${m[1] ? " " + m[1].trim() : ""}`, m[0]); }
  if (/자가|내\s*집|집이 있|집을 가지고|소유|자기 집|우리 집(?!에)|집 한 채|집이 한 채|공시가격|집값|아파트가 있|아파트 한 채/.test(t) && !f.housing) {
    f.housing = { type: "own" };
    const mv = t.match(new RegExp(`(?:공시가격|집값|시가표준액|아파트|집)\\D{0,8}?${AMT}`)); if (mv) f.housing.value = parseAmount(mv[1]);
    note("housing", "집", `자가${mv ? " " + mv[1].trim() : ""}`, mv ? mv[0] : "자가");
  }
  if (/무상|공짜로 살|얹혀|부모님 집에/.test(t) && !f.housing) { f.housing = { type: "free" }; note("housing", "집", "무상", "무상"); }
  if (f.housing) f.housing.living = true;

  // 가구원
  let n = null, children = 0, spouse = false;
  if ((m = t.match(/(\d)\s*인\s*가구/))) { n = parseInt(m[1], 10); note("n", "가구원 수", `${n}명`, m[0]); }
  if (/혼자|독거|1인 가구|나 혼자/.test(t)) { n = 1; note("n", "가구원 수", "1명(혼자)", "혼자"); }
  if ((m = t.match(/(?:아이|자녀|애|아들|딸|자식|애들)(?:가|이|은|는|도)?\s*(\d+|한|두|세|네|다섯|둘|셋|넷)\s*(?:명|놈)?/))) {
    children = KNUM[m[1]] || parseInt(m[1], 10) || 0; note("children", "자녀", `${children}명`, m[0]);
  } else if (/(아이|자녀|아들|딸)(가|이) 있/.test(t)) { children = 1; note("children", "자녀", "1명(수 확인 필요)", "자녀 있음"); }
  if (/아내|남편|배우자|부부|와이프|신랑|집사람/.test(t)) { spouse = true; note("spouse", "배우자", "함께 삶", "배우자"); }
  // 나이
  const ages = [...t.matchAll(/(\d{2})\s*(?:살|세)(?!대)/g)].map((x) => parseInt(x[1], 10));
  const decade = t.match(/(\d)0\s*대(?:\s*(초반|중반|후반))?/);
  let selfAge = ages[0] ?? (decade ? parseInt(decade[1], 10) * 10 + ({ 초반: 2, 중반: 5, 후반: 8 }[decade[2]] ?? 5) : null);
  if (selfAge != null) note("age", "본인 나이", `${selfAge}세`, ages[0] != null ? `${ages[0]}세` : decade[0]);
  const self = { age: selfAge, role: "본인" };
  if (/장애/.test(t)) { self.disabled = true; note("disabled", "등록장애인", "예(확인 필요)", "장애"); }
  if (/임신/.test(t)) { self.pregnant = true; note("pregnant", "임신·출산", "예", "임신"); }
  if (/대학생|휴학/.test(t)) { self.student = true; note("student", "대학생", "예", "대학생"); }

  // 소득
  const earn = (type, label, re) => { const mm = t.match(re); if (mm) { self.earned = { type, amount: parseAmount(mm[1]) }; note("earned", label, mm[1].trim(), mm[0]); return true; } return false; };
  earn("jahwal", "자활근로 소득", new RegExp(`자활(?:근로)?\\D{0,10}?${AMT}`)) ||
    earn("business", "사업소득", new RegExp(`(?:장사|사업|가게|자영업)\\D{0,8}?${AMT}`)) ||
    earn("regular", "근로소득", new RegExp(`(?:월급|급여|근로소득|알바|아르바이트|일당|벌(?:어|고)|수입)\\D{0,8}?${AMT}`));
  if (!self.earned) { const mm = t.match(new RegExp(`${AMT}\\s*(?:의|을|를|씩)?\\s*(월급|급여|근로소득|알바비|수입)`)); if (mm) { self.earned = { type: "regular", amount: parseAmount(mm[1]) }; note("earned", "근로소득", mm[1].trim(), mm[0]); } }
  if (!self.earned && /자활(근로)?/.test(t)) { self.earned = { type: "jahwal", amount: null }; note("earned", "자활근로", "참여 중(금액 확인 필요)", "자활"); }
  if (!self.earned && /소득(은|이)?\s*(없|전혀|하나도)|일을?\s*(안|못)\s*(해|하)|무직|일 없/.test(t)) { self.earned = null; self.noIncome = true; note("earned", "일해서 버는 돈", "없음", "소득 없음"); }
  let pub = 0;
  for (const mm of t.matchAll(new RegExp(`(국민연금|기초연금|장애인연금|노령연금|연금)\\D{0,6}?${AMT}`, "g"))) { const v = parseAmount(mm[2]); if (v) { pub += v; note("publicTransfer", mm[1], mm[2].trim(), mm[0]); } }
  if (pub) self.publicTransfer = pub;
  if ((m = t.match(new RegExp(`(?:용돈|생활비)\\D{0,8}?${AMT}`)))) { self.privateTransfer = parseAmount(m[1]); note("privateTransfer", "가족이 주는 돈(정기 여부 확인)", m[1].trim(), m[0]); }

  // 금융
  if ((m = t.match(new RegExp(`(?:통장|예금|적금|저축|보험|주식|현금)\\D{0,10}?${AMT}`)))) { f.financial = { general: parseAmount(m[1]) }; note("financial", "통장·보험 등", m[1].trim(), m[0]); }
  // 자동차
  if (/(?:자동차|승용차|차)(?:는|가|도)?\s*(?:없|안 가지|안 갖|없음|없고|없어)/.test(t)) { f.cars = []; f.noCar = true; note("car", "자동차", "없음", "차 없음"); }
  else if (/(?:^|[^기])(차|자동차|승용차|SUV|suv|트럭|화물차|승합차|오토바이)(?:가|는|도|를|로|\s|$)/.test(t) && !/차상위|기차|주차/.test(t)) {
    const car = { kind: /트럭|화물/.test(t) ? "truck" : /승합/.test(t) ? "van" : /오토바이/.test(t) ? "motorcycle" : "passenger" };
    if ((m = t.match(/(\d{3,4})\s*cc/i))) car.cc = parseInt(m[1], 10);
    if ((m = t.match(/(20\d{2}|\d{2})\s*년\s*식/))) car.year = m[1].length === 2 ? 2000 + parseInt(m[1], 10) : parseInt(m[1], 10);
    if ((m = t.match(/(\d{1,2})\s*년\s*(?:된|넘은|탄)/))) car.year = 2026 - parseInt(m[1], 10);
    if ((m = t.match(new RegExp(`(?:차|자동차|승용차)\\D{0,12}?${AMT}`)))) car.value = parseAmount(m[1]);
    if (/생업|영업용|배달용|택시|화물 일/.test(t)) car.use = "livelihood";
    f.cars.push(car); note("car", "자동차", `${car.kind === "passenger" ? "승용" : car.kind}${car.cc ? " " + car.cc + "cc" : ""}${car.year ? " " + car.year + "년식" : ""}`, "자동차");
  }
  // 빚
  if ((m = t.match(new RegExp(`(?:빚|대출|채무|카드값)\\D{0,10}?${AMT}`)))) { f.debt = parseAmount(m[1]); note("debt", "빚(금융기관)", m[1].trim(), m[0]); }

  // 따로 사는 가족의 높은 소득(생계급여 예외 1.3억·12억)
  if ((m = t.match(new RegExp(`(아들|딸|자녀|자식|아버지|어머니|부모님?|사위|며느리)\\D{0,8}?(연봉|연 ?소득|한 해에?)\\D{0,4}?${AMT}`)))) {
    const v = parseAmount(m[3]); f.obligorHigh = v != null && v > 130000000; note("obligor", `${m[1]} 연소득`, `${m[3].trim()} → ${f.obligorHigh ? "1.3억 초과(생계급여 예외)" : "1.3억 이하"}`, m[0]);
  }
  // 가구원 조립
  f.members.push(self);
  if (spouse) f.members.push({ role: "배우자", age: ages[1] ?? null });
  for (let i = 0; i < children; i++) f.members.push({ role: "자녀", age: ages[spouse ? 2 + i : 1 + i] ?? null });
  if (n && n > f.members.length) for (let i = f.members.length; i < n; i++) f.members.push({ role: "가구원", age: null });

  // 빠진 것
  const missing = [];
  if (!f.region) missing.push("region");
  if (!f.housing) missing.push("housing"); else if (f.housing.type !== "free" && f.housing.value == null) missing.push("housing.value");
  if (f.members.some((x) => x.age == null)) missing.push("ages");
  if (!self.earned && !self.noIncome) missing.push("earned"); else if (self.earned && self.earned.amount == null) missing.push("earned.amount");
  if (!f.financial) missing.push("financial");
  if (!f.cars.length && !f.noCar) missing.push("car");
  if (f.debt == null) missing.push("debt");
  if (f.obligorHigh == null) missing.push("obligor");
  return { fields: f, found, missing };
}
