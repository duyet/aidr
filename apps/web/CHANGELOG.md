# Changelog

## [0.1.11](https://github.com/duyet/aidr/compare/web-v0.1.10...web-v0.1.11) (2026-10-03)


### ✨ Features

* **admin:** POST /api/admin/notify/digest/preview sends today's digest to a given chat ([ee510a1](https://github.com/duyet/aidr/commit/ee510a181b642b637b1434ffc8407ee55dd79894))
* **email:** accept contributions by email at submit@aidr.today ([8cd2f24](https://github.com/duyet/aidr/commit/8cd2f24941b2456b9950198e2c9225a1ffb524a1))
* **email:** accept only Clerk-verified addresses ([6c3639f](https://github.com/duyet/aidr/commit/6c3639fcf15c34cf3863b077e4ecbf3f8132cf46))
* **mail:** lead the daily digest with the day card, linked to the day page ([c953655](https://github.com/duyet/aidr/commit/c9536550b561c6bccb7f99f9daa4168b998b5311))
* **notify:** send the daily digest as the day card photo with numbered bullets ([e27c7f4](https://github.com/duyet/aidr/commit/e27c7f492289a9fee3bc405b4d0258521b6294a5))
* **tldr:** model picks a topic emoji per digest bullet; Telegram uses it ([049e36d](https://github.com/duyet/aidr/commit/049e36df88fd1ac127bbeff1673db0666b151ebe))
* **web:** add /date day archive with daily YouTube video and Short ([2e54ef1](https://github.com/duyet/aidr/commit/2e54ef1504c5b89cbe2a5534dfa0f3f1436fc715))
* **web:** add builder categories and let official posts own their story ([8a0153d](https://github.com/duyet/aidr/commit/8a0153d5388082316962b0cdf7e3f5e3fbca465e))
* **web:** add per-step model bench with prod-derived datasets ([bf18afa](https://github.com/duyet/aidr/commit/bf18afaca9ff8a2b090a9b4dbd681fea6f00bccf))
* **web:** add quality bench, AI sources, sharper trending and decision-first scoring ([bc50213](https://github.com/duyet/aidr/commit/bc50213980a1728e20b84759669db0b179e32cd3))
* **web:** add reset to default button in appearance settings ([b5c73c6](https://github.com/duyet/aidr/commit/b5c73c68de5ccedf47918705706cd463057d7991))
* **web:** add the Cloudflare Blog as an AI-filtered source ([90fe1a3](https://github.com/duyet/aidr/commit/90fe1a33fe4a6d24f852cc7083ca4dc16c5271ff))
* **web:** bench draft repair, rule extraction, review queue and Jev judges ([51ac6b6](https://github.com/duyet/aidr/commit/51ac6b61e8279af5e51fd674089e68fbc17b6cc6))
* **web:** check translations with back-translation and keep tech terms in English ([cebdb9c](https://github.com/duyet/aidr/commit/cebdb9c7dbced69b732e93b126e3c27bd16188f8))
* **web:** clickable workflow diagram with per-step LLM calls ([e079657](https://github.com/duyet/aidr/commit/e079657983801cd244658a827a4a5ea9dd3cff16))
* **web:** collect every 30 minutes and keep new models and labs ([5a37a8c](https://github.com/duyet/aidr/commit/5a37a8ccbff098ab16a9a3c678c34eabd83e6ec2))
* **web:** compact Recent runs list with a details dialog ([5809f93](https://github.com/duyet/aidr/commit/5809f93993817c238684db153e836067799f8e2f))
* **web:** convert WebP photos to JPEG for OG cards via the Images binding ([c819aa1](https://github.com/duyet/aidr/commit/c819aa1e8506342c69623e49eb2cd642d802dff8))
* **web:** day nav as pills with home link on the right ([eba36c3](https://github.com/duyet/aidr/commit/eba36c351b0550cc5576484c167e62785dad1ddc))
* **web:** day OG card, Telegram digest links to day page, looser trending bar ([1e1ed9a](https://github.com/duyet/aidr/commit/1e1ed9af668489397ca5309dd4b41408db577381))
* **web:** day page AI;DR list uses the homepage rows (highlights, story dialog) ([d9745da](https://github.com/duyet/aidr/commit/d9745da969605db14edf9eb760b19ff756a25c39))
* **web:** double opt-in email signup and reject reserved domains ([e2b36a2](https://github.com/duyet/aidr/commit/e2b36a218f78387614cb2a98568b387d9a1dd872))
* **web:** drive the email preview from the form and add image layouts ([#328](https://github.com/duyet/aidr/issues/328)) ([e2dfbc9](https://github.com/duyet/aidr/commit/e2dfbc90361757569e0f726675df40e234d5ad78))
* **web:** dry-run, step reruns and previews for local agents ([6d27926](https://github.com/duyet/aidr/commit/6d2792694c250b4f94e9a3e93bf281bd858b2bad))
* **web:** explain story rank and Telegram trending status on story page ([c65b2b9](https://github.com/duyet/aidr/commit/c65b2b970834cf4e3ceee43db90605e09eb9d79f))
* **web:** flag runs with failed steps and draw the workflow graph ([aef4a07](https://github.com/duyet/aidr/commit/aef4a070086bcaccc6d8264022150f0682991b5a))
* **web:** group fallback transitions and label dry/partial runs ([5b9e83d](https://github.com/duyet/aidr/commit/5b9e83dd2347351bdba5363164030a874e38219b))
* **web:** group repeated run errors, keep /data English, compact models cell ([0061d5f](https://github.com/duyet/aidr/commit/0061d5fee49727cd626ec22b47360560241a128f))
* **web:** hovering the masthead chip shows the day card over the whole digest ([9b74292](https://github.com/duyet/aidr/commit/9b742926cdc5e28df7abc208a556a8bd274f0cdc))
* **web:** keep model jargon in English and repair weak Vietnamese drafts ([ee2a556](https://github.com/duyet/aidr/commit/ee2a556f25a20f9844968824d68a067035cc1b8f))
* **web:** learn translation rules from accepted suggestions; one free-form suggestion box ([033c572](https://github.com/duyet/aidr/commit/033c572e1446b2dc8d8d753438eb4bd90e64c6fb))
* **web:** link Get AI;DR menu to Contribute page ([1a4f9ea](https://github.com/duyet/aidr/commit/1a4f9ea093044f751a5ecaf585ed8d0cf9a197f4))
* **web:** list day pages in sitemap, llms.txt and add day Markdown ([90a7c90](https://github.com/duyet/aidr/commit/90a7c9030e420fe4234302f85277d2cd6248b2d3))
* **web:** make the Chrome new-tab preview match the real extension ([#329](https://github.com/duyet/aidr/issues/329)) ([2c40f8e](https://github.com/duyet/aidr/commit/2c40f8e1cf17ac4723ab7eba0835a6c89b2e9cae))
* **web:** move contributions to /contribute with a compact, filterable history ([49abf2d](https://github.com/duyet/aidr/commit/49abf2de81cfecbd51f78a63ab75be46c3168963))
* **web:** one row per LLM chain call, retries inline, price when known ([9e02f4f](https://github.com/duyet/aidr/commit/9e02f4fd7ab2e3ea15a08b7b5d28e22f679c3e96))
* **web:** rank on real corroboration and engagement; make the trending bar relative ([b72b23b](https://github.com/duyet/aidr/commit/b72b23bb8c4e8959313d70a42887a545bd053a19))
* **web:** re-rank a rolling 72h window and cap each source family on top lists ([a8b8f4d](https://github.com/duyet/aidr/commit/a8b8f4dac1cd6795dc8b459552043e7e49c5893a))
* **web:** redesign day page hero and link feed day headings to it ([f585dbb](https://github.com/duyet/aidr/commit/f585dbb0f96e2f66f992aafe27395334899de2cc))
* **web:** review reader suggestions on submit and show contribution history ([a4fd4f5](https://github.com/duyet/aidr/commit/a4fd4f5bf5d42ed0aeb5a51df151735b28f27307))
* **web:** route chat chains through the @preset/aidr AnyRouter preset ([ecc2e1a](https://github.com/duyet/aidr/commit/ecc2e1a3a754860024ad98d2d0686efc2138c5a8))
* **web:** show one Telegram card per channel on the subscribe tab ([#322](https://github.com/duyet/aidr/issues/322)) ([be98497](https://github.com/duyet/aidr/commit/be98497a6d4b310e298dc8e0acd0d3a8a245af62))
* **web:** show the day card as the day page hero when there is no video ([6c2fba9](https://github.com/duyet/aidr/commit/6c2fba94c43c9b33fd4c83ababf4cd87698f3af1))
* **web:** show the intro video as a bare, larger player ([#319](https://github.com/duyet/aidr/issues/319)) ([9b48c79](https://github.com/duyet/aidr/commit/9b48c79b20b4ba49dec3196c26023aa2ffb39d1f))
* **web:** show the route behind each LLM call and redesign the call list ([52c34de](https://github.com/duyet/aidr/commit/52c34debc4ffda55ed76a62934bdfb88f64d3f2d))
* **web:** yellow masthead for the AI;DR digest with a day card preview chip ([86f3da9](https://github.com/duyet/aidr/commit/86f3da99500934568acbb516a444e3e6fec28828))


### 🐛 Bug Fixes

* apply biome lint and format fixes ([#346](https://github.com/duyet/aidr/issues/346)) ([56e7a50](https://github.com/duyet/aidr/commit/56e7a50431ed652375ae04b5c54c9e6fd0bab5d6))
* **deps:** update dependency motion to v14 ([#350](https://github.com/duyet/aidr/issues/350)) ([96c488b](https://github.com/duyet/aidr/commit/96c488b8838fe6bed987020c82fae4fc782d061b))
* **notify:** each Telegram channel posts only its own language, no fallback ([b9416ae](https://github.com/duyet/aidr/commit/b9416ae0c37b0f739b24ce493a08fac96b354026))
* **notify:** keep Vietnamese-source stories off the English Telegram channel ([ceb9e7c](https://github.com/duyet/aidr/commit/ceb9e7c3189980ffb14e2940e0cdbd0f908efd64))
* **scripts:** probe non-rss sources in verify-source-feeds ([#360](https://github.com/duyet/aidr/issues/360)) ([ad3e176](https://github.com/duyet/aidr/commit/ad3e176904f38226b4b0ec5124e5fb809c71aa38))
* **web:** anchor importance on a shared 1-10 scale and use Jev's weighted level ([be99f17](https://github.com/duyet/aidr/commit/be99f177ac7cc462551daa483cf5eb6378b5bced))
* **web:** backfill VI summaries a translate batch dropped ([92bd29a](https://github.com/duyet/aidr/commit/92bd29a77a2e80485c4c81f2b98c0b4a3bc8ec55))
* **web:** base webhook severity on importance, not an absolute rank ([661fe30](https://github.com/duyet/aidr/commit/661fe30cd72e191bf2b3bbfa2bf1e549361cb6c8))
* **web:** count a step skipped because it threw as failed ([e5b117f](https://github.com/duyet/aidr/commit/e5b117f3dcc278ab69eb55b1fdb5cd865aa7a7f5))
* **web:** darker scrim on day OG tiles ([11a9b3b](https://github.com/duyet/aidr/commit/11a9b3ba696ce0733f3c1b2e459103d68942807c))
* **web:** day card leads with real photos, skips headline-only share images ([8abed7e](https://github.com/duyet/aidr/commit/8abed7e5cd203b7c9be1540034e283fcb08b7df0))
* **web:** day card shows only stories with copy in its language; fuller text tiles ([d08271d](https://github.com/duyet/aidr/commit/d08271dcda0ec60103acf9eba021ac01d7069655))
* **web:** day card waits up to 5s per photo; Vietnamese tiles must read as Vietnamese ([88ff742](https://github.com/duyet/aidr/commit/88ff7425f2cbdee671eff71240e74ee524d0b33d))
* **web:** decode HTML entities, strip UPDATE: markers, bound Telegram sends, check VI numbers ([d7fe158](https://github.com/duyet/aidr/commit/d7fe15814a5269e7c8d3c613e5d6dc2abafe0a98))
* **web:** fill day OG tiles from the top stories whose photos load ([2f50f40](https://github.com/duyet/aidr/commit/2f50f40fc0d360aaa26e78436721c48dd2cc6268))
* **web:** finish the Cloudflare Blog source: dashboard threshold, budget, rollback ([e98a412](https://github.com/duyet/aidr/commit/e98a4126bf16591ffe9956b8351424f186718f4b))
* **web:** give the TL;DR first hop Laguna's full runtime; log cost and request id ([d105b67](https://github.com/duyet/aidr/commit/d105b676432504b51b29be558480ab056b3d8f42))
* **web:** keep the header sign-in slot avatar-sized so auth never shifts it ([9cb75b7](https://github.com/duyet/aidr/commit/9cb75b7926ecb09c547d6ff06e5dcecb1cb0e2da))
* **web:** lead chains with Laguna; @preset/aidr now serves a model that returns no content ([3897b5d](https://github.com/duyet/aidr/commit/3897b5decce8610071436c939663947990a7cbbd))
* **web:** limit public top stories to the last 48h ([8a8a21b](https://github.com/duyet/aidr/commit/8a8a21baedaec78f2a7c4544579141dc719a9ee5))
* **web:** make the Density pref adjust the AI;DR card too ([07d5465](https://github.com/duyet/aidr/commit/07d5465631dc28b39d0557bac719d2dfc0af364c))
* **web:** never inline WebP into OG cards; resvg draws it blank ([8204d03](https://github.com/duyet/aidr/commit/8204d03cb9018aeacf5af674a3e75f9830bb70e9))
* **web:** parse the bare array Clerk returns from the users list ([144eb49](https://github.com/duyet/aidr/commit/144eb4904b9493fa3305dfbd6ee33881692e8552))
* **web:** rebuild AnyRouter chains on streaming probes, fix review chain ([44af660](https://github.com/duyet/aidr/commit/44af6600e33edcb9d5547cdbb09215ada3d19a46))
* **web:** rebuild AnyRouter model chains from a live probe ([c1d118e](https://github.com/duyet/aidr/commit/c1d118e5e751de38bd8013d8797315a2cae7be75))
* **web:** record LLM timeouts as timeouts, stop one hang eating the chain ([#336](https://github.com/duyet/aidr/issues/336)) ([a1e3034](https://github.com/duyet/aidr/commit/a1e303463d6a637b345c9cd796cef00041063154))
* **web:** record rss fetch failures after the workflow clones the error ([#362](https://github.com/duyet/aidr/issues/362)) ([c5efb52](https://github.com/duyet/aidr/commit/c5efb525adb7ad2bd36011af78507c98b9b15d8a))
* **web:** repair Laguna's stray JSON closers, give each chain call an id ([dd61fcf](https://github.com/duyet/aidr/commit/dd61fcfe0d89e3e30c31b5b67185ae3d7f4da057))
* **web:** restore SubmissionsList.tsx removed by accident in 3897b5d ([60aea07](https://github.com/duyet/aidr/commit/60aea07f9a56a0b8cfa72864303e5b5005260c87))
* **web:** retry the TL;DR step once after an engine interruption ([f993456](https://github.com/duyet/aidr/commit/f9934569d8bacb6f4b9cb129d623693aec99095a))
* **web:** return a mutable copy of cached OG responses ([2ddf30d](https://github.com/duyet/aidr/commit/2ddf30db09ec16b6e01f30520f56b729e364d0c7))
* **web:** return a plain 302 from the subscribe confirm route ([9a5d127](https://github.com/duyet/aidr/commit/9a5d127a9f6f9ec5a72d7827ec89f72a484dbc8f))
* **web:** run cf with color off so the migration gate can parse its JSON ([7f8d3b8](https://github.com/duyet/aidr/commit/7f8d3b8bb4506e85b61a71723a9985002a25aaac))
* **web:** run story clustering through the model chain so merges stop silently failing ([c56bcd3](https://github.com/duyet/aidr/commit/c56bcd3282b64cd2d6bcc4e03d1ba03003d32219))
* **web:** send a User-Agent when fetching OG photos so CDNs return JPEG, not WebP ([c019daf](https://github.com/duyet/aidr/commit/c019daf38d181d2ffcd123795601aee3982ee360))
* **web:** ship a live Clerk key; split the deliver page controls/preview ([117c614](https://github.com/duyet/aidr/commit/117c6141818dcd6ec528f5e44a4e0f201620b35c))
* **web:** ship the Clerk key from local deploys and refuse a keyless deploy ([c92c964](https://github.com/duyet/aidr/commit/c92c964fed0e94c3b952e832ef4a497fea2a6926))
* **web:** show open runs as running and restore Telegram trending posts ([5e064f3](https://github.com/duyet/aidr/commit/5e064f3cf9277150895e145a8b6b3373fc82501f))
* **web:** solid scrim under day OG tile text ([5f3c874](https://github.com/duyet/aidr/commit/5f3c874218eab9b16710a554dac3893247a2dddf))
* **web:** split day OG tiles into photo and solid text panel ([41794b3](https://github.com/duyet/aidr/commit/41794b3aa08d7385c39a3977b184b4c1fee9a439))
* **web:** stop reporting Workflows engine interruptions to Bugsink ([b818e46](https://github.com/duyet/aidr/commit/b818e460879dffbb2ee6163ea15cdb11e90a3d57))
* **web:** sync EXTENSION_VERSION to 0.1.19 and let release-please bump it ([#320](https://github.com/duyet/aidr/issues/320)) ([5728770](https://github.com/duyet/aidr/commit/5728770e4fd7c2a0864b08acc01931856afaf764))
* **worker:** keep the push source off the stale streak ([#361](https://github.com/duyet/aidr/issues/361)) ([da898ac](https://github.com/duyet/aidr/commit/da898acfc117b29bbf75a00ffdc83ef8ed0fac23))
* **worker:** raise translate step timeouts above the LLM deadline ([#358](https://github.com/duyet/aidr/issues/358)) ([d65fac8](https://github.com/duyet/aidr/commit/d65fac8ec284923c70fd3bef84632ec382c2f49e))
* **worker:** stop engine interruptions from filing Bugsink issues ([#351](https://github.com/duyet/aidr/issues/351)) ([ced9f88](https://github.com/duyet/aidr/commit/ced9f8887736ecb660eb36b93cf13ebf7e75453a))


### ⚡ Performance

* **web:** edge-cache rendered OG cards; hourly TTL for recent day cards ([27c192e](https://github.com/duyet/aidr/commit/27c192ec5235ca960275c47aea94efe6f914da81))
* **web:** keep day-card source photos in R2 so renders reuse them ([35c7f63](https://github.com/duyet/aidr/commit/35c7f63e9fdc31c8975ae1c2f4cdabfcfccd1495))
* **web:** preload the day card so the masthead hover is instant ([8b88ddf](https://github.com/duyet/aidr/commit/8b88ddfe2b655e75d32c53ac0f35de0bfd507a42))
* **web:** share rendered OG cards across regions via R2; batch day-card photo fetches ([c15d05c](https://github.com/duyet/aidr/commit/c15d05c973307ae4c5dd1e119ac08c483cad0c89))


### ♻️ Refactoring

* **email:** remove the extra-address confirmation flow ([9484bd3](https://github.com/duyet/aidr/commit/9484bd32c60afb82cb2f9c746d1fe5ed08fe54bf))
* **web:** read source thresholds and score budget from one place ([f6bd42d](https://github.com/duyet/aidr/commit/f6bd42d9c9efa98a0e74f9bcbeeadfd6f729dbdb))

## [0.1.10](https://github.com/duyet/aidr/compare/web-v0.1.9...web-v0.1.10) (2026-09-30)


### ✨ Features

* **digest:** split email into English and Vietnamese lanes ([#261](https://github.com/duyet/aidr/issues/261)) ([00bd53e](https://github.com/duyet/aidr/commit/00bd53e13b915a19e4e4c292f9a5b3eb51bb7712))
* **jev-panel:** gate submissions and suggestions, run judges in parallel, restore on overturn ([#295](https://github.com/duyet/aidr/issues/295)) ([1b2e0e9](https://github.com/duyet/aidr/commit/1b2e0e9d3abab715398a6867b3e82416f26b8d1b)), closes [#144](https://github.com/duyet/aidr/issues/144)
* **jev-panel:** safety/translation seats, verdict audit, admin view and override ([#292](https://github.com/duyet/aidr/issues/292)) ([8d8fbbc](https://github.com/duyet/aidr/commit/8d8fbbc02cdebc3128fff11b9ca54b76d54113bf))
* **jev:** wire the merged review panel into the scoring decision ([#209](https://github.com/duyet/aidr/issues/209)) ([fd5314a](https://github.com/duyet/aidr/commit/fd5314a38961d8bf733fb1fe836cc57b479ca304)), closes [#203](https://github.com/duyet/aidr/issues/203) [#144](https://github.com/duyet/aidr/issues/144)
* **notify:** fewer trending posts, day hours only, more room on big-news days ([#315](https://github.com/duyet/aidr/issues/315)) ([f0816a1](https://github.com/duyet/aidr/commit/f0816a1435e2d6989f6e91750b8d83e063d35c10))
* **notify:** post the English digest to [@aidr](https://github.com/aidr)_today ([#251](https://github.com/duyet/aidr/issues/251)) ([619d006](https://github.com/duyet/aidr/commit/619d006982d89397773b515a0bd56b3c120a02eb))
* **notify:** read Vietnamese and English Telegram chats from env ([#254](https://github.com/duyet/aidr/issues/254)) ([914345a](https://github.com/duyet/aidr/commit/914345a9c3b82b3f69d6daa5aefad3a346f39892))
* **notify:** send the album read link as a native Telegram button ([18c90f9](https://github.com/duyet/aidr/commit/18c90f918d4755de2e34bbd591c2ae582000be47))
* **ops:** live performance budgets and release check results ([#301](https://github.com/duyet/aidr/issues/301)) ([7b2e042](https://github.com/duyet/aidr/commit/7b2e042410ef995ae0cb9971aa24062e5bd0f0d4)), closes [#147](https://github.com/duyet/aidr/issues/147)
* **quality:** add secret scan, call caps, prompt-injection tests and docs ([#290](https://github.com/duyet/aidr/issues/290)) ([31985ad](https://github.com/duyet/aidr/commit/31985ad6ccc7eb3db3e6c777e93b79cfe255d428)), closes [#147](https://github.com/duyet/aidr/issues/147)
* **sources:** add arXiv via rss.arxiv.org, flood-gated ([#286](https://github.com/duyet/aidr/issues/286)) ([5235a46](https://github.com/duyet/aidr/commit/5235a461f57e7365bb8f064914cc551237b98f91))
* **sources:** Lobsters filtered tags and HN points range via the registry ([#294](https://github.com/duyet/aidr/issues/294)) ([242c932](https://github.com/duyet/aidr/commit/242c932d9caf78c539cafc9ffe798b48a319e793))
* **telegram:** send video and mixed albums after a bounded preflight ([#287](https://github.com/duyet/aidr/issues/287)) ([53c232f](https://github.com/duyet/aidr/commit/53c232f6416d62a6557b60218abe5e0da685bfcc))
* **web:** a GA4 audience snapshot behind a new /data Audience tab ([c8eb48b](https://github.com/duyet/aidr/commit/c8eb48b144addb0f1788ea38cc9520b005f26370))
* **web:** add intro video dialog to header ([#309](https://github.com/duyet/aidr/issues/309)) ([f41f264](https://github.com/duyet/aidr/commit/f41f264b5c106d171dede99ccf49376ba1ff6f2b))
* **web:** add repeatable Lighthouse median script for CWV ([#281](https://github.com/duyet/aidr/issues/281)) ([47ae087](https://github.com/duyet/aidr/commit/47ae087ca22df40b9ead39259ee8199a0bc13d07))
* **web:** add story breadcrumb JSON-LD and SEO measurement checklist ([#285](https://github.com/duyet/aidr/issues/285)) ([6af50c9](https://github.com/duyet/aidr/commit/6af50c99044c74012b4761f13b2f2803e5342644)), closes [#139](https://github.com/duyet/aidr/issues/139)
* **web:** advertise the story Markdown so a client can offer a quick view ([8a9b177](https://github.com/duyet/aidr/commit/8a9b177b4824c8002e4f1ad24cadadee9c0e39bb))
* **web:** link footer freshness to the latest run with a health dot ([#265](https://github.com/duyet/aidr/issues/265)) ([cfc876e](https://github.com/duyet/aidr/commit/cfc876e2ad702946b619073e1b69c439942a5627))
* **web:** render the story media manifest as a bounded gallery ([0c5e80c](https://github.com/duyet/aidr/commit/0c5e80cab158d2ff4f73d59616f5635c5ecdea9c))
* **web:** ship raster icons and outline the wordmark in the SVG mark ([39e27f9](https://github.com/duyet/aidr/commit/39e27f9297a4ca06db11e70bb51bfddc871a963a))
* **web:** show all four homepage sections to new users ([#308](https://github.com/duyet/aidr/issues/308)) ([bd22e36](https://github.com/duyet/aidr/commit/bd22e367c0badc125f2d12c1cf0cb513aaae0cd6))
* **web:** title the digest from its bullets and add one hero ([#247](https://github.com/duyet/aidr/issues/247)) ([b04b3b6](https://github.com/duyet/aidr/commit/b04b3b689931d8ec71e3cca224498c87d0c209f8))
* **worker:** owner Telegram DM and GitHub issues for health alerts ([#274](https://github.com/duyet/aidr/issues/274)) ([14bb328](https://github.com/duyet/aidr/commit/14bb3284c284b301c9045f93438d3e91d4b041c2))
* **worker:** pipeline health alerts and /api/health ([#271](https://github.com/duyet/aidr/issues/271)) ([c7c0a12](https://github.com/duyet/aidr/commit/c7c0a12a98ae640efd1a69bcc9569c8ced26f191))
* **worker:** Telegram albums, card fallback, one button, one language ([1ffa2b7](https://github.com/duyet/aidr/commit/1ffa2b7f4593f9e94b6f35baabd8e1542440cc18))


### 🐛 Bug Fixes

* **health:** do not alert on a Telegram channel that spent its daily cap ([#312](https://github.com/duyet/aidr/issues/312)) ([a184b83](https://github.com/duyet/aidr/commit/a184b83a8b1e17ec349271e0c9095ec1f4d0b647))
* **llm:** bound streamed content, not SSE framing, and drop dead scout ([#296](https://github.com/duyet/aidr/issues/296)) ([481ce75](https://github.com/duyet/aidr/commit/481ce75349dea86f912889316050cf517ba54758))
* **llm:** drop deepseek-v4.1-flash from AnyRouter chains ([ce03b61](https://github.com/duyet/aidr/commit/ce03b6146c61086d212b5ef23505ca4f02865b7c))
* **llm:** use live-probed AnyRouter models with auto as last fallback ([1bbb7fd](https://github.com/duyet/aidr/commit/1bbb7fd7c1a0dca9cd5e48423672c999bba664bd))
* **quality:** cap JEV panel items per step, bound dedupe and topic prompts, fence mail picks ([#316](https://github.com/duyet/aidr/issues/316)) ([e395da2](https://github.com/duyet/aidr/commit/e395da2cd1e150b5237e4067299043c816b78dc8)), closes [#147](https://github.com/duyet/aidr/issues/147)
* **telegram:** do not fall back after an unknown send outcome ([#314](https://github.com/duyet/aidr/issues/314)) ([8f0e9de](https://github.com/duyet/aidr/commit/8f0e9dee5a7095b7f8ab7a16c1362eff7042828e)), closes [#145](https://github.com/duyet/aidr/issues/145)
* **web:** cap any single source at 25% of the served feed ([#299](https://github.com/duyet/aidr/issues/299)) ([f98ffc4](https://github.com/duyet/aidr/commit/f98ffc48e7f7b29285a4bf7728f767bb1e2dd922)), closes [#230](https://github.com/duyet/aidr/issues/230)
* **web:** derive the media migration gate from real files ([#275](https://github.com/duyet/aidr/issues/275)) ([de244c9](https://github.com/duyet/aidr/commit/de244c9acd75559dd6db2043e124285391f0ceb2))
* **web:** draw the OG card in Be Vietnam Pro, with the tone marks in the outline ([2f1ca9c](https://github.com/duyet/aidr/commit/2f1ca9cfc1cca4c33a78dd253708d383bfe0fb59))
* **web:** drop Clarity and pageview.duyet.net ([f472129](https://github.com/duyet/aidr/commit/f4721294772b4fbc5c922305cc9800d7070941e6))
* **web:** hide empty source link and missing date on story pages, add fallback tests ([#289](https://github.com/duyet/aidr/issues/289)) ([6493dd5](https://github.com/duyet/aidr/commit/6493dd56d6be223abda4d91cde6fab08edae399a))
* **web:** ignore a missing audience chart date ([82d89a0](https://github.com/duyet/aidr/commit/82d89a08f887a1f8a9deb0b18a1d15b80f4c1658))
* **web:** keep story categories in the site's own taxonomy in every locale ([0077a40](https://github.com/duyet/aidr/commit/0077a409117da2ea051abf5f6140584388e8992e))
* **web:** keep story summaries whole and fall back to the OG card ([#256](https://github.com/duyet/aidr/issues/256)) ([b2fca66](https://github.com/duyet/aidr/commit/b2fca66bd0639ab36160ec70f9ff098712254ff2))
* **web:** link the story dialog to a localized permalink ([71cadb8](https://github.com/duyet/aidr/commit/71cadb8a71e1c15de69b8435c017932961ec89dc))
* **web:** move About out of reader prefs into the menu ([85eca74](https://github.com/duyet/aidr/commit/85eca745a57a11e1013a69124f0b2db8a3c3082d))
* **web:** put language at the top of the phone menu ([97ee748](https://github.com/duyet/aidr/commit/97ee7483e717ade92b87054b6c695654f5015201))
* **web:** stop audience charts from looping ([5b70687](https://github.com/duyet/aidr/commit/5b7068705485d329332bcbe7a277745f1f9d40f7))
* **web:** switch header chrome on width only ([2485368](https://github.com/duyet/aidr/commit/248536807cb7cf19faffb1a822433be2e54c724c))
* **web:** the phone menu is a two-column grid of large tiles ([ff9d158](https://github.com/duyet/aidr/commit/ff9d1586da9aa1813ba1c05120f185a3b54943e6))
* **web:** tighten the story dialog and show the summary ([c0d27c4](https://github.com/duyet/aidr/commit/c0d27c435550ae57786311bfffaa3374bbb8fe60))
* **web:** use a story thumbnail as the digest hero ([#253](https://github.com/duyet/aidr/issues/253)) ([16207d9](https://github.com/duyet/aidr/commit/16207d912faaa8ebe859a548d301e6bd376fa9d2))
* **worker:** report delivery failures to Sentry ([5519761](https://github.com/duyet/aidr/commit/55197613edc7dc2657784f1af913f645af006732))
* **worker:** restore trending rank, notify reason, and tldr fallback ([#266](https://github.com/duyet/aidr/issues/266)) ([1277568](https://github.com/duyet/aidr/commit/12775688053478b6582b83f10db552af409501a0))
* **worker:** send pipeline exceptions to Sentry ([cf9bd99](https://github.com/duyet/aidr/commit/cf9bd991d1475ec8944d66612dd5b216f802886d))


### ⚡ Performance

* **web:** add pending state to settings digest preview, add preview budget doc ([#288](https://github.com/duyet/aidr/issues/288)) ([433a812](https://github.com/duyet/aidr/commit/433a812e43c9ea4a70b89b98826b7480d242475d))
* **web:** fix intermittent AI;DR shift and subset latin-ext font ([#229](https://github.com/duyet/aidr/issues/229)) ([#303](https://github.com/duyet/aidr/issues/303)) ([9b16fef](https://github.com/duyet/aidr/commit/9b16fef41b173047c172b250adf87ecc7f8bf21a))
* **web:** harden subscribe preview cache and loading state ([#284](https://github.com/duyet/aidr/issues/284)) ([0120b46](https://github.com/duyet/aidr/commit/0120b46fd39447e5bc9b63b12500bc2c8e2fd865))
* **web:** inline critical CSS, load full stylesheet async, fix row re-wrap ([#291](https://github.com/duyet/aidr/issues/291)) ([bea5b44](https://github.com/duyet/aidr/commit/bea5b44d6e08dd8dd01f9dac5da4bb0272007268)), closes [#229](https://github.com/duyet/aidr/issues/229)
* **web:** inline the full built stylesheet on the homepage ([#300](https://github.com/duyet/aidr/issues/300)) ([75a9459](https://github.com/duyet/aidr/commit/75a9459778810dae8b28629434cc456e337d8f63)), closes [#229](https://github.com/duyet/aidr/issues/229)


### ♻️ Refactoring

* **digest:** one language edition for email and Telegram ([#258](https://github.com/duyet/aidr/issues/258)) ([bf79c76](https://github.com/duyet/aidr/commit/bf79c76a0bbd439527f5c0e04ee0306f5a85ca64))
* **web:** split run details into focused panels ([#269](https://github.com/duyet/aidr/issues/269)) ([4d3a836](https://github.com/duyet/aidr/commit/4d3a8368fd94f4728fad50c999d70b75062e5d37))
* **web:** split the deliver page into one module per channel ([#267](https://github.com/duyet/aidr/issues/267)) ([53d51af](https://github.com/duyet/aidr/commit/53d51af65d6286b75be6984255e0b524b92055e1))
* **worker:** share sha256Hex and chunk helpers ([#273](https://github.com/duyet/aidr/issues/273)) ([c12f623](https://github.com/duyet/aidr/commit/c12f62340238772aabd46651277dd50b2abe50e9))
* **worker:** split ingest workflow into step modules ([#272](https://github.com/duyet/aidr/issues/272)) ([361b07b](https://github.com/duyet/aidr/commit/361b07b2c6c36938df5de8c580e4de50b051fc80))

## [0.1.9](https://github.com/duyet/aidr/compare/web-v0.1.8...web-v0.1.9) (2026-09-28)


### 🐛 Bug Fixes

* **web:** gate model claims on lookup state, aggregate run usage in SQL ([#193](https://github.com/duyet/aidr/issues/193)) ([d025c51](https://github.com/duyet/aidr/commit/d025c51b4e731e0843430e33bdc8a7502d1e035c)), closes [#189](https://github.com/duyet/aidr/issues/189)
* **web:** harden non-HTML navigation routing ([#186](https://github.com/duyet/aidr/issues/186)) ([a241070](https://github.com/duyet/aidr/commit/a2410702fdb32c0b8c27340f7c77c1e6ceb4cbb3))
* **web:** load the full EB Garamond face on OG cards ([#245](https://github.com/duyet/aidr/issues/245)) ([fb8b107](https://github.com/duyet/aidr/commit/fb8b107dc0be9009590c8d22e7bfb2ae133ca10c))

## [0.1.8](https://github.com/duyet/aidr/compare/web-v0.1.7...web-v0.1.8) (2026-09-27)


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
* **web:** link anyrouter.dev from the footer More column ([#222](https://github.com/duyet/aidr/issues/222)) ([1d89d9e](https://github.com/duyet/aidr/commit/1d89d9e713161f34b611c784b9e01334940dac1c))
* **web:** live digest preview on subscribe email tab, richer chrome tab ([9558832](https://github.com/duyet/aidr/commit/955883209d4e0d7d155ad0bafb6d45677beb2644))
* **web:** make story sources compact and inline ([#176](https://github.com/duyet/aidr/issues/176)) ([db0b838](https://github.com/duyet/aidr/commit/db0b838608b9ac8713204274c61ce966740336e8))
* **web:** merge header actions into dropdown menu ([#133](https://github.com/duyet/aidr/issues/133)) ([710de64](https://github.com/duyet/aidr/commit/710de64c2ba8120f304a4f2741962e6d9a5d23b5))
* **web:** point Algorithms menu item at /data algo tab ([d5ea4bf](https://github.com/duyet/aidr/commit/d5ea4bf0c8989cf9c9ef92e6a44af99f2a9c130a))
* **web:** public RSS at /feed.xml, Google News sitemap, sharded sitemap index, feed autodiscovery ([#236](https://github.com/duyet/aidr/issues/236)) ([07b05a6](https://github.com/duyet/aidr/commit/07b05a62f7b4b31110526af2428ae2a2b9a96e79))
* **web:** put the AnyRouter mark on the /data surfaces ([#221](https://github.com/duyet/aidr/issues/221)) ([74aa4e6](https://github.com/duyet/aidr/commit/74aa4e697201c01ae979a571f02dcac2808c5d1f))
* **web:** redesign /data and sync Clerk signups from a verified webhook ([#205](https://github.com/duyet/aidr/issues/205)) ([2b63ced](https://github.com/duyet/aidr/commit/2b63cedaf9a13c20652bedf1dbc2fdfeef4df772))
* **web:** refresh OG images with homepage masthead variant ([177a633](https://github.com/duyet/aidr/commit/177a6335d035c659c978bd9ffe45d9c22aaf8e12))
* **web:** server-rendered JSON-LD (NewsArticle/WebPage/ItemList/BreadcrumbList) + single site_name constant ([#239](https://github.com/duyet/aidr/issues/239)) ([8dfef74](https://github.com/duyet/aidr/commit/8dfef745fe6135715492dc041d1a845ff6332175))
* **web:** url-state subscribe tabs, email link in header menu ([6b858e4](https://github.com/duyet/aidr/commit/6b858e4d680fa9cbb7704f0e327f49fd7b1b822a))
* **web:** valid llms.txt links, read-only WebMCP tools, ai-catalog.json ([#238](https://github.com/duyet/aidr/issues/238)) ([1cb0c6d](https://github.com/duyet/aidr/commit/1cb0c6d11788fdbff5351825322ba380383b7251))
* **worker:** anonymous read-only MCP news tools + truthful discovery docs ([#237](https://github.com/duyet/aidr/issues/237)) ([735621d](https://github.com/duyet/aidr/commit/735621d8280e220e3143e30f36d151982544cbe1))
* **worker:** automated Telegram IV field gate, explicit link-preview format, runnable editor checklist (no-go unchanged) ([#235](https://github.com/duyet/aidr/issues/235)) ([bf81531](https://github.com/duyet/aidr/commit/bf81531ba24d5eb8be4e1024d45877c50b5abea1))
* **worker:** more verified news sources, data-driven source registry, per-source + stale observability ([#241](https://github.com/duyet/aidr/issues/241)) ([dda036f](https://github.com/duyet/aidr/commit/dda036f7bff625828b46f48e0b71b564c48d7398))


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
* **web:** index bare localized URLs, 308 legacy story hops, valid robots.txt ([#233](https://github.com/duyet/aidr/issues/233)) ([2018dbb](https://github.com/duyet/aidr/commit/2018dbb4ada039c8be76aef8116f2cc72de8bb52))
* **web:** keep story source metadata unit intact and skip empty rows ([#191](https://github.com/duyet/aidr/issues/191)) ([caa4407](https://github.com/duyet/aidr/commit/caa44078b563501d297cf23104f3597e916bdbf6))
* **web:** populate run Models/attempts and surface step fallbacks ([#197](https://github.com/duyet/aidr/issues/197)) ([146a0a0](https://github.com/duyet/aidr/commit/146a0a02bbb0defb4feace148d5ff8b5add679fe)), closes [#189](https://github.com/duyet/aidr/issues/189)
* **web:** preserve locale across neutral navigation ([94bd26c](https://github.com/duyet/aidr/commit/94bd26ce667f7de0bfbe2fa9ce234e64e18f5c19))
* **web:** read the llms.txt H1 from SITE_NAME so the brand cannot drift ([#242](https://github.com/duyet/aidr/issues/242)) ([ec1a0a3](https://github.com/duyet/aidr/commit/ec1a0a3ff295b6a28577fbc40f0473f80e033122))
* **web:** remove mobile Get AI;DR trigger circle background ([#206](https://github.com/duyet/aidr/issues/206)) ([aa12d43](https://github.com/duyet/aidr/commit/aa12d43bf7355f7b038fb943ee7bb7b193631da3))
* **web:** replace opacity-based muted text with reader-bg-safe contrast tokens ([#240](https://github.com/duyet/aidr/issues/240)) ([dcfa6bc](https://github.com/duyet/aidr/commit/dcfa6bc86ae6495809593ed1ccbbdee313184729))
* **web:** send Jev choice criteria as object maps ([#188](https://github.com/duyet/aidr/issues/188)) ([f786f29](https://github.com/duyet/aidr/commit/f786f295996eac7a9e73a5360043dd4265344907)), closes [#187](https://github.com/duyet/aidr/issues/187)
* **web:** stop legacy story redirects from hijacking server functions ([#181](https://github.com/duyet/aidr/issues/181)) ([9d864bf](https://github.com/duyet/aidr/commit/9d864bf77b7fb9a5344e4922e6183f3983701fa7)), closes [#178](https://github.com/duyet/aidr/issues/178)
* **web:** stop neutral locale redirect loops ([#182](https://github.com/duyet/aidr/issues/182)) ([4d18a7c](https://github.com/duyet/aidr/commit/4d18a7c57c94d816877dcf83203fd7245bdc4703))
* **web:** unbreak the /data runs charts, dedupe algo tab, pad tabs ([#219](https://github.com/duyet/aidr/issues/219)) ([7fb5791](https://github.com/duyet/aidr/commit/7fb579130132b0c7c59f74206beaacceff4659a0))
* **web:** widen story dialog on large screens ([#162](https://github.com/duyet/aidr/issues/162)) ([b32c49a](https://github.com/duyet/aidr/commit/b32c49a075769ac966f29df96d64dd35edc0bab0))
* **worker:** let media backfill reach rows that already have a legacy image_url ([7089a94](https://github.com/duyet/aidr/commit/7089a941c1b99b4c4d74ff2d04c71f8e0dca92f6))
* **worker:** let the Clerk handshake redirect back to the app origin (login 502) ([#212](https://github.com/duyet/aidr/issues/212)) ([58d1445](https://github.com/duyet/aidr/commit/58d1445e0676555e79ae9414f08f5c8f6cce512e))


### ⚡ Performance

* **web:** cut the LCP element render delay and the font-swap CLS ([#243](https://github.com/duyet/aidr/issues/243)) ([b476a14](https://github.com/duyet/aidr/commit/b476a144492b90cdfdd085d871c3dc7167d46329))
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
