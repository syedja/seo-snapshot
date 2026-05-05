const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────
// HTML FETCHER
// ─────────────────────────────────────────
async function fetchPage(url) {
  const resp = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SEOSnapshot/1.0; +https://bloominternet.com)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    maxRedirects: 5,
    validateStatus: s => s < 500,
  });
  return { html: resp.data, finalUrl: resp.request.res?.responseUrl || url, status: resp.status };
}

// ─────────────────────────────────────────
// RAW HTML CHECKS (cheerio)
// ─────────────────────────────────────────
function runHtmlChecks(html, url) {
  const $ = cheerio.load(html);
  const domain = new URL(url).hostname.replace('www.', '');

  const title = $('title').first().text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const h1Tags = $('h1');
  const h2Tags = $('h2');
  const h3Tags = $('h3');
  const allImages = $('img');
  const missingAlt = $('img:not([alt]), img[alt=""]');
  const internalLinks = $(`a[href^="/"], a[href*="${domain}"]`);
  const externalLinks = $('a[href^="http"]').filter((_, el) => !$(el).attr('href')?.includes(domain));
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const robotsMeta = $('meta[name="robots"]').attr('content') || 'index, follow';
  const schemaScripts = $('script[type="application/ld+json"]');
  const viewport = $('meta[name="viewport"]').attr('content') || '';
  const favicon = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').length > 0;
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const twitterCard = $('meta[name="twitter:card"]').attr('content') || '';
  const twitterImage = $('meta[name="twitter:image"]').attr('content') || '';
  const isHttps = url.startsWith('https://');

  // Word count (strip scripts/styles)
  $('script, style, nav, footer, header').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText.split(' ').filter(w => w.length > 2).length;

  // Schema types
  const schemaTypes = [];
  schemaScripts.each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html());
      const type = parsed['@type'] || (Array.isArray(parsed) && parsed[0]?.['@type']);
      if (type) schemaTypes.push(Array.isArray(type) ? type[0] : type);
    } catch (_) {}
  });

  return {
    title, metaDesc, h1Count: h1Tags.length, h2Count: h2Tags.length, h3Count: h3Tags.length,
    totalImages: allImages.length, missingAlt: missingAlt.length,
    internalLinkCount: internalLinks.length, externalLinkCount: externalLinks.length,
    canonical, robotsMeta, schemaTypes, viewport, favicon,
    ogTitle, ogDesc, ogImage, twitterCard, twitterImage,
    isHttps, wordCount,
  };
}

