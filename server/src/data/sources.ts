// Third-party domains AI assistants plausibly cite, per industry, plus a generic base
// (encyclopedias, forums, review platforms, big publishers). Weights are relative citation
// likelihood (0..1), loosely based on public AI-citation studies: Reddit, Wikipedia,
// YouTube and review platforms dominate, then vertical publishers.
// Also provides `sampleUrlPath` so the simulated engine can fabricate believable URLs.

export interface SourceDomain {
  domain: string;
  title: string;
  weight: number;
}

type Entry = [domain: string, title: string, weight: number];

/** `fit` limits an entry to software/tech contexts (g2.com is not cited for coffee brands). */
const BASE: { e: Entry; fit?: 'software' | 'tech' }[] = [
  { e: ['reddit.com', 'Reddit', 1.0] },
  { e: ['wikipedia.org', 'Wikipedia', 0.9] },
  { e: ['youtube.com', 'YouTube', 0.75] },
  { e: ['g2.com', 'G2', 0.8], fit: 'software' },
  { e: ['capterra.com', 'Capterra', 0.65], fit: 'software' },
  { e: ['forbes.com', 'Forbes', 0.6] },
  { e: ['trustpilot.com', 'Trustpilot', 0.5] },
  { e: ['quora.com', 'Quora', 0.45] },
  { e: ['linkedin.com', 'LinkedIn', 0.45] },
  { e: ['medium.com', 'Medium', 0.4] },
  { e: ['techradar.com', 'TechRadar', 0.45], fit: 'tech' },
  { e: ['pcmag.com', 'PCMag', 0.4], fit: 'tech' },
  { e: ['nytimes.com', 'The New York Times (Wirecutter)', 0.35] },
  { e: ['businessinsider.com', 'Business Insider', 0.3] },
  { e: ['theguardian.com', 'The Guardian', 0.25] },
  { e: ['bbc.com', 'BBC', 0.25] },
  { e: ['cnbc.com', 'CNBC', 0.2] },
  { e: ['wsj.com', 'The Wall Street Journal', 0.2] },
];

type Kind = 'software' | 'tech' | 'consumer';

interface IndustrySources {
  id: string;
  kind: Kind;
  /** Lowercase keywords matched as whole words (a trailing plural "s" is tolerated). */
  keywords: string[];
  domains: Entry[];
}

