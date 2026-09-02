# Job Feed Syndication

CraftBridge publishes **one** XML job feed for every aggregator we distribute
to, plus a sitemap and per-page `JobPosting` structured data for Google for
Jobs. There is no per-partner export to maintain: the feed emits a superset of
the elements the aggregators read, and each one ignores what it does not
understand.

## URLs

| What | URL | Who uses it |
| --- | --- | --- |
| XML job feed | `https://<api-domain>/feeds/jobs.xml` | Jooble, Jobrapido, Adzuna, Talent.com, Careerjet, Jora |
| Job sitemap | `https://<api-domain>/feeds/jobs-sitemap.xml` | Google Search Console |
| JobPosting JSON-LD | `https://<api-domain>/feeds/jobs/:id/structured-data` | Embedded by the job page for Google for Jobs |
| Syndication status (admin) | `https://<api-domain>/api/feeds/status` | Admin → Job Syndication page |

Every path is also served under `/api` (`/api/feeds/jobs.xml`), because the feed
router is mounted at both prefixes. Submit the `/feeds/...` form to aggregators.

## What the feed contains

Only jobs that are genuinely live:

```
status === "active"  &&  !isDeleted  &&  (no applicationDeadline || applicationDeadline >= now)
```

Closed, suspended, deleted/archived and past-deadline jobs are excluded. The
feed is capped at 5,000 jobs (`FEED_LIMIT` in `routes/feeds.js`).

## Refresh behaviour

The feed is **generated from MongoDB on every request** — there is no cached
file, no cron job and nothing to refresh manually.

| Event | Effect on the feed |
| --- | --- |
| Job created | Appears on the next fetch |
| Job edited | Updated content on the next fetch |
| Job closed / suspended | Dropped on the next fetch |
| Job deleted / archived | Dropped on the next fetch |
| `applicationDeadline` passes | Dropped automatically, no job run required |

`Last-Modified` is the newest `updatedAt` among the syndicated jobs, and
`lastBuildDate`/`ETag` are derived from the same content — so the feed's bytes
change if and only if the syndicated jobs change.

## Caching and compression

- `Cache-Control: public, max-age=900` — aggregators may poll every 15 minutes.
- `ETag` — SHA-1 of the uncompressed XML; conditional `If-None-Match` requests
  get `304 Not Modified`.
- `Last-Modified` — newest job update; `If-Modified-Since` also returns `304`.
- `Content-Encoding: gzip` when the client sends `Accept-Encoding: gzip`
  (roughly 80% smaller), plain XML otherwise. `Vary: Accept-Encoding` is set.
- ETag/Last-Modified always describe the *uncompressed* representation, so a
  crawler that switches between gzip and plain still gets correct 304s.

## Required environment variables

| Variable | Why it matters |
| --- | --- |
| `FRONTEND_URL` | **Must be the public site URL in production.** Every `<url>`, `<applyurl>`, `<link>`, sitemap `<loc>` and JSON-LD `url` is built from it. If it still points at `http://localhost:5173`, aggregators will reject or drop the feed. |
| `MONGO_URI` | Feed source data. |
| `PORT` | Where the feed is served. |

No aggregator credentials are stored in the backend: all six XML partners pull
the public feed URL.

## Aggregator support and platform-specific differences

The feed uses the widely supported `<source>` → `<jobs>` → `<job>` layout and
emits aliases so each partner finds the element name it expects, e.g. the title
is sent as both `<title>` and `<name>`, the URL as `<url>`, `<link>` and
`<applyurl>`, the identifier as `<referencenumber>`, `<id>` and `<ref>`.

