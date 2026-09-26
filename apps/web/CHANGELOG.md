# Changelog

## [0.1.8](https://github.com/duyet/aidr/compare/web-v0.1.7...web-v0.1.8) (2026-09-26)


### ✨ Features

* **jev:** add deterministic review panel core ([77693f2](https://github.com/duyet/aidr/commit/77693f25aed6a27e66b13c949324f2a2a3c62d79))
* **media:** add bounded story media manifest ([#160](https://github.com/duyet/aidr/issues/160)) ([cc460b3](https://github.com/duyet/aidr/commit/cc460b347a368392842bee282013a72332c31867))
* **seo:** centralize route indexability policy ([#151](https://github.com/duyet/aidr/issues/151)) ([d42e03e](https://github.com/duyet/aidr/commit/d42e03e6773883228072edf02421fdd10dd3c079))
* **translation:** add independent semantic QA review ([#158](https://github.com/duyet/aidr/issues/158)) ([0dbf371](https://github.com/duyet/aidr/commit/0dbf3719bf0979d58dabcab6599dbfc31b9e2428))
* **web:** add accessible category accents ([#159](https://github.com/duyet/aidr/issues/159)) ([340ed62](https://github.com/duyet/aidr/commit/340ed629c2423f2eac6e16a70c4cb204d2393bf7))
* **web:** add agent-readable story Markdown ([#149](https://github.com/duyet/aidr/issues/149)) ([117af6e](https://github.com/duyet/aidr/commit/117af6e8c5463dd89af02bd08ae6281e9f8607e8))
* **web:** add locale-aware canonical links ([7869b5a](https://github.com/duyet/aidr/commit/7869b5ae402478ad7b6cc788994c47cfb6d47794))
* **web:** add story photos to OG cards ([#175](https://github.com/duyet/aidr/issues/175)) ([a9d6701](https://github.com/duyet/aidr/commit/a9d67016112f5ec150bb5739b90864fe7f9547e9))
* **web:** always-on Sign in in header, no Clerk wait ([a91143d](https://github.com/duyet/aidr/commit/a91143d65eab766b108bae66bfffbac58afce6f5))
* **web:** backfill /changelog, add agent skill for future entries ([542b676](https://github.com/duyet/aidr/commit/542b67696ffb60fabd0779b650726b740db15f00))
* **web:** brand header dropdown trigger, expand menu items ([14f0d7c](https://github.com/duyet/aidr/commit/14f0d7c60a97b2583044abc47219c84ba03c97e3))
* **web:** browser-chrome mockup frames on /subscribe ([9313a8e](https://github.com/duyet/aidr/commit/9313a8e3270c65d57aabad732938bd3d2a0e88e7))
* **web:** clarify pipeline models and account totals ([#179](https://github.com/duyet/aidr/issues/179)) ([912935b](https://github.com/duyet/aidr/commit/912935b4764710ed2d4a5517c5dd1dd1d0e4b7c9))
* **web:** dynamic OG cards for story permalinks ([3873acc](https://github.com/duyet/aidr/commit/3873acc96df7417668e553f71884b754107b3c7e))
* **web:** expand ingest run details ([#161](https://github.com/duyet/aidr/issues/161)) ([1ce436b](https://github.com/duyet/aidr/commit/1ce436b362db180f470f90864ec1f0e130b23481))
* **web:** full-screen mobile menu with icon links ([d4112a7](https://github.com/duyet/aidr/commit/d4112a79548c5448111446695787a8e1c07dc8c7))
* **web:** label Telegram menu item as Vietnamese channel ([512fc4a](https://github.com/duyet/aidr/commit/512fc4a9e7baf4383a6c98f7d778d36fca54d7a4))
* **web:** live digest preview on subscribe email tab, richer chrome tab ([9558832](https://github.com/duyet/aidr/commit/955883209d4e0d7d155ad0bafb6d45677beb2644))
* **web:** make story sources compact and inline ([#176](https://github.com/duyet/aidr/issues/176)) ([db0b838](https://github.com/duyet/aidr/commit/db0b838608b9ac8713204274c61ce966740336e8))
* **web:** merge header actions into dropdown menu ([#133](https://github.com/duyet/aidr/issues/133)) ([710de64](https://github.com/duyet/aidr/commit/710de64c2ba8120f304a4f2741962e6d9a5d23b5))
* **web:** point Algorithms menu item at /data algo tab ([d5ea4bf](https://github.com/duyet/aidr/commit/d5ea4bf0c8989cf9c9ef92e6a44af99f2a9c130a))
* **web:** redesign /data and sync Clerk signups from a verified webhook ([#205](https://github.com/duyet/aidr/issues/205)) ([2b63ced](https://github.com/duyet/aidr/commit/2b63cedaf9a13c20652bedf1dbc2fdfeef4df772))
* **web:** refresh OG images with homepage masthead variant ([177a633](https://github.com/duyet/aidr/commit/177a6335d035c659c978bd9ffe45d9c22aaf8e12))
* **web:** url-state subscribe tabs, email link in header menu ([6b858e4](https://github.com/duyet/aidr/commit/6b858e4d680fa9cbb7704f0e327f49fd7b1b822a))


### 🐛 Bug Fixes

* **deps:** narrow the [@clerk](https://github.com/clerk) release-age exclude and gate CLERK_SECRET_KEY ([#190](https://github.com/duyet/aidr/issues/190)) ([8554148](https://github.com/duyet/aidr/commit/855414857f7905368f099cb73fab82652b80d742))
* **web:** 404 OG card requests without a valid story id prefix ([b487a65](https://github.com/duyet/aidr/commit/b487a656c0e940a1eb1b10c362b9c6f95466cbc8))
* **web:** align model attribution accessible names with visible hops ([#196](https://github.com/duyet/aidr/issues/196)) ([9ba2498](https://github.com/duyet/aidr/commit/9ba2498c4e7c1cfbcc59df90f53ed195fe8ef3ab))
* **web:** assert the deployed homepage og-home card in smoke ([#199](https://github.com/duyet/aidr/issues/199)) ([bb5c0cb](https://github.com/duyet/aidr/commit/bb5c0cbb3ca108b53eb5080a55ce3beb6ac92d7e))
* **web:** cap all Jev criteria at 10 ([#185](https://github.com/duyet/aidr/issues/185)) ([946f697](https://github.com/duyet/aidr/commit/946f697e65cf324007d29b8cd53e93beee37924c))
* **web:** cap Jev score levels at 10 for TypeSafe ([#183](https://github.com/duyet/aidr/issues/183)) ([e3add3b](https://github.com/duyet/aidr/commit/e3add3b518315b2e0a5ec5c8131a2793d2475891))
* **web:** close escaped Markdown URL sanitizer bypasses ([#184](https://github.com/duyet/aidr/issues/184)) ([715e28a](https://github.com/duyet/aidr/commit/715e28a50e538df4d371d9ca2870d4bde1413c95))
* **web:** close locale cache and auth follow-up gaps ([b8c3c8f](https://github.com/duyet/aidr/commit/b8c3c8f7adc39852aafdf9063856c56d4d2c956c))
* **web:** close story OG card layout and image boundary gaps ([#192](https://github.com/duyet/aidr/issues/192)) ([7a71163](https://github.com/duyet/aidr/commit/7a71163472a4cceef64653c0d17d4bf09d025f0c))
* **web:** gate CLERK_WEBHOOK_SECRET and stop /data inventing a signup 0 ([68dce00](https://github.com/duyet/aidr/commit/68dce00d10fde1909c3a4752f0572d72cdcf507d))
* **web:** gate CLERK_WEBHOOK_SECRET, honest signup count, media backfill reach ([60ce9ec](https://github.com/duyet/aidr/commit/60ce9ec54df51078d87d1edd18e7fbaa3c7a7a97))
* **web:** harden clerk proxy transport boundaries ([#150](https://github.com/duyet/aidr/issues/150)) ([488a9c0](https://github.com/duyet/aidr/commit/488a9c0159064dff919358e9ad8f7d44fdf2b8d0))
* **web:** improve mobile header actions and menu ([080c9bb](https://github.com/duyet/aidr/commit/080c9bbb08e166f7afaa02c33327b02874c3ec92)), closes [#157](https://github.com/duyet/aidr/issues/157)
* **web:** keep story source metadata unit intact and skip empty rows ([#191](https://github.com/duyet/aidr/issues/191)) ([caa4407](https://github.com/duyet/aidr/commit/caa44078b563501d297cf23104f3597e916bdbf6))
* **web:** populate run Models/attempts and surface step fallbacks ([#197](https://github.com/duyet/aidr/issues/197)) ([146a0a0](https://github.com/duyet/aidr/commit/146a0a02bbb0defb4feace148d5ff8b5add679fe)), closes [#189](https://github.com/duyet/aidr/issues/189)
* **web:** preserve locale across neutral navigation ([94bd26c](https://github.com/duyet/aidr/commit/94bd26ce667f7de0bfbe2fa9ce234e64e18f5c19))
* **web:** remove mobile Get AI;DR trigger circle background ([#206](https://github.com/duyet/aidr/issues/206)) ([aa12d43](https://github.com/duyet/aidr/commit/aa12d43bf7355f7b038fb943ee7bb7b193631da3))
* **web:** send Jev choice criteria as object maps ([#188](https://github.com/duyet/aidr/issues/188)) ([f786f29](https://github.com/duyet/aidr/commit/f786f295996eac7a9e73a5360043dd4265344907)), closes [#187](https://github.com/duyet/aidr/issues/187)
* **web:** stop legacy story redirects from hijacking server functions ([#181](https://github.com/duyet/aidr/issues/181)) ([9d864bf](https://github.com/duyet/aidr/commit/9d864bf77b7fb9a5344e4922e6183f3983701fa7)), closes [#178](https://github.com/duyet/aidr/issues/178)
* **web:** stop neutral locale redirect loops ([#182](https://github.com/duyet/aidr/issues/182)) ([4d18a7c](https://github.com/duyet/aidr/commit/4d18a7c57c94d816877dcf83203fd7245bdc4703))
* **web:** unbreak the /data runs charts, dedupe algo tab, pad tabs ([#219](https://github.com/duyet/aidr/issues/219)) ([7fb5791](https://github.com/duyet/aidr/commit/7fb579130132b0c7c59f74206beaacceff4659a0))
* **web:** widen story dialog on large screens ([#162](https://github.com/duyet/aidr/issues/162)) ([b32c49a](https://github.com/duyet/aidr/commit/b32c49a075769ac966f29df96d64dd35edc0bab0))
* **worker:** let media backfill reach rows that already have a legacy image_url ([7089a94](https://github.com/duyet/aidr/commit/7089a941c1b99b4c4d74ff2d04c71f8e0dca92f6))
* **worker:** let the Clerk handshake redirect back to the app origin (login 502) ([#212](https://github.com/duyet/aidr/issues/212)) ([58d1445](https://github.com/duyet/aidr/commit/58d1445e0676555e79ae9414f08f5c8f6cce512e))


### ⚡ Performance

* **web:** use slim feed freshness request ([#148](https://github.com/duyet/aidr/issues/148)) ([54395f7](https://github.com/duyet/aidr/commit/54395f78f23f777a0804f772a9898fcbe0833da3))

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
