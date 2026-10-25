# ai visibility — UI & marketing copy

> Source of truth for every word in the product and on the landing page.
> The code version is `web/src/content/copy.ts` (`import { copy, fmt, plural, ordinal } from '@/content/copy'`). This file mirrors it for review. If the two ever disagree, `copy.ts` is what ships; change it there first, then update this file.
> Voice rules come from `brand/ai/BRAND.md` §11 (the ai tool family guide; the old Overt guide is retired in `brand/retired/overt/`). When this file and the guide disagree, the guide wins.

**Reading this doc**
- `{name}` marks a value filled in at runtime. Numbers arrive pre-formatted per brand/retired/overt/BRAND.md §4: `42`, `38%`, `4.2%`, `+6 pts`, `−3 pts`, `#2.4`, `12.5k`, `—` for no prior data.
- `one` / `other` pairs are singular and plural forms.
- Enum labels are keyed by the exact values in `shared/types.ts` (`must_win`, `third_party`, `user_fetch`…).

---

## 1. Voice in practice

Direct, exact, calm, on your side. Before you ship a string, check it against these.

**Rules at a glance**
1. Number first, then meaning, then action.
2. Name names: engines, competitors, crawlers, pages.
3. Headlines six words or fewer, sentence case, no trailing period. Page titles are nouns.
4. Buttons are verb + object: "Run check", "Approve draft". Never "Submit", "OK" or "Click here".
5. Actions are offers. The agent drafts; a person approves. Never "auto".
6. Empty states say what's missing, why it matters and the one action that fixes it.
7. Errors say what happened, don't blame, and give the way out. Codes go in a detail line.
8. Banned: revolutionary, unlock, supercharge, leverage, seamless, magic, AI-powered, "Oops!", emoji.
9. Hedge claims about third parties ("tends to", "can"), never claims about ai visibility’s own numbers.
10. Simulated data is always badged **Simulated**. Neutral, not alarming.
11. Typographic punctuation: apostrophes ’, quotes “ ”, ellipsis …, ranges with an en dash (20–30), negative deltas with a true minus (−3 pts).
12. No “we”, “us” or “our”. Say what the product does (“ai visibility tracks…”, “Every answer is searched for it”); the maker is Analitik İşler (`brand/ai/BRAND.md` §11).

**Ten rewrites**

| # | Before | After | Why |
|---|---|---|---|
| 1 | Your brand's AI visibility metrics have improved significantly! | Visibility 42 (+6 pts). You now appear in 4 of 10 answers. | Number first, then what it means. No exclamation marks. |
| 2 | SoV: 38.00% (↑) | Share of voice 38% · +4 pts vs prior 30 days | Full metric name, no decimals above 10%, deltas in points with a comparison. |
| 3 | Submit | Create project | Verb + object. Say what the button does. |
| 4 | Leverage AI-powered insights to unlock your brand's full potential. | See why Acme gets named instead of you. | No hype words. A concrete outcome. |
| 5 | A competitor is outperforming you in some areas. | Acme beats you on 7 must-win prompts. | Name the competitor, count the loss, say where. |
| 6 | No data available. | No answers yet. Run your first check to see where ChatGPT, Claude and Gemini mention you. **Run check** | What's missing, why it matters, one action. |
| 7 | Auto-publish optimized content | Draft FAQ page → "Draft ready. Review it before it goes anywhere." | The agent drafts, you decide. Nothing goes live without you. |
| 8 | Our advanced crawler intelligence detected bot activity. | GPTBot read 212 pages. It never reached /pricing. | Name the crawler, give the count, point at the gap. |
| 9 | Sentiment: 0.43 | Sentiment 72 · mostly positive | Never show the raw −1..1. Use the 0–100 KPI and a word. |
| 10 | Error 401: Unauthorized | Key rejected by OpenAI. Paste a new key in Settings. | Plain words, no blame, the way out. Code goes in the detail line. |

---

## 2. Landing page (`/`)

**Page title:** ai visibility · Be the answer.  
**Meta description:** See how ChatGPT, Claude, Gemini and Perplexity describe your brand, why competitors get picked instead, and what to fix.

### Hero

*AI visibility for marketing teams*

# Be the answer when buyers ask AI

ai visibility shows how ChatGPT, Claude, Gemini and Perplexity describe your brand, why competitors get picked instead, and what to fix. You approve every change.

**[Open the demo]** → `/app` · **[Start tracking]** → `/app/new`

<small>Runs without API keys on simulated data. Add a key to track live answers.</small>

**Hero example card** (Example answer. Brands are fictional.) — Perplexity, prompt: "What’s the best CRM for a 10-person sales team?"

> For a small team, three options come up most: ==Acme==, Northwind and Globex. Acme is the quickest to set up and has the clearest pricing.

Brand marking on **Acme** (tinted ground and brand-blue underline, BRAND §10.7). Chip: `Visibility 42 · +6 pts`

### Engine strip

Tracks answers from: ChatGPT · Claude · Gemini · Perplexity · Grok · DeepSeek

### Problem

*The shift*

**Buyers now ask AI first**

A growing share of product research starts in an AI assistant. It names two or three options. If you aren’t one of them, you’re off the shortlist, and your analytics won’t show it.

- **No rank to check.** Answers change by engine, by day and by wording. There is no position 1 to track.
- **No click to count.** Many AI answers never send a visit, so the loss doesn’t show up in your traffic.
- **No obvious fix.** SEO tools report rankings. They don’t tell you why an assistant recommends someone else.

### Modules

#### Monitor `#monitor`

**See where you stand**

Track the questions your buyers ask across six AI assistants. Get one visibility score, your share of voice against named competitors, your average position and sentiment.

- Every number links to the answers behind it
- Breakdowns by engine, prompt and tier
- The sources each assistant cites, sorted by owner

Proof line: *Every number links to the answers behind it.*

#### Diagnose `#diagnose`

**Know why you lose**

ai visibility scores you and the leading competitor on five drivers, from content coverage to source authority, and traces each gap to real answers and citations.

- Lost prompts, with the competitor who won each one
- Driver scores per engine
- Evidence you can check, not a black-box grade

Proof line: *Not a guess. The answer, the source, the gap.*

#### Act `#act`

**Fix it, with you in control**

Get fixes ranked by impact and effort. The agent drafts the work: llms.txt, comparison pages, FAQ pages, schema, outreach emails. You review and approve.

- Drafts you edit, approve, copy or download
- A weekly brief your CMO will actually read
- Nothing goes live without you

Proof line: *Nothing goes live without you.*

#### AI crawlers `#crawlers`

**See which AI reads your site**

Know when GPTBot, ClaudeBot, PerplexityBot and 50+ other AI agents visit, what they read and what they never reach. Then see who arrives from AI answers.

- Agents grouped by operator and purpose
- Pages read, pages missed, response codes
- Visitors from ChatGPT, Perplexity, Gemini and more

Proof line: *GPTBot read 212 pages. It never reached /pricing.*

#### AI readiness `#readiness`

**Make your site easy to cite**

One audit checks what AI crawlers need: robots.txt rules per AI agent, llms.txt, structured data, meta tags and server-rendered content.

- 20+ checks, each with a plain-language fix
- Which AI crawlers your robots.txt allows or blocks
- Missing files drafted for you to approve

Proof line: *Every failed check comes with the fix.*

### How it works

*How it works* — **From first check to first fix**

1. **Add your brand.** Enter your website and competitors. ai visibility suggests the prompts your buyers are likely to ask.
2. **Run the check.** ai visibility asks each AI assistant every prompt on your schedule and records every mention, position and citation.
3. **Fix what matters.** Work through ranked fixes, approve agent drafts and share the weekly brief.

### Stats band

Product facts only. No customer numbers until there are real, approved ones.

| Value | Label |
|---|---|
| 6 | AI assistants tracked |
| 50+ | AI crawlers and agents recognized |
| 20+ | AI readiness checks |
| 0 | changes published without your approval |

### FAQ

**How do you measure AI visibility?**  
ai visibility sends your tracked prompts to each AI assistant and reads the answers. Visibility is the share of answers that mention you. Share of voice compares your mentions with your competitors’. Position is the order you’re named in, and sentiment is the tone around each mention. Every number links back to the answers.

**What’s the difference between live and simulated mode?**  
Live mode calls each engine’s API with your key, with web search on where the engine offers it, and records the real answer. Without a key, an engine runs in simulated mode: realistic sample answers so you can explore every screen. Simulated data is always labelled. Add a key and that engine goes live on the next check.

**Which AI assistants do you track?**  
ChatGPT, Claude, Gemini, Perplexity, Grok and DeepSeek. Pick any mix per project. For AI traffic, ai visibility also recognizes visitors from Microsoft Copilot, Meta AI and other assistants.

