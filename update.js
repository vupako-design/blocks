// Запускается на GitHub: забирает данные у Яндекса и пишет _site/data.json
const { fetchApi, process: filter } = require('./logic.js');
(async () => {
  // sticky_mobile_bottom и sticky_mobile_bottom_wide — один и тот же блок.
  const fix = (s) => s.replace(/\[sticky_mobile_bottom\]/g, '[sticky_mobile_bottom_wide]');
  const totalP = fetch('https://partner.yandex.ru/api/statistics2/get.json?lang=ru&period=today&dimension_field=date|day&field=partner_wo_nds', { headers: { Authorization: 'OAuth ' + process.env.YANDEX_TOKEN } })
    .then((r) => r.json()).then((j) => j.data.points.reduce((a, p) => a + p.measures[0].partner_wo_nds, 0)).catch((e) => console.error('Сумма не получена:', e.message));
  const raw = (await fetchApi(process.env.YANDEX_TOKEN, 'today', 'https://partner.yandex.ru')).map((r) => ({ ...r, block: fix(r.block) }));
  const rows = filter(raw);
  const total = await totalP;
  require('fs').mkdirSync('_site', { recursive: true });
  require('fs').writeFileSync('_site/data.json', JSON.stringify({ updated: new Date().toISOString(), total, rows: filter(raw, true) }));
  const fs = require('fs');
  // Для каждого типа блока формируем отдельную выдачу ссылок по городу.
  // Старые строки games.txt без [типа] считаются fullscreen_mobile для совместимости.
  const normalize = (name) => name.trim().toLowerCase();
  const parseEntry = (value) => {
    const m = value.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    const mode = m ? m[2].trim() : 'fullscreen_mobile';
    return { name: normalize(m ? m[1] : value), mode };
  };
  const allowed = new Set(['fullscreen_mobile', 'sticky_mobile_bottom_wide', 'fullscreen_desktop']);
  const map = new Map();
  const fallbackMap = new Map();
  fix(fs.existsSync('games.txt') ? fs.readFileSync('games.txt', 'utf8') : '')
    .split(/\r?\n/)
    .map((line) => line.match(/^(\S+)\s+-\s+(.+)$/))
    .filter(Boolean)
    .forEach((m) => {
      const entry = parseEntry(m[2]);
      if (!allowed.has(entry.mode)) {
        console.log(`Неизвестный тип блока в games.txt: ${m[2]}`);
        return;
      }
      if (m[2].match(/\s*\[[^\]]+\]\s*$/)) map.set(`${entry.name}\u0000${entry.mode}`, m[1]);
      else fallbackMap.set(entry.name, m[1]);
    });

  const stageLinks = {
    fullscreen_mobile: {},
    sticky_mobile_bottom_wide: {},
    fullscreen_desktop: {},
  };
  const stageAllLinks = {
    fullscreen_mobile: {},
    sticky_mobile_bottom_wide: {},
    fullscreen_desktop: {},
  };
  const addMappedRow = (target, r) => {
    const entry = parseEntry(r.block);
    const hasExplicitType = /\s*\[[^\]]+\]\s*$/.test(String(r.block));
    const add = (mode, url) => {
      if (!url || !target[mode]) return;
      const cityLinks = (target[mode][r.geo] ??= []);
      if (!cityLinks.includes(url)) cityLinks.push(url);
    };
    if (hasExplicitType) {
      add(entry.mode, map.get(`${entry.name}\u0000${entry.mode}`) || fallbackMap.get(entry.name));
      return;
    }
    // If games.txt explicitly assigns formats, use those assignments even
    // when Yandex returns only the plain block caption without a [type] suffix.
    const typed = [...map.entries()].filter(([key]) => key.startsWith(`${entry.name}\u0000`));
    if (typed.length) {
      typed.forEach(([key, url]) => add(key.slice(entry.name.length + 1), url));
    } else {
      add('fullscreen_mobile', fallbackMap.get(entry.name));
    }
  };
  // All raw rows define the complete per-format bypass list; filtered rows
  // define only the checked/selected list for the full-work phase.
  raw.forEach((r) => addMappedRow(stageAllLinks, r));
  rows.forEach((r) => addMappedRow(stageLinks, r));
  // `links` оставлен для старых клиентов и означает только fullscreen_mobile.
  const links = stageLinks.fullscreen_mobile;
  fs.writeFileSync('_site/links.json', JSON.stringify({ updated: new Date().toISOString(), links, stageLinks, stageAllLinks }));
  const names = [...new Set(rows.map((r) => r.block))];
  const miss = names.filter((n) => { const e = parseEntry(n); return !map.has(`${e.name}\u0000${e.mode}`) && !fallbackMap.has(e.name) && ![...map.keys()].some((key) => key.startsWith(`${e.name}\u0000`)); });
  if (miss.length) console.log('Нет ссылки в games.txt:', miss.join(', '));
  console.log(`Строк от Яндекса: ${raw.length}, после фильтра: ${rows.length}`);
  if (!rows.length && raw.length) console.log('Пример строки:', JSON.stringify(raw[0]));
})().catch((e) => { console.error('Ошибка:', e.message, e.cause); process.exit(1); });
