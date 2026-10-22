// Canned YouTube Data API answers for YOUTUBE_MODE=stub, so local runs never spend the production quota.
// They are shaped like real search.list and videos.list responses, so the provider's own mapping code runs on
// them. The same search always gets the same videos, and every stub video id starts with "stub", so stub rows
// are easy to find and delete: Video.deleteMany({ platformVideoId: /^stub/ }).

const STUB_PAGES_PER_SEARCH = 5;
const PAGE_TOKEN_PREFIX = "STUB_PAGE_";

// FNV-1a: a small, stable string hash.
const hash = text => {
  let value = 0x811c9dc5;

  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }

  return value;
};

// 11 characters, like a real YouTube id.
const toStubVideoId = seed => `stub${hash(seed).toString(36).padStart(7, "0").slice(-7)}`;

// search.list escapes HTML in titles ("Tom &amp; Jerry"), so the stub does too.
const escapeHtml = text =>
  text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const buildThumbnail = (videoId, label) => {
  const hue = hash(videoId) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">` +
    `<rect width="480" height="360" fill="hsl(${hue},55%,30%)"/>` +
    `<text x="240" y="190" font-family="sans-serif" font-size="40" fill="white" text-anchor="middle">${label}</text>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const buildSearchList = ({ q = "", pageToken, maxResults = 12 }) => {
  const page = pageToken?.startsWith(PAGE_TOKEN_PREFIX) ? Number(pageToken.slice(PAGE_TOKEN_PREFIX.length)) || 1 : 1;
  const pageSize = Math.min(Number(maxResults) || 12, 50);

  const items = Array.from({ length: pageSize }, (_, index) => {
    const position = (page - 1) * pageSize + index + 1;
    const videoId = toStubVideoId(`${q}|${position}`);
    const thumbnail = buildThumbnail(videoId, `STUB #${position}`);

    return {
      kind: "youtube#searchResult",
      id: { kind: "youtube#video", videoId },
      snippet: {
        publishedAt: new Date(Date.UTC(2020, 0, 1) + (hash(videoId) % 2000) * 24 * 60 * 60 * 1000).toISOString(),
        channelId: `stub-channel-${position % 5}`,
        title: escapeHtml(`"${q}" stub result #${position}`),
        description: escapeHtml(`Stub video for "${q}". YOUTUBE_MODE=stub, no YouTube quota was used.`),
        thumbnails: { default: { url: thumbnail }, high: { url: thumbnail } },
        channelTitle: `Stub Channel ${(position % 5) + 1}`,
      },
    };
  });

  return {
    kind: "youtube#searchListResponse",
    items,
    ...(page < STUB_PAGES_PER_SEARCH && { nextPageToken: `${PAGE_TOKEN_PREFIX}${page + 1}` }),
  };
};

const STUB_CHART_SIZE = 20;

// A chart request (chart=mostPopular) has no ids: the stub makes up a stable chart per region and category, with
// snippets, since chart callers store whole videos.
const buildChartIds = ({ regionCode = "", videoCategoryId = "all" }) =>
  Array.from({ length: STUB_CHART_SIZE }, (_, index) => toStubVideoId(`chart|${regionCode}|${videoCategoryId}|${index}`));

const buildChartSnippet = (videoId, index, { regionCode = "", videoCategoryId = "all" }) => {
  const thumbnail = buildThumbnail(videoId, `TREND #${index + 1}`);
  return {
    publishedAt: new Date(Date.UTC(2026, 0, 1) + (hash(videoId) % 200) * 24 * 60 * 60 * 1000).toISOString(),
    title: `Trending stub #${index + 1} (${regionCode} ${videoCategoryId})`,
    description: "Stub chart video. YOUTUBE_MODE=stub, no YouTube quota was used.",
    thumbnails: { default: { url: thumbnail }, high: { url: thumbnail } },
    channelTitle: `Stub Channel ${(index % 5) + 1}`,
  };
};

// A few lines with a link, so the Player's description box (clamping, "...more", links) can be tried locally.
const buildStubDescription = videoId =>
  [
    `Full stub description of ${videoId}. YOUTUBE_MODE=stub, no YouTube quota was used.`,
    "",
    "In live mode this box shows the whole description from videos.list, line breaks included.",
    "Links open in a new tab: https://developers.google.com/youtube/v3/docs/videos/list",
    "",
    "Descriptions longer than three lines are clamped until you press ...more.",
  ].join("\n");

// By id, a snippet holds only the description. Without a title, thumbnail or channel, toVideoFromDetails leaves
// them undefined and the refresh job keeps the stored ones.
const buildIdSnippet = (videoId, params) =>
  String(params.part || "").split(",").includes("snippet") ? { snippet: { description: buildStubDescription(videoId) } } : {};

const buildVideosList = params => ({
  kind: "youtube#videoListResponse",
  items: (params.chart ? buildChartIds(params) : (params.id || "").split(",").filter(Boolean))
    .map((videoId, index) => {
      const seed = hash(videoId);
      const durationSeconds = 30 + (seed % 900);

      return {
        kind: "youtube#video",
        id: videoId,
        statistics: { viewCount: String(seed % 5000000), likeCount: String(seed % 90000) },
        contentDetails: { duration: `PT${Math.floor(durationSeconds / 60)}M${durationSeconds % 60}S` },
        status: { embeddable: true, privacyStatus: "public" },
        ...(params.chart ? { snippet: buildChartSnippet(videoId, index, params) } : buildIdSnippet(videoId, params)),
      };
    }),
});

// `method` is the Data API method name: "search" or "videos".
export const getStubResponse = (method, params) => (method === "search" ? buildSearchList(params) : buildVideosList(params));