**Are API results the same as what people see in the apps?**  
Close, not identical. Consumer apps add personalization, memory and their own settings. Tracking the same prompts over time through the API gives you a consistent baseline, which is what trends need.

**What crawler data do you collect, and who sees it?**  
Only hits from known AI agents and AI referrals are stored. Everything else is dropped on arrival. For crawler visits, the time, page, status code, user agent and IP are kept. The referral script sets no cookies, and visitor IPs from it are not stored. The data stays in your project and is used only for your reports.

**Does the agent publish anything on its own?**  
No. The agent writes drafts: llms.txt, comparison pages, FAQ pages, schema markup, robots.txt rules and outreach emails. Each one waits as a draft until a person reviews it. You approve it, then copy or download it and ship it yourself. ai visibility never edits your site or sends email for you.

**How is this different from SEO tools?**  
SEO tools track rankings and clicks on search results pages. AI assistants write one answer, name a few brands and cite a few sources. ai visibility measures that answer: who’s named, in what order, in what tone and from which sources, plus the AI crawler visits behind it. Most teams use both.

**How often do you check?**  
Daily, weekly or whenever you press Run check, set per project. Answers vary from day to day, so reports show trends across checks rather than reading too much into a single answer.

### Final CTA

**See what AI says about you**

Open the demo in one click, or add your brand and run your first check.

**[Open the demo]** → `/app` · **[Start tracking]** → `/app/new`

### Footer

Tagline: *Be the answer.*

- **Product:** Monitor (`#monitor`), Diagnose (`#diagnose`), Act (`#act`), AI crawlers (`#crawlers`), AI readiness (`#readiness`)
- **Get started:** Open the demo (`/app`), Start tracking (`/app/new`), FAQ (`#faq`)

Disclaimer: ai visibility is not affiliated with OpenAI, Anthropic, Google, Perplexity, xAI or DeepSeek. Product names are trademarks of their owners.  
Copyright: © {year} Analitik İşler

Landing nav: Product · How it works · FAQ · Open the demo

---

## 3. App shell

**ai visibility** — Be the answer.

### Badges

| Key | Copy |
|---|---|
| `simulated` | Simulated |
| `simulatedTooltip` | Generated sample answers. Add an API key in Settings to track live. |
| `live` | Live |
| `liveTooltip` | Real answers from {engine}, run with your API key. |
| `demo` | Demo |
| `demoTooltip` | Sample brand with simulated data. Safe to explore and edit. |
| `draft` | Draft |
| `draftTooltip` | Written by the agent. Nothing happens until you approve it. |
| `new` | New |
| `you` | You |

### Simulated & demo banners

| Key | Copy |
|---|---|
| `simulatedBanner.short` | Simulated data. Add an API key to go live. |
| `simulatedBanner.allTitle` | Simulated data |
| `simulatedBanner.allBody` | Every engine is showing generated sample answers. Add an API key to track live answers. |
| `simulatedBanner.partialTitle` | Some engines are simulated |
| `simulatedBanner.partialBody` | {simulated} of {total} engines show sample answers. Add their keys to track them live. |
| `simulatedBanner.cta` | Add API key |
| `simulatedBanner.dismiss` | Hide for now |
| `demoBanner.title` | Demo project |
| `demoBanner.body` | A sample brand with 30 days of simulated answers, so you can explore every screen. |
| `demoBanner.cta` | Start tracking your brand |

### Run check button

One button, five states: idle → queued → running → completed / partial / failed.

| Key | Copy |
|---|---|
| `idle` | Run check |
| `queued` | Starting check… |
| `running` | Checking {done}/{total} |
| `runningTooltip` | Sending {prompts} prompts to {engines} engines. You can keep working. |
| `completed` | Check complete |
| `completedDetail` | {count} new answers. Scores are up to date. |
| `partial` | Check finished with gaps |
| `partialDetail` | {failed} of {total} answers didn’t come back. Scores use the rest. |
| `failed` | Check failed |
| `failedDetail` | No answers came back. {error} |
| `retry` | Retry check |
| `alreadyRunning` | A check is already running. |
| `noPrompts` | Add a prompt before you run a check. |
| `noEngines` | Pick at least one engine in Project settings. |
| `lastRun` | Last check {time} |
| `neverRun` | Not checked yet |
| `nextRun` | Next check {time} |

### Errors

| Key | Copy |
|---|---|
| `generic.title` | Couldn’t load this page |
| `generic.body` | The server didn’t answer in time. Check your connection, then try again. |
| `generic.cta` | Try again |
| `notFound.title` | Page not found |
| `notFound.body` | This link may be out of date. Your projects are still here. |
| `notFound.cta` | Go to projects |
| `projectNotFound.title` | Project not found |
| `projectNotFound.body` | It may have been deleted. Pick another project or start a new one. |
| `projectNotFound.cta` | Go to projects |
| `server` | Couldn’t reach the ai visibility server. Check it’s running, then retry. |
| `saveFailed` | Couldn’t save. Your changes are still here. Try again. |
| `deleteFailed` | Couldn’t delete {name}. Nothing was removed. Try again. |
| `validation` | Check the highlighted fields. |
| `engineUnreachable` | Couldn’t reach {host}. The next check tries again. Your other engines are unaffected. |
| `keyRejected` | Key rejected by {vendor}. Paste a new key in Settings. |
| `rateLimited` | {vendor} is rate-limiting requests. Requests are paused and will retry shortly. |
| `urlTimeout` | That URL didn’t load (timeout after {seconds}s). Check it’s public, then try again. |
| `detail` | Details: {detail} |

### Loading, offline, toasts, theme

| Key | Copy |
|---|---|
| `loading.default` | Loading… |
| `loading.page` | Loading {page}… |
| `loading.saving` | Saving… |
| `loading.deleting` | Deleting… |
| `offline.banner` | You’re offline. Showing the last data loaded. |
| `offline.back` | Back online. |
| `toasts.saved` | Saved. |
| `toasts.copied` | Copied to clipboard. |
| `toasts.deleted` | {name} deleted. |
| `toasts.downloaded` | {file} downloaded. |
| `theme.label` | Theme |
| `theme.light` | Light |
| `theme.dark` | Dark |
| `theme.system` | System |

### Common words

| Key | Copy |
|---|---|
| `save` | Save changes |
| `saving` | Saving… |
| `cancel` | Cancel |
| `close` | Close |
| `back` | Back |
| `continue` | Continue |
| `edit` | Edit |
| `remove` | Remove |
| `delete` | Delete |
| `retry` | Try again |
| `copy` | Copy |
| `copied` | Copied |
| `download` | Download |
| `exportCsv` | Export CSV |
| `viewAsTable` | View as table |
| `viewAsChart` | View as chart |
| `search` | Search |
| `clearFilters` | Clear filters |
| `showAll` | Show all |
| `showLess` | Show less |
| `showMore` | Show {count} more |
| `learnMore` | Learn more |
| `open` | Open |
| `optional` | Optional |
| `required` | Required |
| `none` | None |
| `unknown` | Unknown |
| `noValue` | — |
| `and` | and |
| `of` | of |
| `pagination.range` | {from}–{to} of {total} |
| `pagination.previous` | Previous |
| `pagination.next` | Next |
| `unsaved.title` | Discard changes? |
| `unsaved.body` | You have edits that aren’t saved yet. |
| `unsaved.confirm` | Discard changes |
| `unsaved.cancel` | Keep editing |

### Filters

| Key | Copy |
|---|---|
| `range.label` | Period |
| `range.lastDays` | Last {days} days |
| `range.options.7` | Last 7 days |
| `range.options.14` | Last 14 days |
| `range.options.30` | Last 30 days |
| `range.options.90` | Last 90 days |
| `engine.label` | Engine |
| `engine.all` | All engines |
| `tier.label` | Tier |
| `tier.all` | All tiers |
| `intent.label` | Intent |
| `intent.all` | All intents |
| `vsPrior` | vs prior {days} days |
| `noPrior` | No prior period to compare |

### Metric labels

| Key | Copy |
|---|---|
| `visibilityScore` | Visibility score |
| `visibility` | Visibility |
| `shareOfVoice` | Share of voice |
| `avgPosition` | Average position |
| `avgPositionShort` | Avg. position |
| `sentiment` | Sentiment |
| `mentions` | Mentions |
| `citations` | Citations |
| `answers` | Answers |
| `prompts` | Prompts |
| `rank` | Rank |
| `units.score` | /100 |
| `units.points` | pts |
| `units.positionPrefix` | # |
| `deltaTooltip` | {delta} vs prior {days} days ({previous} before) |
| `deltaNone` | — |
| `deltaNoneTooltip` | No data for the prior period. |
| `positionBetter` | Lower is better |
| `sentimentScale` | 0 negative · 50 neutral · 100 positive |

