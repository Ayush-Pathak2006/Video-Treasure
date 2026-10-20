import axios from "axios";

// Google Trends' daily trending searches as RSS. It's unofficial and can change or disappear, so any failure
// just means "no topics": callers never depend on it.
const GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss";

const XML_ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
const decodeXml = text =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(amp|quot|apos|lt|gt);/g, (_, entity) => XML_ENTITIES[entity])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .trim();

// "2000+" -> 2000, "1M+" -> 1000000.
const parseTraffic = text => {
  const match = /([\d.,]+)\s*([KM])?/i.exec(text || "");
  if (!match) return 0;
  const multiplier = { K: 1000, M: 1000000 }[(match[2] || "").toUpperCase()] || 1;
  return Math.round(Number(match[1].replace(/,/g, "")) * multiplier);
};

/** The feed's current topics for a region ("IN"): [{ topic, traffic }]. An empty list when the feed fails. */
export const fetchGoogleTrendingTopics = async region => {
  try {
    const response = await axios.get(GOOGLE_TRENDS_RSS, { params: { geo: region }, timeout: 10000, responseType: "text" });
    const items = String(response.data).match(/<item>[\s\S]*?<\/item>/g) || [];

    return items
      .map(item => ({
        topic: decodeXml(/<title>([\s\S]*?)<\/title>/.exec(item)?.[1] || ""),
        traffic: parseTraffic(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/.exec(item)?.[1]),
      }))
      .filter(entry => entry.topic);
  } catch (error) {
    console.log(`⚠️ [trends] Google Trends feed unavailable: ${error.message}`);
    return [];
  }
};
