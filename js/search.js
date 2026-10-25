// 근거 찾기 — 사업안내 '색인'만 검색한다. 원문 본문은 싣지 않고 쪽수와 제목을 보여 준다.
let DICT = null, DOCS = [];
const SOURCES = {
  guide2026: { title: "2026년 국민기초생활보장 사업안내", short: "사업안내", pdfOffset: 26,
    local: "pdf/guide2026.pdf", external: "https://www.gg.go.kr/welfarehotline/bbs/boardView.do?bsIdx=842&bIdx=110894043&menuId=3911", externalName: "경기도 긴급복지 자료실" },
  jahwal2026: { title: "2026년 자활사업안내", short: "자활사업안내", pdfOffset: 26,
    local: "pdf/jahwal2026.pdf", external: "https://www.gg.go.kr/cmmn/download.do?idx=890169", externalName: "경기도 게시본(내려받기)" },
};
export { SOURCES };

export async function loadSearch() {
  if (DICT) return;
  const [d, g, j] = await Promise.all(["data/dict.json", "data/index_guide2026.json", "data/index_jahwal2026.json"].map((u) => fetch(u).then((r) => r.json())));
  DICT = d; DOCS = [g, j];
  for (const doc of DOCS) { doc.byPdf = {}; for (const p of doc.pages) doc.byPdf[p.pdf] = p; }
}
const norm = (s) => (s || "").replace(/[\s･·\.]/g, "");

export function expandQuery(q) {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  const terms = new Set(tokens);
  for (const [k, vs] of Object.entries(DICT.synonyms)) if (q.includes(k)) vs.forEach((v) => terms.add(v));
  // 색인 용어 중 질문에 들어 있는 것
  for (const doc of DOCS) for (const t of Object.keys(doc.terms)) if (norm(q).includes(norm(t))) terms.add(t);
  return [...terms];
}

export function search(q) {
  if (!q || !q.trim()) return { topics: [], pages: [] };
  const terms = expandQuery(q);
  const tokens = q.trim().split(/\s+/);
  const topics = DICT.topics.map((tp) => {
    let s = 0; for (const tk of tokens) { if (tp.q.includes(tk)) s += 3; if (tp.a.includes(tk)) s += 1; }
    for (const tm of terms) { if (tp.q.includes(tm)) s += 2; else if (tp.a.includes(tm)) s += 1; }
    return { ...tp, score: s };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  const pages = [];
  for (const doc of DOCS) {
    const score = {};
    for (const tm of terms) {
      const w = tokens.includes(tm) ? 2 : 1;
      for (const pdf of doc.terms[tm] || []) {
        score[pdf] = (score[pdf] || 0) + w;
        const pg = doc.byPdf[pdf];
        if (pg && pg.h.some((h) => norm(h).includes(norm(tm)))) score[pdf] += 3;
      }
    }
    Object.entries(score).forEach(([pdf, s]) => { const pg = doc.byPdf[pdf]; if (pg && pg.p) pages.push({ doc: doc.doc, title: SOURCES[doc.doc].short, p: pg.p, pdf: +pdf, heads: pg.h, score: s }); });
  }
  pages.sort((a, b) => b.score - a.score);
  return { terms, topics, pages: pages.slice(0, 12) };
}

export function pageRef(docId, p) {
  const doc = DOCS.find((d) => d.doc === docId);
  const pg = doc && doc.pages.find((x) => x.p === p);
  return { doc: docId, title: SOURCES[docId].short, p, pdf: pg ? pg.pdf : p + SOURCES[docId].pdfOffset, heads: pg ? pg.h : [] };
}
