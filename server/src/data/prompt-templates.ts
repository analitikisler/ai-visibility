// Realistic buyer prompts (what people actually type into ChatGPT & co.) for a brand,
// spread across intents and tiers. Used for heuristic project suggestions and the demo seed.
import type { PromptInput, PromptIntent, PromptTier } from '../../../shared/types.ts';

type Kind = 'software' | 'consumer' | 'service';

interface Category {
  /** Related categories; the description may refine an industry match within its family. */
  family: string[];
  /** Lowercase keywords/phrases matched as whole words against industry and description. */
  match: string[];
  one: string; // "CRM", "password manager", "project management software"
  many: string; // "CRMs", "password managers", "project management software"
  kind: Kind;
  audiences: string[]; // used as "for <audience>"
  jobs: string[]; // verb phrases: "How can I <job>?"
  features: string[]; // noun phrases: "with <feature>"
  integrations?: string[];
}

// Ordered most-specific first: within a family the earliest category with a keyword hit wins.
const CATEGORIES: Category[] = [
  {
    family: ['marketing'],
    match: ['ai visibility', 'generative engine optimization', 'llm visibility', 'ai search visibility', 'answer engine optimization', 'geo tool'],
    one: 'AI visibility tool', many: 'AI visibility tools', kind: 'software',
    audiences: ['B2B SaaS companies', 'marketing agencies', 'e-commerce brands', 'SEO teams', 'startups'],
    jobs: ['track how ChatGPT talks about my brand', 'get my company recommended by AI assistants', 'see which sources AI chatbots cite in my category', 'measure share of voice in AI search'],
    features: ['competitor benchmarking', 'citation tracking', 'AI crawler analytics', 'prompt-level reporting'],
    integrations: ['Google Analytics', 'Looker Studio', 'Slack'],
  },
  {
    family: ['security'],
    match: ['password manager', 'password management'],
    one: 'password manager', many: 'password managers', kind: 'software',
    audiences: ['families', 'small businesses', 'enterprise IT teams', 'Mac and iPhone users', 'developers'],
    jobs: ['share passwords securely with my team', 'stop reusing passwords', 'move my passwords out of Chrome', 'enforce password policies across my company'],
    features: ['passkey support', 'family sharing', 'breach monitoring', 'SSO integration'],
    integrations: ['Okta', 'Microsoft Entra ID', 'Google Workspace'],
  },
  {
    family: ['security'],
    match: ['vpn'],
    one: 'VPN', many: 'VPNs', kind: 'software',
    audiences: ['streaming', 'travel', 'remote workers', 'privacy-conscious users', 'small businesses'],
    jobs: ['browse privately on public Wi-Fi', 'stream shows from other countries', 'secure remote access for my team', 'hide my IP address'],
    features: ['streaming support', 'a strict no-logs policy', 'fast speeds', 'split tunneling'],
  },
  {
    family: ['security'],
    match: ['endpoint', 'edr', 'xdr', 'siem', 'threat detection', 'zero trust', 'cybersecurity', 'security platform', 'infosec', 'antivirus', 'identity and access', 'iam'],
    one: 'cybersecurity platform', many: 'cybersecurity platforms', kind: 'software',
    audiences: ['mid-size companies', 'enterprises', 'small businesses', 'healthcare organizations', 'lean IT teams'],
    jobs: ['protect my company from ransomware', 'pass a SOC 2 audit', 'detect threats across endpoints and cloud', 'reduce alert fatigue for my security team'],
    features: ['managed detection and response', 'ransomware protection', 'cloud security posture management', 'automated incident response'],
    integrations: ['Microsoft 365', 'AWS', 'Okta'],
  },
  {
    family: ['productivity'],
    match: ['project management', 'work management', 'task management', 'kanban', 'gantt', 'issue tracking', 'agile', 'scrum'],
    one: 'project management tool', many: 'project management tools', kind: 'software',
    audiences: ['small teams', 'marketing agencies', 'remote teams', 'software development teams', 'enterprise companies', 'nonprofits'],
    jobs: ['keep projects on schedule', 'manage tasks across a remote team', 'track resource allocation across projects', 'run sprints without endless status meetings'],
    features: ['Gantt charts', 'time tracking', 'resource management', 'workflow automation'],
    integrations: ['Slack', 'Google Workspace', 'Microsoft Teams'],
  },
  {
    family: ['support'],
    match: ['help desk', 'helpdesk', 'customer support', 'customer service', 'ticketing', 'live chat'],
    one: 'help desk software', many: 'help desk tools', kind: 'software',
    audiences: ['e-commerce stores', 'SaaS startups', 'small support teams', 'enterprise support teams'],
    jobs: ['reduce customer support response times', 'handle support tickets from email and chat in one place', 'automate answers to common customer questions'],
    features: ['AI chatbots', 'shared inboxes', 'knowledge base features', 'SLA management'],
    integrations: ['Shopify', 'Salesforce', 'Slack'],
  },
  {
    family: ['sales'],
    match: ['crm', 'customer relationship', 'sales pipeline', 'sales engagement', 'lead management'],
    one: 'CRM', many: 'CRMs', kind: 'software',
    audiences: ['small businesses', 'B2B sales teams', 'startups', 'real estate agents', 'agencies'],
    jobs: ['keep track of leads and follow-ups', 'forecast sales more accurately', 'move off spreadsheets for sales tracking', 'automate sales follow-up emails'],
    features: ['email automation', 'pipeline management', 'AI lead scoring', 'built-in calling'],
    integrations: ['Gmail', 'Outlook', 'Slack'],
  },
  {
    family: ['marketing'],
    match: ['email marketing', 'newsletter', 'marketing automation'],
    one: 'email marketing platform', many: 'email marketing platforms', kind: 'software',
    audiences: ['e-commerce brands', 'creators', 'small businesses', 'B2B marketers'],
    jobs: ['grow my email list', 'improve email open rates', 'set up automated welcome emails', 'segment subscribers by behavior'],
    features: ['automation workflows', 'A/B testing', 'landing pages', 'deliverability tools'],
    integrations: ['Shopify', 'WordPress', 'Salesforce'],
  },
  {
    family: ['marketing'],
    match: ['seo', 'keyword research', 'backlink'],
    one: 'SEO tool', many: 'SEO tools', kind: 'software',
    audiences: ['agencies', 'small businesses', 'content teams', 'e-commerce sites'],
    jobs: ['find keywords my competitors rank for', 'fix technical SEO issues on my site', 'track rankings for local searches', 'build backlinks safely'],
    features: ['rank tracking', 'site audits', 'backlink analysis', 'content optimization'],
    integrations: ['Google Search Console', 'Google Analytics', 'WordPress'],
  },
  {
    family: ['marketing'],
    match: ['product analytics', 'web analytics', 'analytics', 'business intelligence', 'dashboards', 'attribution', 'martech'],
    one: 'analytics platform', many: 'analytics platforms', kind: 'software',
    audiences: ['startups', 'e-commerce stores', 'product teams', 'marketing teams', 'privacy-focused companies'],
    jobs: ['see which marketing channels drive revenue', 'replace Google Analytics with something simpler', 'track user behavior without cookies', 'build dashboards without SQL'],
    features: ['cookieless tracking', 'funnel analysis', 'session replay', 'multi-touch attribution'],
    integrations: ['Shopify', 'HubSpot', 'BigQuery'],
  },
  {
    family: ['hr'],
    match: ['applicant tracking', 'ats', 'recruiting', 'recruitment', 'hiring', 'talent acquisition'],
    one: 'applicant tracking system', many: 'applicant tracking systems', kind: 'software',
    audiences: ['startups', 'high-volume hiring', 'staffing agencies', 'mid-size companies'],
    jobs: ['speed up hiring', 'screen candidates faster', 'organize interview feedback', 'improve candidate experience'],
    features: ['AI resume screening', 'interview scheduling', 'job board posting', 'hiring analytics'],
    integrations: ['LinkedIn', 'Google Calendar', 'Slack'],
  },
  {
    family: ['hr'],
    match: ['payroll', 'hris', 'human resources', 'hr software', 'people ops', 'benefits administration', 'hr'],
    one: 'HR software', many: 'HR platforms', kind: 'software',
    audiences: ['small businesses', 'remote companies', 'companies with international employees', 'growing startups'],
    jobs: ['run payroll for employees in multiple states', 'onboard new hires faster', 'manage PTO and time off', 'hire employees abroad'],
    features: ['built-in payroll', 'performance reviews', 'employee self-service', 'global payroll'],
    integrations: ['QuickBooks', 'Slack', 'Google Workspace'],
  },
  {
    family: ['finance'],
    match: ['accounting', 'bookkeeping', 'invoicing', 'expense management', 'spend management'],
    one: 'accounting software', many: 'accounting tools', kind: 'software',
    audiences: ['small businesses', 'freelancers', 'startups', 'accountants'],
    jobs: ['automate bookkeeping', 'send invoices and get paid faster', 'track business expenses', 'prepare for tax season'],
    features: ['bank feeds', 'receipt scanning', 'multi-currency support', 'automated reconciliation'],
    integrations: ['Stripe', 'Shopify', 'PayPal'],
  },
  {
    family: ['finance'],
    match: ['payment processing', 'payment processor', 'payments platform', 'payments infrastructure', 'payment gateway', 'merchant services', 'online payments'],
    one: 'payment processor', many: 'payment processors', kind: 'service',
    audiences: ['online stores', 'SaaS subscriptions', 'marketplaces', 'small businesses'],
    jobs: ['accept payments online', 'lower credit card processing fees', 'set up subscription billing', 'accept payments internationally'],
    features: ['fraud protection', 'subscription billing', 'low transaction fees', 'fast payouts'],
  },
  {
    family: ['finance'],
    match: ['investing', 'investment', 'brokerage', 'trading', 'robo advisor', 'wealth management'],
    one: 'investing app', many: 'investing apps', kind: 'service',
    audiences: ['beginners', 'long-term investors', 'retirement savings', 'young professionals'],
    jobs: ['start investing with little money', 'build a diversified portfolio', 'invest for retirement', 'lower investment fees'],
    features: ['research tools', 'fractional shares', 'low fees', 'automatic rebalancing'],
  },
  {
    family: ['finance'],
    match: ['bank', 'banking', 'neobank', 'fintech', 'business account', 'savings account'],
    one: 'online bank', many: 'online banks', kind: 'service',
    audiences: ['small businesses', 'freelancers', 'students', 'expats', 'startups'],
    jobs: ['open a business bank account online', 'avoid monthly bank fees', 'send money abroad cheaply', 'earn more interest on my savings'],
    features: ['savings rates', 'no monthly fees', 'free international transfers', 'virtual cards'],
  },
  {
    family: ['finance'],
    match: ['insurance', 'insurtech'],
    one: 'insurance provider', many: 'insurance companies', kind: 'service',
    audiences: ['families', 'young drivers', 'homeowners', 'small businesses'],
    jobs: ['lower my insurance premium', 'compare insurance quotes', 'file a claim quickly', 'choose the right coverage'],
    features: ['claims handling', 'online quotes', 'bundling discounts', 'customer service'],
  },
  {
    family: ['commerce'],
    match: ['e-commerce platform', 'ecommerce platform', 'online store builder', 'store builder', 'website builder', 'headless commerce'],
    one: 'e-commerce platform', many: 'e-commerce platforms', kind: 'software',
    audiences: ['small businesses', 'fashion brands', 'B2B wholesalers', 'dropshipping', 'growing DTC brands'],
    jobs: ['start an online store', 'migrate my store from WooCommerce', 'sell on multiple marketplaces', 'increase online store conversion rates'],
    features: ['built-in payments', 'multi-currency checkout', 'inventory management', 'SEO tools'],
    integrations: ['Stripe', 'Amazon', 'Google Shopping'],
  },
  {
    family: ['travel'],
    match: ['hotel', 'resort', 'hospitality'],
    one: 'hotel chain', many: 'hotel chains', kind: 'service',
    audiences: ['business travelers', 'families', 'couples', 'loyalty program members'],
    jobs: ['get the best hotel rates', 'earn hotel points faster', 'find family-friendly hotels', 'book a last-minute hotel'],
    features: ['loyalty programs', 'free cancellation', 'free breakfast', 'family suites'],
  },
  {
    family: ['travel'],
    match: ['airline', 'flight'],
    one: 'airline', many: 'airlines', kind: 'service',
    audiences: ['long-haul flights', 'business travel', 'budget travelers', 'families'],
    jobs: ['find cheap flights', 'get upgraded to business class', 'earn more frequent flyer miles', 'avoid baggage fees'],
    features: ['legroom', 'free checked bags', 'on-time performance', 'in-flight Wi-Fi'],
  },
  {
    family: ['travel'],
    match: ['travel', 'booking', 'vacation rental', 'tourism', 'trip planning'],
    one: 'travel booking site', many: 'travel booking sites', kind: 'service',
    audiences: ['families', 'budget travelers', 'business trips', 'last-minute trips'],
    jobs: ['plan a trip on a budget', 'find cheap vacation packages', 'compare hotel prices', 'book flights and hotels together'],
    features: ['price match guarantees', 'free cancellation', 'loyalty rewards', 'flexible dates search'],
  },
  {
    family: ['health'],
    match: ['telehealth', 'telemedicine', 'online doctor', 'virtual care'],
    one: 'telehealth service', many: 'telehealth services', kind: 'service',
    audiences: ['people without insurance', 'busy parents', 'mental health support', 'prescription refills'],
    jobs: ['see a doctor online today', 'get a prescription without visiting a clinic', 'find affordable online therapy'],
    features: ['same-day appointments', 'insurance coverage', 'online prescriptions', 'flat-rate pricing'],
  },
  {
    family: ['health'],
    match: ['mental health', 'meditation', 'therapy', 'mindfulness', 'sleep'],
    one: 'mental wellness app', many: 'mental wellness apps', kind: 'software',
    audiences: ['anxiety', 'better sleep', 'beginners', 'busy professionals'],
    jobs: ['reduce stress', 'sleep better', 'build a daily meditation habit', 'find an affordable therapist online'],
    features: ['guided meditations', 'sleep stories', 'licensed therapists', 'mood tracking'],
  },
  {
    family: ['health'],
    match: ['fitness', 'workout', 'gym', 'training app'],
    one: 'fitness app', many: 'fitness apps', kind: 'software',
    audiences: ['beginners', 'home workouts', 'weight loss', 'runners', 'strength training'],
    jobs: ['lose weight without a gym', 'build a consistent workout routine', 'train for a half marathon', 'track my workouts and progress'],
    features: ['personalized training plans', 'Apple Watch integration', 'video workouts', 'nutrition tracking'],
  },
  {
    family: ['health', 'commerce'],
    match: ['supplement', 'vitamin', 'protein', 'nutrition'],
    one: 'supplement brand', many: 'supplement brands', kind: 'consumer',
    audiences: ['women over 40', 'athletes', 'vegans', 'better sleep', 'gut health'],
    jobs: ['choose a high-quality multivitamin', 'support gut health naturally', 'get enough protein on a plant-based diet'],
    features: ['third-party testing', 'clean ingredients', 'subscription discounts', 'clinically studied doses'],
  },
  {
    family: ['health', 'beauty', 'commerce'],
    match: ['skincare', 'skin care', 'beauty', 'cosmetics', 'makeup'],
    one: 'skincare brand', many: 'skincare brands', kind: 'consumer',
    audiences: ['sensitive skin', 'acne-prone skin', 'anti-aging', 'dry skin', 'men'],
    jobs: ['build a simple skincare routine', 'get rid of dark spots', 'find products for sensitive skin'],
    features: ['fragrance-free formulas', 'dermatologist-tested products', 'clean ingredients', 'affordable prices'],
  },
  {
    family: ['health'],
    match: ['wellness', 'health', 'healthcare', 'medical'],
    one: 'health and wellness brand', many: 'health and wellness brands', kind: 'service',
    audiences: ['busy professionals', 'families', 'older adults', 'beginners'],
    jobs: ['build healthier daily habits', 'manage stress better', 'improve my energy levels'],
    features: ['personalized plans', 'expert guidance', 'app tracking', 'affordable memberships'],
  },
  {
    family: ['education'],
    match: ['language learning'],
    one: 'language learning app', many: 'language learning apps', kind: 'software',
    audiences: ['beginners', 'travel', 'business Spanish', 'kids'],
    jobs: ['learn a language fast', 'become conversational in Spanish', 'practice speaking with native speakers'],
    features: ['speaking practice', 'live tutors', 'offline lessons', 'grammar explanations'],
  },
  {
    family: ['education'],
    match: ['lms', 'learning management'],
    one: 'learning management system', many: 'learning management systems', kind: 'software',
    audiences: ['corporate training', 'universities', 'course creators', 'small businesses'],
    jobs: ['train employees online', 'create and sell online courses', 'track compliance training'],
    features: ['course authoring', 'SCORM support', 'certifications', 'mobile learning'],
    integrations: ['Zoom', 'Microsoft Teams', 'Salesforce'],
  },
  {
    family: ['education'],
    match: ['education', 'edtech', 'online course', 'online courses', 'online learning', 'e-learning', 'elearning', 'tutoring', 'bootcamp'],
    one: 'online learning platform', many: 'online learning platforms', kind: 'service',
    audiences: ['career changers', 'professionals', 'students', 'learning to code', 'data science'],
    jobs: ['learn new skills online', 'switch careers into tech', 'get a recognized certificate online', 'learn to code from scratch'],
    features: ['accredited certificates', 'hands-on projects', 'mentor support', 'flexible schedules'],
  },
  {
    family: ['auto'],
    match: ['electric vehicle', 'electric vehicles', 'electric car', 'electric cars', 'electric suv', 'electric suvs', 'ev', 'evs'],
    one: 'electric car', many: 'electric cars', kind: 'consumer',
    audiences: ['families', 'long commutes', 'first-time EV buyers', 'road trips'],
    jobs: ['choose my first electric car', 'charge an EV at home', 'compare EV ranges in winter', 'lower the cost of owning a car'],
    features: ['range', 'fast charging', 'driver assistance', 'resale value'],
  },
  {
    family: ['auto'],
    match: ['automotive', 'car', 'cars', 'vehicle', 'suv', 'truck', 'auto'],
    one: 'car brand', many: 'car brands', kind: 'consumer',
    audiences: ['families', 'reliability', 'first-time buyers', 'commuters', 'off-roading'],
    jobs: ['choose a reliable family car', 'decide between buying and leasing a car', 'find a car with low running costs'],
    features: ['safety ratings', 'low maintenance costs', 'long warranties', 'hybrid options'],
  },
  {
    family: ['electronics', 'commerce'],
    match: ['headphones', 'earbuds', 'headphone'],
    one: 'pair of headphones', many: 'headphones', kind: 'consumer',
    audiences: ['commuting', 'working out', 'working from home', 'audiophiles', 'travel'],
    jobs: ['block out noise on flights', 'find comfortable headphones for all-day calls', 'get great sound on a budget'],
    features: ['active noise cancellation', 'long battery life', 'multipoint Bluetooth', 'spatial audio'],
  },
  {
    family: ['electronics', 'commerce'],
    match: ['laptop', 'notebook computer', 'pc'],
    one: 'laptop', many: 'laptops', kind: 'consumer',
    audiences: ['students', 'programming', 'video editing', 'business travel', 'gaming'],
    jobs: ['pick a laptop for college', 'get a laptop with all-day battery life', 'choose between Mac and Windows'],
    features: ['battery life', 'great keyboards', 'OLED displays', 'lightweight designs'],
  },
  {
    family: ['electronics', 'commerce'],
    match: ['smartphone', 'phone', 'mobile phone'],
    one: 'smartphone', many: 'smartphones', kind: 'consumer',
    audiences: ['photography', 'seniors', 'gaming', 'people on a budget', 'business users'],
    jobs: ['choose a phone with a great camera', 'switch from iPhone to Android', 'get a phone that lasts for years'],
    features: ['cameras', 'long software support', 'battery life', 'fast charging'],
  },
  {
    family: ['electronics', 'commerce'],
    match: ['smartwatch', 'wearable', 'fitness tracker'],
    one: 'smartwatch', many: 'smartwatches', kind: 'consumer',
    audiences: ['runners', 'sleep tracking', 'Android users', 'seniors', 'swimmers'],
    jobs: ['track my sleep accurately', 'monitor my heart health', 'train for a marathon with a watch'],
    features: ['GPS accuracy', 'multi-day battery life', 'health sensors', 'contactless payments'],
  },
  {
    family: ['electronics', 'commerce'],
    match: ['smart home', 'security camera', 'smart speaker', 'router', 'mesh wifi'],
    one: 'smart home device', many: 'smart home devices', kind: 'consumer',
    audiences: ['renters', 'beginners', 'Apple users', 'large homes'],
    jobs: ['set up a smart home on a budget', 'secure my home with cameras', 'get fast Wi-Fi in every room'],
    features: ['Matter support', 'no monthly fees', 'local video storage', 'easy setup'],
  },
  {
    family: ['electronics', 'commerce'],
    match: ['consumer electronics', 'electronics', 'gadget', 'tv', 'camera', 'speaker', 'audio', 'hardware'],
    one: 'consumer electronics brand', many: 'consumer electronics brands', kind: 'consumer',
    audiences: ['reliability', 'value for money', 'home entertainment', 'gift ideas'],
    jobs: ['choose electronics that last', 'find the best value TV', 'build a home theater on a budget'],
    features: ['build quality', 'long warranties', 'customer support', 'software updates'],
  },
  {
    family: ['food', 'commerce'],
    match: ['coffee', 'espresso'],
    one: 'coffee brand', many: 'coffee brands', kind: 'consumer',
    audiences: ['espresso', 'cold brew', 'French press', 'subscriptions', 'decaf drinkers'],
    jobs: ['brew café-quality coffee at home', 'find ethically sourced coffee', 'choose beans for an espresso machine'],
    features: ['single-origin beans', 'fresh roasting', 'subscription delivery', 'fair trade sourcing'],
  },
  {
    family: ['food'],
    match: ['meal kit', 'meal delivery', 'prepared meals'],
    one: 'meal kit service', many: 'meal kit services', kind: 'service',
    audiences: ['families', 'couples', 'weight loss', 'vegetarians', 'busy professionals'],
    jobs: ['eat healthier without meal prepping', 'save time on weeknight dinners', 'cook more at home on a budget'],
    features: ['recipes', 'vegetarian options', 'low prices per serving', 'flexible skipping'],
  },
  {
    family: ['food'],
    match: ['food delivery', 'grocery delivery', 'restaurant delivery'],
    one: 'food delivery app', many: 'food delivery apps', kind: 'service',
    audiences: ['office lunches', 'families', 'late-night orders', 'small towns'],
    jobs: ['save money on food delivery', 'get groceries delivered same day', 'find healthy takeout options'],
    features: ['membership perks', 'low delivery fees', 'fast delivery', 'restaurant selection'],
  },
  {
    family: ['food', 'commerce'],
    match: ['beverage', 'drink', 'energy drink', 'soda', 'juice', 'wine', 'beer', 'spirits', 'tea'],
    one: 'drink brand', many: 'drink brands', kind: 'consumer',
    audiences: ['people cutting sugar', 'parties', 'athletes', 'kids'],
    jobs: ['cut back on sugary drinks', 'find a healthy energy drink', 'pick drinks for a party'],
    features: ['taste', 'low sugar', 'natural ingredients', 'sustainable packaging'],
  },
  {
    family: ['food', 'commerce'],
    match: ['food', 'snack', 'plant based', 'plant-based', 'cpg', 'organic'],
    one: 'food brand', many: 'food brands', kind: 'consumer',
    audiences: ['healthy snacking', 'kids', 'vegans', 'gluten-free diets', 'busy mornings'],
    jobs: ['find healthy snacks for work', 'eat more plant-based protein', 'choose snacks with less sugar'],
    features: ['ingredient lists', 'high protein', 'low sugar', 'sustainable sourcing'],
  },
  {
    family: ['beauty', 'commerce'],
    match: ['fashion', 'apparel', 'clothing', 'shoes', 'sneakers', 'jewelry'],
    one: 'clothing brand', many: 'clothing brands', kind: 'consumer',
    audiences: ['sustainable fashion', 'work wear', 'petite sizes', 'men', 'everyday basics'],
    jobs: ['build a capsule wardrobe', 'find clothes that last', 'shop sustainable fashion on a budget'],
    features: ['sustainable materials', 'free returns', 'inclusive sizing', 'lasting quality'],
  },
  {
    family: ['realestate'],
    match: ['real estate', 'property', 'mortgage', 'proptech', 'rental', 'housing'],
    one: 'real estate platform', many: 'real estate platforms', kind: 'service',
    audiences: ['first-time buyers', 'investors', 'renters', 'sellers'],
    jobs: ['sell my house faster', 'find a rental without a broker', 'get pre-approved for a mortgage', 'estimate my home value'],
    features: ['home value estimates', 'low fees', 'virtual tours', 'mortgage calculators'],
  },
  {
    family: ['commerce'],
    match: ['retail', 'e-commerce', 'ecommerce', 'online store', 'marketplace', 'dtc', 'd2c', 'shop'],
    one: 'online store', many: 'online stores', kind: 'consumer',
    audiences: ['fast shipping', 'gifts', 'bargain hunters', 'sustainable shopping'],
    jobs: ['find trustworthy online stores', 'get the best deals online', 'shop online without getting scammed'],
    features: ['return policies', 'free shipping', 'price matching', 'loyalty rewards'],
  },
  {
    family: ['dev'],
    match: ['developer', 'devops', 'api', 'database', 'hosting', 'observability', 'monitoring', 'ci/cd', 'infrastructure'],
    one: 'developer tool', many: 'developer tools', kind: 'software',
    audiences: ['startups', 'small dev teams', 'enterprise engineering teams', 'open source projects'],
    jobs: ['ship code faster with fewer bugs', 'monitor my production app', 'reduce cloud costs', 'set up CI/CD for a small team'],
    features: ['documentation', 'a generous free tier', 'self-hosting', 'usage-based pricing'],
    integrations: ['GitHub', 'AWS', 'Vercel'],
  },
];

