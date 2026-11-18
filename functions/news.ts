export async function onRequestGet() {
  const rssUrl = "https://news.cctv.com/rss/news.xml";
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`);
    const data = await res.json();
    return Response.json(data, {
      headers: {
        "Cache-Control": "s-maxage=86400" // 24小时缓存，一天只拉取一次新闻，自动更新
      }
    })
  } catch (err) {
    return Response.json({ items: [] }, { status: 500 });
  }
}
