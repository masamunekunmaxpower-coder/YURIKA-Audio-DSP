# YURIKA Audio DSP — SEO / indexing checklist

This package already includes:

- localized Japanese / English / Korean pages
- canonical URLs
- reciprocal `hreflang` for `ja`, `en`, `ko`, and `x-default`
- indexable titles and localized meta descriptions
- visible, human-readable search vocabulary and community slang in each language
- JSON-LD `WebSite`, `WebPage`, and `SoftwareApplication` data
- `robots.txt` with sitemap discovery
- multilingual `sitemap.xml` with `lastmod`
- Open Graph / Twitter cards
- 1280×640 social preview image
- crawlable favicon files
- `404.html` set to `noindex,follow`

## Important note about keywords

Google explicitly ignores `<meta name="keywords">` for ranking and indexing. The package keeps a keywords tag for non-Google consumers, but the important phrases are also present naturally in page titles, descriptions, headings, visible text, and structured data.

## Target vocabulary included

### Japanese

トリッカル / トリッカル・もちもちほっぺ大作戦 / DSP / オーディオDSP / 変態的 / 過剰設計 / 魔改造 / ガチ勢 / オーディオ沼 / 玄人向け / ユーチューブ / YouTube / 同人作品 / 二次創作 / 音響システム / Chrome拡張機能 / HRTF / 立体音響 / WebAudio / AudioWorklet / WASM / 仮想アンプ

### English

TRICKCAL / fan work / fan project / audio DSP / audio system / YouTube audio / Chrome extension / HRTF / spatial audio / binaural audio / WebAudio / AudioWorklet / WebAssembly / WASM / virtual amplifier / high fidelity / overengineered / ridiculously overengineered / overkill / audio nerd / power-user / rabbit hole / enthusiast-grade / kitchen-sink DSP

### Korean

트릭컬 / 트릭컬 리바이브 / 트릭컬 2차 창작 / 팬 프로젝트 / DSP / 오디오 DSP / 음향 시스템 / 크롬 확장 프로그램 / Chrome 확장 / 유튜브 / YouTube / HRTF / 공간 음향 / 바이노럴 오디오 / WebAudio / AudioWorklet / WebAssembly / WASM / 가상 앰프 / 미친 과설계 / 마개조 / 오디오 덕후 / 고인물용 / 과몰입 / 풀세팅

The Korean slang is deliberately localized instead of literally translating Japanese `変態的`, because a literal `변태` wording is more likely to be read as sexual/pervert language than “absurdly overengineered.”

## After GitHub Pages is live

Expected site URL:

https://masamunekunmaxpower-coder.github.io/YURIKA-Audio-DSP/

### Google

1. Open Google Search Console: https://search.google.com/search-console/
2. Add the GitHub Pages URL-prefix property.
3. Verify ownership using a supported method available for the property.
4. Open **Sitemaps** and submit:
   `https://masamunekunmaxpower-coder.github.io/YURIKA-Audio-DSP/sitemap.xml`
5. Use **URL Inspection** on the root page plus `ja.html`, `en.html`, and `ko.html`.
6. If each page is indexable, request indexing.

### Bing / Microsoft search

1. Open Bing Webmaster Tools: https://www.bing.com/webmasters/
2. Add/verify the GitHub Pages site.
3. Submit the same `sitemap.xml` under **Sitemaps**.
4. Bing also supports IndexNow for faster change notification, but adding it is optional. A normal sitemap + robots.txt is already present in this package.

## Keep it useful, not spammy

Do not duplicate the same keyword hundreds of times or hide keyword blocks with CSS. The slang/search sections in this package are visible and explained, so they provide actual context instead of keyword stuffing.
