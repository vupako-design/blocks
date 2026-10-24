// xlsx = zip с XML. Распаковка — встроенный DecompressionStream, зависимостей нет.
async function unzip(buf, name) {
  const v = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder();
  let e = u8.length - 22;
  while (v.getUint32(e, true) !== 0x06054b50) e--;
  let p = v.getUint32(e + 16, true);
  for (let n = v.getUint16(e + 10, true); n--; ) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
    const off = v.getUint32(p + 42, true);
    if (td.decode(u8.subarray(p + 46, p + 46 + nl)) === name) {
      const s = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      const data = u8.subarray(s, s + size);
      if (!method) return td.decode(data);
      const ds = new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
      return td.decode(await ds.arrayBuffer());
    }
    p += 46 + nl + xl + cl;
  }
  return '';
}

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const texts = (x) => [...x.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join('');

async function parseXlsx(buf) {
  const sst = [...(await unzip(buf, 'xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const sheet = await unzip(buf, 'xl/worksheets/sheet1.xml');
  const rows = [];
  for (const [, , body] of [...sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].filter((m) => m[1] > 1)) {
    const c = {};
    for (const [, col, attrs, inner] of body.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (!inner) continue;
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      c[col] = attrs.includes('inlineStr') ? texts(inner) : attrs.includes('t="s"') ? sst[v] : attrs.includes('t="str"') ? unesc(v) : Number(v);
    }
    rows.push({ geo: c.A, block: c.B, browser: c.C, shows: c.D, reward: c.E, cpmv: c.F, clicks: c.G });
  }
  return rows;
}

const process = (rows) =>
  rows
    .filter((r) => r.browser === 'MobileFirefox' && r.cpmv >= 1000 && r.geo !== 'Не определено')
    .sort((a, b) => b.cpmv - a.cpmv)
    .map((r) => ({ ...r, block: r.block.replace('HTML5 game: ', ''), green: r.shows > 1 }));

// Яндекс API (partner.yandex.ru). Названия полей — в одном месте, если что-то не так, правим здесь.
const v = (x) => [].concat(x)[0];
async function fetchApi(token, period, base, onPage) {
  const url = base.replace(/\/$/, '') + '/api/statistics2/get.json?';
  const page = async (offset, filter) => {
    const q = new URLSearchParams({ lang: 'ru', period, dimension_field: 'geo|city', limits: JSON.stringify({ limit: 1000, offset }) });
    if (filter) q.set('filter', filter);
    ['shows', 'partner_wo_nds', 'clicks'].forEach((f) => q.append('field', f));
    ['block_caption', 'browser'].forEach((f) => q.append('entity_field', f));
    const r = await fetch(url + q, { headers: { Authorization: 'OAuth ' + token }, signal: AbortSignal.timeout(90000) });
    const j = await r.json().catch(() => ({}));
    if (j.result !== 'ok') throw new Error(r.status + ' ' + JSON.stringify(j).slice(0, 300));
    return j.data;
  };
  // Первая страница, остальные — параллельно по 5 штук (если Яндекс сообщил общее число строк).
  const all = async (filter) => {
    let d = await page(0, filter);
    const pts = [...d.points], step = pts.length;
    if (!d.is_last_page && step) {
      if (d.total_rows > step) {
        const offs = [];
        for (let o = step; o < d.total_rows; o += step) offs.push(o);
        for (let i = 0; i < offs.length; i += 5) {
          (await Promise.all(offs.slice(i, i + 5).map((o) => page(o, filter)))).forEach((x) => pts.push(...x.points));
          onPage && onPage(pts.length);
        }
      } else do { d = await page(pts.length, filter); pts.push(...d.points); onPage && onPage(pts.length); } while (!d.is_last_page && d.points.length && pts.length < 2e5);
    }
    return pts;
  };
  // Просим у Яндекса сразу только нужный браузер (в разы меньше данных). Не вышло — берём всё, как раньше.
  let pts = await all('["browser","=","MobileFirefox"]').catch((e) => { if (/^(?!40[13])[45]\d\d /.test(e.message)) return []; throw e; });
  if (!pts.length) pts = await all();
  return pts.map(({ dimensions: d, measures: [m] }) => ({ geo: v(d.geo), block: String(v(d.block_caption)), browser: v(d.browser), shows: m.shows, reward: m.partner_wo_nds, clicks: m.clicks, cpmv: m.shows ? (m.partner_wo_nds / m.shows) * 1000 : 0 }));
}

if (typeof module !== 'undefined') module.exports = { parseXlsx, process, fetchApi };
