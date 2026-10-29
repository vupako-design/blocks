// Запускается на GitHub: забирает данные у Яндекса и пишет _site/data.json
const { fetchApi, process: filter } = require('./logic.js');
(async () => {
  const raw = await fetchApi(process.env.YANDEX_TOKEN, 'today', 'https://partner.yandex.ru');
  const rows = filter(raw);
  const total = await fetch('https://partner.yandex.ru/api/statistics2/get.json?lang=ru&period=today&dimension_field=date|day&field=partner_wo_nds', { headers: { Authorization: 'OAuth ' + process.env.YANDEX_TOKEN } })
    .then((r) => r.json()).then((j) => j.data.points.reduce((a, p) => a + p.measures[0].partner_wo_nds, 0)).catch((e) => console.error('Сумма не получена:', e.message));
  require('fs').mkdirSync('_site', { recursive: true });
  require('fs').writeFileSync('_site/data.json', JSON.stringify({ updated: new Date().toISOString(), total, rows }));
  // links.json для телефонов: время обновления и по каждому городу — ссылки игр с CPM от 1000. Ссылки берём из games.txt.
  const fs = require('fs');
  const map = Object.fromEntries((fs.existsSync('games.txt') ? fs.readFileSync('games.txt', 'utf8') : '').split(/\r?\n/).map((l) => l.match(/^(\S+)\s+-\s+(.+)$/)).filter(Boolean).map((m) => [m[2].trim().toLowerCase(), m[1]]));
  const links = {};
  rows.forEach((r) => map[r.block.toLowerCase()] && (links[r.geo] ??= []).push(map[r.block.toLowerCase()]));
  fs.writeFileSync('_site/links.json', JSON.stringify({ updated: new Date().toISOString(), links }));
  const names = [...new Set(rows.map((r) => r.block))];
  const miss = names.filter((n) => !map[n.toLowerCase()]);
  if (miss.length) console.log('Нет ссылки в games.txt:', miss.join(', '));
  console.log(`Строк от Яндекса: ${raw.length}, после фильтра: ${rows.length}`);
  if (!rows.length && raw.length) console.log('Пример строки:', JSON.stringify(raw[0]));
})().catch((e) => { console.error('Ошибка:', e.message, e.cause); process.exit(1); });