// ─────────────────────────────────────────
// CHECK HELPERS
// ─────────────────────────────────────────
function buildChecks(raw, robotsTxtOk, sitemapOk) {
  const checks = {};

  // Title
  if (!raw.title) {
    checks.title = { status: 'fail', value: '', note: 'No title tag found. This is critical — add one immediately.' };
  } else if (raw.title.length < 30) {
    checks.title = { status: 'warn', value: raw.title, note: `Title is only ${raw.title.length} characters — too short. Aim for 50–60.` };
  } else if (raw.title.length > 65) {
    checks.title = { status: 'warn', value: raw.title, note: `Title is ${raw.title.length} characters — too long, will be truncated in search results.` };
  } else {
    checks.title = { status: 'pass', value: raw.title, note: `${raw.title.length} characters — within the optimal 50–60 char range.` };
  }

  // Meta description
  if (!raw.metaDesc) {
    checks.metaDescription = { status: 'fail', value: '', note: 'No meta description found. This directly impacts click-through rates.' };
  } else if (raw.metaDesc.length < 70) {
    checks.metaDescription = { status: 'warn', value: raw.metaDesc, note: `${raw.metaDesc.length} characters — too short. Aim for 120–160.` };
  } else if (raw.metaDesc.length > 165) {
    checks.metaDescription = { status: 'warn', value: raw.metaDesc, note: `${raw.metaDesc.length} characters — too long, will be cut off in search results.` };
  } else {
    checks.metaDescription = { status: 'pass', value: raw.metaDesc, note: `${raw.metaDesc.length} characters — within optimal range.` };
  }

  // H1
  if (raw.h1Count === 0) {
    checks.h1 = { status: 'fail', count: 0, note: 'No H1 tag found. Every page needs exactly one H1.' };
  } else if (raw.h1Count > 1) {
    checks.h1 = { status: 'warn', count: raw.h1Count, note: `${raw.h1Count} H1 tags found — use exactly one per page.` };
  } else {
    checks.h1 = { status: 'pass', count: 1, note: 'Exactly one H1 found — correct.' };
  }

  // Heading structure
  if (raw.h2Count === 0) {
    checks.headingStructure = { status: 'warn', note: 'No H2 headings found. Use H2s to structure your content for readers and search engines.' };
  } else {
    checks.headingStructure = { status: 'pass', note: `${raw.h2Count} H2 and ${raw.h3Count} H3 headings found — good content structure.` };
  }

  // Image alt text
  if (raw.totalImages === 0) {
    checks.imageAltText = { status: 'warn', totalImages: 0, missingAlt: 0, note: 'No images found on this page.' };
  } else if (raw.missingAlt > 0) {
    checks.imageAltText = { status: raw.missingAlt === raw.totalImages ? 'fail' : 'warn', totalImages: raw.totalImages, missingAlt: raw.missingAlt, note: `${raw.missingAlt} of ${raw.totalImages} images missing alt attributes.` };
  } else {
    checks.imageAltText = { status: 'pass', totalImages: raw.totalImages, missingAlt: 0, note: `All ${raw.totalImages} images have alt text.` };
  }

  // Internal links
  if (raw.internalLinkCount < 3) {
    checks.internalLinks = { status: 'warn', count: raw.internalLinkCount, note: `Only ${raw.internalLinkCount} internal links. More internal linking helps search engines crawl your site.` };
  } else {
    checks.internalLinks = { status: 'pass', count: raw.internalLinkCount, note: `${raw.internalLinkCount} internal links found — good.` };
  }

  // External links
  checks.externalLinks = {
    status: raw.externalLinkCount > 0 ? 'pass' : 'warn',
    count: raw.externalLinkCount,
    note: raw.externalLinkCount > 0 ? `${raw.externalLinkCount} external links found.` : 'No external links. Linking to authoritative sources adds credibility.',
  };

  // Word count
  if (raw.wordCount < 200) {
    checks.wordCount = { status: 'fail', count: raw.wordCount, note: `Only ~${raw.wordCount} words. Very thin content — add more to rank competitively.` };
  } else if (raw.wordCount < 350) {
    checks.wordCount = { status: 'warn', count: raw.wordCount, note: `~${raw.wordCount} words — below the recommended 350+ for good indexing.` };
  } else {
    checks.wordCount = { status: 'pass', count: raw.wordCount, note: `~${raw.wordCount} words — sufficient content depth.` };
  }

  // HTTPS
  checks.https = { status: raw.isHttps ? 'pass' : 'fail', note: raw.isHttps ? 'Site is served over HTTPS — secure.' : 'Site is NOT on HTTPS. This is a ranking factor — contact your host to enable SSL.' };

  // robots.txt
  checks.robotsTxt = { status: robotsTxtOk ? 'pass' : 'fail', note: robotsTxtOk ? 'robots.txt accessible and valid.' : 'robots.txt not found at /robots.txt. Create one to guide search crawlers.' };

  // sitemap.xml
  checks.sitemapXml = { status: sitemapOk ? 'pass' : 'fail', note: sitemapOk ? 'sitemap.xml found and accessible.' : 'No sitemap.xml found. Create one and submit via Google Search Console.' };

  // Canonical
  if (!raw.canonical) {
    checks.canonical = { status: 'warn', note: 'No canonical tag found. Add one to prevent duplicate content issues.' };
  } else {
    checks.canonical = { status: 'pass', note: 'Canonical tag present.' };
  }

  // Robots meta
  const robotsLower = raw.robotsMeta.toLowerCase();
  if (robotsLower.includes('noindex')) {
    checks.robotsMeta = { status: 'fail', note: `Page is set to noindex — it will NOT appear in search results. Remove noindex unless intentional.` };
  } else {
    checks.robotsMeta = { status: 'pass', note: `Robots meta: "${raw.robotsMeta}" — indexable.` };
  }

  // Schema
  if (raw.schemaTypes.length === 0) {
    checks.schemaMarkup = { status: 'fail', types: [], note: 'No structured data detected. Add JSON-LD schema to enable rich results.' };
  } else {
    checks.schemaMarkup = { status: 'pass', types: raw.schemaTypes, note: `Schema types found: ${raw.schemaTypes.join(', ')}.` };
  }

  // Viewport
  checks.viewport = { status: raw.viewport ? 'pass' : 'fail', note: raw.viewport ? 'Viewport meta tag present — mobile friendly.' : 'Missing viewport meta tag. Your site may not render correctly on mobile.' };

  // Favicon
  checks.favicon = { status: raw.favicon ? 'pass' : 'warn', note: raw.favicon ? 'Favicon found.' : 'No favicon detected. Add one to improve brand recognition.' };

  // Open Graph
  const ogPresent = [raw.ogTitle, raw.ogDesc, raw.ogImage].filter(Boolean);
  if (ogPresent.length === 3) {
    checks.openGraph = { status: 'pass', tags: ['og:title', 'og:description', 'og:image'], note: 'All Open Graph tags present — links will preview well on social media.' };
  } else if (ogPresent.length > 0) {
    const missing = ['og:title','og:description','og:image'].filter((t,i) => ![raw.ogTitle,raw.ogDesc,raw.ogImage][i]);
    checks.openGraph = { status: 'warn', tags: ['og:title','og:description','og:image'].filter((t,i)=>[raw.ogTitle,raw.ogDesc,raw.ogImage][i]), note: `Missing: ${missing.join(', ')}.` };
  } else {
    checks.openGraph = { status: 'fail', tags: [], note: 'No Open Graph tags found. Links will look plain when shared on social media.' };
  }

  // Twitter Card
  if (raw.twitterCard && raw.twitterImage) {
    checks.twitterCard = { status: 'pass', note: `Twitter Card type: "${raw.twitterCard}". Image present.` };
  } else if (raw.twitterCard) {
    checks.twitterCard = { status: 'warn', note: 'twitter:card present but twitter:image missing.' };
  } else {
    checks.twitterCard = { status: 'fail', note: 'No Twitter Card tags found. Add twitter:card and twitter:image for rich X/Twitter previews.' };
  }

  // Page speed (estimated from page size — real PageSpeed API costs money at scale)
  const estimatedScore = Math.min(100, Math.max(20, 85 - (raw.totalImages * 3)));
  checks.pageSpeed = { status: estimatedScore >= 70 ? 'pass' : estimatedScore >= 50 ? 'warn' : 'fail', estimatedScore, note: `Estimated speed score: ${estimatedScore}/100. ${estimatedScore < 70 ? 'Compress images and minify CSS/JS to improve.' : 'Good performance indicators.'}` };

  return checks;
}