const SOFTWARE_FALLBACK: Omit<Category, 'family' | 'match' | 'one' | 'many'> = {
  kind: 'software',
  audiences: ['small businesses', 'startups', 'enterprise teams', 'agencies', 'remote teams'],
  jobs: ['automate repetitive work', 'replace spreadsheets with a proper tool', 'get my team to adopt new software', 'cut software costs'],
  features: ['AI features', 'a free plan', 'strong security and compliance', 'customer support'],
  integrations: ['Slack', 'Google Workspace', 'Salesforce'],
};

const GENERIC_FALLBACK: Omit<Category, 'family' | 'match' | 'one' | 'many'> = {
  kind: 'service',
  audiences: ['small businesses', 'startups', 'growing companies', 'large companies', 'first-time buyers'],
  jobs: ['choose a trustworthy provider', 'save money without losing quality', 'compare my options quickly', 'switch providers without disruption'],
  features: ['transparent pricing', 'great customer service', 'strong reviews', 'flexible plans'],
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function matches(cat: Category, text: string): boolean {
  return cat.match.some((kw) => new RegExp(`(?:^|[^a-z0-9])${escapeRe(kw)}(?![a-z0-9])`).test(text));
}

function pluralize(noun: string): string {
  if (/(software|hardware|equipment)$/i.test(noun)) return noun;
  if (/(s|x|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

const NOUN_HEADS = 'software|platform|tool|app|application|solution|system|service|marketplace|suite|provider|agency|brand';
const DESC_NOUN = new RegExp(`\\b((?:[a-z0-9-]+ ){0,3}?(?:${NOUN_HEADS}))s?\\b`, 'i');
const LEADING_STOP = new Set(['is', 'are', 'a', 'an', 'the', 'our', 'your', 'its', 'all-in-one', 'leading', 'modern', 'simple', 'powerful',
  'best', 'top', 'new', 'first', 'that', 'which', 'and', 'for', 'of', 'with', 'helps', 'provides', 'offers', 'builds']);

/** "Acme is a leading invoice automation platform for…" -> "invoice automation platform". */
function nounFromText(text: string): string | null {
  const words = DESC_NOUN.exec(text)?.[1]?.toLowerCase().trim().split(/\s+/) ?? [];
  while (words.length && LEADING_STOP.has(words[0] ?? '')) words.shift();
  return words.length >= 2 ? words.join(' ') : null;
}

/**
 * Picks the prompt category. The industry decides the family ("Fintech" -> finance) and the
 * description may refine it within that family ("…accounting software" -> accounting).
 * Without an industry hit, the most specific category matching the description wins.
 */
function resolveCategory(industry: string, description: string): Category {
  const ind = industry.trim().toLowerCase();
  const text = `${ind} ${description.toLowerCase()}`;
  const byIndustry = CATEGORIES.find((c) => matches(c, ind));
  const hit = byIndustry
    ? (CATEGORIES.find((c) => c.family.some((f) => byIndustry.family.includes(f)) && matches(c, text)) ?? byIndustry)
    : CATEGORIES.find((c) => matches(c, text));
  if (hit) return hit;

  const isSoftware = /\b(saas|software|platform|app|tool|cloud|b2b|api|tech)\b/.test(text);
  const base = isSoftware ? SOFTWARE_FALLBACK : GENERIC_FALLBACK;
  const noun = nounFromText(description) ?? nounFromText(ind);
  if (noun) return { family: [], match: [], one: noun, many: pluralize(noun), ...base };
  if (!ind || /^(b2b |b2c )?(saas|software|tech|technology|b2b|internet|it)( software)?$/.test(ind)) {
    return { family: [], match: [], one: 'software tool', many: 'software tools', ...SOFTWARE_FALLBACK };
  }
  if (/(software|platforms?|tools?|apps?|services?|solutions?)$/.test(ind)) {
    const one = ind.replace(/s$/, '');
    return { family: [], match: [], one, many: pluralize(one), ...base };
  }
  return isSoftware
    ? { family: [], match: [], one: `${ind} software`, many: `${ind} software`, ...base }
    : { family: [], match: [], one: `${ind} company`, many: `${ind} companies`, ...base };
}

/** "a CRM", "an HR platform", "an online bank"; mass nouns ("help desk software") get none. */
function article(noun: string): string {
  if (/software$/i.test(noun)) return noun;
  const acronym = /^[A-Z]{2,}/.test(noun);
  const vowel = acronym ? /^[AEFHILMNORSX]/.test(noun) : /^[aeiou]/i.test(noun);
  return `${vowel ? 'an' : 'a'} ${noun}`;
}

const GLOBAL_MARKETS = /^(global|worldwide|international|world|all|any|none|-)?$/i;
const ARTICLE_MARKETS = /^(us|usa|u\.s\.|united states|uk|u\.k\.|united kingdom|uae|netherlands|philippines|czech republic|eu|european union)$/i;

function marketPhrase(market?: string): string | null {
  const m = (market ?? '').trim();
  if (GLOBAL_MARKETS.test(m)) return null;
  if (/^(us|usa|u\.s\.)$/i.test(m)) return 'in the US';
  if (/^(uk|u\.k\.)$/i.test(m)) return 'in the UK';
  if (/^(eu)$/i.test(m)) return 'in the EU';
  return ARTICLE_MARKETS.test(m) ? `in the ${m}` : `in ${m}`;
}

const at = <T>(xs: readonly T[], i: number): T => xs[i % xs.length] as T;

/** Builds 20–30 realistic buyer prompts for a brand, deduplicated and tiered. */
export function promptTemplatesFor(i: { brand: string; industry: string; description?: string; competitors: string[]; market?: string }): PromptInput[] {
  const brand = i.brand.trim();
  const cat = resolveCategory(i.industry ?? '', i.description ?? '');
  const comps = [...new Set(i.competitors.map((c) => c.trim()).filter((c) => c && c.toLowerCase() !== brand.toLowerCase()))];
  const mkt = marketPhrase(i.market);
  const year = new Date().getUTCFullYear();
  const { one, many, audiences: aud, jobs, features: feat } = cat;
  const ints = cat.integrations ?? [];
  const sw = cat.kind === 'software';
  const c = (n: number): string | undefined => comps[n];

  const out: PromptInput[] = [];
  const add = (tier: PromptTier, intent: PromptIntent, topic: string, text: string | null | undefined) => {
    if (text) out.push({ text, topic, tier, intent, active: true });
  };

  // ---- must_win: the head terms a brand has to own
  add('must_win', 'discovery', 'Best-of lists', `What are the best ${many} for ${at(aud, 0)}?`);
  add('must_win', 'discovery', 'Best-of lists', mkt ? `What are the top ${many} ${mkt} right now?` : `What's the best ${one} in ${year}?`);
  add('must_win', 'discovery', 'Recommendations', `Which ${one} would you recommend for ${at(aud, 1)}?`);
  add('must_win', 'comparison', 'Comparisons', c(0) ? `${brand} vs ${c(0)}: which is better for ${at(aud, 1)}?` : `Is ${brand} better than other ${many}?`);
  add('must_win', 'alternatives', 'Alternatives', `What are the best alternatives to ${c(0) ?? brand}?`);
  add('must_win', 'comparison', 'Comparisons', c(1) ? `Compare ${brand}, ${c(0)} and ${c(1)} for ${at(aud, 0)}` : c(0) ? `${c(0)} or ${brand} — which should I pick?` : null);

  // ---- core: category, use-case, pricing and integration coverage
  add('core', 'discovery', 'Best-of lists', `best ${one} for ${at(aud, 2)}`);
  add('core', 'discovery', 'Features', `Which ${many} have the best ${at(feat, 0)}?`);
  add('core', 'discovery', 'Features', `Top ${many} with ${at(feat, 1)}`);
  add('core', 'comparison', 'Comparisons', c(0) && c(1) ? `${c(0)} vs ${c(1)} — pros and cons?` : null);
  add('core', 'comparison', 'Pricing', c(1) || c(0) ? `${brand} or ${c(1) ?? c(0)}? Pricing and features compared` : null);
  add('core', 'alternatives', 'Pricing', c(1) ? `Cheaper alternatives to ${c(1)}` : c(0) ? `Cheaper alternatives to ${c(0)}` : null);
  add('core', 'alternatives', 'Alternatives', c(2) ? `Is there a better option than ${c(2)} for ${at(aud, 0)}?` : null);
  add('core', 'discovery', sw ? 'Integrations' : 'Pricing',
    sw && ints.length >= 2 ? `Which ${one} integrates best with ${at(ints, 0)} and ${at(ints, 1)}?` : `Which ${many} offer the best value for money?`);
  add('core', 'discovery', 'Pricing', `Most affordable ${many} for ${at(aud, 3)}${mkt ? ` ${mkt}` : ''}`);
  add('core', 'how_to', 'Buying guides', `How do I choose the right ${one} for ${at(aud, 0)}?`);
  add('core', 'branded', 'Reviews', `Is ${brand} good for ${at(aud, 0)}?`);
  add('core', 'discovery', 'Use cases', `What ${one} is best for ${at(aud, 4)} on a budget?`);

  // ---- foundational: problem-led, educational and branded long tail
  add('foundational', 'how_to', 'Use cases', `How can I ${at(jobs, 0)}?`);
  add('foundational', 'how_to', 'Use cases', `What's the easiest way to ${at(jobs, 1)}?`);
  add('foundational', 'how_to', 'Use cases', `Any tips to ${at(jobs, 2)}?`);
  add('foundational', 'how_to', 'Features', `What features should I look for in ${article(one)}?`);
  add('foundational', 'branded', 'Reviews', `${brand} reviews: what do users like and dislike?`);
  add('foundational', 'branded', 'Pricing', sw ? `How much does ${brand} cost per month?` : cat.kind === 'service' ? `Is ${brand} worth it?` : `Is ${brand} worth the price?`);
  add('foundational', 'branded', sw ? 'Integrations' : 'Availability',
    sw && ints.length >= 3
      ? `Does ${brand} integrate with ${at(ints, 2)}?`
      : cat.kind === 'service'
        ? mkt ? `Is ${brand} available ${mkt}?` : `How do I get started with ${brand}?`
        : `Where can I buy ${brand}${mkt ? ` ${mkt}` : ''}?`);
  add('foundational', 'branded', 'Reviews', `What are the downsides of ${brand}?`);
  add('foundational', 'discovery', 'Pricing', sw ? `Is ${article(`free ${one}`)} good enough for ${at(aud, 3)}?` : `Are budget ${many} worth it?`);
  add('foundational', 'comparison', 'Comparisons', c(2) ? `${brand} vs ${c(2)}` : null);
  add('foundational', 'alternatives', 'Alternatives', c(3) ? `${c(3)} alternatives for ${at(aud, 2)}` : null);
  add('foundational', 'how_to', 'Buying guides', mkt ? `What should I know before choosing ${article(one)} ${mkt}?` : null);

  // Top up when few competitors were given, so the set stays within 20–30.
  const extras: [PromptIntent, string, string][] = [
    ['discovery', 'Best-of lists', `${many} for ${at(aud, 1)} compared`],
    sw ? ['how_to', 'Use cases', `How do ${at(aud, 2)} ${at(jobs, 3)}?`] : ['how_to', 'Buying guides', `What mistakes should I avoid when choosing ${article(one)}?`],
    ['discovery', 'Features', `Which ${many} are known for ${at(feat, 2)}?`],
    ['branded', 'Reviews', `What do people say about ${brand} on Reddit?`],
  ];
  for (const [intent, topic, text] of extras) if (out.length < 24) add('foundational', intent, topic, text);

  const seen = new Set<string>();
  return out
    .filter((p) => {
      const key = p.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}
