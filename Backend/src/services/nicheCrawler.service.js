import { Video } from "../models/video.model.js";
import { NICHE_TOPICS, getCombinedNicheQuery } from "../config/niches.config.js";
import { PROVIDERS, SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";
import { rankVideos } from "../utils/videoRanking.js";
import {
  getCrawlerMinRemainingPercent,
  getQuotaSnapshot,
  isCrawlerQuotaGuardActive,
} from "../utils/quotaTracker.js";

const FETCH_PER_NICHE = 4;
const CANDIDATES_PER_PROVIDER = 24;
const ONE_HOUR_MS = 60 * 60 * 1000;

const crawlAllNichesOnce = async () => {
  console.log("🕐 Running hourly niche crawler...");

  const startingQuota = getQuotaSnapshot();
  const minimumRemainingPercent = getCrawlerMinRemainingPercent();

  if (isCrawlerQuotaGuardActive()) {
    console.log(
      `🛑 [crawler] skipped run because remaining daily quota is ${startingQuota.remainingPercent.toFixed(2)}%, below threshold ${minimumRemainingPercent.toFixed(2)}%.`
    );
    return;
  }

  for (const niche of NICHE_TOPICS) {
    const nicheName = niche.name;
    const providerQuery = getCombinedNicheQuery(niche);

    if (isCrawlerQuotaGuardActive()) {
      const quotaSnapshot = getQuotaSnapshot();
      console.log(
        `🛑 [crawler:${nicheName}] stopping run because remaining daily quota is ${quotaSnapshot.remainingPercent.toFixed(2)}%, below threshold ${minimumRemainingPercent.toFixed(2)}%.`
      );
      break;
    }

    try {
      const providerCalls = SUPPORTED_PLATFORMS.map(platform =>
        PROVIDERS[platform].search(providerQuery, null, { maxResults: CANDIDATES_PER_PROVIDER })
      );

      const providerResults = await Promise.allSettled(providerCalls);
      const fetchedVideos = providerResults.flatMap(result => {
        if (result.status !== "fulfilled") {
          return [];
        }

        return result.value.videos || [];
      });

      const ranked = rankVideos(fetchedVideos).map(video => ({
        ...video,
        query: nicheName,
      }));

      const selected = ranked.slice(0, FETCH_PER_NICHE);

      if (!selected.length) {
        console.log(`⚠️ [crawler:${nicheName}] no videos fetched from providers.`);
        continue;
      }

      const inserted = await Video.insertMany(selected, { ordered: false }).catch(() => []);
      const insertedCount = Array.isArray(inserted) ? inserted.length : 0;

      console.log(`✅ [crawler:${nicheName}] selected=${selected.length} inserted=${insertedCount}`);
    } catch (error) {
      console.error(`❌ [crawler:${nicheName}] failed: ${error.message}`);
    }
  }
};

export const startNicheCrawler = () => {
  crawlAllNichesOnce().catch(error => {
    console.error(`❌ Initial niche crawl failed: ${error.message}`);
  });

  setInterval(() => {
    crawlAllNichesOnce().catch(error => {
      console.error(`❌ Scheduled niche crawl failed: ${error.message}`);
    });
  }, ONE_HOUR_MS);
};