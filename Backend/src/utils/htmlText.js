// Provider text that arrives as HTML. YouTube's search.list escapes its text ("Tom &amp; Jerry"), and Dailymotion's
// descriptions also mark line breaks with <br /> tags.
const HTML_ENTITIES = { amp: "&", quot: '"', "#39": "'", "#039": "'", lt: "<", gt: ">" };

export const decodeHtmlEntities = text =>
  (text || "").replace(/&(amp|quot|#0?39|lt|gt);/g, (_, entity) => HTML_ENTITIES[entity]);

// "one<br /><br />two &amp; three" -> "one\n\ntwo & three". Tags go first, so an escaped "&lt;br /&gt;" that
// someone typed stays text.
export const htmlToPlainText = html => decodeHtmlEntities((html || "").replace(/<br\s*\/?>/gi, "\n"));
