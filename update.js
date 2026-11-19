// Запускается на GitHub: забирает данные у Яндекса и пишет _site/data.json
const { fetchApi, process: filter } = require('./logic.js');
(async () => {
  // sticky_mobile_bottom и sticky_mobile_bottom_wide — один и тот же блок.
  const fix = (s) => s.replace(/\[sticky_mobile_bottom\]/g, '[sticky_mobile_bottom_wide]');
  const totalP = fetch('https://partner.yandex.ru/api/statistics2/get.json?lang=ru&period=today&dimension_field=date|day&field=partner_wo_nds', { headers: { Authorization: 'OAuth ' + process.env.YANDEX_TOKEN } })
    .then((r) => r.json()).then((j) => j.data.points.reduce((a, p) => a + p.measures[0].partner_wo_nds, 0)).catch((e) => console.error('Сумма не получена:', e.message));
  // Android и Windows получают независимые выборки из Яндекса:
  // Android — Firefox/MobileFirefox, Windows — Edge.
  const [rawAndroid, rawWindows] = await Promise.all([
    fetchApi(process.env.YANDEX_TOKEN, 'today', 'https://partner.yandex.ru', undefined, ['MobileFirefox', 'Firefox']),
    fetchApi(process.env.YANDEX_TOKEN, 'today', 'https://partner.yandex.ru', undefined, ['Edge', 'Microsoft Edge']),
  ]);
  const androidRaw = rawAndroid.map((r) => ({ ...r, block: fix(r.block) }));
  const windowsRaw = rawWindows.map((r) => ({ ...r, block: fix(r.block) }));
  const rows = filter(androidRaw);
  const windowsRows = filter(windowsRaw, false, /Edge/i); // этапы от 6000 до 1000 по городу — как у Android
  const total = await totalP;
  require('fs').mkdirSync('_site', { recursive: true });
  require('fs').writeFileSync('_site/data.json', JSON.stringify({ updated: new Date().toISOString(), total, rows: filter(androidRaw, true), windowsRows: filter(windowsRaw, true, /Edge/i) }));
  const fs = require('fs');
  // Для каждого типа блока формируем отдельную выдачу ссылок по городу.
  // Старые строки games.txt без [типа] считаются fullscreen_mobile для совместимости.
  const normalize = (name) => name.trim().toLowerCase();
  const parseEntry = (value) => {
    const m = value.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    const mode = m ? m[2].trim() : 'fullscreen_mobile';
    return { name: normalize(m ? m[1] : value), mode };
  };
  const allowed = new Set(['fullscreen_mobile', 'sticky_mobile_bottom_wide', 'desktop_rsya_feed', 'fullscreen_desktop']);
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
    desktop_rsya_feed: {},
    fullscreen_desktop: {},
  };
  const stageAllLinks = {
    fullscreen_mobile: {},
    sticky_mobile_bottom_wide: {},
    desktop_rsya_feed: {},
    fullscreen_desktop: {},
  };
  // Windows: те же этапы (от 6000 до 1000 по городу), но по данным Edge и отдельно от Android.
  const windowsStageLinks = {
    desktop_rsya_feed: {},
    fullscreen_desktop: {},
  };
  const addMappedRow = (target, r, requireExplicitWindowsType = false, cpmvTarget) => {
    const entry = parseEntry(r.block);
    const hasExplicitType = /\s*\[[^\]]+\]\s*$/.test(String(r.block));
    const add = (mode, url) => {
      if (!url || !target[mode]) return;
      const cityLinks = (target[mode][r.geo] ??= []);
      if (!cityLinks.includes(url)) cityLinks.push(url);
      if (cpmvTarget) { const c = ((cpmvTarget[mode] ??= {})[r.geo] ??= {}); c[url] = Math.max(c[url] || 0, +r.cpmv.toFixed(2)); } // CPMV ссылки — чтобы приложение выбирало самую дорогую
    };
    if (hasExplicitType) {
      const typedUrl = map.get(`${entry.name}\u0000${entry.mode}`);
      add(entry.mode, typedUrl || (requireExplicitWindowsType ? null : fallbackMap.get(entry.name)));
      return;
    }
    // If games.txt explicitly assigns formats, use those assignments even
    // when Yandex returns only the plain block caption without a [type] suffix.
    const typed = [...map.entries()].filter(([key]) => key.startsWith(`${entry.name}\u0000`));
    if (typed.length) {
      typed.forEach(([key, url]) => add(key.slice(entry.name.length + 1), url));
    } else if (!requireExplicitWindowsType) {
      add('fullscreen_mobile', fallbackMap.get(entry.name));
    }
  };
  // All raw rows define the complete per-format bypass list; filtered rows
  // define only the checked/selected list for the full-work phase.
  androidRaw.forEach((r) => addMappedRow(stageAllLinks, r));
  const stageCpmv = {}; // CPMV ссылок для Android — чтобы приложение выбирало самую дорогую
  rows.forEach((r) => addMappedRow(stageLinks, r, false, stageCpmv));
  // Для Windows допускаются только явные типизированные строки games.txt.
  // Общие/старые Android-записи не могут случайно попасть в Windows-выдачу.
  const windowsStageCpmv = {};
  windowsRows.forEach((r) => addMappedRow(windowsStageLinks, r, true, windowsStageCpmv));
  // `links` оставлен для старых клиентов и означает только fullscreen_mobile.
  const links = stageLinks.fullscreen_mobile;
  fs.writeFileSync('_site/links.json', JSON.stringify({ updated: new Date().toISOString(), minCpmv: 1000, links, stageLinks, stageAllLinks, stageCpmv, windowsStageLinks, windowsStageCpmv }));
  const names = [...new Set(rows.map((r) => r.block))];
  const miss = names.filter((n) => { const e = parseEntry(n); return !map.has(`${e.name}\u0000${e.mode}`) && !fallbackMap.has(e.name) && ![...map.keys()].some((key) => key.startsWith(`${e.name}\u0000`)); });
  if (miss.length) console.log('Нет ссылки в games.txt:', miss.join(', '));
  console.log(`Строк Android (Firefox): ${androidRaw.length}, после фильтра: ${rows.length}`);
  console.log(`Строк Windows (Edge): ${windowsRaw.length}, после этапов: ${windowsRows.length}`);
  if (!rows.length && androidRaw.length) console.log('Пример строки Android:', JSON.stringify(androidRaw[0]));
  if (!windowsRows.length && windowsRaw.length) console.log('Пример строки Windows:', JSON.stringify(windowsRaw[0]));
})().catch((e) => { console.error('Ошибка:', e.message, e.cause); process.exit(1); });
