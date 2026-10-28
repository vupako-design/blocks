// Запускается на GitHub: забирает данные у Яндекса и пишет _site/data.json
const { fetchApi, process: filter } = require('./logic.js');
(async () => {
  const raw = await fetchApi(process.env.YANDEX_TOKEN, 'today', 'https://partner.yandex.ru');
  const rows = filter(raw);
  require('fs').mkdirSync('_site', { recursive: true });
  require('fs').writeFileSync('_site/data.json', JSON.stringify({ updated: new Date().toISOString(), rows }));
  console.log(`Строк от Яндекса: ${raw.length}, после фильтра: ${rows.length}`);
  if (!rows.length && raw.length) console.log('Пример строки:', JSON.stringify(raw[0]));
})().catch((e) => { console.error('Ошибка:', e.message, e.cause); process.exit(1); });
