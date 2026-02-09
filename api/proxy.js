export default async function handler(req, res) {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let { endpoint, ...queryParams } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint missing in query params' });
  }

  // Если endpoint пришел массивом (бывает в Vercel при rewrite), берем первый элемент или склеиваем
  if (Array.isArray(endpoint)) {
    endpoint = endpoint.join('/');
  }

  // Убираем ведущие и закрывающие слеши, чтобы не дублировать
  endpoint = endpoint.replace(/^\/+|\/+$/g, '');

  // Формируем query string для SoundCloud
  const params = new URLSearchParams();
  Object.keys(queryParams).forEach((key) => {
    const value = queryParams[key];
    if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
    } else {
        params.append(key, value);
    }
  });

  const targetUrl = `https://api-v2.soundcloud.com/${endpoint}?${params.toString()}`;

  // Для отладки (можно увидеть в заголовках ответа в браузере)
  res.setHeader('X-Proxy-Target-Url', targetUrl);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Origin': 'https://soundcloud.com',
        'Referer': 'https://soundcloud.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      }
    });

    // Прокидываем Content-Type
    const contentType = response.headers.get('content-type');
    if (contentType) {
        res.setHeader('Content-Type', contentType);
    }

    const data = await response.text();

    // Если статус ошибки, возвращаем JSON с отладкой, если это возможно
    if (!response.ok) {
        // Если это 404/403, велик шанс, что SC нас забанил или URL кривой.
        // Вернем структуру ошибки, чтобы клиент мог показать детали.
        return res.status(response.status).json({
            error: 'Proxy Upstream Error',
            status: response.status,
            targetUrl: targetUrl, // ВАЖНО: возвращаем URL, который мы сформировали
            scBody: data.substring(0, 500) // Первые 500 символов ответа SC
        });
    }

    res.status(response.status).send(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: 'Internal Proxy Error', details: error.message });
  }
}
