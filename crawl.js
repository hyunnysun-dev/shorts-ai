// Vercel Serverless Function — 국내 커뮤니티 크롤러
// GET /api/crawl?source=clien|ppomppu|fmkorea|bobaedream|inven|mlbpark|dcinside|naver

const https = require('https');
const http  = require('http');

// CORS 헤더
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300'); // 5분 캐시
}

// HTTP fetch (Node.js 내장)
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
        ...options.headers,
      },
      timeout: 10000,
    }, (res) => {
      // 리다이렉트 처리
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── RSS XML 파서 (정규식 기반, cheerio 없이)
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1]?.trim();
    const link  = (block.match(/<link[^>]*>([^<]+)<\/link>/) || [])[1]?.trim()
               || (block.match(/<guid[^>]*>([^<]+)<\/guid>/) || [])[1]?.trim();
    const desc  = (block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1]?.trim();
    const date  = (block.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/) || [])[1]?.trim();
    if (title && title.length > 2) {
      items.push({ title, link, description: desc, pubDate: date });
    }
  }
  return items;
}

// ── HTML에서 인기글 추출 (CSS 셀렉터 없이 정규식)
function extractTitles(html, patterns) {
  const results = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'gi');
    let m;
    while ((m = regex.exec(html)) !== null && results.length < 10) {
      const title = m[1]?.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
      if (title && title.length > 4 && title.length < 100) results.push(title);
    }
    if (results.length >= 5) break;
  }
  return [...new Set(results)].slice(0, 5); // 중복 제거
}

// ── 소스별 크롤러 정의
const CRAWLERS = {

  clien: async () => {
    const { body } = await fetchUrl('https://www.clien.net/service/rss/allNews');
    const items = parseRSS(body).slice(0, 5);
    return items.map((it, i) => ({
      title: it.title, url: it.link,
      score: 5000 - i * 600, comments: 0, source: 'clien'
    }));
  },

  ppomppu: async () => {
    const { body } = await fetchUrl('https://www.ppomppu.co.kr/rss.php');
    const items = parseRSS(body).slice(0, 5);
    return items.map((it, i) => ({
      title: it.title, url: it.link,
      score: 5000 - i * 600, comments: 0, source: 'ppomppu'
    }));
  },

  fmkorea: async () => {
    // 에펨코리아 베스트 게시판 HTML 크롤링
    const { body } = await fetchUrl('https://www.fmkorea.com/best');
    const titles = extractTitles(body, [
      'class="title[^"]*"[^>]*>\\s*<a[^>]*>([^<]{5,80})<',
      '<h3[^>]*class="[^"]*title[^"]*"[^>]*>([^<]{5,80})<',
      'class="er_1"[^>]*><a[^>]*>([^<]{5,80})<',
    ]);
    return titles.map((title, i) => ({
      title, url: 'https://www.fmkorea.com/best',
      score: 5000 - i * 600, comments: 0, source: 'fmkorea'
    }));
  },

  bobaedream: async () => {
    const { body } = await fetchUrl('https://www.bobaedream.co.kr/list?code=best');
    const titles = extractTitles(body, [
      '<a[^>]+href="/view[^"]*"[^>]*>([^<]{5,80})<\/a>',
      'class="title[^"]*"[^>]*>\\s*([^<]{5,80})',
      '<td[^>]*class="[^"]*tit[^"]*"[^>]*>[^<]*<a[^>]*>([^<]{5,80})',
    ]);
    return titles.map((title, i) => ({
      title, url: 'https://www.bobaedream.co.kr/list?code=best',
      score: 5000 - i * 600, comments: 0, source: 'bobaedream'
    }));
  },

  inven: async () => {
    const { body } = await fetchUrl('https://www.inven.co.kr/rss/news.php');
    const items = parseRSS(body).slice(0, 5);
    return items.map((it, i) => ({
      title: it.title, url: it.link,
      score: 5000 - i * 600, comments: 0, source: 'inven'
    }));
  },

  mlbpark: async () => {
    const { body } = await fetchUrl('https://mlbpark.donga.com/rss/mlbpark.xml');
    const items = parseRSS(body).slice(0, 5);
    return items.map((it, i) => ({
      title: it.title, url: it.link,
      score: 5000 - i * 600, comments: 0, source: 'mlbpark'
    }));
  },

  dcinside: async () => {
    const { body } = await fetchUrl('https://www.dcinside.com/');
    const titles = extractTitles(body, [
      'class="[^"]*gall_tit[^"]*"[^>]*>\\s*<a[^>]*>([^<]{5,80})',
      '<a[^>]+href="https://gall\\.dcinside\\.com[^"]*"[^>]*>([^<]{5,80})',
      'class="rank_txt"[^>]*>([^<]{5,80})',
    ]);
    return titles.map((title, i) => ({
      title, url: 'https://www.dcinside.com',
      score: 5000 - i * 600, comments: 0, source: 'dcinside'
    }));
  },

  naver: async () => {
    const { body } = await fetchUrl('https://news.naver.com/main/ranking/popularDay.naver');
    const titles = extractTitles(body, [
      'class="[^"]*ranking_headline[^"]*"[^>]*>\\s*<a[^>]*>([^<]{5,80})',
      'class="[^"]*list_title[^"]*"[^>]*>([^<]{5,80})',
      '<strong[^>]*class="[^"]*tit[^"]*"[^>]*>([^<]{5,80})',
    ]);
    return titles.map((title, i) => ({
      title, url: 'https://news.naver.com/main/ranking/popularDay.naver',
      score: 5000 - i * 600, comments: 0, source: 'naver'
    }));
  },

};

// ── 전체 수집 엔드포인트
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const source = req.query.source;

  // 특정 소스만 요청
  if (source && CRAWLERS[source]) {
    try {
      const posts = await CRAWLERS[source]();
      return res.status(200).json({ ok: true, source, posts });
    } catch (e) {
      return res.status(200).json({ ok: false, source, error: e.message, posts: [] });
    }
  }

  // 전체 소스 병렬 수집
  const results = await Promise.allSettled(
    Object.entries(CRAWLERS).map(async ([id, fn]) => {
      const posts = await fn();
      return { id, posts };
    })
  );

  const all = [];
  const errors = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value.posts);
    else errors.push(r.reason?.message || 'unknown');
  }

  res.status(200).json({
    ok: true,
    total: all.length,
    errors: errors.length ? errors : undefined,
    posts: all,
  });
};