### Enum labels

Chips, selects and table cells. Keys match `shared/types.ts`.

| Key | Copy |
|---|---|
| `tier.must_win` | Must-win |
| `tier.core` | Core |
| `tier.foundational` | Foundational |
| `intent.discovery` | Discovery |
| `intent.comparison` | Comparison |
| `intent.alternatives` | Alternatives |
| `intent.how_to` | How-to |
| `intent.branded` | Branded |
| `schedule.manual` | Manual |
| `schedule.daily` | Daily |
| `schedule.weekly` | Weekly |
| `sentiment.positive` | Positive |
| `sentiment.neutral` | Neutral |
| `sentiment.negative` | Negative |
| `sourceType.own` | Yours |
| `sourceType.competitor` | Competitor |
| `sourceType.third_party` | Third-party |
| `mode.live` | Live |
| `mode.simulated` | Simulated |
| `runStatus.queued` | Queued |
| `runStatus.running` | Running |
| `runStatus.completed` | Completed |
| `runStatus.failed` | Failed |
| `runTrigger.manual` | Manual |
| `runTrigger.scheduled` | Scheduled |
| `runTrigger.seed` | Demo data |
| `driver.content_coverage` | Content coverage |
| `driver.content_quality` | Content quality |
| `driver.source_authority` | Source authority |
| `driver.technical_readiness` | Technical readiness |
| `driver.sentiment` | Sentiment |
| `agentCategory.training` | Training |
| `agentCategory.search` | AI search |
| `agentCategory.user_fetch` | User fetch |
| `agentCategory.agent` | Agent |
| `agentCategory.search_engine` | Search engine |
| `agentCategory.seo_tool` | SEO tool |
| `checkStatus.pass` | Pass |
| `checkStatus.warn` | Needs work |
| `checkStatus.fail` | Fail |
| `checkStatus.info` | Info |
| `auditGroup.crawlability` | Crawlability |
| `auditGroup.content` | Content |
| `auditGroup.structured_data` | Structured data |
| `auditGroup.ai_files` | AI files |
| `auditGroup.performance` | Performance |
| `robotsRule.allowed` | Allowed |
| `robotsRule.blocked` | Blocked |
| `robotsRule.partial` | Partly blocked |
| `robotsRule.unspecified` | No rule (allowed) |
| `suggestionMode.llm` | Suggested by AI |
| `suggestionMode.heuristic` | Suggested from templates |

---

## 4. Navigation

- **Monitor** — Overview · Prompts · Competitors · Sources · Answers
- **Improve** — Diagnose · Actions · Reports
- **Your site** — AI crawlers · AI traffic · AI readiness · Integrations
- **Settings** — Project settings · Workspace settings

| Key | Copy |
|---|---|
| `project.switch` | Switch project |
| `project.all` | All projects |
| `project.new` | New project |
| `skipToContent` | Skip to content |
| `openMenu` | Open menu |
| `closeMenu` | Close menu |
| `collapse` | Collapse sidebar |
| `expand` | Expand sidebar |

---

## 5. Pages

Each page: title, the question it answers, its empty state, then every other string.

### Projects `/app`

*Each project tracks one brand across AI assistants.*

**Empty state** — **No projects yet.** Add your brand to start tracking, or open a demo project with 30 days of sample data. **[Start tracking]**

| Key | Copy |
|---|---|
| `newProject` | New project |
| `openDemo` | Open demo project |
| `seedingDemo` | Building demo project… |
| `demoReady` | Demo project ready. |
| `card.prompts.one` | 1 prompt |
| `card.prompts.other` | {count} prompts |
| `card.competitors.one` | 1 competitor |
| `card.competitors.other` | {count} competitors |
| `card.engines.one` | 1 engine |
| `card.engines.other` | {count} engines |
| `card.lastRun` | Checked {time} |
| `card.neverRun` | Not checked yet |
| `card.visibility` | Visibility {score} |
| `card.open` | Open project |
| `deleteDialog.title` | Delete {name}? |
| `deleteDialog.body` | This removes its prompts, answers, crawler data and drafts. It can’t be undone. |
| `deleteDialog.confirm` | Delete project |
| `deleteDialog.cancel` | Keep project |

### New project `/app/new`

*Four steps to your first check. You can change everything later.*

**Empty state** — **No prompts yet.** Prompts are the questions each AI assistant is asked. Add a few, or start from suggestions. **[Suggest prompts]**

| Key | Copy |
|---|---|
| `progress` | Step {step} of {total} |
| `steps.brand.label` | Brand |
| `steps.brand.title` | Your brand |
| `steps.brand.description` | Who you are, so ai visibility can spot you in AI answers. |
| `steps.competitors.label` | Competitors |
| `steps.competitors.title` | Who you compete with |
| `steps.competitors.description` | How often AI names these brands, and how often instead of you. |
| `steps.prompts.label` | Prompts |
| `steps.prompts.title` | What buyers ask |
| `steps.prompts.description` | The questions each AI assistant is asked. Start with 20–30 a buyer would ask before choosing. |
| `steps.engines.label` | Engines & schedule |
| `steps.engines.title` | Where and how often |
| `steps.engines.description` | Pick the AI assistants to check and how often to check them. |
| `fields.name.label` | Brand name |
| `fields.name.placeholder` | Acme |
| `fields.name.help` | The name buyers use. Every answer is searched for it. |
| `fields.domain.label` | Website |
| `fields.domain.placeholder` | acme.com |
| `fields.domain.help` | Citations to this domain count as your own sources. |
| `fields.aliases.label` | Other names |
| `fields.aliases.placeholder` | Acme CRM, AcmeHQ |
| `fields.aliases.help` | Product names, former names or common misspellings. Press Enter after each one. |
| `fields.description.label` | What you do |
| `fields.description.placeholder` | CRM for small sales teams |
| `fields.description.help` | One or two sentences. Used to suggest competitors and prompts. |
| `fields.industry.label` | Industry |
| `fields.industry.placeholder` | Sales software |
| `fields.industry.help` | Points to the review sites and publications AI is likely to cite for you. |
| `fields.market.label` | Market |
| `fields.market.placeholder` | United States |
| `fields.market.help` | Where your buyers are. Prompts and answers are scoped to this market. |
| `fields.language.label` | Language |
| `fields.language.help` | The language prompts are asked and answers are read in. |
| `fields.competitorName.label` | Competitor name |
| `fields.competitorName.placeholder` | Globex |
| `fields.competitorDomain.label` | Website |
| `fields.competitorDomain.placeholder` | globex.com |
| `fields.competitorAliases.label` | Other names |
| `fields.competitorAliases.placeholder` | Globex Sales Cloud |
| `fields.promptText.label` | Prompt |
| `fields.promptText.placeholder` | What’s the best CRM for a 10-person sales team? |
| `fields.promptText.help` | Write it the way a buyer would type it. No brand names unless the intent is Branded. |
| `fields.promptTier.label` | Tier |
| `fields.promptTier.help` | Must-win prompts are the ones closest to a buying decision. |
| `fields.promptIntent.label` | Intent |
| `fields.promptTopic.label` | Topic |
| `fields.promptTopic.placeholder` | Pricing |
| `fields.engines.label` | Engines |
| `fields.engines.help` | Engines without an API key run in simulated mode until you add one. |
| `fields.schedule.label` | Schedule |
| `fields.schedule.help` | AI answers vary day to day. Regular checks show the trend, not a one-off. |
| `fields.schedule.options.manual` | Manual: run checks yourself |
| `fields.schedule.options.daily` | Daily (recommended) |
| `fields.schedule.options.weekly` | Weekly |
| `fields.runNow.label` | Run the first check now |
| `suggest.details` | Suggest details |
| `suggest.competitors` | Suggest competitors |
| `suggest.prompts` | Suggest prompts |
| `suggest.running` | Suggesting… |
| `suggest.needsBrand` | Add a brand name and website first. |
| `suggest.llmNote` | Suggested by AI from your name, website and description. Check them before you continue. |
| `suggest.heuristicNote` | Suggested from industry templates. Add an API key in Settings for suggestions written for your brand. |
| `suggest.failed` | Couldn’t get suggestions. Fill these in yourself, or try again. |
| `suggest.addAll` | Add all {count} |
| `suggest.added` | Added |
| `competitors.add` | Add competitor |
| `competitors.remove` | Remove {name} |
| `competitors.empty` | No competitors yet. Add the brands buyers compare you with. |
| `competitors.limitNote` | Charts show up to 7 competitors. Any more are grouped as Other. |
| `prompts.add` | Add prompt |
| `prompts.paste` | Paste several |
| `prompts.pasteHelp` | One prompt per line. The tier and intent you pick apply to all of them. |
| `prompts.selected.one` | 1 prompt selected |
| `prompts.selected.other` | {count} prompts selected |
| `prompts.tooMany` | More than 50 prompts makes each check slower. Start with your must-win set. |
| `engines.live` | Live |
| `engines.simulated` | Simulated until you add a key |
| `engines.addKey` | Add key |
| `summary.title` | Ready to create |
| `summary.body` | {prompts} prompts across {engines} engines, checked {schedule}. |
| `summary.scheduleWords.manual` | when you run them |
| `summary.scheduleWords.daily` | daily |
| `summary.scheduleWords.weekly` | weekly |
| `actions.back` | Back |
| `actions.next` | Continue |
| `actions.skip` | Skip for now |
| `actions.create` | Create project |
| `actions.creating` | Creating project… |
| `validation.nameRequired` | Add your brand name. |
| `validation.domainInvalid` | That doesn’t look like a domain. Try acme.com. |
| `validation.promptsRequired` | Add at least one prompt. |
| `validation.enginesRequired` | Pick at least one engine. |
| `validation.duplicate` | You’ve already added this. |