| Platform | Format it consumes | Key elements it reads | Onboarding |
| --- | --- | --- | --- |
| **Jooble** | XML feed URL | `name`, `description`, `link`, `company`, `region`, `city`, `salary`, `jobtype`, `pubdate`, `expire`, `id` | Free/organic listing via Jooble's employer XML form; paid CPC needs an account |
| **Jobrapido** | XML feed URL | `title`, `description`, `link`, `company`, `city`, `region`, `country`, `pubdate`, `category`, `contract` | Publisher account + feed review by their integration team |
| **Adzuna** | XML feed URL | `title`, `description`, `url`, `company`, `city`, `region`, `country`, `posted`, `salary_min`, `salary_max`, `contract_type`, `contract_time`, `id` | Free feed submission; Adzuna confirms the mapping after a test crawl |
| **Talent.com** | XML feed URL (`<source>`/`<job>`) | `title`, `date`, `referencenumber`, `url`, `company`, `city`, `state`, `country`, `description`, `jobtype`, `category` | Partner account; organic or CPC. A `<cpc>` element can be added per partner if they ask for bidding |
| **Careerjet** | XML feed URL | `title`, `url`, `company`, `locations`, `description`, `date`, `ref`, `salary`, `jobtype` | Free indexing request through their partner form |
| **Jora** | XML feed URL (`<source>`/`<job>`) | `title`, `date`, `referencenumber`, `url`, `company`, `city`, `state`, `country`, `description`, `salary`, `jobtype` | Partner/feed request; Jora may ask for a per-partner source name |
| **Google for Jobs** | **Not a feed** | `JobPosting` JSON-LD on `/jobs/:id` + sitemap | Verify the domain in Search Console and submit the sitemap |

Differences worth knowing:

- **Google is the odd one out.** It crawls the job *page*, not the XML feed.
  The page embeds the JSON-LD returned by `/feeds/jobs/:id/structured-data`.
  Because that is injected client-side, Google may take longer to pick postings
  up; if Search Console reports missing postings, the fix is server-side
  rendering/prerendering of `/jobs/:id`, not a feed change.
- **Salary is free text in our model** (`"250,000 - 400,000 per month"`). The
  feed derives `salarymin`/`salarymax`/`salaryperiod` and assumes **NGN**. A job
  written as `"Negotiable"` simply carries no structured salary.
- **Location is free text.** `"Ikeja, Lagos, Nigeria"` is split into
  city/state/country; a single-token location (`"Lagos"`) is used as both city
  and state, with `Nigeria` assumed as the country.
- **Employment type** is projected onto three vocabularies:
  schema.org (`employmenttype`), Adzuna/Jobrapido contract fields
  (`contract_type`, `contract_time`) and the raw label (`jobtype`).
- **Partner-specific extras** (a dedicated `<sourcename>` value, `<cpc>` bids,
  a partner-issued feed token in the URL) are requested during onboarding and
  can be added without changing the feed for anyone else.
- Final acceptance always depends on the partner's own crawl/review — the feed
  format is what they publish, but each one confirms the mapping on their side.

## Submission steps

1. **Deploy with `FRONTEND_URL` set to the production site**, then open
   `https://<api-domain>/feeds/jobs.xml` and confirm the job links resolve.
2. **Jooble** — submit the feed URL at jooble.org's employer/XML feed page (or
   through your Jooble account manager) and set the country to Nigeria.
3. **Jobrapido** — request a publisher account, then send the feed URL to their
   integration team for validation.
4. **Adzuna** — submit the feed URL through their "add your jobs" / partner feed
   form; they crawl a sample and confirm the field mapping.
5. **Talent.com** — open a partner account, give them the feed URL and choose
   organic or CPC distribution.
6. **Careerjet** — submit the feed URL through the Careerjet partner/indexing
   request form.
7. **Jora** — send the feed URL to Jora's partner/feeds contact; supply a source
   name if they ask for one.
8. **Google for Jobs** — verify the domain in Google Search Console, submit
   `https://<api-domain>/feeds/jobs-sitemap.xml`, then test a job URL in the
   Rich Results Test.

Aggregators poll the same URL on their own schedule; nothing has to be resubmitted
when jobs change.

## Monitoring

Admin → **Job Syndication** (`/admin/syndication`) shows the feed and sitemap
URLs, how many jobs are currently syndicated, when the feed was last generated,
the compressed/uncompressed size and the XML validation status. It reads
`GET /api/feeds/status` (admin only).

## Validation and tests

`npm test` (backend) builds the feed from fixtures containing `&`, `<`, `>`,
quotes, apostrophes, emoji, a `]]>` CDATA terminator and control characters,
then asserts the output is well-formed:

```bash
cd craftbridge-backend
npm test
```

`utils/xmlValidate.js` is the same checker used by the admin status endpoint, so
"valid" on the admin page means the exact XML being served parses. Text is
emitted inside CDATA, characters XML 1.0 forbids (e.g. `0x00`, `0x0B`, `0x0C`)
are stripped rather than escaped, `]]>` inside a description is split safely,
and recognised elements are omitted entirely when a value is missing instead of
being sent empty.
