# Changelog

## [0.1.7](https://github.com/duyet/aidr/compare/web-v0.1.6...web-v0.1.7) (2026-09-23)


### ✨ Features

* **web:** Algo tab, items volume bars, AI;DR request attribution ([e1b83b3](https://github.com/duyet/aidr/commit/e1b83b394b5f792076c48642cc14044a7455f139))
* **web:** full AnyRouter app attribution for rankings ([c6332b6](https://github.com/duyet/aidr/commit/c6332b600254a29312ba6517e916f32101825e43))
* **web:** regroup pipeline model attribution ([#120](https://github.com/duyet/aidr/issues/120)) ([2171dfa](https://github.com/duyet/aidr/commit/2171dfaf9debb3ea8dd051aa19bfd6f082bbbbf7)), closes [#114](https://github.com/duyet/aidr/issues/114)
* **web:** score stories with typesafe/jev before chat ([#117](https://github.com/duyet/aidr/issues/117)) ([cff9c60](https://github.com/duyet/aidr/commit/cff9c60d2965b93af7f45fb1aff72788d408e6a7)), closes [#113](https://github.com/duyet/aidr/issues/113)
* **web:** score stories with typesafe/jev before chat ([#118](https://github.com/duyet/aidr/issues/118)) ([a809ef0](https://github.com/duyet/aidr/commit/a809ef0a31a29b3bb916afe5b6c640810c0eeead)), closes [#113](https://github.com/duyet/aidr/issues/113)


### 🐛 Bug Fixes

* **deps:** update dependency cn to ^0.4.0 ([#116](https://github.com/duyet/aidr/issues/116)) ([720b962](https://github.com/duyet/aidr/commit/720b9621689455d1f0fee4576782f36ec6555fbe))


### ⚡ Performance

* **web:** client-side SWR cache and deferred loading ([#126](https://github.com/duyet/aidr/issues/126)) ([f060469](https://github.com/duyet/aidr/commit/f06046967634086a83f85109fecd10c084f21340))
* **web:** collapse feed SSR to ~3 D1 round-trips ([#130](https://github.com/duyet/aidr/issues/130)) ([41ed437](https://github.com/duyet/aidr/commit/41ed43760690c0590118f982df47e506b1c1dba2))
* **web:** defer Clerk off the critical path, split vendor chunks ([#132](https://github.com/duyet/aidr/issues/132)) ([4c189f1](https://github.com/duyet/aidr/commit/4c189f1e4e93e4ac936721e830b4b050f8f67ea5))
* **web:** route D1 reads through sessions, strengthen cache headers ([#127](https://github.com/duyet/aidr/issues/127)) ([e3d8f71](https://github.com/duyet/aidr/commit/e3d8f71790405d0ed1ec0d16b570bbbcec128e88))
* **web:** short edge cache on /api/system ([4564fda](https://github.com/duyet/aidr/commit/4564fdaf4a3b7aeae7eda7a01407b7d5c5686248))
* **web:** split /api/system into per-section endpoints, batch D1 reads ([#122](https://github.com/duyet/aidr/issues/122)) ([5a08809](https://github.com/duyet/aidr/commit/5a08809c7097943e1a4b93349d4325a834ca3cac))


### ♻️ Refactoring

* **web:** break down oversized components, extract shared primitives ([#128](https://github.com/duyet/aidr/issues/128)) ([41d4dc4](https://github.com/duyet/aidr/commit/41d4dc4f13c8dc5322f4fa0c509eabb055e5d0ef))
* **web:** decompose remaining oversized components ([#131](https://github.com/duyet/aidr/issues/131)) ([dcb0bb7](https://github.com/duyet/aidr/commit/dcb0bb753c70eb1aa81282e85b49184f43d9a44c))

## [0.1.6](https://github.com/duyet/aidr/compare/web-v0.1.5...web-v0.1.6) (2026-09-22)


### ✨ Features

* **web:** digest email thumbnails, compact rows, keyword highlights ([93e5e8d](https://github.com/duyet/aidr/commit/93e5e8d6fd1e06ec69303a4f1c86ec7e4b3d7e90))
* **web:** fold volume into sources table, add Jev decisions card ([17226a7](https://github.com/duyet/aidr/commit/17226a7c5daeb6fcb0e8816dec134c5ed8be6e66))
* **web:** instant data shell with per-card progressive loading ([a3130cd](https://github.com/duyet/aidr/commit/a3130cddb64490fa08652979feac62859a4a0e51))


### 🐛 Bug Fixes

* **web:** bump wrangler to ^4.135.0 for vite-plugin peer ([19060db](https://github.com/duyet/aidr/commit/19060db47cfdff57ffc62ba54e3bbcd9648a4093))

## [0.1.5](https://github.com/duyet/aidr/compare/web-v0.1.4...web-v0.1.5) (2026-09-19)


### ✨ Features

* **web:** bar charts on data overview, owner ping on new subscribers ([90b59cc](https://github.com/duyet/aidr/commit/90b59cc4cfdc012b6280d59d974aac54a657e864))


### 🐛 Bug Fixes

* **web:** biome import order, sync extension version to 0.1.17 ([d370dff](https://github.com/duyet/aidr/commit/d370dff7088a1d078a37506dade99da9fdb90ad8))
* **web:** redirect favicon.ico to favicon.svg ([0654a33](https://github.com/duyet/aidr/commit/0654a33b61d3145b872d7ade1141e5d83779a073))
* **web:** suppress hydration warnings on relative-time spans ([55919ad](https://github.com/duyet/aidr/commit/55919ad6f26007689ba75d2360ad5f6c5d3ae4c4))

## [0.1.4](https://github.com/duyet/aidr/compare/web-v0.1.3...web-v0.1.4) (2026-09-19)


### ✨ Features

* add Chrome Web Store link to extension page and footer ([#32](https://github.com/duyet/aidr/issues/32)) ([69bbce7](https://github.com/duyet/aidr/commit/69bbce7e5c125f40f603efbdd58ec57ce647bf50))
* **extension:** 0.1.11 digest-first cache paint and campaign telemetry ([888f8d2](https://github.com/duyet/aidr/commit/888f8d24c96d877f94a938e6435c50a8f5bb252a))
* **extension:** 0.1.13 relax AI;DR layout and align header icons ([#44](https://github.com/duyet/aidr/issues/44)) ([0e5a4f8](https://github.com/duyet/aidr/commit/0e5a4f8377c02897b566415e8cef99ea70a632a0))
* **extension:** 0.1.14 hide host/score and fix section tiles ([#46](https://github.com/duyet/aidr/issues/46)) ([d917f6b](https://github.com/duyet/aidr/commit/d917f6bfc94af8d6b9d608fc392b8beaa19861a5))
* **extension:** 0.1.15 reload icon beside updated timestamp ([90004f3](https://github.com/duyet/aidr/commit/90004f337ce40ea7aa7521b9d0fa84406a736ba3))
* **extension:** align new-tab UI with aidr.today web, version 0.1.10 ([#37](https://github.com/duyet/aidr/issues/37)) ([a66bc53](https://github.com/duyet/aidr/commit/a66bc53a60c5f77d2719890fbb006e904108278f))
* **extension:** open AI;DR in a dialog and paint cache first ([416dcf7](https://github.com/duyet/aidr/commit/416dcf7305566bf414ae7ffbef5321c268578362))
* UI contrast tuning, Chrome Web Store link in header, icon-only Submit ([#35](https://github.com/duyet/aidr/issues/35)) ([183c0f1](https://github.com/duyet/aidr/commit/183c0f1f09feadc311b6c85a120a7e0c29143b1b))
* **web:** add llms.txt, match extension UI, and agent submit ([e2c22d7](https://github.com/duyet/aidr/commit/e2c22d7d89571eb250906e8b285565279014964e))
* **web:** branded digest email, deliver tabs, and /data footer ([#38](https://github.com/duyet/aidr/issues/38)) ([fe30042](https://github.com/duyet/aidr/commit/fe3004231ee437c31a6d8f2fb81df5a28ac4bb4d))
* **web:** center AI;DR and reorder section tiles ([#71](https://github.com/duyet/aidr/issues/71)) ([9986796](https://github.com/duyet/aidr/commit/998679615a46f250aa4549c707122763df3163d9))
* **web:** data tabs, token burn, vendor blogs ([2887e3e](https://github.com/duyet/aidr/commit/2887e3ebae38e7486f784531ce650a45398f4829))
* **web:** expand padding, thumb zoom, and email UTM ([#54](https://github.com/duyet/aidr/issues/54)) ([1baffb7](https://github.com/duyet/aidr/commit/1baffb7b576e3837e7912b9ca61b3b1172aeeade))
* **web:** flat expanded panel, larger topics thumb, zoom hover ([9d48543](https://github.com/duyet/aidr/commit/9d48543412316e45876733721d4a633393fffc8f))
* **web:** flatten story permalinks to /:slug ([#83](https://github.com/duyet/aidr/issues/83)) ([f5d525d](https://github.com/duyet/aidr/commit/f5d525d05be6d44c69896f9cb36b8d05328638ad))
* **web:** homepage H1 and richer title/description ([#76](https://github.com/duyet/aidr/issues/76)) ([a54d780](https://github.com/duyet/aidr/commit/a54d780461cd603f50c47d985669ac02d3722cc7))
* **web:** ingest MarketBrief AI hub ([09a8b45](https://github.com/duyet/aidr/commit/09a8b45bb943064587b1b0c90fb514ac435541a9))
* **web:** ingest xAI news, DeepMind, and AWS ML blogs ([#80](https://github.com/duyet/aidr/issues/80)) ([a4f58be](https://github.com/duyet/aidr/commit/a4f58be00df1a2d35aa147b8f077d9e21004b4cf))
* **web:** Jev review gates, 7 new RSS sources, data page upgrades ([8fe5997](https://github.com/duyet/aidr/commit/8fe59975f9f91c778cf3287f05004fcb2bcea6f9))
* **web:** Jev review observability and About docs ([211eb3b](https://github.com/duyet/aidr/commit/211eb3b31f6aa22835349a1dad5c22a7c2817b91))
* **web:** keep /submit form and show history on the right ([0a340d7](https://github.com/duyet/aidr/commit/0a340d7a03a77263739933f28b4613ad6ce2c1af))
* **web:** merge same-story outlets and boost rank/trending by sources ([#39](https://github.com/duyet/aidr/issues/39)) ([83d36e9](https://github.com/duyet/aidr/commit/83d36e927caf3928d8c7170c9130ffc56503c8d2))
* **web:** publish RFC 9727 catalog, A2A/MCP cards, and auth.md ([bf13c7e](https://github.com/duyet/aidr/commit/bf13c7e8208aaa83c90a3225dbf2ac2676e5f188))
* **web:** tab the /data pipeline and list ingest sources ([a904843](https://github.com/duyet/aidr/commit/a904843d8a3bb5c944ebd29ff211c50d995e65bd))
* **web:** translate with Gemini 3.5 Flash and ease trending posts ([a720ef0](https://github.com/duyet/aidr/commit/a720ef0321e97aeae7bdda325c12c2854e1aba53))


### 🐛 Bug Fixes

* **ci:** drop cross-package path from release-please extra-files ([#42](https://github.com/duyet/aidr/issues/42)) ([f40836b](https://github.com/duyet/aidr/commit/f40836ba819d07cda500d64fbf27d3f4a71a000b))
* **deps:** update dependency cn to ^0.3.0 ([#69](https://github.com/duyet/aidr/issues/69)) ([465ee57](https://github.com/duyet/aidr/commit/465ee57fe213f6e768f13c1302e98c7b6ead98ba))
* **deps:** update react monorepo to v19.3.0 ([#45](https://github.com/duyet/aidr/issues/45)) ([ff390c8](https://github.com/duyet/aidr/commit/ff390c8ab31f6718397427e882ee71cc5ec704be))
* **extension:** Chrome brand icon and drop Add section chip (0.1.12) ([#43](https://github.com/duyet/aidr/issues/43)) ([b2318b0](https://github.com/duyet/aidr/commit/b2318b095b00d6b5f9de8f56fc45ed704065087b))
* **extension:** keep GitHub releases on the 0.1.x line ([05ba38b](https://github.com/duyet/aidr/commit/05ba38b18ce1e0ba69ba916af638fa561365178a))
* **mail:** crisp square logo, 32px padding, Gmail-proof CTA ([#55](https://github.com/duyet/aidr/issues/55)) ([b6e628c](https://github.com/duyet/aidr/commit/b6e628c9316d8d156173f91cc21090294eda6c55))
* **mail:** editorial welcome shell with hosted logo and Gmail-proof CTA ([#47](https://github.com/duyet/aidr/issues/47)) ([570bfc1](https://github.com/duyet/aidr/commit/570bfc156b52e33500de6219b12f8333f5dcabda))
* **mail:** quote-free font stacks and clickable digest links ([#56](https://github.com/duyet/aidr/issues/56)) ([3fc9c09](https://github.com/duyet/aidr/commit/3fc9c092e890c2b05fdd1cd3f9821bc9c5b45520))
* **mail:** stable public logo PNG and digest header row ([#52](https://github.com/duyet/aidr/issues/52)) ([3d3d239](https://github.com/duyet/aidr/commit/3d3d239520139ea2b23d9c4c23101bbd0e324c5e))
* restore TL;DR story thumbnails and dialog links ([#34](https://github.com/duyet/aidr/issues/34)) ([bc9de56](https://github.com/duyet/aidr/commit/bc9de569d6e3d15fe1d2f402f69c29efa4a188c0))
* **seo:** self-canonical pages and one URL per story ([00c267a](https://github.com/duyet/aidr/commit/00c267a277b4e2061b9d9b6abcea82ee1f32987e))
* **web:** 308 news.duyet.net to aidr.today with path and query ([#48](https://github.com/duyet/aidr/issues/48)) ([ab701ad](https://github.com/duyet/aidr/commit/ab701ad003ac25ae54eaac4acf6cc2a7aa887504))
* **web:** accept Clerk cookie session on submit and make title optional ([bc16dbe](https://github.com/duyet/aidr/commit/bc16dbe7168e4756f7674c8e8579770922c24af3))
* **web:** AnyRouter chain auto, DeepSeek V4.1 flash, Laguna, MiniMax ([8a6ce45](https://github.com/duyet/aidr/commit/8a6ce45a994f8efce3b43dc33527c8a064599196))
* **web:** AnyRouter score/translate/tldr use anyrouter/auto only ([#60](https://github.com/duyet/aidr/issues/60)) ([54a7ee4](https://github.com/duyet/aidr/commit/54a7ee4e7f878bdea580e5664b21ea951d69fa57))
* **web:** biome format and import order ([958b160](https://github.com/duyet/aidr/commit/958b1603c7bd2357c88d5856da1c2a691edc851c))
* **web:** center AI;DR on yellow logo marks ([#63](https://github.com/duyet/aidr/issues/63)) ([61e081d](https://github.com/duyet/aidr/commit/61e081d3f433477d4cd664e08f6630e41ee1441b))
* **web:** center compact header icons in 44px taps ([#78](https://github.com/duyet/aidr/issues/78)) ([c4b9147](https://github.com/duyet/aidr/commit/c4b914778f23b89b8804341a3eeb2622f2d49717))
* **web:** clear biome unused imports and format for CI ([d66050a](https://github.com/duyet/aidr/commit/d66050ac5fb54d7a72a803956a0455a168cddc10))
* **web:** cut mobile LCP by self-hosting fonts and shrinking thumbs ([9caafe6](https://github.com/duyet/aidr/commit/9caafe605a46794e012f1aaf0dbbe498ca5b75a9))
* **web:** enlarge AI;DR type on social OG image ([#67](https://github.com/duyet/aidr/issues/67)) ([6b0c373](https://github.com/duyet/aidr/commit/6b0c37368b9e81ed5034dce078d2970a046c8fef))
* **web:** keep category and trending at top of brief layout ([#73](https://github.com/duyet/aidr/issues/73)) ([8f1eb2d](https://github.com/duyet/aidr/commit/8f1eb2d6310373f90f86ff937a0bfe231306787f))
* **web:** keep digest story body unlinked ([#70](https://github.com/duyet/aidr/issues/70)) ([2ddacf2](https://github.com/duyet/aidr/commit/2ddacf2293ab7929112e25697cd36feeaf2d44d3))
* **web:** keep square logo corners transparent ([#65](https://github.com/duyet/aidr/issues/65)) ([d186e91](https://github.com/duyet/aidr/commit/d186e91b0d09b37f88134607f94f325cbabd6522))
* **web:** lock run_worker_first to include agent discovery paths ([233f8de](https://github.com/duyet/aidr/commit/233f8def06d52a5bccc49f40044ab9a3af1f4f5b))
* **web:** point pipeline docs and GitHub links at duyet/aidr ([#40](https://github.com/duyet/aidr/issues/40)) ([5edf0a0](https://github.com/duyet/aidr/commit/5edf0a0df1597e631070240ab85ad5b2d54ada23))
* **web:** remove homepage H1 and intro blurb ([#77](https://github.com/duyet/aidr/issues/77)) ([6e1caae](https://github.com/duyet/aidr/commit/6e1caae932cb268fddf01337d0e7ae00c1020d74))
* **web:** run_worker_first true so alias 308s can deploy ([#49](https://github.com/duyet/aidr/issues/49)) ([2b45507](https://github.com/duyet/aidr/commit/2b455079cd28741208d7f82a9261ced871038aeb))
* **web:** runtime owns digest_size column, unblock D1 migrations ([2c78b18](https://github.com/duyet/aidr/commit/2c78b186e74c02448d32fec38b3e869843000604))
* **web:** seed vendor blogs on ingest and restore CI lint ([b60e8e1](https://github.com/duyet/aidr/commit/b60e8e18c427937d2cc25785fd8a6f2b01be0a97))
* **web:** serve favicon.svg and add /brand ([#62](https://github.com/duyet/aidr/issues/62)) ([52c56b7](https://github.com/duyet/aidr/commit/52c56b7ff9fa47f44da19f75b50fc2150187d7e3))
* **web:** serve Get AI;DR at /subscribe ([#66](https://github.com/duyet/aidr/issues/66)) ([639e22d](https://github.com/duyet/aidr/commit/639e22d3cf18902fc1a4bfb9f7faef5b72566bc2))
* **web:** serve public logos via ASSETS so mail PNG is not SPA HTML ([#53](https://github.com/duyet/aidr/issues/53)) ([b6520b9](https://github.com/duyet/aidr/commit/b6520b99fa96c960b0862300d3be51b4a53eab75))
* **web:** skip news.duyet.net custom_domain bind (no duyet.net zone) ([#50](https://github.com/duyet/aidr/issues/50)) ([9bfb80e](https://github.com/duyet/aidr/commit/9bfb80ed9cdfabdf227f1e93582c02ac718f90b1))
* **web:** square AI;DR marks and yellow OG card ([9fd6d34](https://github.com/duyet/aidr/commit/9fd6d3440f6d87a5bd6359519700af2589fa5d23))
* **web:** stop chaining D1 migrate into Worker deploy ([#86](https://github.com/duyet/aidr/issues/86)) ([79d8874](https://github.com/duyet/aidr/commit/79d88742218c9f25d8c1b94e4f9bf0924d4803b3))
* **web:** sync EXTENSION_VERSION to 0.1.16 ([#74](https://github.com/duyet/aidr/issues/74)) ([5d71dbd](https://github.com/duyet/aidr/commit/5d71dbd4a5168d11bb87ce29d8f1a1971fcfc9a4))
* **web:** use 44px icon-lg taps and even compact header gaps ([#79](https://github.com/duyet/aidr/issues/79)) ([d1fed2e](https://github.com/duyet/aidr/commit/d1fed2e713c01cd31312ee1bd8c133cbb1da8183))
* **web:** use dotenvx in cf:deploy:prod ([71a1687](https://github.com/duyet/aidr/commit/71a168703263cabdb1f0c91c2b41105de5d79577))
* **workers-types v5:** replace Buffer int/string methods with DataView/TextDecoder ([#28](https://github.com/duyet/aidr/issues/28)) ([2adc1ef](https://github.com/duyet/aidr/commit/2adc1efe60cdc722b0c9c30aaa0ffb99514b502f))

## [0.1.3](https://github.com/duyet/aidr/compare/web-v0.1.2...web-v0.1.3) (2026-09-07)


### ✨ Features

* **extension:** digest-first new tab with section chrome ([#17](https://github.com/duyet/aidr/issues/17)) ([962f78d](https://github.com/duyet/aidr/commit/962f78d88a46849198579df216b01113c44d1132))
* **extension:** match website PrefsPanel and release 0.1.8 ([e077ebd](https://github.com/duyet/aidr/commit/e077ebd0977fa0cfb4ece913bb40730bc0289b42))


### 🐛 Bug Fixes

* **ci:** drop cross-package path from release-please extra-files ([#24](https://github.com/duyet/aidr/issues/24)) ([905c2cf](https://github.com/duyet/aidr/commit/905c2cff5a5630f6c0a7217d6fcb7f8ee211d0be))
* **extension:** days section expanded by default, remove Chrome extension link ([c277ae5](https://github.com/duyet/aidr/commit/c277ae54c432c6df74fa1fc4e96cc4db4aa3411e))

## [0.1.2](https://github.com/duyet/aidr/compare/web-v0.1.1...web-v0.1.2) (2026-09-05)


### 🐛 Bug Fixes

* **extension:** clickable Aa prefs dialog and release 0.1.7 ([211be27](https://github.com/duyet/aidr/commit/211be2704156aba2f6f0aaad115a635dcc944391))
* **web:** Clerk handshake via /__clerk and extension click attribution ([7f68470](https://github.com/duyet/aidr/commit/7f68470af9c33bc01854d86bd5017a723f42c76e))

## [0.1.1](https://github.com/duyet/aidr/compare/web-v0.1.0...web-v0.1.1) (2026-09-05)


### ✨ Features

* AI;DR logo, latest-release zip redirect, and aidr 0.1.5 ([dbe3894](https://github.com/duyet/aidr/commit/dbe38943e55dffe53783f473dc9e9664959b9666))


### 🐛 Bug Fixes

* **ci:** drop cross-package path from release-please extra-files ([74f0c16](https://github.com/duyet/aidr/commit/74f0c169c5f749f985f655cd2ae5a9f524d42e81))
* **web:** sync EXTENSION_VERSION to 0.1.4 ([89e887d](https://github.com/duyet/aidr/commit/89e887d81dec3010da579da791b7b855e7786794))

## [0.1.0](https://github.com/duyet/aidr/releases/tag/web-v0.1.0) (2026-09-05)

### ✨ Features

* Initial aidr.today website release tracked by release-please.