### Overview `/app/p/:id/overview`

*How often AI assistants name you, and who they name instead.*

**Empty state** — **No answers yet.** Run your first check to see where ChatGPT, Claude and Gemini mention you. **[Run check]**

| Key | Copy |
|---|---|
| `sections.kpis` | Key numbers |
| `sections.visibilityTrend` | Visibility over time |
| `sections.sovTrend` | Share of voice over time |
| `sections.leaderboard` | Leaderboard |
| `sections.engines` | By engine |
| `sections.topSources` | Top cited sources |
| `sections.sentiment` | Sentiment of mentions |
| `sections.tiers` | Visibility by tier |
| `sections.lastRun` | Last check |
| `columns.rank` | # |
| `columns.brand` | Brand |
| `columns.engine` | Engine |
| `columns.visibility` | Visibility |
| `columns.shareOfVoice` | Share of voice |
| `columns.position` | Avg. position |
| `columns.sentiment` | Sentiment |
| `columns.mentions` | Mentions |
| `columns.answers` | Answers |
| `columns.tier` | Tier |
| `columns.prompts` | Prompts |
| `insights.behind` | You appear in {visibility} of answers. {leader} leads at {leaderVisibility}. |
| `insights.leading` | You lead. {runnerUp} is next at {runnerUpVisibility}. |
| `insights.bestEngine` | Strongest on {engine} ({visibility}). Weakest on {weakEngine} ({weakVisibility}). |
| `insights.notMentioned` | {engine} hasn’t mentioned you in this period. |
| `insights.lostPrompts.one` | 1 prompt lost to a competitor. |
| `insights.lostPrompts.other` | {count} prompts lost to competitors. |
| `insights.seeLost` | See lost prompts |
| `totals` | {responses} answers · {prompts} prompts · {runs} checks |
| `viewAll` | View all |

### Prompts `/app/p/:id/prompts`

*The questions you track, and where you win or lose each one.*

**Empty state** — **No prompts yet.** Add the questions buyers ask AI before they choose a vendor. **[Add prompt]**

| Key | Copy |
|---|---|
| `filteredEmpty.title` | No prompts match |
| `filteredEmpty.body` | Try another tier or intent, or clear the search. |
| `filteredEmpty.cta` | Clear filters |
| `columns.prompt` | Prompt |
| `columns.tier` | Tier |
| `columns.intent` | Intent |
| `columns.topic` | Topic |
| `columns.visibility` | Visibility |
| `columns.position` | Avg. position |
| `columns.sentiment` | Sentiment |
| `columns.topCompetitor` | Top competitor |
| `columns.byEngine` | By engine |
| `columns.trend` | Trend |
| `columns.answers` | Answers |
| `columns.lastChecked` | Last checked |
| `columns.status` | Status |
| `status.active` | Tracking |
| `status.paused` | Paused |
| `status.winning` | You lead |
| `status.lost` | Lost to {name} |
| `status.notMentioned` | Not mentioned |
| `status.noData` | Not checked yet |
| `actions.add` | Add prompt |
| `actions.addBulk` | Add in bulk |
| `actions.suggest` | Suggest prompts |
| `actions.edit` | Edit prompt |
| `actions.pause` | Pause tracking |
| `actions.resume` | Resume tracking |
| `actions.delete` | Delete prompt |
| `actions.checkSelected` | Check selected |
| `actions.viewAnswers` | View answers |
| `search` | Search prompts |
| `showPaused` | Show paused |
| `selected.one` | 1 selected |
| `selected.other` | {count} selected |
| `dialog.addTitle` | Add prompt |
| `dialog.editTitle` | Edit prompt |
| `dialog.bulkTitle` | Add prompts in bulk |
| `dialog.bulkHelp` | Paste one prompt per line. Each gets the tier and intent you choose below. |
| `dialog.bulkCount.one` | 1 prompt to add |
| `dialog.bulkCount.other` | {count} prompts to add |
| `dialog.save` | Save prompt |
| `dialog.addMany` | Add {count} prompts |
| `deleteDialog.title` | Delete this prompt? |
| `deleteDialog.body` | It won’t be checked again. To keep it for later, pause it instead. |
| `deleteDialog.confirm` | Delete prompt |
| `deleteDialog.cancel` | Keep prompt |
| `detail.title` | Prompt detail |
| `detail.byEngine` | Visibility by engine |
| `detail.recentAnswers` | Recent answers |
| `detail.competitors` | Who gets named |

### Competitors `/app/p/:id/competitors`

*Who AI names alongside you, and how often instead of you.*

**Empty state** — **No competitors yet.** Add the brands buyers compare you with. ai visibility tracks how often AI names them instead of you. **[Add competitor]**

| Key | Copy |
|---|---|
| `columns.rank` | # |
| `columns.name` | Brand |
| `columns.domain` | Website |
| `columns.visibility` | Visibility |
| `columns.shareOfVoice` | Share of voice |
| `columns.position` | Avg. position |
| `columns.sentiment` | Sentiment |
| `columns.mentions` | Mentions |
| `columns.gap` | Gap to you |
| `sections.leaderboard` | Leaderboard |
| `sections.visibilityTrend` | Visibility over time |
| `sections.headToHead` | Head to head |
| `sections.theyWin` | Prompts {name} wins |
| `sections.youWin` | Prompts you win |
| `sections.sources` | Where {name} gets cited |
| `gap.ahead` | {delta} ahead of you |
| `gap.behind` | {delta} behind you |
| `gap.even` | Level with you |
| `actions.add` | Add competitor |
| `actions.edit` | Edit competitor |
| `actions.remove` | Remove competitor |
| `actions.compare` | Compare with you |
| `dialog.addTitle` | Add competitor |
| `dialog.editTitle` | Edit {name} |
| `dialog.save` | Save competitor |
| `removeDialog.title` | Remove {name}? |
| `removeDialog.body` | {name} won’t be tracked in new answers. |
| `removeDialog.confirm` | Remove competitor |
| `removeDialog.cancel` | Keep tracking |
| `colorNote` | Each competitor keeps its color on every chart. |
| `otherBucket` | Other |
| `otherNote` | Charts show your top 7 competitors by share of voice. The rest are grouped as Other. |

### Sources `/app/p/:id/sources`

*The pages AI cites when it answers your prompts, and who owns them.*

**Empty state** — **No citations yet.** Sources show up once AI answers cite web pages. Run a check with an engine that cites, like Perplexity. **[Run check]**

| Key | Copy |
|---|---|
| `tabs.all` | All |
| `tabs.own` | Yours |
| `tabs.competitor` | Competitors |
| `tabs.third_party` | Third-party |
| `sections.byType` | Who gets cited |
| `sections.domains` | Cited domains |
| `sections.gaps` | Cited without you |
| `sections.gapsBody` | These sites are cited often, but the answers that cite them rarely name you. |
| `columns.domain` | Domain |
| `columns.type` | Owner |
| `columns.citations` | Citations |
| `columns.share` | Share of citations |
| `columns.answers` | Answers |
| `columns.prompts` | Prompts |
| `columns.engines` | Engines |
| `columns.brandRate` | You’re named |
| `columns.pages` | Top pages |
| `insights.thirdParty` | Third-party sites make up {share} of citations. Getting covered there often moves visibility fastest. |
| `insights.own` | Your own pages make up {share} of citations. |
| `insights.competitor` | {name} is cited {ratio}× more often than you. |
| `totals` | {count} citations in this period |
| `openPage` | Open page |
| `viewAnswers` | View answers citing this |

### Answers `/app/p/:id/responses`

*Every AI answer collected, with your mentions highlighted.*

**Empty state** — **No answers yet.** Run your first check to see where ChatGPT, Claude and Gemini mention you. **[Run check]**

