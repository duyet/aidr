# Changelog

## [0.1.19](https://github.com/duyet/aidr/compare/web-v0.1.18...web-v0.1.19) (2026-10-31)


### ✨ Features

* **ingest:** pause the scheduler with INGEST_SCHEDULER_PAUSED ([#1091](https://github.com/duyet/aidr/issues/1091)) ([0cfb8bd](https://github.com/duyet/aidr/commit/0cfb8bd5343bec851b24042210a438d18bf18a2c))
* **og:** serve story cards as static files from og.aidr.today ([#1093](https://github.com/duyet/aidr/issues/1093)) ([51b2602](https://github.com/duyet/aidr/commit/51b2602e7e8d9834a380b7776ae99705c5c29db4))
* **og:** upload story cards through an admin route, drop the R2 API keys ([#1107](https://github.com/duyet/aidr/issues/1107)) ([619e725](https://github.com/duyet/aidr/commit/619e725221274f54ca5e97001a0dcfa6b089810e))
* **web:** copy a story or a whole day as title + link for social posts ([#1104](https://github.com/duyet/aidr/issues/1104)) ([82ef02e](https://github.com/duyet/aidr/commit/82ef02ead4da9e5a56d5c44f72593f87ccd51faa))
* **web:** tag copied share links with utm_source=share ([#1109](https://github.com/duyet/aidr/issues/1109)) ([6093292](https://github.com/duyet/aidr/commit/6093292fb93e34761fd0e385c83f3c488ca402a0))


### 🐛 Bug Fixes

* **health:** daily summary skips legacy runs stored in epoch ms ([#1099](https://github.com/duyet/aidr/issues/1099)) ([2bf77be](https://github.com/duyet/aidr/commit/2bf77bea595ee1411690f678005731dd411d5670))
* **health:** llm-failure-rate counts exhausted chains, not failed attempts ([#1097](https://github.com/duyet/aidr/issues/1097)) ([4be7144](https://github.com/duyet/aidr/commit/4be71440e1327d91741b4b8d3f046754c545f146))
* **llm:** replace dead sonnet and preset in the cluster chain ([#1098](https://github.com/duyet/aidr/issues/1098)) ([91e40a9](https://github.com/duyet/aidr/commit/91e40a95933ca6e9ac1b120766f4cf832911c128))
* **og:** raise the card upload cap to 2 MiB and skip, not fail, an oversized card ([#1108](https://github.com/duyet/aidr/issues/1108)) ([adf8783](https://github.com/duyet/aidr/commit/adf8783eb1c44b14dbc716aa33661f7f1f16c4ca))
* **verify-aidr:** doctor checks the current title and dead LLM chains ([#1101](https://github.com/duyet/aidr/issues/1101)) ([f5a066f](https://github.com/duyet/aidr/commit/f5a066ff022625eba4b71a550db2fbbff5e86056))
* **web:** serve each font family as one file so Vietnamese words never mix faces ([#1087](https://github.com/duyet/aidr/issues/1087)) ([4bdf9c5](https://github.com/duyet/aidr/commit/4bdf9c5419a510e3ccc5ccbb78005da0213815e9))


### ⚡ Performance

* **d1:** cut feed, re-rank and workflow_runs rows read ([#1089](https://github.com/duyet/aidr/issues/1089)) ([65dc7fb](https://github.com/duyet/aidr/commit/65dc7fbd511a5ed649a8a8c248b6e36385e7ed0d))
* **og:** key story cards by their inputs, apart from day cards ([#1092](https://github.com/duyet/aidr/issues/1092)) ([d5768a4](https://github.com/duyet/aidr/commit/d5768a4b70e6cdacc01f23483e03f8fdc2156063))
* **og:** redirect archive stories without a stored card to the home card ([#1094](https://github.com/duyet/aidr/issues/1094)) ([5b81e91](https://github.com/duyet/aidr/commit/5b81e91c3b6711faa095e6cc5b44394aad0f9b59))
* **og:** send bulk crawlers the home card on a story card miss ([#1103](https://github.com/duyet/aidr/issues/1103)) ([f8d53e8](https://github.com/duyet/aidr/commit/f8d53e854a2362b5fe8219955421955512f441dc))
* **web:** keep SEO-audit crawlers off the site, narrow the Kakao card match ([#1106](https://github.com/duyet/aidr/issues/1106)) ([e69a511](https://github.com/duyet/aidr/commit/e69a5116aca56ac60e5abad4172f42eaae77b774))
* **web:** sample Workers Logs at 5% ([#1095](https://github.com/duyet/aidr/issues/1095)) ([f6c552e](https://github.com/duyet/aidr/commit/f6c552e3eed53bd317986f877a54dadcbc0b54d9))

## [0.1.18](https://github.com/duyet/aidr/compare/web-v0.1.17...web-v0.1.18) (2026-10-28)


### 🐛 Bug Fixes

* **llm:** try the next model when an answer fails validate ([#1081](https://github.com/duyet/aidr/issues/1081)) ([4d2c43a](https://github.com/duyet/aidr/commit/4d2c43a648ad30192507bebd9a71854bc8cf6fcb)), closes [#1056](https://github.com/duyet/aidr/issues/1056)

## [0.1.17](https://github.com/duyet/aidr/compare/web-v0.1.16...web-v0.1.17) (2026-10-27)


### ✨ Features

* **ingest:** shadow freshness and trending check for top stories ([#1075](https://github.com/duyet/aidr/issues/1075)) ([afa8512](https://github.com/duyet/aidr/commit/afa8512e47fc1921b010aa961eced7a9d68add35))


### 🐛 Bug Fixes

* **auth:** skip Clerk's handshake on reader pages ([#1078](https://github.com/duyet/aidr/issues/1078)) ([3ac2a8f](https://github.com/duyet/aidr/commit/3ac2a8f82aeb0d1ee94165c2933a139ff48d82b3))


### ⚡ Performance

* **story:** read a story's edit history in the story's own D1 batch ([#1073](https://github.com/duyet/aidr/issues/1073)) ([ec6810c](https://github.com/duyet/aidr/commit/ec6810ca8f45fb4c04d6162b32214b41c638995b))
* **story:** seek the items id index instead of the status index ([#1072](https://github.com/duyet/aidr/issues/1072)) ([e17066f](https://github.com/duyet/aidr/commit/e17066fbb3f566210536b361c645621d402ec64b))
* **web:** keep crawlers off /sign-in and /sign-up via robots.txt ([#1069](https://github.com/duyet/aidr/issues/1069)) ([4d75f35](https://github.com/duyet/aidr/commit/4d75f358ce06f4a655a2efbffdc7c2ea2c3c25db))

## [0.1.16](https://github.com/duyet/aidr/compare/web-v0.1.15...web-v0.1.16) (2026-10-26)


### ✨ Features

* **header:** add MCP Server to the Get AI;DR menu above RSS ([#1040](https://github.com/duyet/aidr/issues/1040)) ([49f90f4](https://github.com/duyet/aidr/commit/49f90f44df0c82f36fa8f21fee937c207b71c84a))
* **mcp:** isometric anatomy figure that explains the MCP server ([#1039](https://github.com/duyet/aidr/issues/1039)) ([8b8083f](https://github.com/duyet/aidr/commit/8b8083fcfec7f26811dea8452a78f1cbd1c66b79))
* **mcp:** one-click install buttons for MCP clients ([#1042](https://github.com/duyet/aidr/issues/1042)) ([5981b6f](https://github.com/duyet/aidr/commit/5981b6f454d9ca6a40d3ae9315dc7fef1e4fe06b))
* **notify:** per-post utm_content and daily Facebook post stats ([#837](https://github.com/duyet/aidr/issues/837)) ([#967](https://github.com/duyet/aidr/issues/967)) ([a30d7cc](https://github.com/duyet/aidr/commit/a30d7cc8f0741a684d0caba9b0d8301f2d09dd08))
* **og:** photo-led story share card with full-bleed thumbnail ([#1054](https://github.com/duyet/aidr/issues/1054)) ([c14fad2](https://github.com/duyet/aidr/commit/c14fad2accd261456a54b4d48716d5e1b70d7502))
* **skills:** scored review skills for each output ([#1020](https://github.com/duyet/aidr/issues/1020)) ([62de0ce](https://github.com/duyet/aidr/commit/62de0ce8d8e0506bc99a6cac7bbfaaf1dc105126))
* **subscribe:** add MCP server tab before RSS ([#1038](https://github.com/duyet/aidr/issues/1038)) ([f16cd97](https://github.com/duyet/aidr/commit/f16cd970a9561dd7cb481d1bfef3c284a08c7238))
* **subscribe:** add RSS as a subscribe channel tab ([#1028](https://github.com/duyet/aidr/issues/1028)) ([cfc1bd5](https://github.com/duyet/aidr/commit/cfc1bd59f5c4c25bf9c1ae73369e5fd200bb0cce))
* **telegram:** plain headers like the email, no 🗞 or 🔥 ([#948](https://github.com/duyet/aidr/issues/948)) ([e47d93d](https://github.com/duyet/aidr/commit/e47d93d95f5b0c69b5a65356a647f28247bf1218))
* **telegram:** show every story on 4 and 5 story days ([#768](https://github.com/duyet/aidr/issues/768)) ([#952](https://github.com/duyet/aidr/issues/952)) ([315c06a](https://github.com/duyet/aidr/commit/315c06a102c5f7695976f732fa8ec08f8af595c7))
* **translate:** use Nemotron 3.5 Bolt E4B as the EN-VI fallback ([#1065](https://github.com/duyet/aidr/issues/1065)) ([da3f8e3](https://github.com/duyet/aidr/commit/da3f8e32e80e45b269a94b688f46f5abc2fb215a))
* **web:** short link aidr.today/c to the Chrome Web Store ([#1041](https://github.com/duyet/aidr/issues/1041)) ([3808954](https://github.com/duyet/aidr/commit/380895440daeb0d39f92fbbea7ac94010325bc9c))


### 🐛 Bug Fixes

* **admin:** count only unverifiable bearers toward the admin lockout ([#977](https://github.com/duyet/aidr/issues/977)) ([#993](https://github.com/duyet/aidr/issues/993)) ([4816325](https://github.com/duyet/aidr/commit/4816325dd38c774295e751c5b4d34417b9315bb4))
* **card:** set no day card headline below 23 px, move tiles to rows when they don't fit ([#1022](https://github.com/duyet/aidr/issues/1022)) ([#1026](https://github.com/duyet/aidr/issues/1026)) ([8c835e2](https://github.com/duyet/aidr/commit/8c835e2e9522d35feb697382d510e54973c435bc))
* **ci:** apply D1 migrations before deploy in the same run ([#973](https://github.com/duyet/aidr/issues/973)) ([3745663](https://github.com/duyet/aidr/commit/374566356024237bf65896c540f61a2f09c30276))
* **clerk:** write synced rows in one batch, stamp Clerk's updated_at, throttle per user ([#946](https://github.com/duyet/aidr/issues/946)) ([#956](https://github.com/duyet/aidr/issues/956)) ([bbee1c6](https://github.com/duyet/aidr/commit/bbee1c6ca7f05d5a03ac05b41d24c881841919a7))
* **copy:** name the product AI;DR in titles and meta, clean VI MCP panel ([#1052](https://github.com/duyet/aidr/issues/1052)) ([70fb949](https://github.com/duyet/aidr/commit/70fb9499f798d5bd6ef12732c42cbfc4dd5745ae))
* **dedupe:** never pick a story under the relevance bar as canonical ([#981](https://github.com/duyet/aidr/issues/981)) ([#998](https://github.com/duyet/aidr/issues/998)) ([cff91d6](https://github.com/duyet/aidr/commit/cff91d67f6fdc787a539de5d2720bd8fa13ea900))
* **dedupe:** split LLM clusters by evidence so one backing item cannot carry others in ([#964](https://github.com/duyet/aidr/issues/964)) ([f61e6d0](https://github.com/duyet/aidr/commit/f61e6d012f4eb4f4bebb36ee886612525228e883))
* **deps:** update all non-major dependencies ([#1014](https://github.com/duyet/aidr/issues/1014)) ([71811c6](https://github.com/duyet/aidr/commit/71811c667c077d42ab2ea6c60fc9497f33217f89))
* **email:** claim the digest stamp before sending and isolate subscriber errors ([#976](https://github.com/duyet/aidr/issues/976)) ([#1005](https://github.com/duyet/aidr/issues/1005)) ([ea43e71](https://github.com/duyet/aidr/commit/ea43e7168b578efd482cfa8776a0999db3a6d2fd))
* **email:** send a digest only for a local date later than the last one ([#979](https://github.com/duyet/aidr/issues/979)) ([#1004](https://github.com/duyet/aidr/issues/1004)) ([966881e](https://github.com/duyet/aidr/commit/966881e5e92e8130d688927fa00d5e8327591913))
* **ingest:** cap new rows per run so write-d1 stays under the D1 query limit ([#997](https://github.com/duyet/aidr/issues/997)) ([f625e10](https://github.com/duyet/aidr/commit/f625e10401c20de11ae311b268a3841bb6925a4c))
* **ingest:** close the run row when Workflow create() fails ([#991](https://github.com/duyet/aidr/issues/991)) ([88737e4](https://github.com/duyet/aidr/commit/88737e47706d07ae3dcd537582ce01ada44145c8))
* **ingest:** do not retry deterministic source failures ([#1000](https://github.com/duyet/aidr/issues/1000)) ([4a4681b](https://github.com/duyet/aidr/commit/4a4681b1e987e01682c580600767185cc7fe8d8c)), closes [#983](https://github.com/duyet/aidr/issues/983)
* **llm:** read mid-stream error frames and name each hop's failure ([#960](https://github.com/duyet/aidr/issues/960)) ([34bfa39](https://github.com/duyet/aidr/commit/34bfa39b0aed5b2e9667d073558a8e2c4411819f))
* **mail:** claim each campaign recipient before sending ([#975](https://github.com/duyet/aidr/issues/975)) ([#1006](https://github.com/duyet/aidr/issues/1006)) ([a575300](https://github.com/duyet/aidr/commit/a575300625bf1e2c12f4b7933c0f1a458af738fb))
* **media:** type video-tag sources from MIME or extension, not URL text ([#986](https://github.com/duyet/aidr/issues/986)) ([#990](https://github.com/duyet/aidr/issues/990)) ([a5696f8](https://github.com/duyet/aidr/commit/a5696f8feeeec871e706edbff1f98c7c7b45b19b))
* **notify:** give caption fallbacks a real time slice ([#1053](https://github.com/duyet/aidr/issues/1053)) ([8bade7a](https://github.com/duyet/aidr/commit/8bade7a7bdc315b59a7aa71363bb92c0ef0705f3)), closes [#1034](https://github.com/duyet/aidr/issues/1034)
* **notify:** measure the Vietnamese Telegram gate and cut its false refusals ([#950](https://github.com/duyet/aidr/issues/950)) ([670f63b](https://github.com/duyet/aidr/commit/670f63b04bede0e53f2b33d3facc62b569256161))
* **og:** bump render version for the photo-led story card ([#1057](https://github.com/duyet/aidr/issues/1057)) ([1598ff3](https://github.com/duyet/aidr/commit/1598ff3cd88c144683a41c8ab2d481c186d4378e))
* **privacy:** list every analytics vendor and turn off PostHog autocapture, errors and replay ([#955](https://github.com/duyet/aidr/issues/955)) ([e63d57b](https://github.com/duyet/aidr/commit/e63d57bf6ec23b89266e3c52f4a295ead58e8f90))
* **qa:** say why qa-translations failed in the step-failed alert ([#592](https://github.com/duyet/aidr/issues/592)) ([#1010](https://github.com/duyet/aidr/issues/1010)) ([05677e2](https://github.com/duyet/aidr/commit/05677e267907db7771ec4d329363ce2ccbaf9452))
* **sources:** read a GitHub 403 with an empty quota as rate limited ([#1055](https://github.com/duyet/aidr/issues/1055)) ([ea0e268](https://github.com/duyet/aidr/commit/ea0e268d71628c18cdf309f59ef0dfbc04aed295))
* **sources:** type huggingnews feed errors and fall back to the sitemap ([#1001](https://github.com/duyet/aidr/issues/1001)) ([3de9c88](https://github.com/duyet/aidr/commit/3de9c887db91a8340cd141b1dab72d88eb2f3404)), closes [#984](https://github.com/duyet/aidr/issues/984)
* **submissions:** cap note, bound review retries, claim limits atomically ([#999](https://github.com/duyet/aidr/issues/999)) ([a46e0bf](https://github.com/duyet/aidr/commit/a46e0bf3f7e33d3d19ff87f2b195fd589367b712))
* **subscribe:** claim the confirm before sending welcome and owner mails ([#978](https://github.com/duyet/aidr/issues/978)) ([#1003](https://github.com/duyet/aidr/issues/1003)) ([e04b9a3](https://github.com/duyet/aidr/commit/e04b9a38ddf5782189a5eca101bc7a40bed99124))
* **subscribe:** stop email tab hydration mismatch on the timezone note ([#1032](https://github.com/duyet/aidr/issues/1032)) ([1b355cb](https://github.com/duyet/aidr/commit/1b355cb18fd3f2c3498a6a893d47c204b7fa6024))
* **topics:** grow learned keyword hit_count by this run's mentions ([#982](https://github.com/duyet/aidr/issues/982)) ([#995](https://github.com/duyet/aidr/issues/995)) ([584f810](https://github.com/duyet/aidr/commit/584f81024e9840bc94338bbc7a7280086faf2fac))
* **translate:** flag VI syllables no Vietnamese word uses ([#959](https://github.com/duyet/aidr/issues/959)) ([dce9cad](https://github.com/duyet/aidr/commit/dce9cadbbf9846c151f8513b0774deff64455ed8))
* **translate:** re-check stored VI rows with the draft check in backfill ([#1021](https://github.com/duyet/aidr/issues/1021)) ([#1025](https://github.com/duyet/aidr/issues/1025)) ([fc7fbfd](https://github.com/duyet/aidr/commit/fc7fbfde148927691635857f3c3bf6997f23d61a))
* **web:** compact Aa popover with row layout and steppers ([#1048](https://github.com/duyet/aidr/issues/1048)) ([6860922](https://github.com/duyet/aidr/commit/68609227d24ca3c208c0cd465a1575dc58752b0e))
* **web:** day video alert counts the missing streak and names the credentials to check ([#635](https://github.com/duyet/aidr/issues/635)) ([#965](https://github.com/duyet/aidr/issues/965)) ([3135d1b](https://github.com/duyet/aidr/commit/3135d1bfe7fd6e75e25a25b50b5e8c52d52dc3ac))
* **worker:** one rescore for backfill and admin reprocess ([#969](https://github.com/duyet/aidr/issues/969)) ([e7610c6](https://github.com/duyet/aidr/commit/e7610c612cb9abdc0248d53ea7d09cecec726f2d))
* **worker:** treat a Durable Object storage reset as an engine interruption ([#958](https://github.com/duyet/aidr/issues/958)) ([95603a2](https://github.com/duyet/aidr/commit/95603a2c2f42786c8597ebaf3d5b54ee421a577c)), closes [#928](https://github.com/duyet/aidr/issues/928)


### ♻️ Refactoring

* **worker:** one row-rank helper and one known-topics loader ([#968](https://github.com/duyet/aidr/issues/968)) ([b2880ef](https://github.com/duyet/aidr/commit/b2880efecad57e4e1c998c3508129848490f15ed))

## [0.1.15](https://github.com/duyet/aidr/compare/web-v0.1.14...web-v0.1.15) (2026-10-20)

### ✨ Features

- **admin:** add GET /api/admin/diagnostics and get_diagnostics ([c2e4091](https://github.com/duyet/aidr/commit/c2e4091bacb8432e00df986e36bc5fb8af984195))
- **admin:** unmerge tool for wrong cluster merges ([#733](https://github.com/duyet/aidr/issues/733)) ([#739](https://github.com/duyet/aidr/issues/739)) ([eed02c6](https://github.com/duyet/aidr/commit/eed02c6fc5999eac79abd6e8071fadbbb354d56b))
- **agent:** add agent diagnose ([343793b](https://github.com/duyet/aidr/commit/343793b388c2e843da6f90e0d350e8e7b00d51ca))
- **analytics:** tag every aidr.today link we post with its channel ([#821](https://github.com/duyet/aidr/issues/821)) ([ca3fbfa](https://github.com/duyet/aidr/commit/ca3fbfa8bbbc5e5a88a08669b9b3f4e845117fb5))
- **audience:** add GA4 channels, source / medium, and landing pages ([#815](https://github.com/duyet/aidr/issues/815)) ([db6adc6](https://github.com/duyet/aidr/commit/db6adc6469cb5212e0665a0f1aea9cb6bede3815))
- **contribute:** add more sender emails from /contribute ([#943](https://github.com/duyet/aidr/issues/943)) ([8c8db7e](https://github.com/duyet/aidr/commit/8c8db7e546b3c13cde339bde1764e57bc316cfe5))
- **data:** per-channel minimum opens for top stories, 10 for email, telegram and extension ([#848](https://github.com/duyet/aidr/issues/848)) ([f291795](https://github.com/duyet/aidr/commit/f291795de3a16d57d2c62429bfacf4f6a50a3956))
- **data:** show opens and outbound clicks separately on the reads card ([#827](https://github.com/duyet/aidr/issues/827)) ([9421f58](https://github.com/duyet/aidr/commit/9421f58547554d70085faf5339d05484b9e03cf9))
- **data:** top stories by channel from item_reads ([#846](https://github.com/duyet/aidr/issues/846)) ([b9d497c](https://github.com/duyet/aidr/commit/b9d497ccc667aea603ffb0b8b4242b44f7119f2d))
- **dedupe:** check digit on cluster prompt aliases ([#824](https://github.com/duyet/aidr/issues/824)) ([1b1309d](https://github.com/duyet/aidr/commit/1b1309dff220909b4fd9760fef408165da74c724))
- **dedupe:** count cluster ids the parser drops and the ones it nearly matched ([#806](https://github.com/duyet/aidr/issues/806)) ([8dd7422](https://github.com/duyet/aidr/commit/8dd7422acaf7d73e5a6a304e3900e199ef5fa58f))
- **digest:** let importance decide what the edition family cap cuts ([#812](https://github.com/duyet/aidr/issues/812)) ([bf34389](https://github.com/duyet/aidr/commit/bf3438991254570aa9701fa5d412ad5d8cb55f78))
- **extension:** count /api/extension events per day in D1 ([#840](https://github.com/duyet/aidr/issues/840)) ([6d67a8c](https://github.com/duyet/aidr/commit/6d67a8c517ca8ebdbb326175dff3eba4a30e4b53))
- **health:** alert on English left in Vietnamese translations; keep the 20s first-token cap ([#716](https://github.com/duyet/aidr/issues/716)) ([7724494](https://github.com/duyet/aidr/commit/772449428e105457e093d72dd03e782e7b5c9131))
- **health:** alert on low Worker traffic and slow responses ([c0af331](https://github.com/duyet/aidr/commit/c0af331741055e7aa2ad213135d1fc1d79262ffd))
- **health:** alert when a source fetch fails 3 runs in a row ([52ce6f4](https://github.com/duyet/aidr/commit/52ce6f47eedb3a9df5c3a96891c4a681168c662d))
- **health:** alert when a source's image coverage collapses ([#853](https://github.com/duyet/aidr/issues/853)) ([3b16cef](https://github.com/duyet/aidr/commit/3b16cef81c085e746f080d22c67b1307c600f837))
- **llm:** add Claude Sonnet 5.5 as the last fallback in the chat chain ([#803](https://github.com/duyet/aidr/issues/803)) ([7a47ffc](https://github.com/duyet/aidr/commit/7a47ffc4f296c6f7375c874cfd44ed2ede4d3a98))
- **mail:** record daily digest send, fail and unsubscribe counts and show them on /data ([#841](https://github.com/duyet/aidr/issues/841)) ([6fb7955](https://github.com/duyet/aidr/commit/6fb7955436d9980c91d48d4b30e7c8e66101a371))
- **mail:** show the newest day video and tighten the digest rows ([#642](https://github.com/duyet/aidr/issues/642)) ([1f9c496](https://github.com/duyet/aidr/commit/1f9c496e2372a86896656e36b8911b9bcbc22377)), closes [#637](https://github.com/duyet/aidr/issues/637)
- **notify,mail:** consistent UTMs for Telegram, Facebook and email ([#709](https://github.com/duyet/aidr/issues/709)) ([2b8a2e3](https://github.com/duyet/aidr/commit/2b8a2e38833ab324436f7b2e584d2fa16abf66c7))
- **notify:** better Telegram story captions ([#653](https://github.com/duyet/aidr/issues/653)) ([5c62240](https://github.com/duyet/aidr/commit/5c62240824b18421a43e9cc475e62221599b1126))
- **notify:** one-post Telegram digest with the top story and a YouTube button ([#624](https://github.com/duyet/aidr/issues/624)) ([fe287dd](https://github.com/duyet/aidr/commit/fe287dd74ae0d790de273d8480cff08a496bd285))
- **og:** lay out each day card for that day's stories ([#767](https://github.com/duyet/aidr/issues/767)) ([40566a7](https://github.com/duyet/aidr/commit/40566a7dc9f39054aa225b39025a9d80155ce2d3))
- **ops:** add admin diagnostics, a traffic alert, and an en-summary no-text marker ([df773a0](https://github.com/duyet/aidr/commit/df773a09d34797a592c928b4705475e8d9af97b5))
- **ops:** audited tool to swap the OG card for a real image on Telegram posts ([#625](https://github.com/duyet/aidr/issues/625)) ([78023fa](https://github.com/duyet/aidr/commit/78023fadbae39f3046bdafff586b25de91d7fda6))
- **ranking:** weigh rank_score by story kind from the scorer's category ([#917](https://github.com/duyet/aidr/issues/917)) ([61bfbad](https://github.com/duyet/aidr/commit/61bfbad14e75b9003f6744f32f0817a26486a3e3))
- **reads:** count what readers open and let it order the homepage ([#822](https://github.com/duyet/aidr/issues/822)) ([96db517](https://github.com/duyet/aidr/commit/96db517fdf330fce348abcc89b0faeefcb3190e6))
- **score:** define importance bands by what a story is, with deal and drama anchors ([#813](https://github.com/duyet/aidr/issues/813)) ([63d8faf](https://github.com/duyet/aidr/commit/63d8fafbc3f4decc2a75fbc5892d2ea8ae04adaf))
- **scripts:** add llm-breaker-replay ([3ca0981](https://github.com/duyet/aidr/commit/3ca09810726de1c665eab2c3cc8a68a453cc5d73))
- **scripts:** add vi-audit, a dry run of the VI draft gate ([1faee19](https://github.com/duyet/aidr/commit/1faee199266dc08ac147cb01fbb5f95ebaded88a))
- **sources:** add hf-trending, Hugging Face trending release repos ([#814](https://github.com/duyet/aidr/issues/814)) ([7076d42](https://github.com/duyet/aidr/commit/7076d42c382a53459acefabe5ea3c35cc77a217d))
- **sources:** take HN stories at 20+ points through migration 0069 ([#873](https://github.com/duyet/aidr/issues/873)) ([#881](https://github.com/duyet/aidr/issues/881)) ([7a7cc27](https://github.com/duyet/aidr/commit/7a7cc275b2f0f3de46df8a557dda610c69ffd77c))
- **telemetry:** Analytics Engine counters for RSS, MCP tools and /api routes ([#845](https://github.com/duyet/aidr/issues/845)) ([cbe38f0](https://github.com/duyet/aidr/commit/cbe38f08d2db6d7d2f9634ad3bafc874859d4988))
- **tldr:** regenerate a recent date without replacing a model digest ([#696](https://github.com/duyet/aidr/issues/696)) ([5e4c624](https://github.com/duyet/aidr/commit/5e4c624063aaad9b9cd45317d35103bd34bf3126))
- **translate:** add model-family and robotics examples to VI_STYLE ([f9bdc9b](https://github.com/duyet/aidr/commit/f9bdc9b7eb3184d0d9649c4d37b427150dc81706))
- **translate:** flag garbled words in VI drafts ([b9eb620](https://github.com/duyet/aidr/commit/b9eb620ae6a4bf06393ae08cd9ec3a5e9e43aefe))
- **translate:** keep "model family" in English ([f5e27b2](https://github.com/duyet/aidr/commit/f5e27b2a0fb07599cb8366ec11185d9e4f29f889))
- **unmerge:** check dangling restores with the cluster model before they publish ([#797](https://github.com/duyet/aidr/issues/797)) ([#801](https://github.com/duyet/aidr/issues/801)) ([1379c24](https://github.com/duyet/aidr/commit/1379c24e3b70784c570950418d9b570a4a16626c))
- **unmerge:** restore merged rows whose canonical id names no item ([#791](https://github.com/duyet/aidr/issues/791)) ([#794](https://github.com/duyet/aidr/issues/794)) ([79dc33a](https://github.com/duyet/aidr/commit/79dc33a159c8fec887ac6610fdceb242e2f36526))
- **web:** alert the owner when the daily video misses a channel ([#641](https://github.com/duyet/aidr/issues/641)) ([06415cf](https://github.com/duyet/aidr/commit/06415cfaa4d142c2a2bedf58b42f9ecf5ecb150c))
- **web:** Markdown negotiation, get_day_edition MCP tool, llms-full.txt for agents ([#819](https://github.com/duyet/aidr/issues/819)) ([82a2b37](https://github.com/duyet/aidr/commit/82a2b370bd15a68185d1c9acd36480a3dbb025de))
- **web:** report request stages in Server-Timing ([#879](https://github.com/duyet/aidr/issues/879)) ([71d45b4](https://github.com/duyet/aidr/commit/71d45b42d86d14e2e77eddf869c4fc2d0289cb93))
- **web:** return readers to their story after sign-in ([#878](https://github.com/duyet/aidr/issues/878)) ([abd709b](https://github.com/duyet/aidr/commit/abd709bb8026e909fd30a0e85eddbf26995bf6cb))
- **web:** typed analytics event registry ([#634](https://github.com/duyet/aidr/issues/634)) ([26ceb44](https://github.com/duyet/aidr/commit/26ceb444a8eea7fc4e87424aaebd4088d42eb6cd))


### 🐛 Bug Fixes

- **admin:** store pushed published_at as epoch seconds ([bcd8120](https://github.com/duyet/aidr/commit/bcd81202e35709902d728a2f2b0087a6903839e6)), closes [#695](https://github.com/duyet/aidr/issues/695)
- **alerts:** list only the failing task's models in its issue ([#666](https://github.com/duyet/aidr/issues/666)) ([0937c33](https://github.com/duyet/aidr/commit/0937c3339dab5ba6712c56441b5653745ee90587))
- **analytics:** brand label and slug params so free text fails type-check ([#769](https://github.com/duyet/aidr/issues/769)) ([ca49f55](https://github.com/duyet/aidr/commit/ca49f55f5333bf3bd36ca90145a8fbac18c56214))
- **analytics:** keep subscribe tokens and search text out of vendor page URLs ([#711](https://github.com/duyet/aidr/issues/711)) ([0cb0e47](https://github.com/duyet/aidr/commit/0cb0e4755042ade509da34745eaca281041c4109))
- **analytics:** keep subscribe tokens out of replay network records ([#724](https://github.com/duyet/aidr/issues/724)) ([7fa2c1e](https://github.com/duyet/aidr/commit/7fa2c1e6e6ca9df4e59389b4c20cc8ee6a90543d)), closes [#701](https://github.com/duyet/aidr/issues/701)
- **analytics:** queue events before GA4 and PostHog load instead of dropping them ([#629](https://github.com/duyet/aidr/issues/629)) ([477a42f](https://github.com/duyet/aidr/commit/477a42f10eebd6d3b5f9f1f4db284b2630ebdb74))
- **analytics:** send app events to the configured GA4 id under the tag gateway ([#816](https://github.com/duyet/aidr/issues/816)) ([2036977](https://github.com/duyet/aidr/commit/20369775d01ee4f7d42407eec1998ed45c1fabb6))
- **analytics:** URL privacy follow-ups to [#711](https://github.com/duyet/aidr/issues/711) ([#720](https://github.com/duyet/aidr/issues/720)) ([d830663](https://github.com/duyet/aidr/commit/d8306638c0518affed229f459a355c79a8b1a8b9))
- **auth:** skip Clerk for requests that carry a subscriber token ([#741](https://github.com/duyet/aidr/issues/741)) ([6ae2426](https://github.com/duyet/aidr/commit/6ae24266b696fa1fd712c8280e502c3ef8b0c6fa))
- **backfill:** fetch each summary-leg row once and skip writes that change nothing ([#830](https://github.com/duyet/aidr/issues/830)) ([f48cf43](https://github.com/duyet/aidr/commit/f48cf43f7a69c114d9588c8d778ae6c656711b69))
- **dedupe:** cap a cluster attempt at 45s so the chain tail can answer ([#672](https://github.com/duyet/aidr/issues/672)) ([#746](https://github.com/duyet/aidr/issues/746)) ([f3c4ac5](https://github.com/duyet/aidr/commit/f3c4ac58edff41de58454514919dd144beb4502f))
- **dedupe:** name existing rows by alias in the cluster prompt ([#810](https://github.com/duyet/aidr/issues/810)) ([8a427c6](https://github.com/duyet/aidr/commit/8a427c690d1a1ad35b8f21808e86ebb0a5150732))
- **dedupe:** title pass needs a shared evidence word ([#749](https://github.com/duyet/aidr/issues/749)) ([#754](https://github.com/duyet/aidr/issues/754)) ([abbf567](https://github.com/duyet/aidr/commit/abbf567b66d24a43c725b1b26b5a7ca4f9e643fe))
- **deploy:** carry newest retired assets first; gate asset types and cache literals ([#730](https://github.com/duyet/aidr/issues/730)) ([e7d0930](https://github.com/duyet/aidr/commit/e7d093059d4e7bf4d1793455f567f9d131f01164))
- **deploy:** keep previous builds' /assets chunks servable and gate deploys on them ([#708](https://github.com/duyet/aidr/issues/708)) ([bbc383f](https://github.com/duyet/aidr/commit/bbc383fac83edb9a561d2c9832f94f1f51f501c8))
- **deploy:** refuse to deploy a build that kept the dev-only Clerk skip ([#734](https://github.com/duyet/aidr/issues/734)) ([0ba316a](https://github.com/duyet/aidr/commit/0ba316a64b86ccde1e25971ec2418d1af5cb6dab))
- **health:** alert on English-in-VI above 10%, not 15% ([#719](https://github.com/duyet/aidr/issues/719)) ([09d9020](https://github.com/duyet/aidr/commit/09d9020fdc4e59358a660d9ec1e2d8eea2bb22b9))
- **health:** judge English-in-VI on summaries, pin the workflow wiring, say GitHub issues need a token ([#718](https://github.com/duyet/aidr/issues/718)) ([4d5cb2a](https://github.com/duyet/aidr/commit/4d5cb2aa80e76c4790f56cab75bb670dd4bfef3a)), closes [#717](https://github.com/duyet/aidr/issues/717)
- **ingest:** decode accented and symbol HTML entities at the boundary ([#725](https://github.com/duyet/aidr/issues/725)) ([f50a4cc](https://github.com/duyet/aidr/commit/f50a4cc327b21914e7a0940589a48abea0306b1a))
- **ingest:** drop TechCrunch event ticket promos before dedupe ([#852](https://github.com/duyet/aidr/issues/852)) ([#855](https://github.com/duyet/aidr/issues/855)) ([ea51b61](https://github.com/duyet/aidr/commit/ea51b61b54e088156775c1696cb6a1cb4cab673b))
- **ingest:** fetch a picture for video-only items and stop refetching blocked rows in the media backfill ([#809](https://github.com/duyet/aidr/issues/809)) ([902a8f4](https://github.com/duyet/aidr/commit/902a8f419e6b7ef14de281235877c40cd4243aa8))
- **ingest:** flag sources that block the Worker and keep dateless feeds ([6a204bd](https://github.com/duyet/aidr/commit/6a204bdc21a941d4471a13cef15b87ea92e8739a))
- **ingest:** flag sources that block the Worker and keep dateless feeds ([af3e039](https://github.com/duyet/aidr/commit/af3e03955d2d2bf03e65656d2519f2c5d0ce7d04))
- **ingest:** keep scorer tags when normalize-topics fails ([#773](https://github.com/duyet/aidr/issues/773)) ([51b69ad](https://github.com/duyet/aidr/commit/51b69add7e5bcbb5bd5c99d5b5e5e7fc306b6569))
- **ingest:** log source fetch errors and alert on repeated failures ([7c9e658](https://github.com/duyet/aidr/commit/7c9e658b3a94381fe4a01323bbf6ad4c1a29fb84))
- **ingest:** log the cause of a failed source fetch step ([84fd0bc](https://github.com/duyet/aidr/commit/84fd0bc8c6d1d30ebb6c3939b247b555130f9c18))
- **ingest:** stop re-queuing en-summary rows with no text ([e0c2ce0](https://github.com/duyet/aidr/commit/e0c2ce03ec65cccc160a6d995ce0ffd6f57f61db))
- **ingest:** strip a footer only when it ends the text as its own sentence ([#665](https://github.com/duyet/aidr/issues/665)) ([3bc03f6](https://github.com/duyet/aidr/commit/3bc03f6286d8c43c1299e4fe3dcb30ce789b4578))
- **ingest:** strip RSS 'appeared first on' footers ([#661](https://github.com/duyet/aidr/issues/661)) ([a65f25f](https://github.com/duyet/aidr/commit/a65f25f8585aeb346e5c9ee18f9c056e16d96f59))
- **llm:** drop anyrouter/auto from the chat chain so Sonnet can answer a cluster call ([#859](https://github.com/duyet/aidr/issues/859)) ([b49ee40](https://github.com/duyet/aidr/commit/b49ee40a755d4d3229da0f0194dfc0c460b5d6ce)), closes [#672](https://github.com/duyet/aidr/issues/672)
- **llm:** keep good TL;DR digests and key skip lists by task ([#683](https://github.com/duyet/aidr/issues/683)) ([64c3736](https://github.com/duyet/aidr/commit/64c3736baee7741a9a519dd70bf648b105bb9175))
- **llm:** label a cooled chain distinctly from a chain where every model failed ([#712](https://github.com/duyet/aidr/issues/712)) ([2ed642a](https://github.com/duyet/aidr/commit/2ed642a0f241d9552480098d9abeab2c9e2aa9ae))
- **llm:** lead translate chains with Laguna and drop dead ids ([#674](https://github.com/duyet/aidr/issues/674)) ([bdf7cf6](https://github.com/duyet/aidr/commit/bdf7cf6a8610e8d2ca0f80a8ec82844694beda67))
- **llm:** pause translation review and alert when a task's whole chain fails ([#664](https://github.com/duyet/aidr/issues/664)) ([4ae9210](https://github.com/duyet/aidr/commit/4ae9210051b2808d35ee28a7cd5ba36b00f75977))
- **llm:** sanitized failure snippets and bad_output for parse failures ([#752](https://github.com/duyet/aidr/issues/752)) ([95a94d0](https://github.com/duyet/aidr/commit/95a94d06c6fffd4b53bf836620412e8a4c46739c))
- **llm:** separate local AnyRouter key and alert on 429 bursts ([#657](https://github.com/duyet/aidr/issues/657)) ([4c80ecc](https://github.com/duyet/aidr/commit/4c80eccde833f32af464c899a9898bdfdc135310))
- **llm:** stop sending a chain whose every id is 429-skipped ([#694](https://github.com/duyet/aidr/issues/694)) ([99c0708](https://github.com/duyet/aidr/commit/99c0708d7986393b9859b8b6be36dc825a2efa5b))
- **media,videos:** drop imgur screen captures when a story has other images; keep the 16:9 rank box clear of the logo ([#687](https://github.com/duyet/aidr/issues/687)) ([4dd2c6f](https://github.com/duyet/aidr/commit/4dd2c6f04fc38cfb2051396924767bb3ebe05b93))
- **media:** keep one share card when cards are the best images ([#727](https://github.com/duyet/aidr/issues/727)) ([1ca802f](https://github.com/duyet/aidr/commit/1ca802fb97d494bf5cf5e00c44319def6839900c))
- **merge:** count near-duplicates against the story title only ([#745](https://github.com/duyet/aidr/issues/745)) ([#751](https://github.com/duyet/aidr/issues/751)) ([1e94210](https://github.com/duyet/aidr/commit/1e9421095e7c998205653864476aeeae4567a614))
- **merge:** gate links on whole words and across languages ([#745](https://github.com/duyet/aidr/issues/745)) ([#750](https://github.com/duyet/aidr/issues/750)) ([0b293e1](https://github.com/duyet/aidr/commit/0b293e15bc9f618d2eebc61087ce1427ba363630))
- **merge:** gate LLM cluster links to unrelated stories ([#733](https://github.com/duyet/aidr/issues/733)) ([#744](https://github.com/duyet/aidr/issues/744)) ([d9bd537](https://github.com/duyet/aidr/commit/d9bd53797f8cf8e594e4cf64146e1ff6d2aa7abb))
- **notify:** compare a Vietnamese and an English story in English ([#786](https://github.com/duyet/aidr/issues/786)) ([#789](https://github.com/duyet/aidr/issues/789)) ([9bfde02](https://github.com/duyet/aidr/commit/9bfde02411551971d4ec9fb4174e31c83f60e9d6))
- **notify:** digest headline repeats and highlight fallback ([#668](https://github.com/duyet/aidr/issues/668)) ([79643ac](https://github.com/duyet/aidr/commit/79643acce767da3d21507685d813223ab8e17253))
- **notify:** gate Vietnamese Telegram posts on the draft check and record each caption ([#938](https://github.com/duyet/aidr/issues/938)) ([9723474](https://github.com/duyet/aidr/commit/9723474301dcf961e4ccd7fa5eb074273f68dd5d))
- **notify:** key sameEvent on article id and source language ([#765](https://github.com/duyet/aidr/issues/765), [#766](https://github.com/duyet/aidr/issues/766)) ([#787](https://github.com/duyet/aidr/issues/787)) ([eec446c](https://github.com/duyet/aidr/commit/eec446ce0c53dc01ac321951af5b1cc3d23c7754))
- **notify:** read Vietnamese names and words whole in sameEvent ([#756](https://github.com/duyet/aidr/issues/756)) ([#764](https://github.com/duyet/aidr/issues/764)) ([2a6d34c](https://github.com/duyet/aidr/commit/2a6d34cb2b846c219ec69124c718563bde2b2d10))
- **notify:** trending posts never send the share card; media guard on every Telegram call ([#804](https://github.com/duyet/aidr/issues/804)) ([4e0b67d](https://github.com/duyet/aidr/commit/4e0b67db07732bdac64a18175be7e0909bad3051))
- **og:** redirect an empty day's card to the default image ([#763](https://github.com/duyet/aidr/issues/763)) ([b4d97ef](https://github.com/duyet/aidr/commit/b4d97ef048e95482185682b0f8e7593b3c9da5c3))
- **og:** stop the double-width gap after words in day card headlines ([#779](https://github.com/duyet/aidr/issues/779)) ([0bab747](https://github.com/duyet/aidr/commit/0bab7479cee253013882efba80772dac16654326))
- **score:** stop calling the decision router before Jev ([#857](https://github.com/duyet/aidr/issues/857)) ([8a7a1b7](https://github.com/duyet/aidr/commit/8a7a1b73aa7dedea8f13087736781469b03ab1bd))
- **seo:** grapheme-safe snippet cut, malformed q, list-marker escape, vi /mcp title ([#828](https://github.com/duyet/aidr/issues/828)) ([1979979](https://github.com/duyet/aidr/commit/19799797101682ad9fb3adffbb8bad2fe33e536c))
- **seo:** sitemap lists only indexable canonicals, adds weekly editions; snippet and heading fixes ([#818](https://github.com/duyet/aidr/issues/818)) ([5d6bbb5](https://github.com/duyet/aidr/commit/5d6bbb5e7d24b7080fb3e3ca112d1e88729e6840))
- **sources:** drop event promos before the flood-gate cap ([#858](https://github.com/duyet/aidr/issues/858)) ([4edb5c9](https://github.com/duyet/aidr/commit/4edb5c9b1f27fb9c2d19083ad55b581054e1fe2a))
- **sources:** drop the HN Algolia query so the popular search matches ([#873](https://github.com/duyet/aidr/issues/873)) ([#874](https://github.com/duyet/aidr/issues/874)) ([d16c41d](https://github.com/duyet/aidr/commit/d16c41db4506dfa8b0b606f016c4339f381db4e1))
- **sources:** stop topic-learning schema setup reverting the HN config ([#871](https://github.com/duyet/aidr/issues/871)) ([#872](https://github.com/duyet/aidr/issues/872)) ([ab81d8e](https://github.com/duyet/aidr/commit/ab81d8ebd9fc41a1898d2002376bc28ee8ac152d))
- **ssr-head:** cut the head at the raw &lt;/head&gt; bytes ([#908](https://github.com/duyet/aidr/issues/908)) ([37f92eb](https://github.com/duyet/aidr/commit/37f92ebb44ba7fc473ae81f21ed3b074cca3b871))
- **story:** dedupe mirrored tweet photos and keep the dialog header on one row ([#860](https://github.com/duyet/aidr/issues/860)) ([d238c94](https://github.com/duyet/aidr/commit/d238c94661964b077bb5dfaefc3a491e7000bb44))
- **subscribe:** keep subscription emails alive with waitUntil ([#627](https://github.com/duyet/aidr/issues/627)) ([41ae9bf](https://github.com/duyet/aidr/commit/41ae9bf3c8f37464f667139244e3db3aad896ffc))
- **subscribe:** send new-subscriber alerts to the owner chat, never a public channel ([#807](https://github.com/duyet/aidr/issues/807)) ([917fdf0](https://github.com/duyet/aidr/commit/917fdf0c0f1da67fd72ef783c5f0ad4626254127))
- **subscribe:** unsubscribe erases the reader from every table in one batch ([#839](https://github.com/duyet/aidr/issues/839)) ([756f89f](https://github.com/duyet/aidr/commit/756f89ffc724414a755a03ef6ba7bd922838d8af))
- **subscribe:** unsubscribe once per link; new token per signup ([#726](https://github.com/duyet/aidr/issues/726)) ([d82f917](https://github.com/duyet/aidr/commit/d82f917d45ad9568e0bf3c81021fb500cf7950e5))
- **tags:** fallback on failed normalize, retire denylisted learned keywords at read ([#775](https://github.com/duyet/aidr/issues/775)) ([#776](https://github.com/duyet/aidr/issues/776)) ([7f5a218](https://github.com/duyet/aidr/commit/7f5a218074ddaa5acc3b972c5d8f3f28b18f1ee1))
- **tags:** name UK, Ukraine and World Labs in headline fallback tags ([#770](https://github.com/duyet/aidr/issues/770)) ([#851](https://github.com/duyet/aidr/issues/851)) ([6d8a6b2](https://github.com/duyet/aidr/commit/6d8a6b24db7d89cc69422cd4c9ea772a9bfa8aff))
- **tags:** tag stories Jev leaves untagged, and backfill the 233 published ones ([#770](https://github.com/duyet/aidr/issues/770)) ([#774](https://github.com/duyet/aidr/issues/774)) ([9d6455e](https://github.com/duyet/aidr/commit/9d6455e92ce6aabe562d367104ab52fca4ecd338))
- **telegram:** report a delivered imageless story at info level ([#849](https://github.com/duyet/aidr/issues/849)) ([dfd40ad](https://github.com/duyet/aidr/commit/dfd40ad3705a4c82c8bb342fc6c30f977423e8a9))
- **telegram:** upload a story photo when Telegram cannot fetch its URL ([6a2c790](https://github.com/duyet/aidr/commit/6a2c7909657877e0d04aebd5a9a281bc11924c53))
- **telegram:** upload a story photo when Telegram cannot fetch its URL ([af960dd](https://github.com/duyet/aidr/commit/af960ddb1e689a3bb38c8684dd52cc0c5484ac4e))
- **telegram:** use real story images before the generated card ([#622](https://github.com/duyet/aidr/issues/622)) ([e5cb54a](https://github.com/duyet/aidr/commit/e5cb54afc85c6b759decf0fe5a7114450156e531))
- **telemetry:** redact every token key except an allowlist of counters ([#782](https://github.com/duyet/aidr/issues/782)) ([8eb2e5c](https://github.com/duyet/aidr/commit/8eb2e5c5802f5fe88628d4cb5791fed8ad09faf0)), closes [#755](https://github.com/duyet/aidr/issues/755)
- **telemetry:** redact number values under credential keys in JSON stats ([#783](https://github.com/duyet/aidr/issues/783)) ([#785](https://github.com/duyet/aidr/issues/785)) ([d3121f6](https://github.com/duyet/aidr/commit/d3121f6c6725b34ca0ce7b19a651012a3b0402f9))
- **text,notify:** attribution strip follow-ups ([#715](https://github.com/duyet/aidr/issues/715)) ([c5ebe67](https://github.com/duyet/aidr/commit/c5ebe67770883e92ea7b85b2c24c19370fcc31c8))
- **text:** don't end a sentence at an abbreviation ([#649](https://github.com/duyet/aidr/issues/649)) ([1d5f62d](https://github.com/duyet/aidr/commit/1d5f62dff24771256c524b74be968328105ab6cf))
- **text:** end a sentence before a URL or repo tag ([#651](https://github.com/duyet/aidr/issues/651)) ([abc2532](https://github.com/duyet/aidr/commit/abc2532d7e224caf76667b50ac6de404a9daf0f9))
- **text:** strip a trailing source-attribution sentence ([#671](https://github.com/duyet/aidr/issues/671)) ([24b2186](https://github.com/duyet/aidr/commit/24b2186bb7c078bf9f19953ec907c3407e2dee69))
- **thumb:** cache the miss redirect at the edge for 5 minutes ([#887](https://github.com/duyet/aidr/issues/887)) ([72220c7](https://github.com/duyet/aidr/commit/72220c74acf56baf51773a0d585018809c156377))
- **tldr:** keep rule honors homepage VI rebuilds and the dry-run preview ([#685](https://github.com/duyet/aidr/issues/685)) ([8b98991](https://github.com/duyet/aidr/commit/8b98991c1bacfc1947081937d42e498e6d72fa11))
- **tldr:** make the homepage TL;DR rebuild display-only ([#710](https://github.com/duyet/aidr/issues/710)) ([c7cf85c](https://github.com/duyet/aidr/commit/c7cf85c1fc542213554c5715f727d0a3fb58911c)), closes [#688](https://github.com/duyet/aidr/issues/688)
- **tldr:** regenerate follow-ups from [#698](https://github.com/duyet/aidr/issues/698) ([#713](https://github.com/duyet/aidr/issues/713)) ([40f6dc5](https://github.com/duyet/aidr/commit/40f6dc51d05f319d1bafcbd85d010bdbbc4095b1))
- **tldr:** report a kept dry-run digest and skip no-op homepage rewrites ([#686](https://github.com/duyet/aidr/issues/686)) ([207002e](https://github.com/duyet/aidr/commit/207002edfa9ba50207d208d175317cd52f059c19))
- **translate:** flag a VI draft that changes a model version ([#781](https://github.com/duyet/aidr/issues/781)) ([#784](https://github.com/duyet/aidr/issues/784)) ([47c87dc](https://github.com/duyet/aidr/commit/47c87dc05ec071d879020b9b88a6e5a2be3f3c05))
- **translate:** flag a VI draft that echoes the English summary ([#777](https://github.com/duyet/aidr/issues/777)) ([#780](https://github.com/duyet/aidr/issues/780)) ([a55e665](https://github.com/duyet/aidr/commit/a55e665f1a5bb2a53973734e8d541add5d97a1d9))
- **translate:** flag AI-term calques seen in rated VI rows ([cd74677](https://github.com/duyet/aidr/commit/cd74677a4521ab3f7a432d45a46b1e68750bee66))
- **translate:** flag an English headline left unchanged ([990cbc1](https://github.com/duyet/aidr/commit/990cbc1935c9db7600a857545846b23d85e09093))
- **translate:** flag decimal points and dollar figures in VI drafts ([1a72045](https://github.com/duyet/aidr/commit/1a72045f7121f258a641557a76d1deb6ea816056))
- **translate:** flag garbled words, number format, English headlines and AI calques in VI drafts ([b24dc67](https://github.com/duyet/aidr/commit/b24dc67a8d6a5f4712165a5d942414f7a4c2c661))
- **translate:** flag model-family and robotics calques in VI drafts ([45f8b65](https://github.com/duyet/aidr/commit/45f8b653765f886eb3a9f34d9ca9f479f9944277))
- **translate:** keep "inference engine" in English ([#942](https://github.com/duyet/aidr/issues/942)) ([9251fd8](https://github.com/duyet/aidr/commit/9251fd86d89adfbea8474207bbcdbabb618f5fb0))
- **translate:** keep model family in English and flag robotics calques ([14f33a3](https://github.com/duyet/aidr/commit/14f33a347cd9a5e081e4569b39d4c63e4b3efe72))
- **translation:** keep a bare "from &lt;place&gt;" closing ([#762](https://github.com/duyet/aidr/issues/762)) ([#788](https://github.com/duyet/aidr/issues/788)) ([b831dcb](https://github.com/duyet/aidr/commit/b831dcb253d23a5a575194f73b29ac2b3ca10ab8))
- **translation:** keep a speaker attribution before a known outlet ([#737](https://github.com/duyet/aidr/issues/737)) ([3060f52](https://github.com/duyet/aidr/commit/3060f52db74e526049ecc7baadb040a39216a1e2))
- **translation:** keep Vietnamese place names before an outlet ([#761](https://github.com/duyet/aidr/issues/761)) ([5f35978](https://github.com/duyet/aidr/commit/5f359787bd008b5b7d5f6e0b6c6c70b45dce3aff))
- **translation:** strip bylines with month surnames, Jr. and own handles ([#760](https://github.com/duyet/aidr/issues/760)) ([790bfd4](https://github.com/duyet/aidr/commit/790bfd459c1aaa2eddaf3f44c0cddadf25e73bc2))
- **unmerge:** check live copies for distinct pairs too ([#796](https://github.com/duyet/aidr/issues/796)) ([4191f42](https://github.com/duyet/aidr/commit/4191f42e206a8f4755e0ef17ef5315af023b911e))
- **unmerge:** CLI apply keeps sameAs/distinct decisions ([#743](https://github.com/duyet/aidr/issues/743)) ([db45da2](https://github.com/duyet/aidr/commit/db45da2838eca2a2c634c5df5edab2f981283431))
- **unmerge:** count rows the request re-points as live copies ([#799](https://github.com/duyet/aidr/issues/799)) ([d98ba19](https://github.com/duyet/aidr/commit/d98ba191d83720daaf6c62b3bf8c2ecb51fe5367))
- **unmerge:** fixture of 113 unrelated merges, test for dangling cluster ids ([#790](https://github.com/duyet/aidr/issues/790)) ([46f6cff](https://github.com/duyet/aidr/commit/46f6cfff2822453013b064b12273d7f51784c4d9))
- **unmerge:** fixture of 113 unrelated merges, test for dangling cluster ids ([#790](https://github.com/duyet/aidr/issues/790)) ([e95b36e](https://github.com/duyet/aidr/commit/e95b36e448e049d0fc64791cfc75e8430e855631))
- **unmerge:** undo one canonical of a batch, and the repair for 9 stories live twice ([#795](https://github.com/duyet/aidr/issues/795)) ([#800](https://github.com/duyet/aidr/issues/800)) ([32d0dde](https://github.com/duyet/aidr/commit/32d0dde7d3471c88b324e1e5b5abf602ad577652))
- **videos:** daily-reel and day video watchdog follow-ups to [#623](https://github.com/duyet/aidr/issues/623) and [#641](https://github.com/duyet/aidr/issues/641) ([#644](https://github.com/duyet/aidr/issues/644)) ([d034e30](https://github.com/duyet/aidr/commit/d034e303ca5101a53aff5cc668568457dd8884fe))
- **web:** 500 instead of 404 when a day, story or weeks read fails ([#909](https://github.com/duyet/aidr/issues/909)) ([34241a6](https://github.com/duyet/aidr/commit/34241a6bd52afb5f8f0956e8332bf2d548edfcfe))
- **web:** 500 instead of 404 when a week read fails ([#906](https://github.com/duyet/aidr/issues/906)) ([99882b4](https://github.com/duyet/aidr/commit/99882b42309f61e4dab66abd2d810aff2df419e3))
- **web:** announce story dialog and calendar load failures, test stale story reads ([#915](https://github.com/duyet/aidr/issues/915)) ([af84dca](https://github.com/duyet/aidr/commit/af84dcaad0d8b162f5bc13163f3fc71dca0e7d54))
- **web:** day video watchdog confirms Telegram from recorded posts ([#689](https://github.com/duyet/aidr/issues/689)) ([a51547c](https://github.com/duyet/aidr/commit/a51547ca210232c8bb1475fca15c80c783421f62))
- **web:** disabled suggest control instead of a sign-in label while Clerk loads ([#924](https://github.com/duyet/aidr/issues/924)) ([8400542](https://github.com/duyet/aidr/commit/8400542ff1f465bd926480745f4ee9c4157e9b52))
- **web:** hydrate the local dev server (React Refresh, Clerk dev handshake) ([#729](https://github.com/duyet/aidr/issues/729)) ([e5dfc2f](https://github.com/duyet/aidr/commit/e5dfc2fcf0195d05274c7d6f4bdd0563b64aa2ed))
- **web:** keep the public Cache-Control on /api/thumb and /api/health ([#897](https://github.com/duyet/aidr/issues/897)) ([da73156](https://github.com/duyet/aidr/commit/da73156990f56b3ae063a35460e2b304cde8b471))
- **web:** leave the ssr Server-Timing stage out when it waited on no I/O ([#913](https://github.com/duyet/aidr/issues/913)) ([0166b8a](https://github.com/duyet/aidr/commit/0166b8ab2615218436f9f0fd8be754523d83320c))
- **web:** no aria-pressed on the pending vote thumb, keep the suggest control while Clerk loads ([#916](https://github.com/duyet/aidr/issues/916)) ([345697f](https://github.com/duyet/aidr/commit/345697f53577b142da0aa1ed18d7461ac3c9904c))
- **web:** retry a failed story read instead of calling the story missing ([#911](https://github.com/duyet/aidr/issues/911)) ([90fccd4](https://github.com/duyet/aidr/commit/90fccd478c3d56069c7daa2cacbbeceefe33bfe4))
- **web:** send any response that sets a cookie as private, no-store ([#899](https://github.com/duyet/aidr/issues/899)) ([dc2e67f](https://github.com/duyet/aidr/commit/dc2e67feee83be386ac5fa05b064eb60351cfa25))
- **web:** sharper thumbnails, share cards and fallback font ([#825](https://github.com/duyet/aidr/issues/825)) ([acb0f8b](https://github.com/duyet/aidr/commit/acb0f8b452caac556095d90544e8fad80e6f11df))
- **web:** show a disabled vote thumb while a session's Clerk SDK loads ([#903](https://github.com/duyet/aidr/issues/903)) ([fedbd3f](https://github.com/duyet/aidr/commit/fedbd3fd6298cc4fb9950207e4f93d1e28141fa0))


### ⚡ Performance

- **cache:** put day and week archives in the Worker cache ([#865](https://github.com/duyet/aidr/issues/865)) ([540da1b](https://github.com/duyet/aidr/commit/540da1b5031bc5d0d0b25d114db631004fcd3af2))
- **cache:** serve stale SSR from the Worker cache and revalidate in the background ([#864](https://github.com/duyet/aidr/issues/864)) ([29e6496](https://github.com/duyet/aidr/commit/29e6496db30b69b14bee42c7621fba71b80c5077))
- **cache:** share the homepage HTML across colos through KV ([#900](https://github.com/duyet/aidr/issues/900)) ([ed47405](https://github.com/duyet/aidr/commit/ed4740560599760fbef46a03015f551b7653e619))
- **feed:** drop cold-isolate schema probes from read paths ([#888](https://github.com/duyet/aidr/issues/888)) ([285c38b](https://github.com/duyet/aidr/commit/285c38ba352067da25a1d45f1009f4276bd634cb))
- **feed:** fetch collapsed rows only for the homepage SSR loader ([#866](https://github.com/duyet/aidr/issues/866)) ([0f090c8](https://github.com/duyet/aidr/commit/0f090c8e4d144e2fff9670e3fc19793d30b70dd3))
- **feed:** log where each feed batch was served and how long it waited ([#870](https://github.com/duyet/aidr/issues/870)) ([95f286a](https://github.com/duyet/aidr/commit/95f286ab541243759e2d4534ebe3256fbbc0da39))
- **feed:** one D1 batch per feed read, no DDL on the read path ([#869](https://github.com/duyet/aidr/issues/869)) ([8aa6604](https://github.com/duyet/aidr/commit/8aa6604a40287d8146037717c1ea0d1b87d453ad))
- **mail:** load day videos once per edition ([#648](https://github.com/duyet/aidr/issues/648)) ([449e055](https://github.com/duyet/aidr/commit/449e055331564a64350282fbb1b83004b58efeda))
- **media:** keep one public media result per stored row ([#901](https://github.com/duyet/aidr/issues/901)) ([2f44179](https://github.com/duyet/aidr/commit/2f441794b9275c99f30908a31208cf5eacf545b1))
- **web:** drop schema probes and ALTERs from write and cron paths ([#920](https://github.com/duyet/aidr/issues/920)) ([d557613](https://github.com/duyet/aidr/commit/d557613206127e4688eeed7aa17d0d8d893f6521)), closes [#894](https://github.com/duyet/aidr/issues/894)
- **web:** fetch the day card on intent instead of 2 s after every load ([#862](https://github.com/duyet/aidr/issues/862)) ([a09ceae](https://github.com/duyet/aidr/commit/a09ceaef9c60e1ea0918a4abdb95bbfee33210c8))
- **web:** forward body bytes after &lt;/head&gt; without re-encoding ([#902](https://github.com/duyet/aidr/issues/902)) ([0dc7a7f](https://github.com/duyet/aidr/commit/0dc7a7f6084e6afde124a433311d95b7d036cae1))
- **web:** keep one calendar date formatter per timezone ([#877](https://github.com/duyet/aidr/issues/877)) ([f8f1844](https://github.com/duyet/aidr/commit/f8f1844b5ec2d6950db28bb32a6aab6d9d84e057))
- **web:** keep the release notes out of every page's preloads ([#867](https://github.com/duyet/aidr/issues/867)) ([389e739](https://github.com/duyet/aidr/commit/389e739bd505605c6e49aceb3edaa02ca7ef050a))
- **web:** memoize media URL canonical forms and identity keys ([#880](https://github.com/duyet/aidr/issues/880)) ([67955db](https://github.com/duyet/aidr/commit/67955dbad1286679fbbfcbe81bc9121e44969fd0))
- **web:** mount the Clerk SDK only for sessions and auth routes, preload on sign-in intent ([#861](https://github.com/duyet/aidr/issues/861)) ([ccfe97a](https://github.com/duyet/aidr/commit/ccfe97a56c39e625b2c23ac58626db02298951c2))
- **web:** serve 48px feed thumbs resized through /api/thumb ([#882](https://github.com/duyet/aidr/issues/882)) ([0deb47d](https://github.com/duyet/aidr/commit/0deb47d72214233143191d0486bff0a94f9ff040))
- **web:** split the /data page out of the entry chunk ([#863](https://github.com/duyet/aidr/issues/863)) ([32986a1](https://github.com/duyet/aidr/commit/32986a1ec0f18de91b7fec85e4cf09bee3d711bf))


### ♻️ Refactoring

- **translate:** return VI draft issues per check ([c46d883](https://github.com/duyet/aidr/commit/c46d88355cd5a594a5404c9cac4649d608de4a16))

## [0.1.14](https://github.com/duyet/aidr/compare/web-v0.1.13...web-v0.1.14) (2026-10-12)

### ✨ Features

- **about:** drive the how-it-works figure from real D1 data ([#611](https://github.com/duyet/aidr/issues/611)) ([e813acc](https://github.com/duyet/aidr/commit/e813acc46e61b958359a2f0f7bead102987dd3f4))
- **about:** interactive how-it-works figure on the about page ([#609](https://github.com/duyet/aidr/issues/609)) ([b2e877b](https://github.com/duyet/aidr/commit/b2e877b91707a16dc93c51ba8dc47d7b68fba887))
- **analytics:** load PostHog from env, mirror track() events, capture exceptions ([#585](https://github.com/duyet/aidr/issues/585)) ([bc7d2cc](https://github.com/duyet/aidr/commit/bc7d2cc85e033f9e694d243b8d625989c8dcf052))
- **analytics:** report Core Web Vitals to GA4 and PostHog, split by edge cache ([#581](https://github.com/duyet/aidr/issues/581)) ([4474350](https://github.com/duyet/aidr/commit/4474350ffcf1c8d083ee4028716f1475d4a9ef3e))
- **calendar:** heat month page with sticky day preview and phone agenda ([#608](https://github.com/duyet/aidr/issues/608)) ([c9dc619](https://github.com/duyet/aidr/commit/c9dc6197168ea4a78a8175a4ff7b093d11652067))
- **calendar:** keyboard navigation, weekly edition links and legend polish ([#615](https://github.com/duyet/aidr/issues/615)) ([8b77138](https://github.com/duyet/aidr/commit/8b771380ea4d36d1744dbebea351202e22e22869))
- **data:** Trends tab with topic, model, and category trends ([#621](https://github.com/duyet/aidr/issues/621)) ([8ad6c6d](https://github.com/duyet/aidr/commit/8ad6c6d322e569d94a799ab1be525070d78c99cc))
- **email:** one-click feedback on the digest ([#545](https://github.com/duyet/aidr/issues/545)) ([1fb80e4](https://github.com/duyet/aidr/commit/1fb80e4ea7f16aa41d44175d799aaf48962fe912))
- **email:** redesign the daily digest mail ([#544](https://github.com/duyet/aidr/issues/544)) ([b3948d8](https://github.com/duyet/aidr/commit/b3948d86dcc1fbee34bad09c061fbffd843aa22c))
- **header:** calendar popover on desktop, bottom sheet on phone ([#607](https://github.com/duyet/aidr/issues/607)) ([84a0012](https://github.com/duyet/aidr/commit/84a00122c7a01b97c4558a8f4aa5e929f337cd22))
- **llm:** gemma-latest and glm-latest for score/cluster, luna for TL;DR ([#541](https://github.com/duyet/aidr/issues/541)) ([fccb318](https://github.com/duyet/aidr/commit/fccb318877873c9bb2ad6313b02888fe6021adfe))
- **mail:** polish daily and weekly email template ([#617](https://github.com/duyet/aidr/issues/617)) ([5f92a22](https://github.com/duyet/aidr/commit/5f92a228bb949da2479d68cd7ffea4884d6367cb))
- **mail:** weekly digest on the reader's chosen day, from one shared batch ([#618](https://github.com/duyet/aidr/issues/618)) ([319dc6c](https://github.com/duyet/aidr/commit/319dc6cca4b2fe98dcdb8529a238d6c26fe05d9e))
- **mail:** weekly newsletter option for subscribers ([#612](https://github.com/duyet/aidr/issues/612)) ([bfef319](https://github.com/duyet/aidr/commit/bfef319af5c07a2b17d02b9152d9c6a1f5f65ffe))
- **notify:** skip trending posts that repeat an event, gate chrome and stub copy ([#603](https://github.com/duyet/aidr/issues/603)) ([5acd9f8](https://github.com/duyet/aidr/commit/5acd9f8b4b6a2fd19022e5f99141435f0ad8108a))
- **prefs:** add relaxed and airy density levels; extension defaults to spacious ([#578](https://github.com/duyet/aidr/issues/578)) ([eeafb52](https://github.com/duyet/aidr/commit/eeafb5277fb6303d100d671bbd523eacefbc635b))
- **ranking:** replay-tuned rank formula and rank-replay lever ([#602](https://github.com/duyet/aidr/issues/602)) ([da062ab](https://github.com/duyet/aidr/commit/da062ab33face603567956cd04a6f8a2615ef028))
- **ranking:** weight reader votes x10; downvotes lower but never zero a story ([#589](https://github.com/duyet/aidr/issues/589)) ([6a86c2f](https://github.com/duyet/aidr/commit/6a86c2f66627a59e6d314b7cb319ddba3f871c98))
- **sources:** refresh sources and alert on fetch-failed streaks ([#604](https://github.com/duyet/aidr/issues/604)) ([0b804eb](https://github.com/duyet/aidr/commit/0b804eb8e35e7dc6e31206cceda00768942a6650))
- **sources:** send GITHUB_ALERT_TOKEN on GitHub release fetches ([#606](https://github.com/duyet/aidr/issues/606)) ([161d9a1](https://github.com/duyet/aidr/commit/161d9a1601e842c9dbb48eebac87529a32304a83))
- **summary:** LLM-written English summary for English-source stories ([#558](https://github.com/duyet/aidr/issues/558)) ([30b1cec](https://github.com/duyet/aidr/commit/30b1cec0008c7f5bd96c3c64cb18a9746d6dff60))
- **translate:** tighten VI style, flag doubled words, add bullet bake-off ([#519](https://github.com/duyet/aidr/issues/519)) ([caef34d](https://github.com/duyet/aidr/commit/caef34d7b34bae6391e73f679047d014016f7b7c))
- **video:** daily 9:16 Facebook Reel on a schedule ([#593](https://github.com/duyet/aidr/issues/593)) ([17ee87a](https://github.com/duyet/aidr/commit/17ee87aaabe3db3b07587dd4f9ed589f249564f5))
- **videos:** daily video workflow with per-language day page and Telegram ([#511](https://github.com/duyet/aidr/issues/511)) ([8043272](https://github.com/duyet/aidr/commit/8043272ac0ec4e54c964ad5104e85a3933e015fe))
- **web:** /calendar page to browse past editions ([#575](https://github.com/duyet/aidr/issues/575)) ([7d1dcd0](https://github.com/duyet/aidr/commit/7d1dcd010883cce9d04aca78a61921df67950027))
- **web:** calendar follows reader prefs; Facebook subscribe tab; MCP footer link ([#587](https://github.com/duyet/aidr/issues/587)) ([c46ad0c](https://github.com/duyet/aidr/commit/c46ad0cabe74b9b7155c9c53c1083c60513209dd))
- **web:** dense table layout for homepage story rows ([#590](https://github.com/duyet/aidr/issues/590)) ([bdd55ea](https://github.com/duyet/aidr/commit/bdd55ea708bab2ed41423ef731d9b9b869d8dd4c))
- **web:** expand story rows from the title with a chevron cue ([#600](https://github.com/duyet/aidr/issues/600)) ([a4f3362](https://github.com/duyet/aidr/commit/a4f33623210df9acf9e4f6f13a334f4d8638eb6e))
- **web:** move votes into the media column of an expanded story row ([#588](https://github.com/duyet/aidr/issues/588)) ([ac36ba5](https://github.com/duyet/aidr/commit/ac36ba5821df0a082ea50880abbce4f1fded071e))
- **weekly:** subscribe CTA, ?freq=weekly preselect, index and nav polish ([#619](https://github.com/duyet/aidr/issues/619)) ([07c82e5](https://github.com/duyet/aidr/commit/07c82e5874c8bc1a196d161247b1355caecd19e7))
- **weekly:** weekly edition — snapshot, /week newspaper page, video mode ([#566](https://github.com/duyet/aidr/issues/566)) ([1110c49](https://github.com/duyet/aidr/commit/1110c493ebd5152c899f91c467f5c6dcb0d42107))


### 🐛 Bug Fixes

- **about:** hide the how-it-works frame scrollbar ([#610](https://github.com/duyet/aidr/issues/610)) ([0d0cc17](https://github.com/duyet/aidr/commit/0d0cc17023d21fc2f28cc5c36ba6dc8c8fc36939))
- **admin:** Clerk token check fails closed without CLERK_ISSUER ([#523](https://github.com/duyet/aidr/issues/523)) ([e65bd51](https://github.com/duyet/aidr/commit/e65bd51f2dcd77b9846458339bc250fa43345ff8))
- **admin:** count wrong bearers on /api/admin/me and /api/mcp ([#526](https://github.com/duyet/aidr/issues/526)) ([813f79d](https://github.com/duyet/aidr/commit/813f79d5e2b93a18369a19d1a3e5ec10f9a95ab9))
- **admin:** mail preview route was shadowed by the generic GET /mail handler ([#546](https://github.com/duyet/aidr/issues/546)) ([188d348](https://github.com/duyet/aidr/commit/188d34849f8f8e0b8b200a5feca503c6bee71909))
- **clerk:** webhook trusts the signed body type over svix-type ([#529](https://github.com/duyet/aidr/issues/529)) ([dc3e705](https://github.com/duyet/aidr/commit/dc3e70596649fc28810bc8e9ceef993c9f24fb88))
- **email:** join translations for the VI title; never let the lookup block a send ([#547](https://github.com/duyet/aidr/issues/547)) ([6d1c570](https://github.com/duyet/aidr/commit/6d1c5705f655964680c07310e11baad55e6e31de))
- **email:** join translations for the VI title; never let the lookup block a send ([#548](https://github.com/duyet/aidr/issues/548)) ([765698a](https://github.com/duyet/aidr/commit/765698a5a058190ad6444fc70b9591d8d3dc73bd))
- **email:** wait for the subscriber's local-date edition ([#542](https://github.com/duyet/aidr/issues/542)) ([39ef52b](https://github.com/duyet/aidr/commit/39ef52be71ba0124c0a49394c237ef361e1f60a7))
- **en-summary:** allow benchmark points; reject meta replies ([#570](https://github.com/duyet/aidr/issues/570)) ([387da10](https://github.com/duyet/aidr/commit/387da10df27dcc5f980c04084b35a999e6fa384e))
- **en-summary:** queue visible teaser excerpts first ([#568](https://github.com/duyet/aidr/issues/568)) ([d0a9f71](https://github.com/duyet/aidr/commit/d0a9f7126af2b2bab0fb53c1cd1686b5992512ff))
- **health:** owner DM errors name Telegram's reason, rejected summary DM stops retrying ([#527](https://github.com/duyet/aidr/issues/527)) ([c992607](https://github.com/duyet/aidr/commit/c9926073affe2a2514206863ca237b05156b44aa)), closes [#521](https://github.com/duyet/aidr/issues/521)
- **ingest:** report email digest failures instead of calling them no subscribers ([#535](https://github.com/duyet/aidr/issues/535)) ([c1cd7bc](https://github.com/duyet/aidr/commit/c1cd7bc6cbfc811b033cb46689754b2a0788748e)), closes [#533](https://github.com/duyet/aidr/issues/533)
- **ingest:** strip feed chrome from summaries; add gold cluster eval ([#540](https://github.com/duyet/aidr/issues/540)) ([200c78c](https://github.com/duyet/aidr/commit/200c78c3ef90936b3edfcc4986000b660c2b007e))
- **ingest:** strip page chrome and re-fetch RSS teasers in EN summaries ([#555](https://github.com/duyet/aidr/issues/555)) ([d9ef1fb](https://github.com/duyet/aidr/commit/d9ef1fb9243f71cc5f299f5b08a78a2fe952e9d4))
- **llm:** log Jev/decision fetch timeouts as timeouts ([#538](https://github.com/duyet/aidr/issues/538)) ([c015b3d](https://github.com/duyet/aidr/commit/c015b3df57ea06fe8429406c3051bdb1b8a75ca6))
- **llm:** per-run timeout breaker and chains by measured success ([#560](https://github.com/duyet/aidr/issues/560)) ([87614bf](https://github.com/duyet/aidr/commit/87614bf9db984a0217504de7e3cc79c505b6d5c0)), closes [#559](https://github.com/duyet/aidr/issues/559)
- **llm:** warn on absorbed provider failures instead of raising issues ([#564](https://github.com/duyet/aidr/issues/564)) ([957dd04](https://github.com/duyet/aidr/commit/957dd045889a47f9cbcad0ee4b6c5d5948d62cb8))
- **media:** hide generated share cards when real media exists ([#552](https://github.com/duyet/aidr/issues/552)) ([ccf872a](https://github.com/duyet/aidr/commit/ccf872ac8b818ec1dabba2a8d294fbba27656092))
- **migrations:** renumber source refresh to 0058 so migration numbers stay unique ([#605](https://github.com/duyet/aidr/issues/605)) ([1fe62db](https://github.com/duyet/aidr/commit/1fe62dbbde60c0c371f2cea6d1fd99e0d490bb38))
- **notify:** claim each delivery before sending it ([#536](https://github.com/duyet/aidr/issues/536)) ([e70afda](https://github.com/duyet/aidr/commit/e70afda3095c58473b5ed423ca174a53f60aee02))
- **notify:** fit Telegram captions instead of cutting them mid-sentence ([#518](https://github.com/duyet/aidr/issues/518)) ([9530d27](https://github.com/duyet/aidr/commit/9530d27a462079f6e1fed50e4289521a99fb1ee0))
- **notify:** give Telegram media-by-URL calls a 45s timeout ([#530](https://github.com/duyet/aidr/issues/530)) ([f9ec226](https://github.com/duyet/aidr/commit/f9ec22653a4be1855cc1f554f3b88bbf1f1d44fd)), closes [#482](https://github.com/duyet/aidr/issues/482) [#483](https://github.com/duyet/aidr/issues/483)
- **notify:** report send_failed when trending retries are exhausted ([#614](https://github.com/duyet/aidr/issues/614)) ([1823ac7](https://github.com/duyet/aidr/commit/1823ac74206eb0f99cd7a681090f58c3d65ed47f))
- **notify:** send http videos as https, use Telegram's decimal 20 MB cap, record fallback reasons, tighten media dedup ([#601](https://github.com/duyet/aidr/issues/601)) ([065d69a](https://github.com/duyet/aidr/commit/065d69aea3c8f24246fc5d10634f5163733720bd))
- **notify:** webhook timeout is ambiguous, not sent ([#528](https://github.com/duyet/aidr/issues/528)) ([5afd698](https://github.com/duyet/aidr/commit/5afd698c22ba6f9d90651f09cf0364e54d078e1f))
- **owner-dm:** treat permanent Telegram rejection as config warning, stop retrying ([#572](https://github.com/duyet/aidr/issues/572)) ([921945a](https://github.com/duyet/aidr/commit/921945a94fa0a8004eee7cd40c965487dcd64fea))
- **pipeline:** audit fixes for ranking, backfill and editions ([#613](https://github.com/duyet/aidr/issues/613)) ([39e884d](https://github.com/duyet/aidr/commit/39e884dd060e32c1be6bf39ea3768379faffc6ea))
- **scripts:** stop syncing FACEBOOK_APP_SECRET to the Worker and GitHub ([#537](https://github.com/duyet/aidr/issues/537)) ([d04c70a](https://github.com/duyet/aidr/commit/d04c70a10645b16f85014b8f79930104a9490df8)), closes [#525](https://github.com/duyet/aidr/issues/525)
- **seo:** localize story title and description on VI permalinks ([#557](https://github.com/duyet/aidr/issues/557)) ([8452321](https://github.com/duyet/aidr/commit/845232139b7095bb8b3fa71c8edfd95dee338bca)), closes [#556](https://github.com/duyet/aidr/issues/556)
- **story:** move dialog votes to the sidebar top; pad the bilingual divider ([#554](https://github.com/duyet/aidr/issues/554)) ([ea527ea](https://github.com/duyet/aidr/commit/ea527ea4fa61c28aa694145ebcaf0f16ad5daf1f))
- **story:** show dialog votes as a labelled thumbs pill ([#551](https://github.com/duyet/aidr/issues/551)) ([d611c95](https://github.com/duyet/aidr/commit/d611c95a0f43a2498173b8d6c2c7105166f803de))
- **subscribe:** confirm settings changes for subscribed addresses by email ([#534](https://github.com/duyet/aidr/issues/534)) ([#543](https://github.com/duyet/aidr/issues/543)) ([f6b79f4](https://github.com/duyet/aidr/commit/f6b79f4253e9e03d7abf9d4a543b898a25c2f553))
- **web:** give dense feed rows edge padding and a wider score column ([#591](https://github.com/duyet/aidr/issues/591)) ([a955ae6](https://github.com/duyet/aidr/commit/a955ae649b72bd8328d9ec5143c4e7db81db2e95))
- **web:** include every TL;DR-cited story in /api/public stories ([#599](https://github.com/duyet/aidr/issues/599)) ([705e122](https://github.com/duyet/aidr/commit/705e122edacc629f5cd507311193065bef9b8f75))
- **web:** keep worker/llm out of the client bundle so pages hydrate ([#584](https://github.com/duyet/aidr/issues/584)) ([5520ed7](https://github.com/duyet/aidr/commit/5520ed7f48d16fb25c68275dc8e2508cff7dcdce))
- **web:** link the English Facebook release post with ?lang=en ([#497](https://github.com/duyet/aidr/issues/497)) ([a829158](https://github.com/duyet/aidr/commit/a8291587d685343e6a14c02e0839249ada5768ce))
- **web:** one small thumbs-up vote control with a sign-in dialog ([#594](https://github.com/duyet/aidr/issues/594)) ([fcd4133](https://github.com/duyet/aidr/commit/fcd41338660ec942d53cfe901b0e7981deead9b4))
- **web:** read the Chrome Web Store publisher id from CWS_PUBLISHER_ID ([#492](https://github.com/duyet/aidr/issues/492)) ([66b6b88](https://github.com/duyet/aidr/commit/66b6b88191adaec8d49e95f014a7c062c09c922f))
- **weekly:** retry the model chain and absorb provider timeouts quietly ([#574](https://github.com/duyet/aidr/issues/574)) ([4dfa041](https://github.com/duyet/aidr/commit/4dfa041f74e05d5a7f320dea345ef24b3af49b8b)), closes [#567](https://github.com/duyet/aidr/issues/567)


### ⚡ Performance

- **d1:** index-seek story id prefix and ETag on feed/public APIs ([#563](https://github.com/duyet/aidr/issues/563)) ([03be639](https://github.com/duyet/aidr/commit/03be6398331ed6131383fc52e118d174ff839eb6))
- **rss:** Worker-cache bare /feed.xml per resolved language ([#579](https://github.com/duyet/aidr/issues/579)) ([6cedd7b](https://github.com/duyet/aidr/commit/6cedd7b5d394c977acc46b9f117dbf262266d0ec))
- **web:** homepage SSR only the newest day, 30 rows, sprite icons ([#577](https://github.com/duyet/aidr/issues/577)) ([95e42e1](https://github.com/duyet/aidr/commit/95e42e1e32eec85fd8128c7f7bb006b8bac17a3a))
- **web:** serve public SSR through edge cache with tracking-stripped key ([#576](https://github.com/duyet/aidr/issues/576)) ([60bdc4f](https://github.com/duyet/aidr/commit/60bdc4fd105be0b27dbf17123779d0864eafe5fb))
- **web:** Worker-cache bare localized pages per resolved language ([#580](https://github.com/duyet/aidr/issues/580)) ([9b408c1](https://github.com/duyet/aidr/commit/9b408c124fa5e8c4a823ab407dc15c955b74a91c))


### ♻️ Refactoring

- **pages:** share one shell for about, brand, privacy, terms and tighten copy ([#620](https://github.com/duyet/aidr/issues/620)) ([514baf2](https://github.com/duyet/aidr/commit/514baf21e384c9e3482bf9aa798a94afcfca0edf))

## [0.1.13](https://github.com/duyet/aidr/compare/web-v0.1.12...web-v0.1.13) (2026-10-09)

### ✨ Features

- Chrome Web Store listing refresh, store-assets, full-width day card, release skills ([#489](https://github.com/duyet/aidr/issues/489)) ([ed6696c](https://github.com/duyet/aidr/commit/ed6696cfe881a0354c858e8c36dbf23769f37190))
- five density steps, aligned story rows, image/text day card switch (web + extension) ([#485](https://github.com/duyet/aidr/issues/485)) ([d49fc1b](https://github.com/duyet/aidr/commit/d49fc1bfca9a630943a82600754f12dc9ff43cc6))
- **web:** release notes at /release (v0.1.0, v0.1.12), film hero, replaces /changelog ([#491](https://github.com/duyet/aidr/issues/491)) ([92a077b](https://github.com/duyet/aidr/commit/92a077b4ffaf8c475a477831feb0c85ea39ebf32))

## [0.1.12](https://github.com/duyet/aidr/compare/web-v0.1.11...web-v0.1.12) (2026-10-09)

### 🐛 Bug Fixes

- **smoke:** check the news child's publication_date, not lastmod ([0702fde](https://github.com/duyet/aidr/commit/0702fde878d962e793a330df452511e18082f730))

## [0.1.11](https://github.com/duyet/aidr/compare/web-v0.1.10...web-v0.1.11) (2026-10-09)

### ✨ Features

- **admin:** POST /api/admin/notify/digest/preview sends today's digest to a given chat ([ee510a1](https://github.com/duyet/aidr/commit/ee510a181b642b637b1434ffc8407ee55dd79894))
- **email:** accept contributions by email at submit@aidr.today ([8cd2f24](https://github.com/duyet/aidr/commit/8cd2f24941b2456b9950198e2c9225a1ffb524a1))
- **email:** accept only Clerk-verified addresses ([6c3639f](https://github.com/duyet/aidr/commit/6c3639fcf15c34cf3863b077e4ecbf3f8132cf46))
- **extension:** match the new tab to the homepage digest ([b0d3c6c](https://github.com/duyet/aidr/commit/b0d3c6ce5af107d18483e5ec95bab80372be3aae))
- **mail:** lead the daily digest with the day card, linked to the day page ([c953655](https://github.com/duyet/aidr/commit/c9536550b561c6bccb7f99f9daa4168b998b5311))
- **mail:** put the digest story thumbnail on the right ([#475](https://github.com/duyet/aidr/issues/475)) ([0368dc2](https://github.com/duyet/aidr/commit/0368dc2082b38ca58d0ae25fb87e38bfd4475338))
- **notify:** send the daily digest as the day card photo with numbered bullets ([e27c7f4](https://github.com/duyet/aidr/commit/e27c7f492289a9fee3bc405b4d0258521b6294a5))
- **sources:** add Reddit + Techmeme trending feeds, disable vnexpress-tech ([#474](https://github.com/duyet/aidr/issues/474)) ([ecb5fce](https://github.com/duyet/aidr/commit/ecb5fcecc56dd53d546a5029dc1373a3dd6b20e6))
- **tldr:** model picks a topic emoji per digest bullet; Telegram uses it ([049e36d](https://github.com/duyet/aidr/commit/049e36df88fd1ac127bbeff1673db0666b151ebe))
- **web:** add /date day archive with daily YouTube video and Short ([2e54ef1](https://github.com/duyet/aidr/commit/2e54ef1504c5b89cbe2a5534dfa0f3f1436fc715))
- **web:** add builder categories and let official posts own their story ([8a0153d](https://github.com/duyet/aidr/commit/8a0153d5388082316962b0cdf7e3f5e3fbca465e))
- **web:** add per-step model bench with prod-derived datasets ([bf18afa](https://github.com/duyet/aidr/commit/bf18afaca9ff8a2b090a9b4dbd681fea6f00bccf))
- **web:** add quality bench, AI sources, sharper trending and decision-first scoring ([bc50213](https://github.com/duyet/aidr/commit/bc50213980a1728e20b84759669db0b179e32cd3))
- **web:** add reset to default button in appearance settings ([b5c73c6](https://github.com/duyet/aidr/commit/b5c73c68de5ccedf47918705706cd463057d7991))
- **web:** add the Cloudflare Blog as an AI-filtered source ([90fe1a3](https://github.com/duyet/aidr/commit/90fe1a33fe4a6d24f852cc7083ca4dc16c5271ff))
- **web:** bench draft repair, rule extraction, review queue and Jev judges ([51ac6b6](https://github.com/duyet/aidr/commit/51ac6b61e8279af5e51fd674089e68fbc17b6cc6))
- **web:** check translations with back-translation and keep tech terms in English ([cebdb9c](https://github.com/duyet/aidr/commit/cebdb9c7dbced69b732e93b126e3c27bd16188f8))
- **web:** clickable workflow diagram with per-step LLM calls ([e079657](https://github.com/duyet/aidr/commit/e079657983801cd244658a827a4a5ea9dd3cff16))
- **web:** collect every 30 minutes and keep new models and labs ([5a37a8c](https://github.com/duyet/aidr/commit/5a37a8ccbff098ab16a9a3c678c34eabd83e6ec2))
- **web:** compact Recent runs list with a details dialog ([5809f93](https://github.com/duyet/aidr/commit/5809f93993817c238684db153e836067799f8e2f))
- **web:** configure the Facebook Page from the environment ([72f4ce1](https://github.com/duyet/aidr/commit/72f4ce1b5efb2fcc143581883a338ed258ed4a00))
- **web:** convert WebP photos to JPEG for OG cards via the Images binding ([c819aa1](https://github.com/duyet/aidr/commit/c819aa1e8506342c69623e49eb2cd642d802dff8))
- **web:** day nav as pills with home link on the right ([eba36c3](https://github.com/duyet/aidr/commit/eba36c351b0550cc5576484c167e62785dad1ddc))
- **web:** day OG card, Telegram digest links to day page, looser trending bar ([1e1ed9a](https://github.com/duyet/aidr/commit/1e1ed9af668489397ca5309dd4b41408db577381))
- **web:** day page AI;DR list uses the homepage rows (highlights, story dialog) ([d9745da](https://github.com/duyet/aidr/commit/d9745da969605db14edf9eb760b19ff756a25c39))
- **web:** double opt-in email signup and reject reserved domains ([e2b36a2](https://github.com/duyet/aidr/commit/e2b36a218f78387614cb2a98568b387d9a1dd872))
- **web:** drive the email preview from the form and add image layouts ([#328](https://github.com/duyet/aidr/issues/328)) ([e2dfbc9](https://github.com/duyet/aidr/commit/e2dfbc90361757569e0f726675df40e234d5ad78))
- **web:** dry-run, step reruns and previews for local agents ([6d27926](https://github.com/duyet/aidr/commit/6d2792694c250b4f94e9a3e93bf281bd858b2bad))
- **web:** explain story rank and Telegram trending status on story page ([c65b2b9](https://github.com/duyet/aidr/commit/c65b2b970834cf4e3ceee43db90605e09eb9d79f))
- **web:** flag runs with failed steps and draw the workflow graph ([aef4a07](https://github.com/duyet/aidr/commit/aef4a070086bcaccc6d8264022150f0682991b5a))
- **web:** group fallback transitions and label dry/partial runs ([5b9e83d](https://github.com/duyet/aidr/commit/5b9e83dd2347351bdba5363164030a874e38219b))
- **web:** group repeated run errors, keep /data English, compact models cell ([0061d5f](https://github.com/duyet/aidr/commit/0061d5fee49727cd626ec22b47360560241a128f))
- **web:** hovering the masthead chip shows the day card over the whole digest ([9b74292](https://github.com/duyet/aidr/commit/9b742926cdc5e28df7abc208a556a8bd274f0cdc))
- **web:** keep model jargon in English and repair weak Vietnamese drafts ([ee2a556](https://github.com/duyet/aidr/commit/ee2a556f25a20f9844968824d68a067035cc1b8f))
- **web:** learn translation rules from accepted suggestions; one free-form suggestion box ([033c572](https://github.com/duyet/aidr/commit/033c572e1446b2dc8d8d753438eb4bd90e64c6fb))
- **web:** let signed-in readers vote stories up or down ([#367](https://github.com/duyet/aidr/issues/367)) ([3202a77](https://github.com/duyet/aidr/commit/3202a7780083ded44f5d7f3f6850e509a7d081cf))
- **web:** link Get AI;DR menu to Contribute page ([1a4f9ea](https://github.com/duyet/aidr/commit/1a4f9ea093044f751a5ecaf585ed8d0cf9a197f4))
- **web:** link the Facebook Page from the Get AI;DR menu ([45213ed](https://github.com/duyet/aidr/commit/45213ed7a21b2991fb6326c81935dda0d250a8a5))
- **web:** list day pages in sitemap, llms.txt and add day Markdown ([90a7c90](https://github.com/duyet/aidr/commit/90a7c9030e420fe4234302f85277d2cd6248b2d3))
- **web:** make the Chrome new-tab preview match the real extension ([#329](https://github.com/duyet/aidr/issues/329)) ([2c40f8e](https://github.com/duyet/aidr/commit/2c40f8e1cf17ac4723ab7eba0835a6c89b2e9cae))
- **web:** move contributions to /contribute with a compact, filterable history ([49abf2d](https://github.com/duyet/aidr/commit/49abf2de81cfecbd51f78a63ab75be46c3168963))
- **web:** one row per LLM chain call, retries inline, price when known ([9e02f4f](https://github.com/duyet/aidr/commit/9e02f4fd7ab2e3ea15a08b7b5d28e22f679c3e96))
- **web:** post the English digest and trending stories to Facebook ([e65ea90](https://github.com/duyet/aidr/commit/e65ea902eb5c22ebe70e6ae1ea5ab47e7b8bde16))
- **web:** post the full Facebook edition in paragraphs ([3c99da0](https://github.com/duyet/aidr/commit/3c99da04873840f6a4af6d06953f9596ac9a4cab))
- **web:** prepare an off Threads channel for the daily edition ([#391](https://github.com/duyet/aidr/issues/391)) ([1f5dae9](https://github.com/duyet/aidr/commit/1f5dae949278c5c96b10913adbb85a41996588e3))
- **web:** rank on real corroboration and engagement; make the trending bar relative ([b72b23b](https://github.com/duyet/aidr/commit/b72b23bb8c4e8959313d70a42887a545bd053a19))
- **web:** re-rank a rolling 72h window and cap each source family on top lists ([a8b8f4d](https://github.com/duyet/aidr/commit/a8b8f4dac1cd6795dc8b459552043e7e49c5893a))
- **web:** redesign day page hero and link feed day headings to it ([f585dbb](https://github.com/duyet/aidr/commit/f585dbb0f96e2f66f992aafe27395334899de2cc))
- **web:** review reader suggestions on submit and show contribution history ([a4fd4f5](https://github.com/duyet/aidr/commit/a4fd4f5bf5d42ed0aeb5a51df151735b28f27307))
- **web:** route chat chains through the @preset/aidr AnyRouter preset ([ecc2e1a](https://github.com/duyet/aidr/commit/ecc2e1a3a754860024ad98d2d0686efc2138c5a8))
- **web:** show a family mark beside each run model ([#399](https://github.com/duyet/aidr/issues/399)) ([775e248](https://github.com/duyet/aidr/commit/775e248eb77ea45d691dc22f0efab96ad08228bc))
- **web:** show one Telegram card per channel on the subscribe tab ([#322](https://github.com/duyet/aidr/issues/322)) ([be98497](https://github.com/duyet/aidr/commit/be98497a6d4b310e298dc8e0acd0d3a8a245af62))
- **web:** show the day card as the day page hero when there is no video ([6c2fba9](https://github.com/duyet/aidr/commit/6c2fba94c43c9b33fd4c83ababf4cd87698f3af1))
- **web:** show the intro video as a bare, larger player ([#319](https://github.com/duyet/aidr/issues/319)) ([9b48c79](https://github.com/duyet/aidr/commit/9b48c79b20b4ba49dec3196c26023aa2ffb39d1f))
- **web:** show the route behind each LLM call and redesign the call list ([52c34de](https://github.com/duyet/aidr/commit/52c34debc4ffda55ed76a62934bdfb88f64d3f2d))
- **web:** yellow masthead for the AI;DR digest with a day card preview chip ([86f3da9](https://github.com/duyet/aidr/commit/86f3da99500934568acbb516a444e3e6fec28828))


### 🐛 Bug Fixes

- apply biome lint and format fixes ([#346](https://github.com/duyet/aidr/issues/346)) ([56e7a50](https://github.com/duyet/aidr/commit/56e7a50431ed652375ae04b5c54c9e6fd0bab5d6))
- **deps:** update dependency motion to v14 ([#350](https://github.com/duyet/aidr/issues/350)) ([96c488b](https://github.com/duyet/aidr/commit/96c488b8838fe6bed987020c82fae4fc782d061b))
- **notify:** each Telegram channel posts only its own language, no fallback ([b9416ae](https://github.com/duyet/aidr/commit/b9416ae0c37b0f739b24ce493a08fac96b354026))
- **notify:** keep Vietnamese-source stories off the English Telegram channel ([ceb9e7c](https://github.com/duyet/aidr/commit/ceb9e7c3189980ffb14e2940e0cdbd0f908efd64))
- **scripts:** probe non-rss sources in verify-source-feeds ([#360](https://github.com/duyet/aidr/issues/360)) ([ad3e176](https://github.com/duyet/aidr/commit/ad3e176904f38226b4b0ec5124e5fb809c71aa38))
- **web:** add a short summary to each Telegram highlight ([9fda72f](https://github.com/duyet/aidr/commit/9fda72ffcc8eef4feda34d02e025ce1e015868b0))
- **web:** anchor importance on a shared 1-10 scale and use Jev's weighted level ([be99f17](https://github.com/duyet/aidr/commit/be99f177ac7cc462551daa483cf5eb6378b5bced))
- **web:** backfill VI summaries a translate batch dropped ([92bd29a](https://github.com/duyet/aidr/commit/92bd29a77a2e80485c4c81f2b98c0b4a3bc8ec55))
- **web:** base webhook severity on importance, not an absolute rank ([661fe30](https://github.com/duyet/aidr/commit/661fe30cd72e191bf2b3bbfa2bf1e549361cb6c8))
- **web:** bucket the homepage feed on the audience day ([#381](https://github.com/duyet/aidr/issues/381)) ([a8f7f10](https://github.com/duyet/aidr/commit/a8f7f10a11a7bf86825e05db29c3c5079fb8bfb4))
- **web:** cache the explicit-lang submit page ([#374](https://github.com/duyet/aidr/issues/374)) ([def69e1](https://github.com/duyet/aidr/commit/def69e162b07448ae7126f38e12168b6fdd304de))
- **web:** choose channel copy from source_lang, not diacritics ([eb039a0](https://github.com/duyet/aidr/commit/eb039a0e1b51284be745d827e971d2538be1f0f7))
- **web:** count a step skipped because it threw as failed ([e5b117f](https://github.com/duyet/aidr/commit/e5b117f3dcc278ab69eb55b1fdb5cd865aa7a7f5))
- **web:** darker scrim on day OG tiles ([11a9b3b](https://github.com/duyet/aidr/commit/11a9b3ba696ce0733f3c1b2e459103d68942807c))
- **web:** day card leads with real photos, skips headline-only share images ([8abed7e](https://github.com/duyet/aidr/commit/8abed7e5cd203b7c9be1540034e283fcb08b7df0))
- **web:** day card shows only stories with copy in its language; fuller text tiles ([d08271d](https://github.com/duyet/aidr/commit/d08271dcda0ec60103acf9eba021ac01d7069655))
- **web:** day card waits up to 5s per photo; Vietnamese tiles must read as Vietnamese ([88ff742](https://github.com/duyet/aidr/commit/88ff7425f2cbdee671eff71240e74ee524d0b33d))
- **web:** decode HTML entities, strip UPDATE: markers, bound Telegram sends, check VI numbers ([d7fe158](https://github.com/duyet/aidr/commit/d7fe15814a5269e7c8d3c613e5d6dc2abafe0a98))
- **web:** decode numeric entities in RSS titles ([#436](https://github.com/duyet/aidr/issues/436)) ([4aed163](https://github.com/duyet/aidr/commit/4aed163b83810cb84ea1cc5ccba1540b760cf068))
- **web:** do not age operator push sources ([#455](https://github.com/duyet/aidr/issues/455)) ([d9f4af8](https://github.com/duyet/aidr/commit/d9f4af89754136a6e20bb9c8b318adab9f6ca1ba))
- **web:** do not mark a partial Telegram digest as sent ([#435](https://github.com/duyet/aidr/issues/435)) ([9e8ea3c](https://github.com/duyet/aidr/commit/9e8ea3c6f05e7a58b0437166f5a1315bee8173cd))
- **web:** drop invented facts from Vietnamese style examples ([#397](https://github.com/duyet/aidr/issues/397)) ([02030e1](https://github.com/duyet/aidr/commit/02030e138f11cfe7f37b055b9c3d7bd792bcf7a8)), closes [#394](https://github.com/duyet/aidr/issues/394)
- **web:** drop undated RSS items from the fetch window ([#438](https://github.com/duyet/aidr/issues/438)) ([f397b36](https://github.com/duyet/aidr/commit/f397b36ee129cdb416327d8b3a7e02977892da90))
- **web:** fill day OG tiles from the top stories whose photos load ([2f50f40](https://github.com/duyet/aidr/commit/2f50f40fc0d360aaa26e78436721c48dd2cc6268))
- **web:** finish the Cloudflare Blog source: dashboard threshold, budget, rollback ([e98a412](https://github.com/duyet/aidr/commit/e98a4126bf16591ffe9956b8351424f186718f4b))
- **web:** format story clocks in Asia/Ho_Chi_Minh ([#441](https://github.com/duyet/aidr/issues/441)) ([2e2f334](https://github.com/duyet/aidr/commit/2e2f3344c6ccd46761b5c7fe8a7a107810cb3109))
- **web:** give the TL;DR first hop Laguna's full runtime; log cost and request id ([d105b67](https://github.com/duyet/aidr/commit/d105b676432504b51b29be558480ab056b3d8f42))
- **web:** head translate chains with gemini-3-flash ([#398](https://github.com/duyet/aidr/issues/398)) ([a00fcbd](https://github.com/duyet/aidr/commit/a00fcbde67f84acf1efa4ab6ddbaf0771e724511))
- **web:** keep a partial campaign send retryable ([#449](https://github.com/duyet/aidr/issues/449)) ([9939dd0](https://github.com/duyet/aidr/commit/9939dd08b5e6467c974a6ec928910ea352e57def))
- **web:** keep a slow Gemini translate start ([9bb643f](https://github.com/duyet/aidr/commit/9bb643fd627dccf31703bbfc3f0f99c9f30c9c25))
- **web:** keep an approved suggestion when re-translation fails ([#456](https://github.com/duyet/aidr/issues/456)) ([78bfe83](https://github.com/duyet/aidr/commit/78bfe830b195f93cd6066c8f44f3f000c6fb1e48))
- **web:** keep every failed story thumbnail ([#380](https://github.com/duyet/aidr/issues/380)) ([d80fb2d](https://github.com/duyet/aidr/commit/d80fb2d6862bb0c46c65f92d3d111c82783b9f9a))
- **web:** keep Facebook mint and secret sync from stopping early ([5f0f4ea](https://github.com/duyet/aidr/commit/5f0f4ea8066e33d381b017099a43eaaf31ba8804))
- **web:** keep feed vote controls on the title line ([8aed35b](https://github.com/duyet/aidr/commit/8aed35bcc13f8351b29ebf93f738bb1146a138b6))
- **web:** keep locale redirects on the request origin ([#383](https://github.com/duyet/aidr/issues/383)) ([c3b7049](https://github.com/duyet/aidr/commit/c3b704909fdce36fb968184a74b6c8e2bb6105b3))
- **web:** keep one row when two feeds share a URL ([#447](https://github.com/duyet/aidr/issues/447)) ([105ea20](https://github.com/duyet/aidr/commit/105ea202d0d375f842b37af099b5a648406416c5))
- **web:** keep sent_count a lifetime total across retries ([#457](https://github.com/duyet/aidr/issues/457)) ([1ce2075](https://github.com/duyet/aidr/commit/1ce2075f510a76424a70bfae6aa7f1b1e3d566b0))
- **web:** keep the digest out of the trending gap ([#448](https://github.com/duyet/aidr/issues/448)) ([a0b9f88](https://github.com/duyet/aidr/commit/a0b9f88966b723d0379a539f0ac9a0d5a51f6317))
- **web:** keep the header sign-in slot avatar-sized so auth never shifts it ([9cb75b7](https://github.com/duyet/aidr/commit/9cb75b7926ecb09c547d6ff06e5dcecb1cb0e2da))
- **web:** keep the score step inside its 5-minute budget ([#389](https://github.com/duyet/aidr/issues/389)) ([392ac04](https://github.com/duyet/aidr/commit/392ac04d1b03178eb31f6fb9969816c3406757c7))
- **web:** keep the Telegram digest on the day card's stories ([#373](https://github.com/duyet/aidr/issues/373)) ([491bb4c](https://github.com/duyet/aidr/commit/491bb4c48183338abfa41938a9e9df8e17e1ae91))
- **web:** lead chains with Laguna; @preset/aidr now serves a model that returns no content ([3897b5d](https://github.com/duyet/aidr/commit/3897b5decce8610071436c939663947990a7cbbd))
- **web:** limit public top stories to the last 48h ([8a8a21b](https://github.com/duyet/aidr/commit/8a8a21baedaec78f2a7c4544579141dc719a9ee5))
- **web:** link a slow suggestion review to the contributions list ([#440](https://github.com/duyet/aidr/issues/440)) ([f517255](https://github.com/duyet/aidr/commit/f517255ab38c2372deb240290831c817d1ca617a))
- **web:** load story content history with the story ([#371](https://github.com/duyet/aidr/issues/371)) ([a44175b](https://github.com/duyet/aidr/commit/a44175b9149dbd52729ea4fc597f744673f1bb48))
- **web:** localize reader labels that stayed in English ([#385](https://github.com/duyet/aidr/issues/385)) ([7ea917f](https://github.com/duyet/aidr/commit/7ea917fe165057b8bcd1b7a2fa2f5baca6e24be6))
- **web:** log item text changes on push and ingest ([#377](https://github.com/duyet/aidr/issues/377)) ([19c6083](https://github.com/duyet/aidr/commit/19c60837862ed482b556451a5a7764c6afd8ed6d))
- **web:** log QA corrections before they replace text ([#368](https://github.com/duyet/aidr/issues/368)) ([05c78be](https://github.com/duyet/aidr/commit/05c78be91c43b2f1c390d9c944d48719f87c03c1))
- **web:** log story text edits and clean Vietnamese copy ([bc16870](https://github.com/duyet/aidr/commit/bc168701451aa6d57155de52d8efcaad0126163d))
- **web:** make the Density pref adjust the AI;DR card too ([07d5465](https://github.com/duyet/aidr/commit/07d5465631dc28b39d0557bac719d2dfc0af364c))
- **web:** match the Telegram digest to today's day card ([694b7b4](https://github.com/duyet/aidr/commit/694b7b48450aa228135f73939ca70551965299ef))
- **web:** move reader votes when an official post takes the canonical ([#451](https://github.com/duyet/aidr/issues/451)) ([f303a00](https://github.com/duyet/aidr/commit/f303a002159d568a7f27bc7a303c7fe9c40f8ade)), closes [#420](https://github.com/duyet/aidr/issues/420)
- **web:** name merged items in Vietnamese ([#434](https://github.com/duyet/aidr/issues/434)) ([5d274f8](https://github.com/duyet/aidr/commit/5d274f8e57c48abb5656e4e71ae33d5edee99a96))
- **web:** name the permalink day in Vietnam time ([#382](https://github.com/duyet/aidr/issues/382)) ([3627a7c](https://github.com/duyet/aidr/commit/3627a7ca8e15376f0a1ebbd3d1fca719b278765a))
- **web:** never inline WebP into OG cards; resvg draws it blank ([8204d03](https://github.com/duyet/aidr/commit/8204d03cb9018aeacf5af674a3e75f9830bb70e9))
- **web:** order admin run status by normalized started_at ([#396](https://github.com/duyet/aidr/issues/396)) ([1b1b64a](https://github.com/duyet/aidr/commit/1b1b64a0233b05ee33c8a5eba060129d5a820cbf)), closes [#393](https://github.com/duyet/aidr/issues/393)
- **web:** parse the bare array Clerk returns from the users list ([144eb49](https://github.com/duyet/aidr/commit/144eb4904b9493fa3305dfbd6ee33881692e8552))
- **web:** put the Vietnamese fact card in the translate prompt ([#375](https://github.com/duyet/aidr/issues/375)) ([42e6dec](https://github.com/duyet/aidr/commit/42e6decd52cfa39f9e2575e36f8b51f5b096bf83))
- **web:** rank a story inside its ICT day ([#445](https://github.com/duyet/aidr/issues/445)) ([4416325](https://github.com/duyet/aidr/commit/44163257b01fcb35c8976a99c8be6a5784ceaac7))
- **web:** read catalog batch rows by name ([#369](https://github.com/duyet/aidr/issues/369)) ([4624b84](https://github.com/duyet/aidr/commit/4624b84470c12b0ed621d236462e481fb64d2cf4))
- **web:** read the catalog size from D1 result meta ([486a62e](https://github.com/duyet/aidr/commit/486a62e7069f6dc977cf7a36841fc01cc69e0d8c))
- **web:** rebuild AnyRouter chains on streaming probes, fix review chain ([44af660](https://github.com/duyet/aidr/commit/44af6600e33edcb9d5547cdbb09215ada3d19a46))
- **web:** rebuild AnyRouter model chains from a live probe ([c1d118e](https://github.com/duyet/aidr/commit/c1d118e5e751de38bd8013d8797315a2cae7be75))
- **web:** record a non-2xx source fetch as fetch_failed ([#384](https://github.com/duyet/aidr/issues/384)) ([e991aa4](https://github.com/duyet/aidr/commit/e991aa400111417b83111a9469e67a1ebfd3e854))
- **web:** record LLM timeouts as timeouts, stop one hang eating the chain ([#336](https://github.com/duyet/aidr/issues/336)) ([a1e3034](https://github.com/duyet/aidr/commit/a1e303463d6a637b345c9cd796cef00041063154))
- **web:** record rss fetch failures after the workflow clones the error ([#362](https://github.com/duyet/aidr/issues/362)) ([c5efb52](https://github.com/duyet/aidr/commit/c5efb525adb7ad2bd36011af78507c98b9b15d8a))
- **web:** refuse an ambiguous story id prefix ([#432](https://github.com/duyet/aidr/issues/432)) ([ec7d0a2](https://github.com/duyet/aidr/commit/ec7d0a2eca42e24b6b93bf60acc39962fd724b85))
- **web:** reload an open story when the language changes ([#387](https://github.com/duyet/aidr/issues/387)) ([017e661](https://github.com/duyet/aidr/commit/017e6611fe1254e78955730579e73ecb4d7837e6))
- **web:** repair Laguna's stray JSON closers, give each chain call an id ([dd61fcf](https://github.com/duyet/aidr/commit/dd61fcfe0d89e3e30c31b5b67185ae3d7f4da057))
- **web:** replace cut-off summaries and retry short translations ([#386](https://github.com/duyet/aidr/issues/386)) ([500048c](https://github.com/duyet/aidr/commit/500048c58c8c827e49ba6a4460ab5e8e55a8e021))
- **web:** report a missing source on delete ([#458](https://github.com/duyet/aidr/issues/458)) ([8f58ddf](https://github.com/duyet/aidr/commit/8f58ddf48dab9d75b016c5b4b33b4cce00bec16c))
- **web:** report an unconfirmed Telegram digest as outcome_unknown ([e943cdb](https://github.com/duyet/aidr/commit/e943cdba48cf4661698dbe49d090834d0be35499))
- **web:** report an unexplained fetch throw as fetch_failed ([#460](https://github.com/duyet/aidr/issues/460)) ([30dd3bf](https://github.com/duyet/aidr/commit/30dd3bf42f5dd8e643b9790de9b15a5482595858)), closes [#357](https://github.com/duyet/aidr/issues/357)
- **web:** request story ranking with both query parameters ([#433](https://github.com/duyet/aidr/issues/433)) ([fa1912a](https://github.com/duyet/aidr/commit/fa1912a325e75759a9ce93b9c4d1e1f45fa3c8df))
- **web:** restore SubmissionsList.tsx removed by accident in 3897b5d ([60aea07](https://github.com/duyet/aidr/commit/60aea07f9a56a0b8cfa72864303e5b5005260c87))
- **web:** retry sign-in for the same suggestion selection ([#388](https://github.com/duyet/aidr/issues/388)) ([75a288b](https://github.com/duyet/aidr/commit/75a288b705ecccbba2f603ecd586bd622ce25e2f))
- **web:** retry the item_votes probe after a miss ([#431](https://github.com/duyet/aidr/issues/431)) ([0fb0e8d](https://github.com/duyet/aidr/commit/0fb0e8db081b1eb78ef1c961bf3a2887990202c9))
- **web:** retry the TL;DR step once after an engine interruption ([f993456](https://github.com/duyet/aidr/commit/f9934569d8bacb6f4b9cb129d623693aec99095a))
- **web:** return a mutable copy of cached OG responses ([2ddf30d](https://github.com/duyet/aidr/commit/2ddf30db09ec16b6e01f30520f56b729e364d0c7))
- **web:** return a plain 302 from the subscribe confirm route ([9a5d127](https://github.com/duyet/aidr/commit/9a5d127a9f6f9ec5a72d7827ec89f72a484dbc8f))
- **web:** run cf with color off so the migration gate can parse its JSON ([7f8d3b8](https://github.com/duyet/aidr/commit/7f8d3b8bb4506e85b61a71723a9985002a25aaac))
- **web:** run story clustering through the model chain so merges stop silently failing ([c56bcd3](https://github.com/duyet/aidr/commit/c56bcd3282b64cd2d6bcc4e03d1ba03003d32219))
- **web:** say the pipeline runs every 30 minutes ([#442](https://github.com/duyet/aidr/issues/442)) ([a0fec7a](https://github.com/duyet/aidr/commit/a0fec7aa5ec09bca747f2938376c0e8095d8c8d1))
- **web:** score published rows that still have null relevance ([#395](https://github.com/duyet/aidr/issues/395)) ([3a1a9a5](https://github.com/duyet/aidr/commit/3a1a9a5dd4805f0e4f2ccbd3f20c2546871be350)), closes [#392](https://github.com/duyet/aidr/issues/392)
- **web:** send a User-Agent when fetching OG photos so CDNs return JPEG, not WebP ([c019daf](https://github.com/duyet/aidr/commit/c019daf38d181d2ffcd123795601aee3982ee360))
- **web:** ship a live Clerk key; split the deliver page controls/preview ([117c614](https://github.com/duyet/aidr/commit/117c6141818dcd6ec528f5e44a4e0f201620b35c))
- **web:** ship the Clerk key from local deploys and refuse a keyless deploy ([c92c964](https://github.com/duyet/aidr/commit/c92c964fed0e94c3b952e832ef4a497fea2a6926))
- **web:** show a dash when a catalog count is missing ([#372](https://github.com/duyet/aidr/issues/372)) ([f24dcc5](https://github.com/duyet/aidr/commit/f24dcc558a29b5fd6fa122cd5e1203d92dca668c))
- **web:** show dates and totals on the data charts ([#400](https://github.com/duyet/aidr/issues/400)) ([9e252b9](https://github.com/duyet/aidr/commit/9e252b93a105179f46dc5ca5788a9db55410b6a5))
- **web:** show open runs as running and restore Telegram trending posts ([5e064f3](https://github.com/duyet/aidr/commit/5e064f3cf9277150895e145a8b6b3373fc82501f))
- **web:** skip today's stamp when the digest is the UTC fallback ([#379](https://github.com/duyet/aidr/issues/379)) ([a8e2728](https://github.com/duyet/aidr/commit/a8e272877fc21029c1db069bcca4f77a11018f3f))
- **web:** solid scrim under day OG tile text ([5f3c874](https://github.com/duyet/aidr/commit/5f3c874218eab9b16710a554dac3893247a2dddf))
- **web:** sort equal GA4 days stably ([#430](https://github.com/duyet/aidr/issues/430)) ([1eb0fe4](https://github.com/duyet/aidr/commit/1eb0fe4ea303cd7e772bc0b4ab3f024f300668bb))
- **web:** split a long Telegram digest into two highlights ([a68f403](https://github.com/duyet/aidr/commit/a68f4033a667a2e5f0ec0f664b8b014039097fd2))
- **web:** split day OG tiles into photo and solid text panel ([41794b3](https://github.com/duyet/aidr/commit/41794b3aa08d7385c39a3977b184b4c1fee9a439))
- **web:** stop reporting Workflows engine interruptions to Bugsink ([b818e46](https://github.com/duyet/aidr/commit/b818e460879dffbb2ee6163ea15cdb11e90a3d57))
- **web:** stop the VI draft gate from repairing good copy ([#370](https://github.com/duyet/aidr/issues/370)) ([d31fff7](https://github.com/duyet/aidr/commit/d31fff70f8da1781785a7f0e3c37df7be9d5a485))
- **web:** sync EXTENSION_VERSION to 0.1.19 and let release-please bump it ([#320](https://github.com/duyet/aidr/issues/320)) ([5728770](https://github.com/duyet/aidr/commit/5728770e4fd7c2a0864b08acc01931856afaf764))
- **web:** try Gemma free models before Laguna on translate ([#366](https://github.com/duyet/aidr/issues/366)) ([4cd3e74](https://github.com/duyet/aidr/commit/4cd3e7439e19b67a901c987bd1b17467b495b4ae))
- **web:** type the Facebook fetch mock call ([d558057](https://github.com/duyet/aidr/commit/d558057c038f5fd858da3bdb456108bdc3d81d11))
- **web:** verify Clerk Svix v1 signatures and keep deletions ([#378](https://github.com/duyet/aidr/issues/378)) ([8594dbb](https://github.com/duyet/aidr/commit/8594dbb2d1f48c8ead13d78fe557fa7ce68d8483))
- **worker:** keep the push source off the stale streak ([#361](https://github.com/duyet/aidr/issues/361)) ([da898ac](https://github.com/duyet/aidr/commit/da898acfc117b29bbf75a00ffdc83ef8ed0fac23))
- **worker:** raise translate step timeouts above the LLM deadline ([#358](https://github.com/duyet/aidr/issues/358)) ([d65fac8](https://github.com/duyet/aidr/commit/d65fac8ec284923c70fd3bef84632ec382c2f49e))
- **worker:** stop engine interruptions from filing Bugsink issues ([#351](https://github.com/duyet/aidr/issues/351)) ([ced9f88](https://github.com/duyet/aidr/commit/ced9f8887736ecb660eb36b93cf13ebf7e75453a))


### ⚡ Performance

- **web:** edge-cache rendered OG cards; hourly TTL for recent day cards ([27c192e](https://github.com/duyet/aidr/commit/27c192ec5235ca960275c47aea94efe6f914da81))
- **web:** index the published feed and ranking join ([#376](https://github.com/duyet/aidr/issues/376)) ([e549e8f](https://github.com/duyet/aidr/commit/e549e8f9d5f26ec93789b06f21e3c1b2c3f973d2))
- **web:** index unsubscribe tokens and items by source ([#459](https://github.com/duyet/aidr/issues/459)) ([9c5a649](https://github.com/duyet/aidr/commit/9c5a6497dfb36ac641a981856ab54b1e28c32e7e))
- **web:** keep day-card source photos in R2 so renders reuse them ([35c7f63](https://github.com/duyet/aidr/commit/35c7f63e9fdc31c8975ae1c2f4cdabfcfccd1495))
- **web:** preload the day card so the masthead hover is instant ([8b88ddf](https://github.com/duyet/aidr/commit/8b88ddfe2b655e75d32c53ac0f35de0bfd507a42))
- **web:** prune subscribe attempts older than a day ([#454](https://github.com/duyet/aidr/issues/454)) ([dbc5b78](https://github.com/duyet/aidr/commit/dbc5b780060f85f8c78df68695c875f3bd165d12))
- **web:** share rendered OG cards across regions via R2; batch day-card photo fetches ([c15d05c](https://github.com/duyet/aidr/commit/c15d05c973307ae4c5dd1e119ac08c483cad0c89))


### ♻️ Refactoring

- **email:** remove the extra-address confirmation flow ([9484bd3](https://github.com/duyet/aidr/commit/9484bd32c60afb82cb2f9c746d1fe5ed08fe54bf))
- **web:** read source thresholds and score budget from one place ([f6bd42d](https://github.com/duyet/aidr/commit/f6bd42d9c9efa98a0e74f9bcbeeadfd6f729dbdb))

## [0.1.10](https://github.com/duyet/aidr/compare/web-v0.1.9...web-v0.1.10) (2026-09-30)

### ✨ Features

- **digest:** split email into English and Vietnamese lanes ([#261](https://github.com/duyet/aidr/issues/261)) ([00bd53e](https://github.com/duyet/aidr/commit/00bd53e13b915a19e4e4c292f9a5b3eb51bb7712))
- **jev-panel:** gate submissions and suggestions, run judges in parallel, restore on overturn ([#295](https://github.com/duyet/aidr/issues/295)) ([1b2e0e9](https://github.com/duyet/aidr/commit/1b2e0e9d3abab715398a6867b3e82416f26b8d1b)), closes [#144](https://github.com/duyet/aidr/issues/144)
- **jev-panel:** safety/translation seats, verdict audit, admin view and override ([#292](https://github.com/duyet/aidr/issues/292)) ([8d8fbbc](https://github.com/duyet/aidr/commit/8d8fbbc02cdebc3128fff11b9ca54b76d54113bf))
- **jev:** wire the merged review panel into the scoring decision ([#209](https://github.com/duyet/aidr/issues/209)) ([fd5314a](https://github.com/duyet/aidr/commit/fd5314a38961d8bf733fb1fe836cc57b479ca304)), closes [#203](https://github.com/duyet/aidr/issues/203) [#144](https://github.com/duyet/aidr/issues/144)
- **notify:** fewer trending posts, day hours only, more room on big-news days ([#315](https://github.com/duyet/aidr/issues/315)) ([f0816a1](https://github.com/duyet/aidr/commit/f0816a1435e2d6989f6e91750b8d83e063d35c10))
- **notify:** post the English digest to [@aidr](https://github.com/aidr)_today ([#251](https://github.com/duyet/aidr/issues/251)) ([619d006](https://github.com/duyet/aidr/commit/619d006982d89397773b515a0bd56b3c120a02eb))
- **notify:** read Vietnamese and English Telegram chats from env ([#254](https://github.com/duyet/aidr/issues/254)) ([914345a](https://github.com/duyet/aidr/commit/914345a9c3b82b3f69d6daa5aefad3a346f39892))
- **notify:** send the album read link as a native Telegram button ([18c90f9](https://github.com/duyet/aidr/commit/18c90f918d4755de2e34bbd591c2ae582000be47))
- **ops:** live performance budgets and release check results ([#301](https://github.com/duyet/aidr/issues/301)) ([7b2e042](https://github.com/duyet/aidr/commit/7b2e042410ef995ae0cb9971aa24062e5bd0f0d4)), closes [#147](https://github.com/duyet/aidr/issues/147)
- **quality:** add secret scan, call caps, prompt-injection tests and docs ([#290](https://github.com/duyet/aidr/issues/290)) ([31985ad](https://github.com/duyet/aidr/commit/31985ad6ccc7eb3db3e6c777e93b79cfe255d428)), closes [#147](https://github.com/duyet/aidr/issues/147)
- **sources:** add arXiv via rss.arxiv.org, flood-gated ([#286](https://github.com/duyet/aidr/issues/286)) ([5235a46](https://github.com/duyet/aidr/commit/5235a461f57e7365bb8f064914cc551237b98f91))
- **sources:** Lobsters filtered tags and HN points range via the registry ([#294](https://github.com/duyet/aidr/issues/294)) ([242c932](https://github.com/duyet/aidr/commit/242c932d9caf78c539cafc9ffe798b48a319e793))
- **telegram:** send video and mixed albums after a bounded preflight ([#287](https://github.com/duyet/aidr/issues/287)) ([53c232f](https://github.com/duyet/aidr/commit/53c232f6416d62a6557b60218abe5e0da685bfcc))
- **web:** a GA4 audience snapshot behind a new /data Audience tab ([c8eb48b](https://github.com/duyet/aidr/commit/c8eb48b144addb0f1788ea38cc9520b005f26370))
- **web:** add intro video dialog to header ([#309](https://github.com/duyet/aidr/issues/309)) ([f41f264](https://github.com/duyet/aidr/commit/f41f264b5c106d171dede99ccf49376ba1ff6f2b))
- **web:** add repeatable Lighthouse median script for CWV ([#281](https://github.com/duyet/aidr/issues/281)) ([47ae087](https://github.com/duyet/aidr/commit/47ae087ca22df40b9ead39259ee8199a0bc13d07))
- **web:** add story breadcrumb JSON-LD and SEO measurement checklist ([#285](https://github.com/duyet/aidr/issues/285)) ([6af50c9](https://github.com/duyet/aidr/commit/6af50c99044c74012b4761f13b2f2803e5342644)), closes [#139](https://github.com/duyet/aidr/issues/139)
- **web:** advertise the story Markdown so a client can offer a quick view ([8a9b177](https://github.com/duyet/aidr/commit/8a9b177b4824c8002e4f1ad24cadadee9c0e39bb))
- **web:** link footer freshness to the latest run with a health dot ([#265](https://github.com/duyet/aidr/issues/265)) ([cfc876e](https://github.com/duyet/aidr/commit/cfc876e2ad702946b619073e1b69c439942a5627))
- **web:** render the story media manifest as a bounded gallery ([0c5e80c](https://github.com/duyet/aidr/commit/0c5e80cab158d2ff4f73d59616f5635c5ecdea9c))
- **web:** ship raster icons and outline the wordmark in the SVG mark ([39e27f9](https://github.com/duyet/aidr/commit/39e27f9297a4ca06db11e70bb51bfddc871a963a))
- **web:** show all four homepage sections to new users ([#308](https://github.com/duyet/aidr/issues/308)) ([bd22e36](https://github.com/duyet/aidr/commit/bd22e367c0badc125f2d12c1cf0cb513aaae0cd6))
- **web:** title the digest from its bullets and add one hero ([#247](https://github.com/duyet/aidr/issues/247)) ([b04b3b6](https://github.com/duyet/aidr/commit/b04b3b689931d8ec71e3cca224498c87d0c209f8))
- **worker:** owner Telegram DM and GitHub issues for health alerts ([#274](https://github.com/duyet/aidr/issues/274)) ([14bb328](https://github.com/duyet/aidr/commit/14bb3284c284b301c9045f93438d3e91d4b041c2))
- **worker:** pipeline health alerts and /api/health ([#271](https://github.com/duyet/aidr/issues/271)) ([c7c0a12](https://github.com/duyet/aidr/commit/c7c0a12a98ae640efd1a69bcc9569c8ced26f191))
- **worker:** Telegram albums, card fallback, one button, one language ([1ffa2b7](https://github.com/duyet/aidr/commit/1ffa2b7f4593f9e94b6f35baabd8e1542440cc18))


### 🐛 Bug Fixes

- **health:** do not alert on a Telegram channel that spent its daily cap ([#312](https://github.com/duyet/aidr/issues/312)) ([a184b83](https://github.com/duyet/aidr/commit/a184b83a8b1e17ec349271e0c9095ec1f4d0b647))
- **llm:** bound streamed content, not SSE framing, and drop dead scout ([#296](https://github.com/duyet/aidr/issues/296)) ([481ce75](https://github.com/duyet/aidr/commit/481ce75349dea86f912889316050cf517ba54758))
- **llm:** drop deepseek-v4.1-flash from AnyRouter chains ([ce03b61](https://github.com/duyet/aidr/commit/ce03b6146c61086d212b5ef23505ca4f02865b7c))
- **llm:** use live-probed AnyRouter models with auto as last fallback ([1bbb7fd](https://github.com/duyet/aidr/commit/1bbb7fd7c1a0dca9cd5e48423672c999bba664bd))
- **quality:** cap JEV panel items per step, bound dedupe and topic prompts, fence mail picks ([#316](https://github.com/duyet/aidr/issues/316)) ([e395da2](https://github.com/duyet/aidr/commit/e395da2cd1e150b5237e4067299043c816b78dc8)), closes [#147](https://github.com/duyet/aidr/issues/147)
- **telegram:** do not fall back after an unknown send outcome ([#314](https://github.com/duyet/aidr/issues/314)) ([8f0e9de](https://github.com/duyet/aidr/commit/8f0e9dee5a7095b7f8ab7a16c1362eff7042828e)), closes [#145](https://github.com/duyet/aidr/issues/145)
- **web:** cap any single source at 25% of the served feed ([#299](https://github.com/duyet/aidr/issues/299)) ([f98ffc4](https://github.com/duyet/aidr/commit/f98ffc48e7f7b29285a4bf7728f767bb1e2dd922)), closes [#230](https://github.com/duyet/aidr/issues/230)
- **web:** derive the media migration gate from real files ([#275](https://github.com/duyet/aidr/issues/275)) ([de244c9](https://github.com/duyet/aidr/commit/de244c9acd75559dd6db2043e124285391f0ceb2))
- **web:** draw the OG card in Be Vietnam Pro, with the tone marks in the outline ([2f1ca9c](https://github.com/duyet/aidr/commit/2f1ca9cfc1cca4c33a78dd253708d383bfe0fb59))
- **web:** drop Clarity and pageview.duyet.net ([f472129](https://github.com/duyet/aidr/commit/f4721294772b4fbc5c922305cc9800d7070941e6))
- **web:** hide empty source link and missing date on story pages, add fallback tests ([#289](https://github.com/duyet/aidr/issues/289)) ([6493dd5](https://github.com/duyet/aidr/commit/6493dd56d6be223abda4d91cde6fab08edae399a))
- **web:** ignore a missing audience chart date ([82d89a0](https://github.com/duyet/aidr/commit/82d89a08f887a1f8a9deb0b18a1d15b80f4c1658))
- **web:** keep story categories in the site's own taxonomy in every locale ([0077a40](https://github.com/duyet/aidr/commit/0077a409117da2ea051abf5f6140584388e8992e))
- **web:** keep story summaries whole and fall back to the OG card ([#256](https://github.com/duyet/aidr/issues/256)) ([b2fca66](https://github.com/duyet/aidr/commit/b2fca66bd0639ab36160ec70f9ff098712254ff2))
- **web:** link the story dialog to a localized permalink ([71cadb8](https://github.com/duyet/aidr/commit/71cadb8a71e1c15de69b8435c017932961ec89dc))
- **web:** move About out of reader prefs into the menu ([85eca74](https://github.com/duyet/aidr/commit/85eca745a57a11e1013a69124f0b2db8a3c3082d))
- **web:** put language at the top of the phone menu ([97ee748](https://github.com/duyet/aidr/commit/97ee7483e717ade92b87054b6c695654f5015201))
- **web:** stop audience charts from looping ([5b70687](https://github.com/duyet/aidr/commit/5b7068705485d329332bcbe7a277745f1f9d40f7))
- **web:** switch header chrome on width only ([2485368](https://github.com/duyet/aidr/commit/248536807cb7cf19faffb1a822433be2e54c724c))
- **web:** the phone menu is a two-column grid of large tiles ([ff9d158](https://github.com/duyet/aidr/commit/ff9d1586da9aa1813ba1c05120f185a3b54943e6))
- **web:** tighten the story dialog and show the summary ([c0d27c4](https://github.com/duyet/aidr/commit/c0d27c435550ae57786311bfffaa3374bbb8fe60))
- **web:** use a story thumbnail as the digest hero ([#253](https://github.com/duyet/aidr/issues/253)) ([16207d9](https://github.com/duyet/aidr/commit/16207d912faaa8ebe859a548d301e6bd376fa9d2))
- **worker:** report delivery failures to Sentry ([5519761](https://github.com/duyet/aidr/commit/55197613edc7dc2657784f1af913f645af006732))
- **worker:** restore trending rank, notify reason, and tldr fallback ([#266](https://github.com/duyet/aidr/issues/266)) ([1277568](https://github.com/duyet/aidr/commit/12775688053478b6582b83f10db552af409501a0))
- **worker:** send pipeline exceptions to Sentry ([cf9bd99](https://github.com/duyet/aidr/commit/cf9bd991d1475ec8944d66612dd5b216f802886d))


### ⚡ Performance

- **web:** add pending state to settings digest preview, add preview budget doc ([#288](https://github.com/duyet/aidr/issues/288)) ([433a812](https://github.com/duyet/aidr/commit/433a812e43c9ea4a70b89b98826b7480d242475d))
- **web:** fix intermittent AI;DR shift and subset latin-ext font ([#229](https://github.com/duyet/aidr/issues/229)) ([#303](https://github.com/duyet/aidr/issues/303)) ([9b16fef](https://github.com/duyet/aidr/commit/9b16fef41b173047c172b250adf87ecc7f8bf21a))
- **web:** harden subscribe preview cache and loading state ([#284](https://github.com/duyet/aidr/issues/284)) ([0120b46](https://github.com/duyet/aidr/commit/0120b46fd39447e5bc9b63b12500bc2c8e2fd865))
- **web:** inline critical CSS, load full stylesheet async, fix row re-wrap ([#291](https://github.com/duyet/aidr/issues/291)) ([bea5b44](https://github.com/duyet/aidr/commit/bea5b44d6e08dd8dd01f9dac5da4bb0272007268)), closes [#229](https://github.com/duyet/aidr/issues/229)
- **web:** inline the full built stylesheet on the homepage ([#300](https://github.com/duyet/aidr/issues/300)) ([75a9459](https://github.com/duyet/aidr/commit/75a9459778810dae8b28629434cc456e337d8f63)), closes [#229](https://github.com/duyet/aidr/issues/229)


### ♻️ Refactoring

- **digest:** one language edition for email and Telegram ([#258](https://github.com/duyet/aidr/issues/258)) ([bf79c76](https://github.com/duyet/aidr/commit/bf79c76a0bbd439527f5c0e04ee0306f5a85ca64))
- **web:** split run details into focused panels ([#269](https://github.com/duyet/aidr/issues/269)) ([4d3a836](https://github.com/duyet/aidr/commit/4d3a8368fd94f4728fad50c999d70b75062e5d37))
- **web:** split the deliver page into one module per channel ([#267](https://github.com/duyet/aidr/issues/267)) ([53d51af](https://github.com/duyet/aidr/commit/53d51af65d6286b75be6984255e0b524b92055e1))
- **worker:** share sha256Hex and chunk helpers ([#273](https://github.com/duyet/aidr/issues/273)) ([c12f623](https://github.com/duyet/aidr/commit/c12f62340238772aabd46651277dd50b2abe50e9))
- **worker:** split ingest workflow into step modules ([#272](https://github.com/duyet/aidr/issues/272)) ([361b07b](https://github.com/duyet/aidr/commit/361b07b2c6c36938df5de8c580e4de50b051fc80))

## [0.1.9](https://github.com/duyet/aidr/compare/web-v0.1.8...web-v0.1.9) (2026-09-28)

### 🐛 Bug Fixes

- **web:** gate model claims on lookup state, aggregate run usage in SQL ([#193](https://github.com/duyet/aidr/issues/193)) ([d025c51](https://github.com/duyet/aidr/commit/d025c51b4e731e0843430e33bdc8a7502d1e035c)), closes [#189](https://github.com/duyet/aidr/issues/189)
- **web:** harden non-HTML navigation routing ([#186](https://github.com/duyet/aidr/issues/186)) ([a241070](https://github.com/duyet/aidr/commit/a2410702fdb32c0b8c27340f7c77c1e6ceb4cbb3))
- **web:** load the full EB Garamond face on OG cards ([#245](https://github.com/duyet/aidr/issues/245)) ([fb8b107](https://github.com/duyet/aidr/commit/fb8b107dc0be9009590c8d22e7bfb2ae133ca10c))

## [0.1.8](https://github.com/duyet/aidr/compare/web-v0.1.7...web-v0.1.8) (2026-09-27)

### ✨ Features

- **jev:** add deterministic review panel core ([77693f2](https://github.com/duyet/aidr/commit/77693f25aed6a27e66b13c949324f2a2a3c62d79))
- **media:** add bounded story media manifest ([#160](https://github.com/duyet/aidr/issues/160)) ([cc460b3](https://github.com/duyet/aidr/commit/cc460b347a368392842bee282013a72332c31867))
- **seo:** centralize route indexability policy ([#151](https://github.com/duyet/aidr/issues/151)) ([d42e03e](https://github.com/duyet/aidr/commit/d42e03e6773883228072edf02421fdd10dd3c079))
- **translation:** add independent semantic QA review ([#158](https://github.com/duyet/aidr/issues/158)) ([0dbf371](https://github.com/duyet/aidr/commit/0dbf3719bf0979d58dabcab6599dbfc31b9e2428))
- **web:** add accessible category accents ([#159](https://github.com/duyet/aidr/issues/159)) ([340ed62](https://github.com/duyet/aidr/commit/340ed629c2423f2eac6e16a70c4cb204d2393bf7))
- **web:** add agent-readable story Markdown ([#149](https://github.com/duyet/aidr/issues/149)) ([117af6e](https://github.com/duyet/aidr/commit/117af6e8c5463dd89af02bd08ae6281e9f8607e8))
- **web:** add locale-aware canonical links ([7869b5a](https://github.com/duyet/aidr/commit/7869b5ae402478ad7b6cc788994c47cfb6d47794))
- **web:** add story photos to OG cards ([#175](https://github.com/duyet/aidr/issues/175)) ([a9d6701](https://github.com/duyet/aidr/commit/a9d67016112f5ec150bb5739b90864fe7f9547e9))
- **web:** always-on Sign in in header, no Clerk wait ([a91143d](https://github.com/duyet/aidr/commit/a91143d65eab766b108bae66bfffbac58afce6f5))
- **web:** backfill /changelog, add agent skill for future entries ([542b676](https://github.com/duyet/aidr/commit/542b67696ffb60fabd0779b650726b740db15f00))
- **web:** brand header dropdown trigger, expand menu items ([14f0d7c](https://github.com/duyet/aidr/commit/14f0d7c60a97b2583044abc47219c84ba03c97e3))
- **web:** browser-chrome mockup frames on /subscribe ([9313a8e](https://github.com/duyet/aidr/commit/9313a8e3270c65d57aabad732938bd3d2a0e88e7))
- **web:** clarify pipeline models and account totals ([#179](https://github.com/duyet/aidr/issues/179)) ([912935b](https://github.com/duyet/aidr/commit/912935b4764710ed2d4a5517c5dd1dd1d0e4b7c9))
- **web:** dynamic OG cards for story permalinks ([3873acc](https://github.com/duyet/aidr/commit/3873acc96df7417668e553f71884b754107b3c7e))
- **web:** expand ingest run details ([#161](https://github.com/duyet/aidr/issues/161)) ([1ce436b](https://github.com/duyet/aidr/commit/1ce436b362db180f470f90864ec1f0e130b23481))
- **web:** full-screen mobile menu with icon links ([d4112a7](https://github.com/duyet/aidr/commit/d4112a79548c5448111446695787a8e1c07dc8c7))
- **web:** label Telegram menu item as Vietnamese channel ([512fc4a](https://github.com/duyet/aidr/commit/512fc4a9e7baf4383a6c98f7d778d36fca54d7a4))
- **web:** link anyrouter.dev from the footer More column ([#222](https://github.com/duyet/aidr/issues/222)) ([1d89d9e](https://github.com/duyet/aidr/commit/1d89d9e713161f34b611c784b9e01334940dac1c))
- **web:** live digest preview on subscribe email tab, richer chrome tab ([9558832](https://github.com/duyet/aidr/commit/955883209d4e0d7d155ad0bafb6d45677beb2644))
- **web:** make story sources compact and inline ([#176](https://github.com/duyet/aidr/issues/176)) ([db0b838](https://github.com/duyet/aidr/commit/db0b838608b9ac8713204274c61ce966740336e8))
- **web:** merge header actions into dropdown menu ([#133](https://github.com/duyet/aidr/issues/133)) ([710de64](https://github.com/duyet/aidr/commit/710de64c2ba8120f304a4f2741962e6d9a5d23b5))
- **web:** point Algorithms menu item at /data algo tab ([d5ea4bf](https://github.com/duyet/aidr/commit/d5ea4bf0c8989cf9c9ef92e6a44af99f2a9c130a))
- **web:** public RSS at /feed.xml, Google News sitemap, sharded sitemap index, feed autodiscovery ([#236](https://github.com/duyet/aidr/issues/236)) ([07b05a6](https://github.com/duyet/aidr/commit/07b05a62f7b4b31110526af2428ae2a2b9a96e79))
- **web:** put the AnyRouter mark on the /data surfaces ([#221](https://github.com/duyet/aidr/issues/221)) ([74aa4e6](https://github.com/duyet/aidr/commit/74aa4e697201c01ae979a571f02dcac2808c5d1f))
- **web:** redesign /data and sync Clerk signups from a verified webhook ([#205](https://github.com/duyet/aidr/issues/205)) ([2b63ced](https://github.com/duyet/aidr/commit/2b63cedaf9a13c20652bedf1dbc2fdfeef4df772))
- **web:** refresh OG images with homepage masthead variant ([177a633](https://github.com/duyet/aidr/commit/177a6335d035c659c978bd9ffe45d9c22aaf8e12))
- **web:** server-rendered JSON-LD (NewsArticle/WebPage/ItemList/BreadcrumbList) + single site_name constant ([#239](https://github.com/duyet/aidr/issues/239)) ([8dfef74](https://github.com/duyet/aidr/commit/8dfef745fe6135715492dc041d1a845ff6332175))
- **web:** url-state subscribe tabs, email link in header menu ([6b858e4](https://github.com/duyet/aidr/commit/6b858e4d680fa9cbb7704f0e327f49fd7b1b822a))
- **web:** valid llms.txt links, read-only WebMCP tools, ai-catalog.json ([#238](https://github.com/duyet/aidr/issues/238)) ([1cb0c6d](https://github.com/duyet/aidr/commit/1cb0c6d11788fdbff5351825322ba380383b7251))
- **worker:** anonymous read-only MCP news tools + truthful discovery docs ([#237](https://github.com/duyet/aidr/issues/237)) ([735621d](https://github.com/duyet/aidr/commit/735621d8280e220e3143e30f36d151982544cbe1))
- **worker:** automated Telegram IV field gate, explicit link-preview format, runnable editor checklist (no-go unchanged) ([#235](https://github.com/duyet/aidr/issues/235)) ([bf81531](https://github.com/duyet/aidr/commit/bf81531ba24d5eb8be4e1024d45877c50b5abea1))
- **worker:** more verified news sources, data-driven source registry, per-source + stale observability ([#241](https://github.com/duyet/aidr/issues/241)) ([dda036f](https://github.com/duyet/aidr/commit/dda036f7bff625828b46f48e0b71b564c48d7398))


### 🐛 Bug Fixes

- **deps:** narrow the [@clerk](https://github.com/clerk) release-age exclude and gate CLERK_SECRET_KEY ([#190](https://github.com/duyet/aidr/issues/190)) ([8554148](https://github.com/duyet/aidr/commit/855414857f7905368f099cb73fab82652b80d742))
- **web:** 404 OG card requests without a valid story id prefix ([b487a65](https://github.com/duyet/aidr/commit/b487a656c0e940a1eb1b10c362b9c6f95466cbc8))
- **web:** align model attribution accessible names with visible hops ([#196](https://github.com/duyet/aidr/issues/196)) ([9ba2498](https://github.com/duyet/aidr/commit/9ba2498c4e7c1cfbcc59df90f53ed195fe8ef3ab))
- **web:** assert the deployed homepage og-home card in smoke ([#199](https://github.com/duyet/aidr/issues/199)) ([bb5c0cb](https://github.com/duyet/aidr/commit/bb5c0cbb3ca108b53eb5080a55ce3beb6ac92d7e))
- **web:** cap all Jev criteria at 10 ([#185](https://github.com/duyet/aidr/issues/185)) ([946f697](https://github.com/duyet/aidr/commit/946f697e65cf324007d29b8cd53e93beee37924c))
- **web:** cap Jev score levels at 10 for TypeSafe ([#183](https://github.com/duyet/aidr/issues/183)) ([e3add3b](https://github.com/duyet/aidr/commit/e3add3b518315b2e0a5ec5c8131a2793d2475891))
- **web:** close escaped Markdown URL sanitizer bypasses ([#184](https://github.com/duyet/aidr/issues/184)) ([715e28a](https://github.com/duyet/aidr/commit/715e28a50e538df4d371d9ca2870d4bde1413c95))
- **web:** close locale cache and auth follow-up gaps ([b8c3c8f](https://github.com/duyet/aidr/commit/b8c3c8f7adc39852aafdf9063856c56d4d2c956c))
- **web:** close story OG card layout and image boundary gaps ([#192](https://github.com/duyet/aidr/issues/192)) ([7a71163](https://github.com/duyet/aidr/commit/7a71163472a4cceef64653c0d17d4bf09d025f0c))
- **web:** gate CLERK_WEBHOOK_SECRET and stop /data inventing a signup 0 ([68dce00](https://github.com/duyet/aidr/commit/68dce00d10fde1909c3a4752f0572d72cdcf507d))
- **web:** gate CLERK_WEBHOOK_SECRET, honest signup count, media backfill reach ([60ce9ec](https://github.com/duyet/aidr/commit/60ce9ec54df51078d87d1edd18e7fbaa3c7a7a97))
- **web:** harden clerk proxy transport boundaries ([#150](https://github.com/duyet/aidr/issues/150)) ([488a9c0](https://github.com/duyet/aidr/commit/488a9c0159064dff919358e9ad8f7d44fdf2b8d0))
- **web:** improve mobile header actions and menu ([080c9bb](https://github.com/duyet/aidr/commit/080c9bbb08e166f7afaa02c33327b02874c3ec92)), closes [#157](https://github.com/duyet/aidr/issues/157)
- **web:** index bare localized URLs, 308 legacy story hops, valid robots.txt ([#233](https://github.com/duyet/aidr/issues/233)) ([2018dbb](https://github.com/duyet/aidr/commit/2018dbb4ada039c8be76aef8116f2cc72de8bb52))
- **web:** keep story source metadata unit intact and skip empty rows ([#191](https://github.com/duyet/aidr/issues/191)) ([caa4407](https://github.com/duyet/aidr/commit/caa44078b563501d297cf23104f3597e916bdbf6))
- **web:** populate run Models/attempts and surface step fallbacks ([#197](https://github.com/duyet/aidr/issues/197)) ([146a0a0](https://github.com/duyet/aidr/commit/146a0a02bbb0defb4feace148d5ff8b5add679fe)), closes [#189](https://github.com/duyet/aidr/issues/189)
- **web:** preserve locale across neutral navigation ([94bd26c](https://github.com/duyet/aidr/commit/94bd26ce667f7de0bfbe2fa9ce234e64e18f5c19))
- **web:** read the llms.txt H1 from SITE_NAME so the brand cannot drift ([#242](https://github.com/duyet/aidr/issues/242)) ([ec1a0a3](https://github.com/duyet/aidr/commit/ec1a0a3ff295b6a28577fbc40f0473f80e033122))
- **web:** remove mobile Get AI;DR trigger circle background ([#206](https://github.com/duyet/aidr/issues/206)) ([aa12d43](https://github.com/duyet/aidr/commit/aa12d43bf7355f7b038fb943ee7bb7b193631da3))
- **web:** replace opacity-based muted text with reader-bg-safe contrast tokens ([#240](https://github.com/duyet/aidr/issues/240)) ([dcfa6bc](https://github.com/duyet/aidr/commit/dcfa6bc86ae6495809593ed1ccbbdee313184729))
- **web:** send Jev choice criteria as object maps ([#188](https://github.com/duyet/aidr/issues/188)) ([f786f29](https://github.com/duyet/aidr/commit/f786f295996eac7a9e73a5360043dd4265344907)), closes [#187](https://github.com/duyet/aidr/issues/187)
- **web:** stop legacy story redirects from hijacking server functions ([#181](https://github.com/duyet/aidr/issues/181)) ([9d864bf](https://github.com/duyet/aidr/commit/9d864bf77b7fb9a5344e4922e6183f3983701fa7)), closes [#178](https://github.com/duyet/aidr/issues/178)
- **web:** stop neutral locale redirect loops ([#182](https://github.com/duyet/aidr/issues/182)) ([4d18a7c](https://github.com/duyet/aidr/commit/4d18a7c57c94d816877dcf83203fd7245bdc4703))
- **web:** unbreak the /data runs charts, dedupe algo tab, pad tabs ([#219](https://github.com/duyet/aidr/issues/219)) ([7fb5791](https://github.com/duyet/aidr/commit/7fb579130132b0c7c59f74206beaacceff4659a0))
- **web:** widen story dialog on large screens ([#162](https://github.com/duyet/aidr/issues/162)) ([b32c49a](https://github.com/duyet/aidr/commit/b32c49a075769ac966f29df96d64dd35edc0bab0))
- **worker:** let media backfill reach rows that already have a legacy image_url ([7089a94](https://github.com/duyet/aidr/commit/7089a941c1b99b4c4d74ff2d04c71f8e0dca92f6))
- **worker:** let the Clerk handshake redirect back to the app origin (login 502) ([#212](https://github.com/duyet/aidr/issues/212)) ([58d1445](https://github.com/duyet/aidr/commit/58d1445e0676555e79ae9414f08f5c8f6cce512e))


### ⚡ Performance

- **web:** cut the LCP element render delay and the font-swap CLS ([#243](https://github.com/duyet/aidr/issues/243)) ([b476a14](https://github.com/duyet/aidr/commit/b476a144492b90cdfdd085d871c3dc7167d46329))
- **web:** use slim feed freshness request ([#148](https://github.com/duyet/aidr/issues/148)) ([54395f7](https://github.com/duyet/aidr/commit/54395f78f23f777a0804f772a9898fcbe0833da3))

## [0.1.7](https://github.com/duyet/aidr/compare/web-v0.1.6...web-v0.1.7) (2026-09-23)

### ✨ Features

- **web:** Algo tab, items volume bars, AI;DR request attribution ([e1b83b3](https://github.com/duyet/aidr/commit/e1b83b394b5f792076c48642cc14044a7455f139))
- **web:** full AnyRouter app attribution for rankings ([c6332b6](https://github.com/duyet/aidr/commit/c6332b600254a29312ba6517e916f32101825e43))
- **web:** regroup pipeline model attribution ([#120](https://github.com/duyet/aidr/issues/120)) ([2171dfa](https://github.com/duyet/aidr/commit/2171dfaf9debb3ea8dd051aa19bfd6f082bbbbf7)), closes [#114](https://github.com/duyet/aidr/issues/114)
- **web:** score stories with typesafe/jev before chat ([#117](https://github.com/duyet/aidr/issues/117)) ([cff9c60](https://github.com/duyet/aidr/commit/cff9c60d2965b93af7f45fb1aff72788d408e6a7)), closes [#113](https://github.com/duyet/aidr/issues/113)
- **web:** score stories with typesafe/jev before chat ([#118](https://github.com/duyet/aidr/issues/118)) ([a809ef0](https://github.com/duyet/aidr/commit/a809ef0a31a29b3bb916afe5b6c640810c0eeead)), closes [#113](https://github.com/duyet/aidr/issues/113)


### 🐛 Bug Fixes

- **deps:** update dependency cn to ^0.4.0 ([#116](https://github.com/duyet/aidr/issues/116)) ([720b962](https://github.com/duyet/aidr/commit/720b9621689455d1f0fee4576782f36ec6555fbe))


### ⚡ Performance

- **web:** client-side SWR cache and deferred loading ([#126](https://github.com/duyet/aidr/issues/126)) ([f060469](https://github.com/duyet/aidr/commit/f06046967634086a83f85109fecd10c084f21340))
- **web:** collapse feed SSR to ~3 D1 round-trips ([#130](https://github.com/duyet/aidr/issues/130)) ([41ed437](https://github.com/duyet/aidr/commit/41ed43760690c0590118f982df47e506b1c1dba2))
- **web:** defer Clerk off the critical path, split vendor chunks ([#132](https://github.com/duyet/aidr/issues/132)) ([4c189f1](https://github.com/duyet/aidr/commit/4c189f1e4e93e4ac936721e830b4b050f8f67ea5))
- **web:** route D1 reads through sessions, strengthen cache headers ([#127](https://github.com/duyet/aidr/issues/127)) ([e3d8f71](https://github.com/duyet/aidr/commit/e3d8f71790405d0ed1ec0d16b570bbbcec128e88))
- **web:** short edge cache on /api/system ([4564fda](https://github.com/duyet/aidr/commit/4564fdaf4a3b7aeae7eda7a01407b7d5c5686248))
- **web:** split /api/system into per-section endpoints, batch D1 reads ([#122](https://github.com/duyet/aidr/issues/122)) ([5a08809](https://github.com/duyet/aidr/commit/5a08809c7097943e1a4b93349d4325a834ca3cac))


### ♻️ Refactoring

- **web:** break down oversized components, extract shared primitives ([#128](https://github.com/duyet/aidr/issues/128)) ([41d4dc4](https://github.com/duyet/aidr/commit/41d4dc4f13c8dc5322f4fa0c509eabb055e5d0ef))
- **web:** decompose remaining oversized components ([#131](https://github.com/duyet/aidr/issues/131)) ([dcb0bb7](https://github.com/duyet/aidr/commit/dcb0bb753c70eb1aa81282e85b49184f43d9a44c))

## [0.1.6](https://github.com/duyet/aidr/compare/web-v0.1.5...web-v0.1.6) (2026-09-22)

### ✨ Features

- **web:** digest email thumbnails, compact rows, keyword highlights ([93e5e8d](https://github.com/duyet/aidr/commit/93e5e8d6fd1e06ec69303a4f1c86ec7e4b3d7e90))
- **web:** fold volume into sources table, add Jev decisions card ([17226a7](https://github.com/duyet/aidr/commit/17226a7c5daeb6fcb0e8816dec134c5ed8be6e66))
- **web:** instant data shell with per-card progressive loading ([a3130cd](https://github.com/duyet/aidr/commit/a3130cddb64490fa08652979feac62859a4a0e51))


### 🐛 Bug Fixes

- **web:** bump wrangler to ^4.135.0 for vite-plugin peer ([19060db](https://github.com/duyet/aidr/commit/19060db47cfdff57ffc62ba54e3bbcd9648a4093))

## [0.1.5](https://github.com/duyet/aidr/compare/web-v0.1.4...web-v0.1.5) (2026-09-19)

### ✨ Features

- **web:** bar charts on data overview, owner ping on new subscribers ([90b59cc](https://github.com/duyet/aidr/commit/90b59cc4cfdc012b6280d59d974aac54a657e864))


### 🐛 Bug Fixes

- **web:** biome import order, sync extension version to 0.1.17 ([d370dff](https://github.com/duyet/aidr/commit/d370dff7088a1d078a37506dade99da9fdb90ad8))
- **web:** redirect favicon.ico to favicon.svg ([0654a33](https://github.com/duyet/aidr/commit/0654a33b61d3145b872d7ade1141e5d83779a073))
- **web:** suppress hydration warnings on relative-time spans ([55919ad](https://github.com/duyet/aidr/commit/55919ad6f26007689ba75d2360ad5f6c5d3ae4c4))

## [0.1.4](https://github.com/duyet/aidr/compare/web-v0.1.3...web-v0.1.4) (2026-09-19)

### ✨ Features

- add Chrome Web Store link to extension page and footer ([#32](https://github.com/duyet/aidr/issues/32)) ([69bbce7](https://github.com/duyet/aidr/commit/69bbce7e5c125f40f603efbdd58ec57ce647bf50))
- **extension:** 0.1.11 digest-first cache paint and campaign telemetry ([888f8d2](https://github.com/duyet/aidr/commit/888f8d24c96d877f94a938e6435c50a8f5bb252a))
- **extension:** 0.1.13 relax AI;DR layout and align header icons ([#44](https://github.com/duyet/aidr/issues/44)) ([0e5a4f8](https://github.com/duyet/aidr/commit/0e5a4f8377c02897b566415e8cef99ea70a632a0))
- **extension:** 0.1.14 hide host/score and fix section tiles ([#46](https://github.com/duyet/aidr/issues/46)) ([d917f6b](https://github.com/duyet/aidr/commit/d917f6bfc94af8d6b9d608fc392b8beaa19861a5))
- **extension:** 0.1.15 reload icon beside updated timestamp ([90004f3](https://github.com/duyet/aidr/commit/90004f337ce40ea7aa7521b9d0fa84406a736ba3))
- **extension:** align new-tab UI with aidr.today web, version 0.1.10 ([#37](https://github.com/duyet/aidr/issues/37)) ([a66bc53](https://github.com/duyet/aidr/commit/a66bc53a60c5f77d2719890fbb006e904108278f))
- **extension:** open AI;DR in a dialog and paint cache first ([416dcf7](https://github.com/duyet/aidr/commit/416dcf7305566bf414ae7ffbef5321c268578362))
- UI contrast tuning, Chrome Web Store link in header, icon-only Submit ([#35](https://github.com/duyet/aidr/issues/35)) ([183c0f1](https://github.com/duyet/aidr/commit/183c0f1f09feadc311b6c85a120a7e0c29143b1b))
- **web:** add llms.txt, match extension UI, and agent submit ([e2c22d7](https://github.com/duyet/aidr/commit/e2c22d7d89571eb250906e8b285565279014964e))
- **web:** branded digest email, deliver tabs, and /data footer ([#38](https://github.com/duyet/aidr/issues/38)) ([fe30042](https://github.com/duyet/aidr/commit/fe3004231ee437c31a6d8f2fb81df5a28ac4bb4d))
- **web:** center AI;DR and reorder section tiles ([#71](https://github.com/duyet/aidr/issues/71)) ([9986796](https://github.com/duyet/aidr/commit/998679615a46f250aa4549c707122763df3163d9))
- **web:** data tabs, token burn, vendor blogs ([2887e3e](https://github.com/duyet/aidr/commit/2887e3ebae38e7486f784531ce650a45398f4829))
- **web:** expand padding, thumb zoom, and email UTM ([#54](https://github.com/duyet/aidr/issues/54)) ([1baffb7](https://github.com/duyet/aidr/commit/1baffb7b576e3837e7912b9ca61b3b1172aeeade))
- **web:** flat expanded panel, larger topics thumb, zoom hover ([9d48543](https://github.com/duyet/aidr/commit/9d48543412316e45876733721d4a633393fffc8f))
- **web:** flatten story permalinks to /:slug ([#83](https://github.com/duyet/aidr/issues/83)) ([f5d525d](https://github.com/duyet/aidr/commit/f5d525d05be6d44c69896f9cb36b8d05328638ad))
- **web:** homepage H1 and richer title/description ([#76](https://github.com/duyet/aidr/issues/76)) ([a54d780](https://github.com/duyet/aidr/commit/a54d780461cd603f50c47d985669ac02d3722cc7))
- **web:** ingest MarketBrief AI hub ([09a8b45](https://github.com/duyet/aidr/commit/09a8b45bb943064587b1b0c90fb514ac435541a9))
- **web:** ingest xAI news, DeepMind, and AWS ML blogs ([#80](https://github.com/duyet/aidr/issues/80)) ([a4f58be](https://github.com/duyet/aidr/commit/a4f58be00df1a2d35aa147b8f077d9e21004b4cf))
- **web:** Jev review gates, 7 new RSS sources, data page upgrades ([8fe5997](https://github.com/duyet/aidr/commit/8fe59975f9f91c778cf3287f05004fcb2bcea6f9))
- **web:** Jev review observability and About docs ([211eb3b](https://github.com/duyet/aidr/commit/211eb3b31f6aa22835349a1dad5c22a7c2817b91))
- **web:** keep /submit form and show history on the right ([0a340d7](https://github.com/duyet/aidr/commit/0a340d7a03a77263739933f28b4613ad6ce2c1af))
- **web:** merge same-story outlets and boost rank/trending by sources ([#39](https://github.com/duyet/aidr/issues/39)) ([83d36e9](https://github.com/duyet/aidr/commit/83d36e927caf3928d8c7170c9130ffc56503c8d2))
- **web:** publish RFC 9727 catalog, A2A/MCP cards, and auth.md ([bf13c7e](https://github.com/duyet/aidr/commit/bf13c7e8208aaa83c90a3225dbf2ac2676e5f188))
- **web:** tab the /data pipeline and list ingest sources ([a904843](https://github.com/duyet/aidr/commit/a904843d8a3bb5c944ebd29ff211c50d995e65bd))
- **web:** translate with Gemini 3.5 Flash and ease trending posts ([a720ef0](https://github.com/duyet/aidr/commit/a720ef0321e97aeae7bdda325c12c2854e1aba53))


### 🐛 Bug Fixes

- **ci:** drop cross-package path from release-please extra-files ([#42](https://github.com/duyet/aidr/issues/42)) ([f40836b](https://github.com/duyet/aidr/commit/f40836ba819d07cda500d64fbf27d3f4a71a000b))
- **deps:** update dependency cn to ^0.3.0 ([#69](https://github.com/duyet/aidr/issues/69)) ([465ee57](https://github.com/duyet/aidr/commit/465ee57fe213f6e768f13c1302e98c7b6ead98ba))
- **deps:** update react monorepo to v19.3.0 ([#45](https://github.com/duyet/aidr/issues/45)) ([ff390c8](https://github.com/duyet/aidr/commit/ff390c8ab31f6718397427e882ee71cc5ec704be))
- **extension:** Chrome brand icon and drop Add section chip (0.1.12) ([#43](https://github.com/duyet/aidr/issues/43)) ([b2318b0](https://github.com/duyet/aidr/commit/b2318b095b00d6b5f9de8f56fc45ed704065087b))
- **extension:** keep GitHub releases on the 0.1.x line ([05ba38b](https://github.com/duyet/aidr/commit/05ba38b18ce1e0ba69ba916af638fa561365178a))
- **mail:** crisp square logo, 32px padding, Gmail-proof CTA ([#55](https://github.com/duyet/aidr/issues/55)) ([b6e628c](https://github.com/duyet/aidr/commit/b6e628c9316d8d156173f91cc21090294eda6c55))
- **mail:** editorial welcome shell with hosted logo and Gmail-proof CTA ([#47](https://github.com/duyet/aidr/issues/47)) ([570bfc1](https://github.com/duyet/aidr/commit/570bfc156b52e33500de6219b12f8333f5dcabda))
- **mail:** quote-free font stacks and clickable digest links ([#56](https://github.com/duyet/aidr/issues/56)) ([3fc9c09](https://github.com/duyet/aidr/commit/3fc9c092e890c2b05fdd1cd3f9821bc9c5b45520))
- **mail:** stable public logo PNG and digest header row ([#52](https://github.com/duyet/aidr/issues/52)) ([3d3d239](https://github.com/duyet/aidr/commit/3d3d239520139ea2b23d9c4c23101bbd0e324c5e))
- restore TL;DR story thumbnails and dialog links ([#34](https://github.com/duyet/aidr/issues/34)) ([bc9de56](https://github.com/duyet/aidr/commit/bc9de569d6e3d15fe1d2f402f69c29efa4a188c0))
- **seo:** self-canonical pages and one URL per story ([00c267a](https://github.com/duyet/aidr/commit/00c267a277b4e2061b9d9b6abcea82ee1f32987e))
- **web:** 308 news.duyet.net to aidr.today with path and query ([#48](https://github.com/duyet/aidr/issues/48)) ([ab701ad](https://github.com/duyet/aidr/commit/ab701ad003ac25ae54eaac4acf6cc2a7aa887504))
- **web:** accept Clerk cookie session on submit and make title optional ([bc16dbe](https://github.com/duyet/aidr/commit/bc16dbe7168e4756f7674c8e8579770922c24af3))
- **web:** AnyRouter chain auto, DeepSeek V4.1 flash, Laguna, MiniMax ([8a6ce45](https://github.com/duyet/aidr/commit/8a6ce45a994f8efce3b43dc33527c8a064599196))
- **web:** AnyRouter score/translate/tldr use anyrouter/auto only ([#60](https://github.com/duyet/aidr/issues/60)) ([54a7ee4](https://github.com/duyet/aidr/commit/54a7ee4e7f878bdea580e5664b21ea951d69fa57))
- **web:** biome format and import order ([958b160](https://github.com/duyet/aidr/commit/958b1603c7bd2357c88d5856da1c2a691edc851c))
- **web:** center AI;DR on yellow logo marks ([#63](https://github.com/duyet/aidr/issues/63)) ([61e081d](https://github.com/duyet/aidr/commit/61e081d3f433477d4cd664e08f6630e41ee1441b))
- **web:** center compact header icons in 44px taps ([#78](https://github.com/duyet/aidr/issues/78)) ([c4b9147](https://github.com/duyet/aidr/commit/c4b914778f23b89b8804341a3eeb2622f2d49717))
- **web:** clear biome unused imports and format for CI ([d66050a](https://github.com/duyet/aidr/commit/d66050ac5fb54d7a72a803956a0455a168cddc10))
- **web:** cut mobile LCP by self-hosting fonts and shrinking thumbs ([9caafe6](https://github.com/duyet/aidr/commit/9caafe605a46794e012f1aaf0dbbe498ca5b75a9))
- **web:** enlarge AI;DR type on social OG image ([#67](https://github.com/duyet/aidr/issues/67)) ([6b0c373](https://github.com/duyet/aidr/commit/6b0c37368b9e81ed5034dce078d2970a046c8fef))
- **web:** keep category and trending at top of brief layout ([#73](https://github.com/duyet/aidr/issues/73)) ([8f1eb2d](https://github.com/duyet/aidr/commit/8f1eb2d6310373f90f86ff937a0bfe231306787f))
- **web:** keep digest story body unlinked ([#70](https://github.com/duyet/aidr/issues/70)) ([2ddacf2](https://github.com/duyet/aidr/commit/2ddacf2293ab7929112e25697cd36feeaf2d44d3))
- **web:** keep square logo corners transparent ([#65](https://github.com/duyet/aidr/issues/65)) ([d186e91](https://github.com/duyet/aidr/commit/d186e91b0d09b37f88134607f94f325cbabd6522))
- **web:** lock run_worker_first to include agent discovery paths ([233f8de](https://github.com/duyet/aidr/commit/233f8def06d52a5bccc49f40044ab9a3af1f4f5b))
- **web:** point pipeline docs and GitHub links at duyet/aidr ([#40](https://github.com/duyet/aidr/issues/40)) ([5edf0a0](https://github.com/duyet/aidr/commit/5edf0a0df1597e631070240ab85ad5b2d54ada23))
- **web:** remove homepage H1 and intro blurb ([#77](https://github.com/duyet/aidr/issues/77)) ([6e1caae](https://github.com/duyet/aidr/commit/6e1caae932cb268fddf01337d0e7ae00c1020d74))
- **web:** run_worker_first true so alias 308s can deploy ([#49](https://github.com/duyet/aidr/issues/49)) ([2b45507](https://github.com/duyet/aidr/commit/2b455079cd28741208d7f82a9261ced871038aeb))
- **web:** runtime owns digest_size column, unblock D1 migrations ([2c78b18](https://github.com/duyet/aidr/commit/2c78b186e74c02448d32fec38b3e869843000604))
- **web:** seed vendor blogs on ingest and restore CI lint ([b60e8e1](https://github.com/duyet/aidr/commit/b60e8e18c427937d2cc25785fd8a6f2b01be0a97))
- **web:** serve favicon.svg and add /brand ([#62](https://github.com/duyet/aidr/issues/62)) ([52c56b7](https://github.com/duyet/aidr/commit/52c56b7ff9fa47f44da19f75b50fc2150187d7e3))
- **web:** serve Get AI;DR at /subscribe ([#66](https://github.com/duyet/aidr/issues/66)) ([639e22d](https://github.com/duyet/aidr/commit/639e22d3cf18902fc1a4bfb9f7faef5b72566bc2))
- **web:** serve public logos via ASSETS so mail PNG is not SPA HTML ([#53](https://github.com/duyet/aidr/issues/53)) ([b6520b9](https://github.com/duyet/aidr/commit/b6520b99fa96c960b0862300d3be51b4a53eab75))
- **web:** skip news.duyet.net custom_domain bind (no duyet.net zone) ([#50](https://github.com/duyet/aidr/issues/50)) ([9bfb80e](https://github.com/duyet/aidr/commit/9bfb80ed9cdfabdf227f1e93582c02ac718f90b1))
- **web:** square AI;DR marks and yellow OG card ([9fd6d34](https://github.com/duyet/aidr/commit/9fd6d3440f6d87a5bd6359519700af2589fa5d23))
- **web:** stop chaining D1 migrate into Worker deploy ([#86](https://github.com/duyet/aidr/issues/86)) ([79d8874](https://github.com/duyet/aidr/commit/79d88742218c9f25d8c1b94e4f9bf0924d4803b3))
- **web:** sync EXTENSION_VERSION to 0.1.16 ([#74](https://github.com/duyet/aidr/issues/74)) ([5d71dbd](https://github.com/duyet/aidr/commit/5d71dbd4a5168d11bb87ce29d8f1a1971fcfc9a4))
- **web:** use 44px icon-lg taps and even compact header gaps ([#79](https://github.com/duyet/aidr/issues/79)) ([d1fed2e](https://github.com/duyet/aidr/commit/d1fed2e713c01cd31312ee1bd8c133cbb1da8183))
- **web:** use dotenvx in cf:deploy:prod ([71a1687](https://github.com/duyet/aidr/commit/71a168703263cabdb1f0c91c2b41105de5d79577))
- **workers-types v5:** replace Buffer int/string methods with DataView/TextDecoder ([#28](https://github.com/duyet/aidr/issues/28)) ([2adc1ef](https://github.com/duyet/aidr/commit/2adc1efe60cdc722b0c9c30aaa0ffb99514b502f))

## [0.1.3](https://github.com/duyet/aidr/compare/web-v0.1.2...web-v0.1.3) (2026-09-07)

### ✨ Features

- **extension:** digest-first new tab with section chrome ([#17](https://github.com/duyet/aidr/issues/17)) ([962f78d](https://github.com/duyet/aidr/commit/962f78d88a46849198579df216b01113c44d1132))
- **extension:** match website PrefsPanel and release 0.1.8 ([e077ebd](https://github.com/duyet/aidr/commit/e077ebd0977fa0cfb4ece913bb40730bc0289b42))


### 🐛 Bug Fixes

- **ci:** drop cross-package path from release-please extra-files ([#24](https://github.com/duyet/aidr/issues/24)) ([905c2cf](https://github.com/duyet/aidr/commit/905c2cff5a5630f6c0a7217d6fcb7f8ee211d0be))
- **extension:** days section expanded by default, remove Chrome extension link ([c277ae5](https://github.com/duyet/aidr/commit/c277ae54c432c6df74fa1fc4e96cc4db4aa3411e))

## [0.1.2](https://github.com/duyet/aidr/compare/web-v0.1.1...web-v0.1.2) (2026-09-05)

### 🐛 Bug Fixes

- **extension:** clickable Aa prefs dialog and release 0.1.7 ([211be27](https://github.com/duyet/aidr/commit/211be2704156aba2f6f0aaad115a635dcc944391))
- **web:** Clerk handshake via /__clerk and extension click attribution ([7f68470](https://github.com/duyet/aidr/commit/7f68470af9c33bc01854d86bd5017a723f42c76e))

## [0.1.1](https://github.com/duyet/aidr/compare/web-v0.1.0...web-v0.1.1) (2026-09-05)

### ✨ Features

- AI;DR logo, latest-release zip redirect, and aidr 0.1.5 ([dbe3894](https://github.com/duyet/aidr/commit/dbe38943e55dffe53783f473dc9e9664959b9666))


### 🐛 Bug Fixes

- **ci:** drop cross-package path from release-please extra-files ([74f0c16](https://github.com/duyet/aidr/commit/74f0c169c5f749f985f655cd2ae5a9f524d42e81))
- **web:** sync EXTENSION_VERSION to 0.1.4 ([89e887d](https://github.com/duyet/aidr/commit/89e887d81dec3010da579da791b7b855e7786794))

## [0.1.0](https://github.com/duyet/aidr/releases/tag/web-v0.1.0) (2026-09-05)

### ✨ Features

- Initial aidr.today website release tracked by release-please.