function calcScore(checks) {
  const weights = { title:8, metaDescription:8, h1:7, headingStructure:4, imageAltText:5, internalLinks:4, externalLinks:3, wordCount:5, https:10, robotsTxt:5, sitemapXml:6, canonical:5, robotsMeta:6, schemaMarkup:5, viewport:5, favicon:2, openGraph:5, twitterCard:4, pageSpeed:8 };
  let total = 0, earned = 0;
  Object.entries(checks).forEach(([k, v]) => {
    const w = weights[k] || 5;
    total += w;
    if (v.status === 'pass') earned += w;
    else if (v.status === 'warn') earned += w * 0.5;
  });
  return Math.round((earned / total) * 100);
}

function buildTopIssues(checks) {
  const priority = ['https','metaDescription','sitemapXml','robotsMeta','title','schemaMarkup','h1','imageAltText','twitterCard','openGraph'];
  return priority.filter(k => checks[k]?.status === 'fail').slice(0, 3).map(k => {
    const msgs = {
      https: 'Site not on HTTPS — this is a Google ranking factor',
      metaDescription: 'No meta description — directly hurts click-through rate in search',
      sitemapXml: 'No sitemap.xml — Google may be missing important pages',
      robotsMeta: 'Page is set to noindex — invisible to search engines',
      title: 'Missing title tag — critical for search ranking',
      schemaMarkup: 'No schema markup — missing rich result eligibility',
      h1: 'No H1 tag — search engines need this to understand your page topic',
      imageAltText: 'Images missing alt text — hurting accessibility and image search',
      twitterCard: 'No Twitter Card tags — social shares will look plain',
      openGraph: 'No Open Graph tags — social sharing previews are broken',
    };
    return msgs[k] || `${k} check failed`;
  });
}

