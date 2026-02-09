export default async function handler(req, res) {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, ...queryParams } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint missing' });
  }

  // Формируем query string
  const params = new URLSearchParams();
  Object.keys(queryParams).forEach((key) => {
    // Vercel может возвращать массив, если параметр повторяется
    const value = queryParams[key];
    if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
    } else {
        params.append(key, value);
    }
  });

  const targetUrl = `https://api-v2.soundcloud.com/${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Origin': 'https://soundcloud.com',
        'Referer': 'https://soundcloud.com/',
        // Имитируем браузер
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    // Прокидываем Content-Type (важно для JSON и m3u8)
    const contentType = response.headers.get('content-type');
    if (contentType) {
        res.setHeader('Content-Type', contentType);
    }

    const data = await response.text();
    res.status(response.status).send(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: 'Internal Proxy Error', details: error.message });
  }
}