| Key | Copy |
|---|---|
| `filteredEmpty.title` | No answers match |
| `filteredEmpty.body` | Try another engine or prompt, or clear the filters. |
| `filteredEmpty.cta` | Clear filters |
| `filters.prompt` | Prompt |
| `filters.allPrompts` | All prompts |
| `filters.mentioned` | Mentions |
| `filters.all` | All answers |
| `filters.mentionsYou` | Mentions you |
| `filters.doesNotMention` | Doesn’t mention you |
| `filters.run` | Check |
| `filters.allRuns` | All checks |
| `columns.prompt` | Prompt |
| `columns.engine` | Engine |
| `columns.mentioned` | Named? |
| `columns.position` | Position |
| `columns.sentiment` | Sentiment |
| `columns.citations` | Citations |
| `columns.date` | Date |
| `list.named` | Named {position} |
| `list.notNamed` | Not named |
| `list.citations.one` | 1 citation |
| `list.citations.other` | {count} citations |
| `detail.title` | Answer |
| `detail.prompt` | Prompt |
| `detail.answer` | Answer |
| `detail.mentions` | Brands named |
| `detail.citations` | Sources cited |
| `detail.noCitations` | This answer didn’t cite any sources. |
| `detail.model` | Model |
| `detail.latency` | Response time |
| `detail.collected` | Collected {time} |
| `detail.legend` | Highlighted: you. Underlined: competitors. |
| `detail.brandPosition` | You’re named {position} of {total}. |
| `detail.notMentioned` | You aren’t named in this answer. |
| `detail.mentionContext` | Context |
| `detail.copyAnswer` | Copy answer |
| `detail.openSource` | Open source |
| `detail.prev` | Previous answer |
| `detail.next` | Next answer |
| `detail.error` | {engine} didn’t return an answer. {error} |

### Diagnose `/app/p/:id/diagnose`

*Why competitors get named instead of you, traced to real answers.*

**Empty state** — **Nothing to diagnose yet.** Diagnosis needs at least one completed check. Run one to see your five driver scores. **[Run check]**

| Key | Copy |
|---|---|
| `overall.label` | Overall |
| `overall.vsLeader` | You {score} · {leader} {leaderScore} |
| `sections.drivers` | Five drivers |
| `sections.byEngine` | Drivers by engine |
| `sections.lostPrompts` | Lost prompts |
| `sections.lostPromptsBody` | Prompts where a competitor is named and you aren’t. |
| `driver.you` | You |
| `driver.leader` | Leader |
| `driver.gap` | Gap |
| `driver.leaderLabel` | {name} leads at {score} |
| `driver.youLead` | You lead this driver |
| `driver.evidence` | Evidence |
| `driver.actions` | See actions for this driver |
| `lostColumns.prompt` | Prompt |
| `lostColumns.winner` | Named instead |
| `lostColumns.winnerVisibility` | Their visibility |
| `lostColumns.brandVisibility` | Your visibility |
| `lostEmpty` | No lost prompts in this period. Answers shift week to week, so keep checking. |
| `ctaActions` | See recommended actions |
| `viewAnswers` | View answers |

### Actions `/app/p/:id/actions`

*What to fix first, ranked by impact and effort.*

**Empty state** — **No actions yet.** Actions come from your diagnosis and AI readiness audit. Run a check to get your first list. **[Run check]**

| Key | Copy |
|---|---|
| `tabs.recommended` | Recommended |
| `tabs.drafts` | Drafts |
| `columns.priority` | Priority |
| `columns.action` | Action |
| `columns.category` | Category |
| `columns.impact` | Impact |
| `columns.effort` | Effort |
| `columns.driver` | Driver |
| `columns.status` | Status |
| `filters.status` | Status |
| `filters.category` | Category |
| `filters.allCategories` | All categories |
| `filters.allStatuses` | All statuses |
| `card.why` | Why this matters |
| `card.relatedPrompts.one` | 1 related prompt |
| `card.relatedPrompts.other` | {count} related prompts |
| `card.driver` | Moves {driver} |
| `doneEmpty` | Nothing marked done yet. Finished actions show up here. |
| `allDone.title` | All open actions handled |
| `allDone.body` | New actions appear as fresh answers come in. |
| `draftsEmpty.title` | No drafts yet |
| `draftsEmpty.body` | Pick an action and draft it with the agent. Drafts wait here for your review. |
| `draftsEmpty.cta` | New draft |
| `newDraft` | New draft |
| `newDraftMenu` | What should the agent draft? |

### AI crawlers `/app/p/:id/crawlers`

*Which AI agents read your site, what they read and what they miss.*

**Empty state** — **No AI crawlers seen yet.** Install the snippet or upload a server log to start counting visits. **[Set up tracking]**

| Key | Copy |
|---|---|
| `kpis.visits` | AI crawler visits |
| `kpis.agents` | Agents seen |
| `kpis.pages` | Pages read |
| `kpis.operators` | Operators |
| `sections.trend` | Visits by purpose |
| `sections.byAgent` | Agents |
| `sections.byOperator` | By operator |
| `sections.byCategory` | By purpose |
| `sections.topPages` | Most-read pages |
| `sections.missedPages` | Pages AI never reached |
| `sections.missedPagesBody` | In your sitemap or seen before, but no AI agent fetched them in this period. |
| `sections.newAgents` | New this period |
| `sections.statusCodes` | Response codes |
| `sections.events` | Visit log |
| `columns.agent` | Agent |
| `columns.operator` | Operator |
| `columns.category` | Purpose |
| `columns.visits` | Visits |
| `columns.pages` | Pages |
| `columns.agents` | Agents |
| `columns.lastSeen` | Last seen |
| `columns.firstSeen` | First seen |
| `columns.share` | Share |
| `columns.path` | Page |
| `columns.topAgent` | Top agent |
| `columns.status` | Status |
| `columns.time` | Time |
| `columns.userAgent` | User agent |
| `columns.ip` | IP |
| `columns.verified` | Verified |
| `columns.source` | Source |
| `missedSource.sitemap` | Sitemap |
| `missedSource.known` | Seen before |
| `verified.yes` | Verified |
| `verified.no` | Unverified |
| `verified.yesTooltip` | IP matches the operator’s published ranges for this agent. |
| `verified.noTooltip` | Identified by user agent. IP not confirmed against the operator’s published ranges. |
| `eventSource.ingest` | Server snippet |
| `eventSource.log_upload` | Log upload |
| `eventSource.pixel` | Referral script |
| `eventSource.demo` | Demo data |
| `filters.allAgents` | All agents |
| `filters.allOperators` | All operators |
| `filters.allCategories` | All purposes |
| `alerts.newAgent` | {name} visited for the first time on {date}. |
| `alerts.serverErrors` | {count} AI crawler visits got a server error (5xx). Those pages couldn’t be read. |
| `alerts.notFound` | {count} visits hit missing pages (404). |
| `alerts.neverReached` | {agent} never reached {path}. |
| `upload.button` | Upload server log |
| `upload.title` | Upload a server log |
| `upload.body` | Paste or upload an access log (combined log format). Only AI agent and AI referral hits are kept; everything else is skipped. |
| `upload.placeholder` | Paste log lines here |
| `upload.submit` | Read log |
| `upload.reading` | Reading log… |
| `upload.result` | Read {parsed} lines: {bots} AI crawler visits, {referrals} AI referrals, {skipped} skipped. |
| `upload.nothingFound` | No AI agent or AI referral hits in that log. |

### AI traffic `/app/p/:id/traffic`

*People who click through to your site from AI answers.*

**Empty state** — **No AI referrals yet.** Add the tracking script to count visitors arriving from ChatGPT, Perplexity, Gemini and other assistants. **[Get tracking script]**

| Key | Copy |
|---|---|
| `kpis.visits` | AI referral visits |
| `kpis.sources` | Assistants sending visits |
| `kpis.landingPages` | Landing pages |
| `sections.trend` | Visits by assistant |
| `sections.bySource` | By assistant |
| `sections.topLandingPages` | Top landing pages |
| `columns.source` | Assistant |
| `columns.visits` | Visits |
| `columns.share` | Share |
| `columns.path` | Landing page |
| `columns.topSource` | Top assistant |
| `undercountNote` | Some assistants don’t pass a referrer, so real AI traffic is likely higher than counted here. |

### AI readiness `/app/p/:id/readiness`

*Can AI crawlers reach, read and cite your site?*

**Empty state** — **No audit yet.** Run an audit to check robots.txt, llms.txt, structured data and page content on {domain}. **[Run audit]**

