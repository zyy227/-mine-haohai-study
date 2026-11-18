// 每日新闻接口：直接抓取 RSS 并解析，不依赖 rss2json（避免免费额度限流）
const FEEDS = [
  "https://plink.anyfeeder.com/people-daily",
  "https://plink.anyfeeder.com/chinadaily/china",
  "https://plink.anyfeeder.com/guangmingribao"
];

function parseRSS(xml: string): Array<{ title: string; link: string }> {
  const items: Array<{ title: string; link: string }> = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const pick = (b: string, tag: string): string => {
    const m = b.match(new RegExp(`<${tag}[\\s\\S]*?>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (!m) return "";
    return m[1]
      .replace(/<!$$CDATA\[([\s\S]*?)$$\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
      .trim();
  };
  for (const b of blocks) {
    const title = pick(b, "title");
    const link = pick(b, "link");
    if (title && link) items.push({ title, link });
    if (items.length >= 8) break;
  }
  return items;
}

export async function onRequestGet() {
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const items = parseRSS(await res.text());
      if (items.length === 0) continue;
      return Response.json({ items }, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, s-maxage=86400, max-age=0"
        }
      });
    } catch (e) { continue; }
  }
  return Response.json({ items: [] }, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, s-maxage=3600, max-age=0" }
  });
}
