// 每日新闻接口：直接抓取 RSS 并解析，不依赖 rss2json（避免免费额度限流）
// 多源兜底：按顺序尝试，哪个能用用哪个；Cloudflare 边缘缓存 24 小时，一天只拉一次，自动更新

const FEEDS = [
  "https://plink.anyfeeder.com/people-daily",      // 人民日报（时政）
  "https://plink.anyfeeder.com/chinadaily/china",  // 中国日报 时政
  "https://plink.anyfeeder.com/guangmingribao"     // 光明日报（备用）
];

// 极简 XML 解析：从 <item>...</item> 中提取 title / link
function parseRSS(xml: string): Array<{ title: string; link: string }> {
  const items: Array<{ title: string; link: string }> = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  const pick = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}[\\s\\S]*?>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (!m) return "";
    return m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1") // 去掉 CDATA 包裹
      .replace(/<[^>]+>/g, "")                       // 去掉内嵌 HTML 标签
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
      .trim();
  };

  for (const block of itemBlocks) {
    const title = pick(block, "title");
    const link = pick(block, "link");
    // 只放行 http/https 链接，杜绝 javascript: 等危险协议混进 RSS
    if (title && link && /^https?:\/\//i.test(link)) items.push({ title, link });
    if (items.length >= 8) break;
  }
  return items;
}

export async function onRequestGet() {
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HaoHaiNews/1.0)" }
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRSS(xml);
      if (items.length === 0) continue;

      return Response.json(
        { items },
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            // 边缘缓存 24 小时：一天只回源一次，既省请求又自动更新
            "Cache-Control": "public, s-maxage=86400, max-age=0"
          }
        }
      );
    } catch (e) {
      // 当前源失败，尝试下一个
      continue;
    }
  }

  // 所有源都失败时，返回空列表 + 友好提示，前端会显示"暂无新闻"
  return Response.json(
    { items: [] },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, max-age=0"
      }
    }
  );
}