| Key | Copy |
|---|---|
| `run.button` | Run audit |
| `run.rerun` | Run again |
| `run.running` | Auditing {url}… |
| `run.urlLabel` | Page to audit |
| `run.urlHelp` | Defaults to your homepage. Must be publicly reachable. |
| `run.lastRun` | Audited {time} |
| `score` | Readiness score |
| `summary` | {pass} passed · {warn} need work · {fail} failed |
| `sections.checks` | Checks |
| `sections.robots` | AI crawler rules |
| `sections.robotsBody` | What your robots.txt allows each AI agent to do. |
| `sections.llmsTxt` | llms.txt |
| `sections.page` | Page details |
| `sections.history` | Past audits |
| `check.fix` | How to fix |
| `check.draftFix` | Draft fix |
| `robots.columns.agent` | Agent |
| `robots.columns.operator` | Operator |
| `robots.columns.category` | Purpose |
| `robots.columns.rule` | Rule |
| `robots.notFound` | No robots.txt found. Every crawler is allowed by default. |
| `robots.sitemaps.one` | 1 sitemap listed |
| `robots.sitemaps.other` | {count} sitemaps listed |
| `robots.draft` | Draft robots.txt rules |
| `llmsTxt.found` | Found at {url} ({bytes}). |
| `llmsTxt.notFound` | No llms.txt found. It gives AI assistants a short, curated map of your site. |
| `llmsTxt.preview` | Preview |
| `llmsTxt.draft` | Draft llms.txt |
| `page.title` | Title |
| `page.metaDescription` | Meta description |
| `page.h1` | H1 |
| `page.wordCount` | Word count |
| `page.schemaTypes` | Schema types |
| `page.ogTags` | Open Graph tags |
| `page.canonical` | Canonical URL |
| `page.lang` | Language |
| `page.statusCode` | Status code |
| `page.responseMs` | Response time |
| `page.missing` | Missing |
| `historyItem` | Score {score} · {date} |

### Reports `/app/p/:id/reports`

*A weekly brief on your AI visibility, ready to share.*

**Empty state** — **No report yet.** Reports need at least one completed check. Run one, then come back for your brief. **[Run check]**

| Key | Copy |
|---|---|
| `period.label` | Period |
| `period.week` | Last 7 days |
| `period.month` | Last 30 days |
| `actions.print` | Print |
| `actions.savePdf` | Save as PDF |
| `actions.copySummary` | Copy summary |
| `actions.export` | Export data |
| `exports.responses` | Answers (CSV) |
| `exports.mentions` | Mentions (CSV) |
| `exports.citations` | Citations (CSV) |
| `exports.bot_events` | AI crawler visits (CSV) |
| `exports.prompts` | Prompts (CSV) |
| `generated` | Generated {time} |
| `covers` | {from} – {to} |

### Integrations `/app/p/:id/integrations`

*Send AI crawler and AI referral data from your site to ai visibility.*

**Empty state** — **No data received yet.** Pick one method below. The time of the first event shows here as soon as it arrives. **[Copy snippet]**

| Key | Copy |
|---|---|
| `status.receiving` | Receiving data. Last event {time}. |
| `status.waiting` | Waiting for the first event. |
| `sections.pixel` | AI referral script |
| `sections.pixelBody` | Paste before &lt;/head>. It counts visits that arrive from AI assistants. No cookies, about 1 KB. |
| `sections.server` | AI crawler tracking |
| `sections.serverBody` | Most AI crawlers don’t run JavaScript, so their visits have to be sent from your server or edge. |
| `sections.log` | Upload a server log |
| `sections.logBody` | No code changes? Paste an access log and the AI visits are pulled out of it. |
| `sections.api` | Ingest API |
| `sections.apiBody` | POST one event or an array as JSON. Each event needs a user agent. |
| `sections.siteKey` | Site key |
| `sections.siteKeyBody` | Identifies this project. It’s visible in your tracking script and can only send events, not read them. |
| `snippetTabs` | Platform |
| `copy` | Copy snippet |
| `copied` | Copied |
| `sendTest` | Send test event |
| `testSent` | Test event received. |
| `testFailed` | Test event didn’t arrive. Check the ingest URL is reachable from your server. |

### Project settings `/app/p/:id/settings`

*What this project tracks, and how often.*

**Empty state** — **Project not found.** It may have been deleted. Pick another project or start a new one. **[Go to projects]**

| Key | Copy |
|---|---|
| `sections.brand` | Brand |
| `sections.competitors` | Competitors |
| `sections.engines` | Engines |
| `sections.schedule` | Schedule |
| `sections.tracking` | Tracking |
| `sections.danger` | Delete project |
| `enginesHelp` | Engines without an API key run in simulated mode. Keys live in Workspace settings. |
| `dangerBody` | Deletes this project’s prompts, answers, crawler data and drafts. It can’t be undone. |
| `deleteButton` | Delete project |
| `saved` | Project settings saved. |

### Workspace settings `/app/settings`

*API keys and models used by every project.*

**Empty state** — **No API keys yet.** Every engine runs in simulated mode until you add its key. Keys are stored server-side and shown masked. **[Add API key]**

| Key | Copy |
|---|---|
| `sections.keys` | API keys |
| `sections.keysBody` | Add a key and that engine goes live on the next check. |
| `sections.models` | Models |
| `sections.modelsBody` | Override the model used for live checks. Leave blank for the default. |
| `sections.analysis` | Analysis engine |
| `sections.analysisBody` | Writes prompt suggestions and agent drafts. Defaults to the first live engine. |
| `key.label` | {vendor} API key |
| `key.placeholder` | Paste key |
| `key.save` | Save key |
| `key.replace` | Replace key |
| `key.remove` | Remove key |
| `key.saved` | Key saved. {engine} goes live on the next check. |
| `key.removed` | Key removed. {engine} is back in simulated mode. |
| `key.masked` | Saved as {masked} |
| `key.notSet` | Not set |
| `removeDialog.title` | Remove the {vendor} key? |
| `removeDialog.body` | {engine} goes back to simulated mode. Past live answers stay. |
| `removeDialog.confirm` | Remove key |
| `removeDialog.cancel` | Keep key |
| `model.label` | {engine} model |
| `model.placeholder` | Default: {model} |
| `analysis.none` | None: suggestions and drafts use templates |
| `analysis.current` | {engine} is writing suggestions and drafts. |
| `saved` | Workspace settings saved. |

---

## 6. Glossary

Powers tooltips (`short`, ≤ 90 characters) and help panels (`long`). Define a term once, then use it the same way everywhere.

### Metrics

| Term | Tooltip | Help text |
|---|---|---|
| **Visibility score** <br>`metrics.visibilityScore` | Share of AI answers that mention you, from 0 to 100. | The percentage of answers in this period that mention your brand at least once, across the engines and prompts in your filter. Visibility 42 means 42 of every 100 answers name you. It counts whether you are named, not how often or how well. |
| **Share of voice** <br>`metrics.shareOfVoice` | Your mentions as a share of all mentions of you and tracked competitors. | Count every mention of your brand and your tracked competitors across all answers. Share of voice is your part of that total. It shows who dominates the conversation, even on prompts where everyone gets named. |
| **Average position** <br>`metrics.avgPosition` | Where you are named among tracked brands, when you appear. Lower is better. | In each answer that mentions you, ai visibility notes the order in which tracked brands first appear. #1 means you are named first. The average only counts answers that mention you, so read it next to visibility. |
| **Sentiment** <br>`metrics.sentiment` | How favorably answers describe you: 0 negative, 50 neutral, 100 positive. | The text around each mention is scored as positive, neutral or negative and averaged onto a 0–100 scale. Open any answer to see the sentence behind the score. |
| **Mentions** <br>`metrics.mentions` | Answers that named your brand in this period. | Each answer that names you counts once, however many times you appear in it. Use visibility to compare periods with different numbers of answers. |
| **Citations** <br>`metrics.citations` | Times AI answers cited a page on your domain. | A citation is a source an answer links to or credits. This count covers your own domain only. See Sources for competitor and third-party citations. |
| **Change** <br>`metrics.delta` | Difference from the previous period of the same length. | Shares change in points (+6 pts). Counts change in the same unit. A dash means there is no data for the previous period, not zero change. |
| **Overall driver score** <br>`metrics.diagnosisScore` | Your combined score across the five drivers, from 0 to 100. | Rolls up content coverage, content quality, source authority, technical readiness and sentiment. Compare it with the leader, then open the driver with the biggest gap. |
| **Readiness score** <br>`metrics.readinessScore` | How well your site passes AI readiness checks, from 0 to 100. | Each check is weighted by how much it affects whether AI crawlers can reach, read and cite the page. Failed checks cost more than warnings. |

### Concepts