function buildQuickWins(checks) {
  const wins = [];
  if (checks.metaDescription?.status !== 'pass') wins.push('Write a 120–160 char meta description — biggest CTR boost for least effort');
  if (checks.sitemapXml?.status !== 'pass') wins.push('Generate a sitemap at /sitemap.xml and submit to Google Search Console (free, 10 minutes)');
  if (checks.imageAltText?.status !== 'pass') wins.push(`Add alt text to your ${checks.imageAltText?.missingAlt || 'missing'} images — improves accessibility and image search ranking`);
  if (checks.openGraph?.status !== 'pass') wins.push('Add og:title, og:description, og:image meta tags for better social sharing previews');
  if (checks.schemaMarkup?.status !== 'pass') wins.push('Add Organization JSON-LD schema — unlocks rich results in Google');
  if (checks.twitterCard?.status !== 'pass') wins.push('Add Twitter Card tags for better X/Twitter preview cards');
  return wins.slice(0, 3);
}

// ─────────────────────────────────────────
// CLAUDE AI SUMMARY
// ─────────────────────────────────────────
async function generateAiSummary(domain, checks, score) {
  const failCount = Object.values(checks).filter(c => c.status === 'fail').length;
  const warnCount = Object.values(checks).filter(c => c.status === 'warn').length;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `You are an expert SEO consultant writing a brief summary for an SEO audit report.

Website: ${domain}
SEO Score: ${score}/100
Failed checks: ${failCount}
Warning checks: ${warnCount}

Key findings:
${Object.entries(checks).filter(([,v]) => v.status !== 'pass').map(([k,v]) => `- ${k}: ${v.note}`).join('\n')}

Write 2–3 sentences in a professional but direct tone. Mention the domain. Be specific about the most impactful issues. End with one actionable priority. No markdown, no lists — plain prose only.`,
    }],
  });

  return message.content[0].text.trim();
}

// ─────────────────────────────────────────
// AUXILIARY CHECKS
// ─────────────────────────────────────────
async function checkRobotsTxt(baseUrl) {
  try {
    const r = await axios.get(baseUrl + '/robots.txt', { timeout: 5000, validateStatus: s => s < 500 });
    return r.status === 200 && r.data.length > 0;
  } catch { return false; }
}

async function checkSitemap(baseUrl) {
  try {
    const r = await axios.get(baseUrl + '/sitemap.xml', { timeout: 5000, validateStatus: s => s < 500 });
    return r.status === 200;
  } catch { return false; }
}

// ─────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────
async function analyzeSite(url) {
  const baseUrl = new URL(url).origin;
  const domain = new URL(url).hostname.replace('www.', '');

  // Parallel fetch
  const [pageData, robotsOk, sitemapOk] = await Promise.all([
    fetchPage(url),
    checkRobotsTxt(baseUrl),
    checkSitemap(baseUrl),
  ]);

  const raw = runHtmlChecks(pageData.html, pageData.finalUrl);
  const checks = buildChecks(raw, robotsOk, sitemapOk);
  const score = calcScore(checks);
  const topIssues = buildTopIssues(checks);
  const quickWins = buildQuickWins(checks);
  const aiSummary = await generateAiSummary(domain, checks, score);

  return { score, checks, topIssues, quickWins, aiSummary, domain, analyzedAt: new Date().toISOString() };
}

module.exports = { analyzeSite };