const INDUSTRIES: IndustrySources[] = [
  {
    id: 'saas',
    kind: 'software',
    keywords: ['saas', 'software', 'b2b', 'platform', 'cloud', 'app', 'tool', 'productivity', 'collaboration', 'startup', 'enterprise software', 'ai'],
    domains: [
      ['g2.com', 'G2', 1.0],
      ['capterra.com', 'Capterra', 0.85],
      ['trustradius.com', 'TrustRadius', 0.6],
      ['gartner.com', 'Gartner Peer Insights', 0.55],
      ['getapp.com', 'GetApp', 0.5],
      ['softwareadvice.com', 'Software Advice', 0.45],
      ['zapier.com', 'Zapier Blog', 0.5],
      ['producthunt.com', 'Product Hunt', 0.4],
      ['techcrunch.com', 'TechCrunch', 0.35],
      ['news.ycombinator.com', 'Hacker News', 0.3],
      ['saasworthy.com', 'SaaSworthy', 0.25],
      ['techrepublic.com', 'TechRepublic', 0.3],
    ],
  },
  {
    id: 'project_management',
    kind: 'software',
    keywords: ['project management', 'task management', 'work management', 'project', 'kanban', 'agile', 'issue tracking', 'workflow', 'scrum', 'gantt'],
    domains: [
      ['g2.com', 'G2', 1.0],
      ['capterra.com', 'Capterra', 0.85],
      ['zapier.com', 'Zapier Blog', 0.65],
      ['pcmag.com', 'PCMag', 0.55],
      ['thedigitalprojectmanager.com', 'The Digital Project Manager', 0.55],
      ['forbes.com', 'Forbes Advisor', 0.6],
      ['techrepublic.com', 'TechRepublic', 0.45],
      ['pmi.org', 'Project Management Institute', 0.4],
      ['tech.co', 'Tech.co', 0.35],
      ['getapp.com', 'GetApp', 0.4],
      ['trustradius.com', 'TrustRadius', 0.4],
      ['softwareadvice.com', 'Software Advice', 0.35],
      ['cio.com', 'CIO', 0.25],
    ],
  },
  {
    id: 'crm',
    kind: 'software',
    keywords: ['crm', 'customer relationship', 'sales', 'pipeline', 'lead management', 'sales engagement', 'customer support', 'help desk', 'helpdesk'],
    domains: [
      ['g2.com', 'G2', 1.0],
      ['capterra.com', 'Capterra', 0.8],
      ['forbes.com', 'Forbes Advisor', 0.65],
      ['techradar.com', 'TechRadar', 0.5],
      ['pcmag.com', 'PCMag', 0.45],
      ['zapier.com', 'Zapier Blog', 0.5],
      ['nerdwallet.com', 'NerdWallet', 0.35],
      ['fitsmallbusiness.com', 'Fit Small Business', 0.4],
      ['business.com', 'Business.com', 0.35],
      ['trustradius.com', 'TrustRadius', 0.45],
      ['gartner.com', 'Gartner Peer Insights', 0.45],
      ['softwareadvice.com', 'Software Advice', 0.4],
      ['techrepublic.com', 'TechRepublic', 0.35],
    ],
  },
  {
    id: 'martech',
    kind: 'software',
    keywords: ['analytics', 'martech', 'marketing', 'seo', 'advertising', 'adtech', 'email marketing', 'attribution', 'growth', 'content marketing', 'ai visibility', 'geo', 'social media', 'web analytics', 'product analytics'],
    domains: [
      ['g2.com', 'G2', 0.9],
      ['searchengineland.com', 'Search Engine Land', 0.7],
      ['searchenginejournal.com', 'Search Engine Journal', 0.65],
      ['martech.org', 'MarTech', 0.5],
      ['moz.com', 'Moz', 0.5],
      ['semrush.com', 'Semrush Blog', 0.5],
      ['ahrefs.com', 'Ahrefs Blog', 0.5],
      ['neilpatel.com', 'Neil Patel', 0.45],
      ['backlinko.com', 'Backlinko', 0.4],
      ['cxl.com', 'CXL', 0.35],
      ['contentmarketinginstitute.com', 'Content Marketing Institute', 0.3],
      ['marketingprofs.com', 'MarketingProfs', 0.25],
      ['trustradius.com', 'TrustRadius', 0.35],
      ['capterra.com', 'Capterra', 0.5],
    ],
  },
  {
    id: 'ecommerce',
    kind: 'consumer',
    keywords: ['e-commerce', 'ecommerce', 'retail', 'online store', 'shopping', 'marketplace', 'dtc', 'd2c', 'direct-to-consumer', 'furniture', 'home goods', 'store'],
    domains: [
      ['amazon.com', 'Amazon', 0.7],
      ['nytimes.com', 'Wirecutter (NYT)', 0.65],
      ['consumerreports.org', 'Consumer Reports', 0.6],
      ['trustpilot.com', 'Trustpilot', 0.6],
      ['goodhousekeeping.com', 'Good Housekeeping', 0.45],
      ['shopify.com', 'Shopify Blog', 0.45],
      ['practicalecommerce.com', 'Practical Ecommerce', 0.3],
      ['digitalcommerce360.com', 'Digital Commerce 360', 0.3],
      ['retaildive.com', 'Retail Dive', 0.3],
      ['modernretail.co', 'Modern Retail', 0.25],
      ['sitejabber.com', 'Sitejabber', 0.3],
      ['bbb.org', 'Better Business Bureau', 0.3],
    ],
  },
  {
    id: 'fintech',
    kind: 'consumer',
    keywords: ['fintech', 'bank', 'banking', 'neobank', 'payments', 'payment', 'finance', 'financial', 'credit card', 'lending', 'loan', 'invest', 'investing', 'investment', 'trading', 'crypto', 'accounting', 'wealth', 'budgeting', 'money transfer'],
    domains: [
      ['nerdwallet.com', 'NerdWallet', 1.0],
      ['bankrate.com', 'Bankrate', 0.8],
      ['investopedia.com', 'Investopedia', 0.8],
      ['forbes.com', 'Forbes Advisor', 0.7],
      ['cnbc.com', 'CNBC Select', 0.5],
      ['businessinsider.com', 'Business Insider', 0.4],
      ['money.com', 'Money', 0.35],
      ['fool.com', 'The Motley Fool', 0.4],
      ['finextra.com', 'Finextra', 0.3],
      ['thefinancialbrand.com', 'The Financial Brand', 0.25],
      ['ft.com', 'Financial Times', 0.3],
      ['consumerfinance.gov', 'CFPB', 0.25],
      ['trustpilot.com', 'Trustpilot', 0.45],
    ],
  },
  {
    id: 'travel',
    kind: 'consumer',
    keywords: ['travel', 'hospitality', 'hotel', 'airline', 'tourism', 'vacation', 'booking', 'flight', 'resort', 'cruise', 'vacation rental', 'trip'],
    domains: [
      ['tripadvisor.com', 'Tripadvisor', 1.0],
      ['booking.com', 'Booking.com', 0.6],
      ['lonelyplanet.com', 'Lonely Planet', 0.6],
      ['cntraveler.com', 'Condé Nast Traveler', 0.55],
      ['travelandleisure.com', 'Travel + Leisure', 0.55],
      ['thepointsguy.com', 'The Points Guy', 0.5],
      ['expedia.com', 'Expedia', 0.45],
      ['timeout.com', 'Time Out', 0.4],
      ['skift.com', 'Skift', 0.3],
      ['nomadicmatt.com', 'Nomadic Matt', 0.3],
      ['kayak.com', 'Kayak', 0.3],
      ['afar.com', 'AFAR', 0.25],
    ],
  },
  {
    id: 'health',
    kind: 'consumer',
    keywords: ['health', 'wellness', 'fitness', 'medical', 'healthcare', 'nutrition', 'supplement', 'mental health', 'telehealth', 'pharma', 'sleep', 'meditation', 'workout', 'diet'],
    domains: [
      ['healthline.com', 'Healthline', 1.0],
      ['mayoclinic.org', 'Mayo Clinic', 0.85],
      ['webmd.com', 'WebMD', 0.75],
      ['clevelandclinic.org', 'Cleveland Clinic', 0.6],
      ['verywellhealth.com', 'Verywell Health', 0.55],
      ['medicalnewstoday.com', 'Medical News Today', 0.5],
      ['nih.gov', 'National Institutes of Health', 0.5],
      ['health.harvard.edu', 'Harvard Health', 0.45],
      ['everydayhealth.com', 'Everyday Health', 0.35],
      ['menshealth.com', "Men's Health", 0.3],
      ['self.com', 'SELF', 0.3],
      ['examine.com', 'Examine', 0.3],
    ],
  },
  {
    id: 'hr',
    kind: 'software',
    keywords: ['hr', 'human resources', 'recruiting', 'recruitment', 'hiring', 'talent', 'payroll', 'hris', 'ats', 'applicant tracking', 'workforce', 'employee', 'people ops', 'benefits'],
    domains: [
      ['g2.com', 'G2', 0.95],
      ['capterra.com', 'Capterra', 0.8],
      ['shrm.org', 'SHRM', 0.7],
      ['forbes.com', 'Forbes Advisor', 0.6],
      ['glassdoor.com', 'Glassdoor', 0.5],
      ['indeed.com', 'Indeed', 0.5],
      ['hrdive.com', 'HR Dive', 0.4],
      ['peoplemanagingpeople.com', 'People Managing People', 0.4],
      ['hrexecutive.com', 'HR Executive', 0.3],
      ['selectsoftwarereviews.com', 'SelectSoftware Reviews', 0.35],
      ['joshbersin.com', 'Josh Bersin', 0.25],
      ['gartner.com', 'Gartner Peer Insights', 0.4],
    ],
  },
  {
    id: 'education',
    kind: 'consumer',
    keywords: ['education', 'edtech', 'learning', 'e-learning', 'elearning', 'course', 'school', 'university', 'tutoring', 'lms', 'language learning', 'bootcamp', 'students'],
    domains: [
      ['coursera.org', 'Coursera', 0.7],
      ['classcentral.com', 'Class Central', 0.6],
      ['edsurge.com', 'EdSurge', 0.5],
      ['usnews.com', 'U.S. News & World Report', 0.55],
      ['edx.org', 'edX', 0.45],
      ['insidehighered.com', 'Inside Higher Ed', 0.4],
      ['edweek.org', 'Education Week', 0.4],
      ['khanacademy.org', 'Khan Academy', 0.35],
      ['commonsense.org', 'Common Sense Media', 0.35],
      ['niche.com', 'Niche', 0.35],
      ['chronicle.com', 'The Chronicle of Higher Education', 0.3],
      ['g2.com', 'G2', 0.4],
    ],
  },
  {
    id: 'automotive',
    kind: 'consumer',
    keywords: ['automotive', 'car', 'vehicle', 'ev', 'electric vehicle', 'auto', 'motor', 'dealership', 'mobility', 'suv', 'truck'],
    domains: [
      ['caranddriver.com', 'Car and Driver', 1.0],
      ['edmunds.com', 'Edmunds', 0.85],
      ['motortrend.com', 'MotorTrend', 0.8],
      ['kbb.com', 'Kelley Blue Book', 0.75],
      ['consumerreports.org', 'Consumer Reports', 0.7],
      ['cars.com', 'Cars.com', 0.55],
      ['iihs.org', 'IIHS', 0.45],
      ['jdpower.com', 'J.D. Power', 0.45],
      ['insideevs.com', 'InsideEVs', 0.4],
      ['electrek.co', 'Electrek', 0.35],
      ['topgear.com', 'Top Gear', 0.35],
      ['whatcar.com', 'What Car?', 0.3],
      ['autotrader.com', 'Autotrader', 0.3],
    ],
  },
  {
    id: 'electronics',
    kind: 'tech',
    keywords: ['consumer electronics', 'electronics', 'gadget', 'smartphone', 'phone', 'laptop', 'headphones', 'earbuds', 'audio', 'wearable', 'smartwatch', 'tv', 'camera', 'smart home', 'hardware', 'gaming', 'speaker', 'monitor', 'tablet'],
    domains: [
      ['rtings.com', 'RTINGS', 0.95],
      ['nytimes.com', 'Wirecutter (NYT)', 0.8],
      ['cnet.com', 'CNET', 0.8],
      ['techradar.com', 'TechRadar', 0.8],
      ['tomsguide.com', "Tom's Guide", 0.75],
      ['theverge.com', 'The Verge', 0.7],
      ['pcmag.com', 'PCMag', 0.6],
      ['engadget.com', 'Engadget', 0.5],
      ['wired.com', 'WIRED', 0.5],
      ['consumerreports.org', 'Consumer Reports', 0.5],
      ['zdnet.com', 'ZDNET', 0.45],
      ['gsmarena.com', 'GSMArena', 0.4],
      ['digitaltrends.com', 'Digital Trends', 0.35],
      ['notebookcheck.net', 'Notebookcheck', 0.3],
      ['soundguys.com', 'SoundGuys', 0.3],
    ],
  },
  {
    id: 'food',
    kind: 'consumer',
    keywords: ['food', 'beverage', 'drink', 'restaurant', 'coffee', 'tea', 'snack', 'meal kit', 'grocery', 'cpg', 'wine', 'beer', 'spirits', 'plant-based', 'food delivery', 'kitchen', 'recipe'],
    domains: [
      ['seriouseats.com', 'Serious Eats', 0.75],
      ['bonappetit.com', 'Bon Appétit', 0.6],
      ['foodandwine.com', 'Food & Wine', 0.6],
      ['eater.com', 'Eater', 0.55],
      ['thekitchn.com', 'The Kitchn', 0.5],
      ['allrecipes.com', 'Allrecipes', 0.5],
      ['tastingtable.com', 'Tasting Table', 0.45],
      ['nytimes.com', 'Wirecutter (NYT)', 0.5],
      ['goodhousekeeping.com', 'Good Housekeeping', 0.4],
      ['healthline.com', 'Healthline', 0.4],
      ['epicurious.com', 'Epicurious', 0.35],
      ['fooddive.com', 'Food Dive', 0.3],
      ['vinepair.com', 'VinePair', 0.3],
    ],
  },
  {
    id: 'cybersecurity',
    kind: 'software',
    keywords: ['cybersecurity', 'security', 'infosec', 'vpn', 'password', 'password manager', 'antivirus', 'endpoint', 'identity', 'zero trust', 'firewall', 'siem', 'privacy', 'compliance', 'malware'],
    domains: [
      ['gartner.com', 'Gartner Peer Insights', 0.8],
      ['g2.com', 'G2', 0.75],
      ['techradar.com', 'TechRadar', 0.6],
      ['pcmag.com', 'PCMag', 0.6],
      ['csoonline.com', 'CSO Online', 0.55],
      ['darkreading.com', 'Dark Reading', 0.5],
      ['bleepingcomputer.com', 'BleepingComputer', 0.5],
      ['thehackernews.com', 'The Hacker News', 0.45],
      ['securityweek.com', 'SecurityWeek', 0.4],
      ['av-test.org', 'AV-TEST', 0.35],
      ['peerspot.com', 'PeerSpot', 0.35],
      ['zdnet.com', 'ZDNET', 0.4],
      ['security.org', 'Security.org', 0.35],
      ['cisa.gov', 'CISA', 0.25],
    ],
  },
  {
    id: 'devtools',
    kind: 'software',
    keywords: ['developer', 'developer tools', 'devops', 'dev tools', 'api', 'ci/cd', 'infrastructure', 'database', 'hosting', 'observability', 'monitoring', 'open source', 'sdk', 'code', 'coding'],
    domains: [
      ['stackoverflow.com', 'Stack Overflow', 0.85],
      ['github.com', 'GitHub', 0.85],
      ['news.ycombinator.com', 'Hacker News', 0.55],
      ['dev.to', 'DEV Community', 0.5],
      ['stackshare.io', 'StackShare', 0.4],
      ['g2.com', 'G2', 0.55],
      ['thenewstack.io', 'The New Stack', 0.4],
      ['infoq.com', 'InfoQ', 0.3],
      ['dzone.com', 'DZone', 0.3],
      ['freecodecamp.org', 'freeCodeCamp', 0.35],
      ['smashingmagazine.com', 'Smashing Magazine', 0.25],
    ],
  },
  {
    id: 'insurance',
    kind: 'consumer',
    keywords: ['insurance', 'insurtech', 'life insurance', 'car insurance', 'health insurance', 'home insurance'],
    domains: [
      ['nerdwallet.com', 'NerdWallet', 0.95],
      ['policygenius.com', 'Policygenius', 0.75],
      ['bankrate.com', 'Bankrate', 0.7],
      ['forbes.com', 'Forbes Advisor', 0.7],
      ['valuepenguin.com', 'ValuePenguin', 0.5],
      ['investopedia.com', 'Investopedia', 0.5],
      ['jdpower.com', 'J.D. Power', 0.45],
      ['consumerreports.org', 'Consumer Reports', 0.4],
      ['insure.com', 'Insure.com', 0.35],
      ['iii.org', 'Insurance Information Institute', 0.3],
      ['trustpilot.com', 'Trustpilot', 0.4],
    ],
  },
  {
    id: 'real_estate',
    kind: 'consumer',
    keywords: ['real estate', 'property', 'mortgage', 'proptech', 'rental', 'housing', 'homes', 'realtor', 'property management'],
    domains: [
      ['zillow.com', 'Zillow', 0.9],
      ['realtor.com', 'Realtor.com', 0.75],
      ['redfin.com', 'Redfin', 0.65],
      ['bankrate.com', 'Bankrate', 0.55],
      ['nerdwallet.com', 'NerdWallet', 0.5],
      ['biggerpockets.com', 'BiggerPockets', 0.5],
      ['inman.com', 'Inman', 0.35],
      ['housingwire.com', 'HousingWire', 0.35],
      ['investopedia.com', 'Investopedia', 0.4],
      ['nar.realtor', 'National Association of Realtors', 0.3],
    ],
  },
  {
    id: 'beauty_fashion',
    kind: 'consumer',
    keywords: ['beauty', 'cosmetics', 'skincare', 'makeup', 'fashion', 'apparel', 'clothing', 'jewelry', 'shoes', 'haircare', 'fragrance'],
    domains: [
      ['allure.com', 'Allure', 0.7],
      ['byrdie.com', 'Byrdie', 0.65],
      ['vogue.com', 'Vogue', 0.6],
      ['sephora.com', 'Sephora', 0.55],
      ['harpersbazaar.com', "Harper's Bazaar", 0.45],
      ['elle.com', 'ELLE', 0.45],
      ['refinery29.com', 'Refinery29', 0.4],
      ['ulta.com', 'Ulta Beauty', 0.4],
      ['cosmopolitan.com', 'Cosmopolitan', 0.35],
      ['glamour.com', 'Glamour', 0.35],
      ['goodhousekeeping.com', 'Good Housekeeping', 0.35],
    ],
  },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

const KEYWORD_RES = new Map(
  INDUSTRIES.map((ind) => [ind.id, ind.keywords.map((k) => ({ re: new RegExp(`(?:^|[^a-z0-9])${escapeRe(k)}s?(?![a-z0-9])`), multi: /[\s/-]/.test(k) }))]),
);

/** Scores each industry by keyword hits (multi-word keywords count double), best first. */
function rankIndustries(text: string): { ind: IndustrySources; score: number }[] {
  const t = text.toLowerCase();
  return INDUSTRIES.map((ind) => {
    let score = 0;
    for (const k of KEYWORD_RES.get(ind.id) ?? []) if (k.re.test(t)) score += k.multi ? 2 : 1;
    // "saas" keywords are generic; let a specific software vertical win ties.
    return { ind, score: ind.id === 'saas' ? score * 0.9 : score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

const MAX_SOURCES = 22;

/** Plausible third-party domains AI assistants cite for an industry (review sites, publications, forums). */
export function sourceDomainsFor(industry: string): SourceDomain[] {
  const ranked = rankIndustries(industry ?? '');
  const top = ranked[0];
  const blend: { ind: IndustrySources; factor: number }[] = [];
  if (top) {
    blend.push({ ind: top.ind, factor: 1 });
    const second = ranked[1];
    // Blend a close runner-up, but don't pull generic SaaS review sites into consumer verticals.
    if (second && second.score >= top.score * 0.6 && (second.ind.id !== 'saas' || top.ind.kind === 'software')) {
      blend.push({ ind: second.ind, factor: 0.6 });
    }
    const saas = INDUSTRIES.find((i) => i.id === 'saas');
    if (saas && top.ind.kind === 'software' && !blend.some((b) => b.ind.id === 'saas')) blend.push({ ind: saas, factor: 0.5 });
  }
  const kind: Kind | null = top?.ind.kind ?? null;

  const out = new Map<string, SourceDomain>();
  const add = ([domain, title, weight]: Entry, factor: number) => {
    const w = weight * factor;
    const prev = out.get(domain);
    // Domains relevant in several lists get a small boost rather than a simple max.
    if (prev) prev.weight = Math.max(prev.weight, w) + Math.min(prev.weight, w) * 0.15;
    else out.set(domain, { domain, title, weight: w });
  };

  for (const { ind, factor } of blend) for (const e of ind.domains) add(e, factor);
  for (const { e, fit } of BASE) {
    let factor = 0.75;
    if (fit === 'software' && kind !== null && kind !== 'software') factor = 0.2;
    if (fit === 'tech' && kind === 'consumer') factor = 0.25;
    add(e, factor);
  }

  return [...out.values()]
    .map((s) => ({ ...s, weight: Math.round(Math.min(1, s.weight) * 1000) / 1000 }))
    .sort((a, b) => b.weight - a.weight || a.domain.localeCompare(b.domain))
    .slice(0, MAX_SOURCES);
}

// ---------------------------------------------------------------------------
// Realistic URL paths for fabricated citations
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: tiny deterministic PRNG returning [0, 1). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEADING_FILLER = new Set([
  'what', 'whats', 'which', 'who', 'how', 'is', 'are', 'the', 'best', 'top', 'do', 'does', 'can', 'should', 'i', 'you',
  'recommend', 'a', 'an', 'of', 'me', 'some', 'good', 'most', 'popular', 'for', 'to', 'in', 'my', 'any', 'there', 'tell',
]);

/** "What are the best project management tools for small teams?" -> ['project','management','tools','for','small','teams'] */
function topicWords(topic: string): string[] {
  const words = topic
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  let i = 0;
  while (i < words.length - 1 && LEADING_FILLER.has(words[i] ?? '')) i++;
  const rest = words.slice(i, i + 7);
  return rest.length ? rest : ['guide'];
}

const SUBREDDITS: [RegExp, string[]][] = [
  [/project|task|kanban|agile|scrum/, ['projectmanagement', 'agile', 'productivity']],
  [/crm|sales|pipeline/, ['CRM', 'sales', 'smallbusiness']],
  [/seo|marketing|analytics|ads|advertising/, ['marketing', 'SEO', 'digital_marketing', 'analytics']],
  [/ecommerce|e commerce|shop|store|retail/, ['ecommerce', 'shopify', 'smallbusiness']],
  [/bank|financ|credit|invest|loan|budget|payment|accounting/, ['personalfinance', 'FinancialPlanning', 'fintech']],
  [/travel|hotel|flight|airline|vacation/, ['travel', 'solotravel', 'TravelHacks']],
  [/fitness|workout|gym/, ['Fitness', 'homegym']],
  [/health|wellness|nutrition|supplement|sleep|meditation/, ['HealthyFood', 'nutrition', 'Supplements', 'selfimprovement']],
  [/hr|recruit|hiring|payroll|talent|employee/, ['humanresources', 'recruiting', 'AskHR']],
  [/learn|course|education|school|tutor|lms/, ['edtech', 'Teachers', 'learnprogramming']],
  [/car|vehicle|ev|suv|truck/, ['cars', 'whatcarshouldIbuy', 'electricvehicles']],
  [/headphone|earbud|audio|speaker/, ['headphones', 'audiophile']],
  [/laptop|computer|pc/, ['SuggestALaptop', 'laptops']],
  [/phone|smartphone|android|iphone/, ['Android', 'iphone', 'PickAnAndroidForMe']],
  [/tv|monitor|camera|smart home|gadget/, ['hometheater', 'smarthome', 'gadgets']],
  [/coffee/, ['Coffee', 'espresso']],
  [/food|snack|meal|recipe|restaurant|drink|beverage|wine|beer/, ['food', 'Cooking', 'mealprep']],
  [/vpn|password|security|antivirus|privacy|malware/, ['cybersecurity', 'privacy', 'sysadmin']],
  [/developer|devops|api|database|hosting|code/, ['webdev', 'devops', 'programming']],
  [/insurance/, ['Insurance', 'personalfinance']],
  [/real estate|property|mortgage|rental|home/, ['RealEstate', 'FirstTimeHomeBuyer']],
  [/beauty|skincare|makeup|fashion|clothing/, ['SkincareAddiction', 'MakeupAddiction', 'malefashionadvice']],
  [/saas|software|startup|tool|platform|app/, ['SaaS', 'startups', 'smallbusiness', 'software']],
];

const AUTHORS = ['sarah-mitchell', 'james-carter', 'priya-nair', 'daniel-kim', 'laura-schmidt', 'marco-rossi', 'emily-chen', 'tom-becker'];
const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
const YT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

interface Ctx {
  r: () => number;
  words: string[];
  slug: string; // project-management-tools-for-small-teams
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
const chars = (r: () => number, set: string, n: number) => Array.from({ length: n }, () => pick(r, set.split(''))).join('');
const digits = (r: () => number, n: number) => String(Math.floor(10 ** (n - 1) + r() * 9 * 10 ** (n - 1)));
const titleCase = (words: string[], sep: string) => words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(sep);

/** Publication date between Jan 2024 and Sep 2026, as [yyyy, mm, dd]. */
function pubDate(r: () => number): [string, string, string] {
  const year = 2024 + Math.floor(r() * 3);
  const month = 1 + Math.floor(r() * (year === 2026 ? 9 : 12));
  const day = 1 + Math.floor(r() * 28);
  return [String(year), String(month).padStart(2, '0'), String(day).padStart(2, '0')];
}

function subreddit({ r, words }: Ctx): string {
  const text = words.join(' ');
  for (const [re, subs] of SUBREDDITS) if (re.test(text)) return pick(r, subs);
  return words.slice(0, 2).join('').slice(0, 20) || 'AskReddit';
}

const softwareSlug = (slug: string) => (/-(software|tools?|platforms?|apps?)$/.test(slug) ? slug : `${slug}-software`);

const PATHS: Record<string, ((c: Ctx) => string)[]> = {
  'reddit.com': [
    (c) => `/r/${subreddit(c)}/comments/1${chars(c.r, ALNUM, 6)}/${c.words.join('_')}/`,
    (c) => `/r/${subreddit(c)}/comments/1${chars(c.r, ALNUM, 6)}/what_${c.words.join('_')}_do_you_use/`,
    (c) => `/r/${subreddit(c)}/comments/1${chars(c.r, ALNUM, 6)}/${c.words.join('_')}_recommendations/`,
  ],
  'wikipedia.org': [
    (c) => {
      const t = c.words.slice(0, 3).join('_');
      return `/wiki/${t.charAt(0).toUpperCase()}${t.slice(1)}`;
    },
  ],
  'youtube.com': [(c) => `/watch?v=${chars(c.r, YT, 11)}`],
  'g2.com': [(c) => `/categories/${c.slug}`, (c) => `/categories/${c.slug}/small-business`, (c) => `/categories/${c.slug}/free`],
  'capterra.com': [(c) => `/${softwareSlug(c.slug)}/`, (c) => `/resources/best-${c.slug}/`],
  'getapp.com': [(c) => `/${softwareSlug(c.slug)}/`],
  'trustradius.com': [(c) => `/${c.slug}`],
  'softwareadvice.com': [(c) => `/${c.slug.replace(/-software$/, '')}/`],
  'gartner.com': [(c) => `/reviews/market/${c.slug}`],
  'producthunt.com': [(c) => `/topics/${c.slug}`],
  'trustpilot.com': [(c) => `/categories/${c.slug}`],
  'quora.com': [(c) => `/What-is-the-best-${titleCase(c.words, '-')}`, (c) => `/Which-${titleCase(c.words, '-')}-do-you-recommend`],
  'linkedin.com': [(c) => `/pulse/${c.slug}-${pick(c.r, AUTHORS)}-${chars(c.r, ALNUM, 5)}/`],
  'medium.com': [(c) => `/@${pick(c.r, AUTHORS).replace('-', '')}/${c.slug}-${chars(c.r, '0123456789abcdef', 12)}`],
  'forbes.com': [
    (c) => `/advisor/business/software/best-${c.slug}/`,
    (c) => {
      const [y, m, d] = pubDate(c.r);
      return `/sites/forbestechcouncil/${y}/${m}/${d}/${c.slug}/`;
    },
  ],
  'techradar.com': [(c) => `/best/best-${c.slug}`],
  'pcmag.com': [(c) => `/picks/the-best-${c.slug}`],
  'nytimes.com': [(c) => `/wirecutter/reviews/best-${c.slug}/`],
  'zapier.com': [(c) => `/blog/best-${c.slug}/`],
  'cnet.com': [(c) => `/tech/best-${c.slug}/`],
  'tomsguide.com': [(c) => `/best-picks/best-${c.slug}`],
  'theverge.com': [
    (c) => {
      const [y, m, d] = pubDate(c.r);
      return `/${y}/${Number(m)}/${Number(d)}/${digits(c.r, 8)}/${c.slug}`;
    },
  ],
  'wired.com': [(c) => `/gallery/best-${c.slug}/`],
  'rtings.com': [(c) => `/${c.words[0] ?? 'tv'}/reviews/best`],
  'engadget.com': [(c) => `/best-${c.slug}-${digits(c.r, 9)}.html`],
  'consumerreports.org': [(c) => `/${c.words[0] ?? 'products'}/best-${c.slug}-a${digits(c.r, 10)}/`],
  'nerdwallet.com': [(c) => `/best/${c.slug}`, (c) => `/article/finance/${c.slug}`],
  'bankrate.com': [(c) => `/banking/${c.slug}/`],
  'investopedia.com': [(c) => `/${c.slug}-${digits(c.r, 7)}`],
  'tripadvisor.com': [(c) => `/ShowTopic-g${digits(c.r, 6)}-i${digits(c.r, 3)}-k${digits(c.r, 8)}-${titleCase(c.words, '_')}.html`],
  'booking.com': [(c) => `/articles/${c.slug}.html`],
  'lonelyplanet.com': [(c) => `/articles/${c.slug}`],
  'cntraveler.com': [(c) => `/gallery/best-${c.slug}`],
  'healthline.com': [(c) => `/health/${c.slug}`, (c) => `/nutrition/${c.slug}`],
  'mayoclinic.org': [(c) => `/healthy-lifestyle/${c.slug}/in-depth/${c.slug}/art-${digits(c.r, 8)}`],
  'shrm.org': [(c) => `/topics-tools/news/${c.slug}`],
  'glassdoor.com': [(c) => `/blog/${c.slug}/`],
  'indeed.com': [(c) => `/career-advice/${c.slug}`, (c) => `/hire/c/info/${c.slug}`],
  'coursera.org': [(c) => `/articles/${c.slug}`],
  'edsurge.com': [
    (c) => {
      const [y, m, d] = pubDate(c.r);
      return `/news/${y}-${m}-${d}-${c.slug}`;
    },
  ],
  'usnews.com': [(c) => `/360-reviews/${c.slug}`],
  'caranddriver.com': [(c) => `/features/a${digits(c.r, 8)}/best-${c.slug}/`],
  'motortrend.com': [(c) => `/features/best-${c.slug}/`],
  'edmunds.com': [(c) => `/car-buying/${c.slug}.html`],
  'kbb.com': [(c) => `/best-cars/${c.slug}/`],
  'seriouseats.com': [(c) => `/best-${c.slug}-${digits(c.r, 7)}`],
  'bonappetit.com': [(c) => `/story/best-${c.slug}`],
  'eater.com': [(c) => `/${digits(c.r, 8)}/${c.slug}`],
  'allrecipes.com': [(c) => `/article/${c.slug}/`],
  'csoonline.com': [(c) => `/article/${digits(c.r, 7)}/${c.slug}.html`],
  'darkreading.com': [(c) => `/cyber-risk/${c.slug}`],
  'bleepingcomputer.com': [(c) => `/news/security/${c.slug}/`],
  'thehackernews.com': [
    (c) => {
      const [y, m] = pubDate(c.r);
      return `/${y}/${m}/${c.slug}.html`;
    },
  ],
  'stackoverflow.com': [(c) => `/questions/${digits(c.r, 8)}/${c.slug}`],
  'github.com': [(c) => `/topics/${c.slug}`],
  'dev.to': [(c) => `/${pick(c.r, AUTHORS).split('-')[0]}/${c.slug}-${chars(c.r, ALNUM, 4)}`],
  'news.ycombinator.com': [(c) => `/item?id=${digits(c.r, 8)}`],
  'searchengineland.com': [(c) => `/${c.slug}-${digits(c.r, 6)}`],
  'searchenginejournal.com': [(c) => `/${c.slug}/${digits(c.r, 6)}/`],
  'zillow.com': [(c) => `/learn/${c.slug}/`],
  'amazon.com': [(c) => `/s?k=${c.words.join('+')}`],
};

const DEFAULT_PATHS: ((c: Ctx) => string)[] = [
  (c) => `/blog/${c.slug}`,
  (c) => `/best-${c.slug}/`,
  (c) => `/guides/${c.slug}`,
  (c) => `/reviews/${c.slug}`,
  (c) => `/articles/${c.slug}`,
  (c) => {
    const [y, m] = pubDate(c.r);
    return `/${y}/${m}/${c.slug}/`;
  },
];

/**
 * Realistic URL path (with leading slash, may include a query) for a citation on `domain`
 * about `topic` (a category noun or the prompt text). Deterministic in (domain, topic, seed).
 */
export function sampleUrlPath(domain: string, topic: string, seed: number): string {
  const host = domain.toLowerCase().replace(/^www\./, '');
  const r = prng((seed ^ hashStr(host) ^ hashStr(topic)) >>> 0);
  const words = topicWords(topic);
  const ctx: Ctx = { r, words, slug: words.join('-') };
  const templates = PATHS[host] ?? PATHS[host.split('.').slice(-2).join('.')] ?? DEFAULT_PATHS;
  return pick(r, templates)(ctx);
}