| Term | Tooltip | Help text |
|---|---|---|
| **Prompt** <br>`concepts.prompt` | A question each AI assistant is asked for you, the way a buyer would ask it. | Prompts are the unit of tracking. Each check sends every active prompt to every selected engine and records the answer. Good prompts sound like a buyer, not a marketer. |
| **Answer** <br>`concepts.answer` | One reply from one AI assistant to one prompt. | Each answer is stored in full, with every brand it names in order, the tone around each mention and the sources it cites. Every number in ai visibility links back to answers. |
| **Check** <br>`concepts.check` | One pass that sends every active prompt to every selected engine. | Checks run on your schedule or when you press Run check. Answers vary from day to day, so trends across several checks matter more than any single one. |
| **Lost prompt** <br>`concepts.lostPrompt` | A prompt where a competitor is named and you aren’t. | Lost prompts are where buyers hear about someone else. Diagnose shows who won each one and the sources behind the answer. |
| **Citation** <br>`concepts.citation` | A source an AI answer links to or credits. | Engines that search the web cite the pages they used. Citations show which sites shape the answer, and which ones you need to be on. |
| **You’re named** <br>`concepts.brandMentionRate` | How often answers that cite this source also name you. | A source with many citations and a low rate is a gap: AI trusts it, and it doesn’t talk about you. These are often the best outreach targets. |
| **Verified visit** <br>`concepts.verifiedVisit` | The visit’s IP matches the ranges the operator publishes for that agent. | Anyone can put “GPTBot” in a user agent. Verified visits come from IPs the operator lists. Unverified visits are identified by user agent alone. |
| **Missed pages** <br>`concepts.missedPages` | Pages in your sitemap that no AI agent fetched in this period. | If AI crawlers never read a page, AI answers can’t draw on it. Check robots.txt rules, internal links and whether the page renders without JavaScript. |

### Source types

| Term | Tooltip | Help text |
|---|---|---|
| **Your sources** <br>`sourceTypes.own` | Pages on your own domain that AI answers cite. | Citations to your domain mean AI is quoting you directly. Strong own-source share usually comes from clear comparison, pricing and FAQ pages. |
| **Competitor sources** <br>`sourceTypes.competitor` | Pages on a tracked competitor’s domain that AI answers cite. | When AI cites a competitor’s own pages, it is often repeating their framing. Check which of their pages get cited and whether you have an equivalent. |
| **Third-party sources** <br>`sourceTypes.third_party` | Sites no tracked brand owns: reviews, media, forums, directories. | These often make up most citations. Being listed, reviewed or discussed on them is one of the most direct ways to change what AI says. |

### Prompt tiers

| Term | Tooltip | Help text |
|---|---|---|
| **Must-win prompt** <br>`tiers.must_win` | High-intent questions closest to a purchase, like “best CRM for startups”. | The few prompts that decide shortlists. Losing these costs pipeline. Keep this tier small and watch it first. |
| **Core prompt** <br>`tiers.core` | Everyday category questions buyers ask while they research. | The bulk of your tracking. Core prompts show whether AI treats you as a normal part of the category conversation. |
| **Foundational prompt** <br>`tiers.foundational` | Broad, early questions that build awareness of the category. | Earlier in the journey and less likely to name brands. Useful for spotting which sources and ideas AI associates with the category. |

### Prompt intents

| Term | Tooltip | Help text |
|---|---|---|
| **Discovery** <br>`intents.discovery` | Open questions asking AI to recommend options. “Best CRM for startups”. | The buyer has no shortlist yet. Being named here puts you on it. |
| **Comparison** <br>`intents.comparison` | Head-to-head questions. “Acme vs Globex”. | The buyer is choosing between named options. Comparison pages and fair, specific claims carry weight here. |
| **Alternatives** <br>`intents.alternatives` | Buyers looking to replace a product. “Alternatives to Globex”. | A chance to win a competitor’s unhappy customers. AI tends to lean on review sites and listicles for these. |
| **How-to** <br>`intents.how_to` | Task questions where a product can be part of the answer. | The buyer wants to get something done. Helpful guides and docs earn mentions here even without a sales pitch. |
| **Branded** <br>`intents.branded` | Questions that name you directly. “Is Acme good for small teams?” | Shows how AI describes you when asked by name: accuracy, tone and which sources it trusts about you. |

### Drivers

| Term | Tooltip | Help text |
|---|---|---|
| **Content coverage** <br>`drivers.content_coverage` | Whether you have pages that answer the prompts buyers ask. | How well your site covers the topics in your prompts: comparisons, alternatives, use cases, pricing. Low coverage means AI has nothing of yours to quote, so it quotes someone else. |
| **Content quality** <br>`drivers.content_quality` | How quotable your pages are: specific, current and well structured. | Clear answers, concrete facts, recent dates, headings and lists make a page easy to quote. Thin or vague pages get passed over, even when they rank in search. |
| **Source authority** <br>`drivers.source_authority` | How often trusted third-party sites cite or list you. | AI answers lean on review sites, publications, forums and directories. If those sources name competitors and not you, so will the answer. This compares your third-party presence with the leader’s. |
| **Technical readiness** <br>`drivers.technical_readiness` | Whether AI crawlers can reach, read and understand your site. | Covers robots.txt rules for AI agents, llms.txt, structured data, server-rendered content and response times. Based on your AI readiness audit. |
| **Sentiment** <br>`drivers.sentiment` | How favorably AI describes you, compared with the leader. | Negative or lukewarm framing lowers your odds of being recommended even when you are named. Check which sources the negative answers cite. |

### Engine modes

| Term | Tooltip | Help text |
|---|---|---|
| **Simulated mode** <br>`modes.simulated` | Generated sample answers. Add an API key in Settings to track live. | Without an API key, an engine returns realistic sample answers that are the same every time for the same prompt and day. Use it to explore ai visibility and set up tracking. Simulated data is always badged Simulated. |
| **Live mode** <br>`modes.live` | Real answers from the engine’s API, run with your key. | ai visibility calls each engine’s API, with web search on where the engine offers it, and records the answer and its citations. API answers can differ from the consumer apps, which add personalization and their own settings. |

### AI agent categories

| Term | Tooltip | Help text |
|---|---|---|
| **Training crawlers** <br>`agentCategories.training` | Collect pages to train AI models. GPTBot, ClaudeBot, CCBot. | What they read can shape what models know about you in future versions. Blocking them doesn’t remove you from AI search, which uses separate crawlers. |
| **AI search crawlers** <br>`agentCategories.search` | Build the indexes AI assistants search. OAI-SearchBot, PerplexityBot. | These decide which of your pages AI assistants can find and cite when they search the web. Blocking them usually means fewer citations. |
| **User fetches** <br>`agentCategories.user_fetch` | Fetch a page live because someone asked an assistant about it. | ChatGPT-User, Perplexity-User and Claude-User visit when a person’s question needs your page right now. It is the closest signal to a human reading you through AI. |
| **AI agents** <br>`agentCategories.agent` | Browse and act on websites for a user, such as ChatGPT agent. | Agents click, read and fill in forms the way a person would. Expect more of these as assistants start doing tasks, not just answering. |
| **Search engines** <br>`agentCategories.search_engine` | Classic crawlers like Googlebot and Bingbot. Their indexes feed many AI answers. | Several assistants ground their answers in Google or Bing results, so classic search crawling still matters for AI visibility. |
| **SEO tools** <br>`agentCategories.seo_tool` | Crawlers from SEO and data tools, like AhrefsBot and SemrushBot. | Not AI assistants, but common in logs. They’re shown separately so they don’t inflate your AI crawler counts. |

### Site & files

| Term | Tooltip | Help text |
|---|---|---|
| **AI referral** <br>`site.aiReferral` | A visit from a person who clicked a link in an AI answer. | A visit counts as an AI referral when its referrer or utm_source is a known AI assistant, such as chatgpt.com or perplexity.ai. Some assistants hide the referrer, so the true number is likely higher. |
| **llms.txt** <br>`site.llmsTxt` | A Markdown file at /llms.txt that gives AI a curated map of your site. | A proposed convention: a short summary of who you are plus links to your most useful pages. Not every AI crawler reads it yet, but it is quick to add and easy to keep current. |
| **robots.txt AI rules** <br>`site.robotsAiRules` | Lines in robots.txt that allow or block specific AI crawlers by name. | Each AI operator publishes the user-agent names it obeys, like GPTBot or ClaudeBot. You can block training while allowing AI search. Major operators say their crawlers respect these rules. |
| **Structured data** <br>`site.structuredData` | Schema.org JSON-LD that tells machines what a page is and who it’s about. | Organization, Product and FAQPage markup give crawlers unambiguous facts: your name, what you sell, prices, answers. It helps AI describe you accurately. |
| **Server-rendered content** <br>`site.ssrContent` | Text that is in the HTML before any JavaScript runs. | Most AI crawlers don’t run JavaScript. If your content only appears after scripts load, they may see an empty page. |

---

## 7. Engines

Official product names only. Notes are hedged: they describe tendencies, not guarantees.

| Engine | Vendor | Note |
|---|---|---|
| ChatGPT `chatgpt` | OpenAI | Searches the web for many buying questions and cites the pages it used. |
| Claude `claude` | Anthropic | Searches the web when a question needs it and cites the pages behind its answer. |
| Gemini `gemini` | Google | Grounded in Google Search, so pages that do well on Google tend to get cited. |
| Perplexity `perplexity` | Perplexity | Search-first. Nearly every answer cites live web sources, so fresh pages matter. |
| Grok `grok` | xAI | Can draw on posts from X alongside web results, so social discussion can shape answers. |
| DeepSeek `deepseek` | DeepSeek | Tracked without citations. Answers lean on training data, so long-standing coverage counts. |

Mode labels: `Live · {model}` · `Simulated`

---

## 8. Recommendations & drafts

**Human-in-the-loop line:** Nothing goes live without you. Drafts wait here until you approve, copy or download them.

| Key | Copy |
|---|---|
| `category.content` | Content |
| `category.technical` | Technical |
| `category.sources` | Sources |
| `category.reputation` | Reputation |
| `category.crawlers` | Crawlers |
| `impact.high` | High impact |
| `impact.medium` | Medium impact |
| `impact.low` | Low impact |
| `impactShort.high` | High |
| `impactShort.medium` | Medium |
| `impactShort.low` | Low |
| `effort.low` | Low effort |
| `effort.medium` | Medium effort |
| `effort.high` | High effort |
| `effortShort.low` | Low |
| `effortShort.medium` | Medium |
| `effortShort.high` | High |
| `quickWin` | Quick win |
| `quickWinTooltip` | High impact, low effort. Start here. |
| `status.open` | Open |
| `status.in_progress` | In progress |
| `status.done` | Done |
| `status.dismissed` | Dismissed |
| `statusActions.start` | Start |
| `statusActions.done` | Mark done |
| `statusActions.dismiss` | Dismiss |
| `statusActions.reopen` | Reopen |
| `priority` | Priority {priority} |
| `generate` | Draft with agent |
| `generating` | Drafting… |
| `generated` | Draft ready. Review it before it goes anywhere. |
| `generateFailed` | Couldn’t write the draft. Try again, or start from a template. |
| `viewDraft` | Review draft |
| `humanInLoopShort` | Nothing goes live without you. |

### Drafts

| Key | Copy |
|---|---|
| `kind.llms_txt` | llms.txt |
| `kind.comparison_page` | Comparison page |
| `kind.faq_page` | FAQ page |
| `kind.content_brief` | Content brief |
| `kind.robots_txt` | robots.txt rules |
| `kind.schema_jsonld` | Schema markup |
| `kind.outreach_email` | Outreach email |
| `kindDescription.llms_txt` | A curated map of your site for AI assistants, ready for /llms.txt. |
| `kindDescription.comparison_page` | A fair, specific you-vs-them page for a competitor that beats you. |
| `kindDescription.faq_page` | Answers to the questions buyers ask AI, written to be quoted. |
| `kindDescription.content_brief` | An outline for a page that covers a prompt you lose. |
| `kindDescription.robots_txt` | AI crawler rules that keep your current robots.txt intact. |
| `kindDescription.schema_jsonld` | JSON-LD for Organization, Product or FAQPage. |
| `kindDescription.outreach_email` | A short pitch to a site AI cites often but that doesn’t mention you. |
| `status.draft` | Draft |
| `status.approved` | Approved |
| `status.published` | Published |
| `status.dismissed` | Dismissed |
| `mode.llm` | Written by the agent |
| `mode.template` | From a template |
| `mode.templateNote` | No API key, so this draft uses a template. Add a key in Settings for a draft written for your brand. |
| `columns.title` | Draft |
| `columns.kind` | Type |
| `columns.status` | Status |
| `columns.updated` | Updated |
| `editor.edit` | Edit |
| `editor.preview` | Preview |
| `editor.save` | Save changes |
| `editor.approve` | Approve draft |
| `editor.approved` | Approved. Copy or download it to ship. |
| `editor.copy` | Copy |
| `editor.copied` | Copied |
| `editor.download` | Download {file} |
| `editor.markPublished` | Mark as published |
| `editor.markPublishedHelp` | ai visibility doesn’t change your site. Mark it once you’ve shipped it yourself. |
| `editor.regenerate` | Redraft |
| `editor.dismiss` | Dismiss draft |
| `editor.delete` | Delete draft |
| `editor.approveFirst` | Approve the draft to copy or download it. |
| `editor.emailNote` | ai visibility doesn’t send email. Copy this into your own mail client. |
| `deleteDialog.title` | Delete this draft? |
| `deleteDialog.body` | It can’t be recovered. The action it came from stays open. |
| `deleteDialog.confirm` | Delete draft |
| `deleteDialog.cancel` | Keep draft |

---

## 9. Reports

Headline templates. Pass absolute values for `{delta}` in improving / declining; the verb carries the direction.

| Key | Copy |
|---|---|
| `cover.overline` | AI visibility brief |
| `cover.title` | {brand} |
| `cover.range` | {from} – {to} |
| `headline.improving` | Visibility up {delta} pts to {score}. {brand} now appears in {visibility} of AI answers. |
| `headline.declining` | Visibility down {delta} pts to {score}. {competitor} gained the most ground. |
| `headline.flat` | Visibility steady at {score}. {leader} still leads at {leaderVisibility}. |
| `headline.leading` | Visibility {score}, ahead of every tracked competitor. {runnerUp} is closest at {runnerUpVisibility}. |
| `headline.firstPeriod` | Visibility {score} in your first {days} days of tracking. |
| `subline.engines` | Strongest on {engine} ({visibility}). Weakest on {weakEngine} ({weakVisibility}). |
| `subline.lostPrompts.one` | 1 must-win prompt lost to a competitor. |
| `subline.lostPrompts.other` | {count} must-win prompts lost to competitors. |
| `subline.crawlers` | AI crawlers made {visits} visits, led by {operator}. |
| `sections.summary` | Summary |
| `sections.highlights` | Wins |
| `sections.risks` | Risks |
| `sections.scorecard` | Scorecard |
| `sections.visibilityTrend` | Visibility over time |
| `sections.competitors` | Competitors |
| `sections.engines` | By engine |
| `sections.drivers` | Why competitors win |
| `sections.lostPrompts` | Prompts you lost |
| `sections.actions` | Top actions this week |
| `sections.crawlers` | AI crawlers |
| `sections.methodology` | How this was measured |
| `emptyHighlights` | No clear wins this period. |
| `emptyRisks` | No new risks this period. |
| `methodology` | Based on {responses} answers to {prompts} prompts across {engines} engines, {from} – {to}. |
| `simulatedNote` | Includes simulated answers from engines without an API key. Treat those numbers as illustrative. |
| `footer` | Generated by ai visibility on {date}. Every number links to the answers behind it in the app. |

---

## 10. Claims to keep true

Every factual claim in the copy, and what it rests on. Re-check when the product changes.

| Claim | Where | Basis today |
|---|---|---|
| 6 AI assistants tracked | Landing stats, FAQ | `server/src/engines/catalog.ts` (ChatGPT, Claude, Gemini, Perplexity, Grok, DeepSeek) |
| 50+ AI crawlers and agents recognized | Landing stats, Crawlers module | `server/src/data/ai-agents.ts` (61 entries at time of writing) |
| 20+ AI readiness checks | Readiness module | `server/src/audit/checks.ts` (23 checks at time of writing) |
| 0 changes published without your approval | Landing stats, Act | Drafts never auto-publish; "Published" is a status the user sets. ai visibility never edits the site or sends email. |
| Referral script: no cookies, about 1 KB, no visitor IPs stored | Integrations, FAQ | `server/src/crawlers/pixel.ts` (sessionStorage only, ≤ 1.5 KB) and `/api/collect` (stores `ip: ''`) |
| Crawler visits store time, page, status, user agent and IP | FAQ | `bot_events` columns in `server/src/crawlers/record.ts` |
| Only AI agent and AI referral hits are stored | FAQ, log upload | `recordHits` ignores unclassified hits |
| DeepSeek is tracked without citations | Engines | `supportsCitations: false` in the engine catalog |
| Live mode uses web search where the engine offers it | Glossary, FAQ | `PROVIDERS[engine].search` in `server/src/engines/providers.ts` |
| Demo project has 30 days of sample data | Projects empty state, demo banner | `POST /api/demo/seed` (~30 days history) |

**Before public launch:** legal should review the FAQ answer on crawler data and the trademark disclaimer in the footer. No customer names, logos, testimonials or usage numbers appear anywhere; add them only once they are real and approved.
