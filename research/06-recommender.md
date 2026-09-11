# 06 — Recommendation & Ranking for a Campus Club OS

*Research track: recommender systems and ranking, applied to a club/event/people product. Date: 2026-09-10.*

Scope note: this covers (1) how the large platforms work, (2) the standard modern stack, (3) cold start, (4) event recommendation, (5) graph / people-you-may-know, (6) feed design for low-volume community products and notification ranking, (7) open-source options, (8) measurement, (9) regulation, and ends with a concrete v1 / v2 / v3 architecture for us. Source URLs are inline. Where a claim comes from my own experience rather than a fetched source, it is marked "(judgment)".

---

## 1. How the big ones work

### 1.1 The common architecture

Every large system in this survey converges on the same funnel. Names differ, the shape does not.

```
                 ┌──────────────────────────────────────────────────────┐
  corpus         │  RETRIEVAL / CANDIDATE SOURCING  (N sources, union)   │  10^6..10^9 -> 10^3..10^4
  ───────────────┤  in-network (follow graph)  | two-tower ANN           │
                 │  graph walks (Pixie/UTEG)   | item-to-item CF         │
                 │  trending / popularity      | rules & pre-generated   │
                 └───────────────────────┬──────────────────────────────┘
                                         ▼
                 ┌──────────────────────────────────────────────────────┐
                 │  EARLY-STAGE / LIGHT RANKER  (cheap, cacheable,       │  10^4 -> 10^2..10^3
                 │  often a two-tower distilled from the heavy ranker)   │
                 └───────────────────────┬──────────────────────────────┘
                                         ▼
                 ┌──────────────────────────────────────────────────────┐
                 │  LATE-STAGE / HEAVY RANKER  (multi-task, multi-label; │  10^2..10^3 -> 10^2
                 │  outputs p(like), p(comment), p(share), p(dwell)...)  │
                 └───────────────────────┬──────────────────────────────┘
                                         ▼
                 ┌──────────────────────────────────────────────────────┐
                 │  VALUE MODEL  score = Σ w_k · p_k  (− w_neg · p_neg)  │
                 └───────────────────────┬──────────────────────────────┘
                                         ▼
                 ┌──────────────────────────────────────────────────────┐
                 │  RE-RANK / MIX: diversity, author dedupe, integrity   │  final slate ~20-50
                 │  filters, ads & "follow suggestions" interleaving     │
                 └──────────────────────────────────────────────────────┘
```

Meta describes this explicitly for Instagram: each surface is "Sourcing (retrieval) -> Early-Stage Ranking (ESR) -> Late-Stage Ranking (LSR)", operating on fewer candidates as the models get more expensive, with over 1,000 models in production across Feed, Stories, Reels, comments, notifications, and tagging ([Journey to 1000 models, Meta 2025](https://engineering.fb.com/2025/05/21/production-engineering/journey-to-1000-models-scaling-instagrams-recommendation-system/)).

### 1.2 TikTok / ByteDance

**Monolith** ([arXiv 2209.07663](https://arxiv.org/abs/2209.07663), [GitHub bytedance/monolith](https://github.com/bytedance/monolith)) is the training/serving framework behind BytePlus Recommend and, by wide inference, Douyin/TikTok. The two ideas that matter for us:

- **Collisionless embedding tables.** Standard frameworks hash sparse IDs into a fixed table, so unrelated IDs collide. Monolith uses a Cuckoo hashmap keyed on the raw ID, so every user/item/tag gets its own row, plus two memory controls: *frequency filtering* (an ID only gets an embedding after it has been seen k times) and *expirable embeddings* (rows that have not been touched for N days are evicted). The paper shows collisions measurably hurt AUC and that filtering/expiry recover most memory at no quality cost.
- **Online training.** A training parameter server and a serving parameter server are kept separate; user actions flow through Kafka, join with the logged features, and are used for streaming updates. Sparse parameters are synced to serving on the order of minutes, dense parameters on the order of daily, and the paper reports that shortening the sync interval improves online AUC because user interest drifts within a day. This is the mechanism behind TikTok's "it learned what I like in 20 minutes" feel.

The leaked **"TikTok Algo 101"** document reported by the New York Times (summarized in [CACM](https://cacmb4.acm.org/news/257217-how-tiktok-reads-your-mind/fulltext) and [Gizmodo](https://gizmodo.com/leaked-tiktok-doc-reveals-its-obvious-secret-to-an-addi-1848166901)) states the objective plainly: the ultimate goal is daily active users, operationalized as two proxies, **retention** (does the user come back) and **time spent**. The document's toy scoring function is a weighted sum of predicted likes, comments, and playtime, and it lists four values the system balances: user value, long-term user value, creator value, and platform value. Public TikTok material adds that follower count is not a direct ranking input and that new videos are tested on a small audience first (this "seed then scale" pattern is also what we should do for new clubs).

### 1.3 Instagram / Meta

The canonical write-up is [Scaling the Instagram Explore recommendations system (Meta, Aug 2023)](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/):

- **Retrieval sources**: (a) Two-Tower neural network (user tower + item tower, trained on engagement events as a dot-product similarity; both towers' outputs cached, so serving is an ANN lookup), (b) "user interactions history" — items similar to things the user engaged with, with rule filters for quality, (c) heuristic sources such as trending, (d) pre-generated sources computed offline in off-peak hours.
- **First-stage ranker**: a lightweight two-tower model trained by **knowledge distillation** to imitate the second-stage ranker's outputs, so it can be cached on both sides.
- **Second-stage ranker**: a multi-task multi-label (MTML) network over user-item crossed features.
- **Value model**: `Expected Value = W_click·P(click) + W_like·P(like) − W_see_less·P(see less) + …`, tuned per surface.
- **Final re-rank**: integrity filters and diversity rules (no long runs of the same author).

Instagram's own ranking-explained page ([about.instagram.com](https://about.instagram.com/blog/announcements/instagram-ranking-explained)) lists per-surface signals and the predictions made: Feed predicts "spend a few seconds, comment, like, share, tap profile"; Explore predicts like/save/share; Reels predicts reshare/watch-to-end/like/visit audio page. It also lists the user controls that regulators now expect: Favorites, a chronological "Following" view, mute, snooze suggested posts, "Not interested".

**DLRM** ([arXiv 1906.00091](https://arxiv.org/abs/1906.00091)) is the reference shape of Meta's rankers: embedding tables for categorical features, a bottom MLP for dense features, pairwise dot-product interactions, and a top MLP; it is also the reference workload that TorchRec is built to train. The newest public Meta ranking work ([multi-stage ads ranking, Aug 2026](https://engineering.fb.com/2026/08/05/ml-applications/from-user-sequences-to-scaling-laws-a-multi-stage-architecture-for-metas-ads-ranking/)) splits an *offline user model* (transformer over thousands of user events, cached) from an *online ranking model* (cached user embedding + live candidate features, target-aware attention), reporting +6% conversions on Instagram. The "precompute the user side, keep the item side live" split is the single most reusable idea for a small team.

Two 2025 Meta posts on **notifications** are covered in section 6.

### 1.4 LinkedIn

- **FollowFeed** ([LinkedIn engineering](https://www.linkedin.com/blog/engineering/feed/followfeed-linkedin-s-feed-made-faster-and-smarter)) is the feed backend: **fan-out on read** (pull), timelines stored as reverse-chronological blobs in RocksDB keyed by (entity id, content type), 720 partitions, relevance scored at read time with generated code at ~50µs p99 per record, p99 140ms. They chose pull over push because it was 62x smaller and made A/B testing new relevance models trivial. For a product with thousands of users, pull is the only sensible choice (judgment).
- **LiRank** ([arXiv 2402.06859](https://arxiv.org/html/2402.06859v1)) is the heavy ranker: residual DCNv2 with attention in the low-rank cross net, dense gating, MLPs up to 4×3500, a **trainable isotonic calibration layer**, two multi-task towers (click tower: click + long-dwell; contribution tower: like/comment/share/vote), 8-bit embedding quantization (−70% size), QR hashing for vocabularies, and incremental training with Hessian regularization. The feed score is a **linear combination** of the per-action probabilities. "Long dwell" is not a regression on seconds; it is a binary classifier for "time on post exceeds the p90 for this position / content type / platform", because raw dwell is too noisy. Reported: +0.5% sessions (Feed), +1.76% qualified job applications, +4.3% ads CTR.
- **360Brew** ([arXiv 2501.16450](https://ar5iv.labs.arxiv.org/html/2501.16450), paper since withdrawn for licensing reasons; secondary coverage [here](https://thelinkedblog.com/2025/360brew-linkedin-algorithm-new-update-3619/)) is a ~150B-parameter decoder-only foundation model built on a Mixtral 8x22B base, which *verbalizes* member profiles, connections, and 2–3 months of interaction history into a prompt and answers 30+ ranking tasks (feed, jobs, search, ads) in-context, matching or beating the specialized production models. The strategic lesson: one text-native model with many-shot in-context examples replaces feature engineering across surfaces — and at our scale, a much smaller LLM can play the same role (section 3.6).
- **Heterogeneous recommendations** ([LinkedIn](https://www.linkedin.com/blog/engineering/optimization/building-a-heterogeneous-social-network-recommendation-system)): people, hashtags, companies, groups, newsletters, and *events* are ranked per-type by first-pass rankers, then a second-pass XGBoost ranks the cohorts against each other. The two hard problems were **score calibration across models** (solved by mapping quantiles to observed response rates) and **distribution bias** across edge types (solved with counterfactual "remove part of the network" experiments). This is precisely our mixed feed problem: clubs vs events vs posts vs people.
- **PYMK equity** ([LinkedIn](https://www.linkedin.com/blog/engineering/member-customer-experience/optimizing-pymk-for-equity-in-network-creation)): impression discounting on over-invited recipients (the score threshold rises with invitations received) plus fairness re-ranking; overloaded recipients −50%, invitations to infrequent members +5.4%, connections by infrequent members +4.8%, sessions +1%. Section 5 reuses this.

### 1.5 Twitter / X (open-sourced March 2023)

The [twitter/the-algorithm](https://github.com/twitter/the-algorithm) README and the [ML repo](https://github.com/twitter/the-algorithm-ml/blob/main/projects/home/recap/README.md) give the clearest fully-disclosed pipeline:

- **Candidate sources**: Earlybird search index for in-network tweets (~50% of the timeline); out-of-network from **SimClusters** (sparse community embeddings), **TwHIN** (dense heterogeneous-graph embeddings over users and tweets), **UTEG/GraphJet** (in-memory traversal of the recent interaction graph: "people you follow engaged with this"), coordinated by cr-mixer/tweet-mixer.
- **Light ranker** (Earlybird logistic regression) then **Heavy ranker**: a parallel **MaskNet** predicting ten engagement probabilities.
- **Published value-model weights** (Apr 2023): favorite 0.5, retweet 1.0, reply 13.5, good profile click 12.0, video playback 50% 0.005, reply-engaged-by-author 75.0, good click 11.0, good click v2 10.0, negative feedback v2 −74.0, report −369.0. Note the asymmetry: one report erases ~740 likes. This is the most explicit public statement that value models are hand-tuned policy, not learned.
- **Home Mixer** applies heuristics: visibility filtering, author diversity, content balance between in- and out-of-network, feedback fatigue, social-proof requirement for out-of-network tweets, then interleaves ads and follow suggestions.

### 1.6 Pinterest, YouTube, Spotify

- **Pixie** ([Pinterest](https://medium.com/pinterest-engineering/introducing-pixie-an-advanced-graph-based-recommendation-system-e7b4229b664b)): biased random walks on the pin-board bipartite graph from a seed set of the user's recent pins, in memory, 60ms p99, drove ~half of saved pins. This is the best candidate-generation idea for a graph-rich, low-content product like ours.
- **PinSage** ([Pinterest](https://medium.com/pinterest-engineering/pinsage-a-new-graph-convolutional-neural-network-for-web-scale-recommender-systems-88795a107f48)): random-walk GraphSAGE producing embeddings that fuse visual, text, and graph signals over billions of nodes.
- **Unified lightweight scoring** ([Pinterest](https://medium.com/pinterest-engineering/pinterest-home-feed-unified-lightweight-scoring-a-two-tower-approach-b3143ac70b55)): a two-tower pre-ranker distilled from the heavy ranker ("Pinnability") — the same ESR pattern as Instagram.
- **YouTube** ([Deep Neural Networks for YouTube Recommendations, 2016](https://research.google.com/pubs/pub45530.html); [Recommending What Video to Watch Next, 2019](https://daiwk.github.io/assets/youtube-multitask.pdf)): candidate generation as extreme multiclass classification / two-tower, then a Wide & Deep ranker upgraded to **MMoE** with separate "engagement" (click, watch time) and "satisfaction" (survey, like/dismiss) heads, and a **shallow tower** fed position features to absorb selection bias, dropped at serving. Final score is a weighted combination of the heads. YouTube also runs **DPP re-ranking** ([CIKM 2018](https://dl.acm.org/doi/10.1145/3269206.3272018)) in sliding windows over the feed, with measured short- and long-term engagement gains.
- **Spotify** ([guide](https://music-tomorrow.com/blog/how-spotify-recommendation-system-works-complete-guide)): hybrid content + collaborative representations, a home page of "shelves" chosen by contextual bandits (the "explore, exploit, explain" line of work), and a 2025 move toward semantic IDs and interactive/LLM-driven discovery. The bandit-over-shelves pattern maps directly onto a club-hub home screen with modules (Events this week, Clubs for you, People to meet).

**Common extraction:** (1) many cheap candidate sources unioned; (2) a distilled light ranker; (3) one multi-task heavy ranker predicting calibrated probabilities of *several* actions; (4) a hand-tuned value model with large negative weights; (5) re-ranking for diversity, fatigue, and integrity; (6) the user side precomputed and cached, the item side scored live; (7) increasingly, online/streaming training and LLM/text-native representations.

---

## 2. The standard modern stack, component by component

**Candidate generation.** Two-tower with in-batch negatives and sampling-bias correction (Yi et al., [Google 2019](https://research.google/pubs/sampling-bias-corrected-neural-modeling-for-large-corpus-item-recommendations/)); item embeddings indexed in an ANN library — [FAISS](https://github.com/facebookresearch/faiss) (IVF/HNSW/PQ), [ScaNN](https://github.com/google-research/google-research/tree/master/scann), or HNSW inside pgvector/Qdrant/Vespa. At <10^5 items, brute-force dot product over a NumPy matrix is faster than any index (judgment); ANN only matters past ~10^6.

**Multi-stage ranking.** Distill the heavy ranker into the light one (Instagram, Pinterest). The [Vespa phased-ranking docs](https://docs.vespa.ai/en/phased-ranking.html) are a good concrete reference: first-phase expression on every hit, second-phase reranks the top `rerank-count` (default 100/node) with XGBoost/LightGBM/ONNX, global-phase normalizes across nodes.

**Multi-task learning.** Shared-bottom → **MMoE** (YouTube) → **PLE/CGC** (Tencent, RecSys 2020: task-specific plus shared experts, which fixes MMoE's "seesaw" where one task improves as another degrades) ([ACM](https://dl.acm.org/doi/10.1145/3383313.3412236)). LiRank's alternative is task-grouped towers. At our scale, a single GBDT per task or a small shared-bottom MLP is enough until v2.

**Value model.** All platforms combine head outputs linearly with hand-set weights (Instagram formula, Twitter's published weights, LiRank's linear combination). Weights encode policy: heavy negatives for reports/hides, bonuses for actions that signal *real-world* value. For us the heads should be `p(open)`, `p(RSVP)`, `p(attend)` (check-in), `p(join club)`, `p(long dwell)`, `p(share/invite)`, `p(hide)`, `p(report)`; attendance and joining should carry the largest positive weights because they are the product's actual purpose.

**Calibration.** Multi-task and multi-source scores must be comparable: LiRank's trainable isotonic layer; LinkedIn's quantile-to-response-rate mapping across heterogeneous rankers; Instagram tracks calibration and normalized entropy as model-health metrics. Rule: never add uncalibrated scores from two models.

**Position bias.** YouTube's shallow position tower; the general family is unbiased learning-to-rank with inverse propensity weighting. For a small product: log the position of every impression, include position as a feature in training, set it to a constant at serving (judgment; this is the minimal version of the YouTube approach).

**Exploration.** Contextual bandits (LinUCB / Thompson sampling) on top of the ranker score, with a small ε of randomized slots; Spotify shelves, Duolingo notifications (section 6). Thompson sampling is robust to delayed feedback, which matters when the label ("attended") arrives days after the impression ([survey](https://arxiv.org/pdf/1508.03326)).

**Diversity / re-rank.** MMR for pairwise; **DPP** for set-wise with a single diversity knob and windowed greedy inference (YouTube). Twitter's author-diversity and content-balance heuristics are the cheap version.

**Feedback loops and popularity bias.** Low-dimensional embeddings amplify popularity gaps ([category-diversity paper](https://arxiv.org/html/2402.03801v1)); ranked feeds train on their own outputs. Mitigations: randomized exploration slots, impression discounting (LinkedIn PYMK), inverse-propensity training weights, and explicit exposure floors.

**Creator/club-side fairness.** Two lines of work: **FairRec** ([arXiv 2002.10764](https://arxiv.org/pdf/2002.10764)) guarantees a minimum exposure to every producer while keeping user utility near-optimal; **DualRec** ([arXiv 2502.20497](https://arxiv.org/pdf/2502.20497), Kuaishou) inverts the problem — "for each item, which users are available and best suited?" — with a user-availability module so small creators' content is routed to receptive users. TikTok's seed-audience testing and LinkedIn's impression discounting are the production versions. For a club OS this is existential: if the 10 biggest clubs absorb all distribution, the long tail of clubs dies and so does the product.

---

## 3. Cold start (our entire life at launch)

Everything is cold at launch: new users, new clubs, new events (events are *permanently* cold — each one is new and expires). The RecSys 2015 Meetup study ([Macedo et al.](https://dl.acm.org/doi/10.1145/2792838.2800187)) states this directly: because events are always new, collaborative filtering alone fails and the winning approach was a learning-to-rank combination of social, geographic, temporal, content, and popularity contextual signals.

**3.1 Onboarding survey as explicit features.** Interests (multi-select over the club taxonomy), major, year, dorm/residence, free-time blocks, "what do you want out of college" goals. Instagram's Explore uses activity as the strongest signal; we do not have activity yet, so explicit signals are the substitute. The EU minors guidelines explicitly *prefer* explicit signals over behavioral profiling (section 9), so this is also the compliant default.

**3.2 Content-based features.** Club category, tags, description embedding, meeting cadence, typical meeting time/location, size, age of club, officer roster; event title/description embedding, time, location, cost, capacity, recurring-vs-one-off.

**3.3 Text embeddings.** Embed club and event text with a general text-embedding model (any of the current OpenAI / Voyage / Cohere / open-weight bge/e5 families work at this scale; store in pgvector). Embed the user's survey answers and any bio the same way. Cosine similarity between a user's interest vector and a club vector is a strong v1 retriever and needs zero interaction data. LinkedIn's 360Brew is the extreme version of "text is the universal feature".

**3.4 Graph features from day one.** Even before any feed activity exists we have edges: enrollment (major, year, dorm), club membership (imported from the registrar's club list or the prior system), officer positions, class co-enrollment if available, phone-contact or friend graph if users opt in. Triangle-closing and co-membership are exactly Facebook's PYMK signals ([Meta transparency](https://transparency.meta.com/features/explaining-ranking/fb-people-you-may-know/)).

**3.5 Popularity priors with time decay.** A Reddit-style "hot" score for events (RSVP velocity with an exponential decay and a hard cutoff at event start) and a Bayesian-smoothed join rate for clubs (prior = category mean). The [r/popular audit](https://arxiv.org/html/2502.20491v1) shows recency, comment rate, and vote score are enough to run a credible non-personalized feed.

**3.6 LLM-as-ranker for tiny scale.** [Hou et al., ECIR 2024](https://arxiv.org/abs/2305.08845) show zero-shot LLM rankers can rival trained models when the candidate set is retrieved well, with two caveats: they are biased by candidate position and popularity in the prompt, and they struggle with interaction order. Practical pattern for v1: retrieve 30 candidates with rules + embeddings, then ask an LLM to score each against a verbalized profile ("junior, CS, lives in West, likes climbing and hackathons, free Tue/Thu evenings"), shuffling candidate order and caching results per (user-profile-hash, item) for a day. At thousands of users and hundreds of clubs this costs cents a day and is dramatically better than a matrix factorization with no data (judgment). Newer work uses LLMs to *simulate* interactions for cold items to bootstrap a conventional model ([FilterLLM](https://arxiv.org/html/2502.16924), [LLM Reasoning for Cold-Start](https://arxiv.org/pdf/2511.18261)) — useful later for new clubs.

**3.7 Contextual bandits for allocation.** For each home-screen module and for "new club spotlight" slots, run Thompson sampling over which club/event fills the slot, with context = user survey vector. This turns the cold-start period into a structured experiment instead of a guess.

---

## 4. Event recommendation specifically

Events differ from posts in five ways and the ranker must encode each:

1. **Temporal validity.** Hard filter: `start_time > now` (or ongoing). Feature: `hours_until_start` with a bell-shaped utility — too far away and users forget, too soon and they cannot make it. Decay after RSVP deadline or capacity reached.
2. **Schedule fit.** If we have the student's class schedule or calendar, `conflict = overlaps(event, user_busy_blocks)` is a strong negative feature and a UI affordance ("You have CS 61B until 5, this starts at 6"). Recurring meeting times become a per-user "free evening" prior.
3. **Location / distance.** Walking minutes from dorm or last known building; on a campus this is a small number but still predictive (judgment). DoorDash and Uber Eats frame the analogous problem as context-conditioned ranking where time of day and location gate the candidate set; Uber Eats found graph embeddings the single most influential feature, with context applied in the ranker ([Uber Eats graph learning](https://www.uber.com/blog/uber-eats-graph-learning/)).
4. **Social proof.** "3 friends going" is both a feature (count and identity of friends/co-members RSVPed, weighted by tie strength) and the primary UI explanation. Twitter requires social proof for out-of-network content; Facebook's field experiment on "things in common" found that showing shared context measurably increases friendship formation ([arXiv 1905.02762](https://arxiv.org/pdf/1905.02762)). Luma and Partiful are product examples of the "who's going" list as the core of event discovery (no engineering write-ups found).
5. **Group and host-side value.** An event is worth more to recommend if the host club is small and the event is under-attended relative to capacity (creator-side fairness), and if the recommending user's friends are going (group recommendation: recommend to the friend cluster together, and let one RSVP notify the rest).

Eventbrite's early system ([TechCrunch](https://techcrunch.com/?p=621555)) used explicit interests plus attended-event categories (42 categories) to recommend ~60 events per user — proof that category-level content matching is enough to start.

```
event score = value_model( p_open, p_rsvp, p_attend, p_share | user, event, ctx )
            × time_utility(hours_until_start)
            × (1 − conflict_penalty)
            × social_proof_boost(n_friends_going)
            × exposure_floor_boost(host_club_size, fill_rate)
```

---

## 5. Graph and people-you-may-know

**The graph.** Model the product as a heterogeneous graph:

```
nodes: Student, Club, Event, Post, Major, Dorm, Course, Tag/Interest
edges: Student -[MEMBER_OF {role, since, active}]-> Club
       Student -[HOLDS_POSITION {title: "President", term: 2026-27}]-> Club
       Student -[RSVP {status, at}]-> Event ;  Student -[ATTENDED {checked_in_at}]-> Event
       Club    -[HOSTS]-> Event ;  Club -[POSTED]-> Post ; Student -[REACTED {type}]-> Post
       Student -[ENROLLED_IN]-> Course/Major ; Student -[LIVES_IN]-> Dorm
       Student -[FRIEND / FOLLOWS {strength}]-> Student
       Club    -[TAGGED]-> Interest ; Student -[INTERESTED_IN {from: survey}]-> Interest
```

Positions are edges with attributes, not node types: `HOLDS_POSITION` carries `title`, `term`, and a `weight` (president > treasurer > member) that feeds tie-strength computations and lets "officers of clubs you are in" be a first-class candidate source for PYMK and a permission source for the CRM side. Store this in Postgres (edge tables) at v1; a graph database is not needed until multi-hop queries dominate (judgment).

**PYMK.** LinkedIn's PYMK is link prediction over the graph and builds >50% of its graph ([LinkedIn](https://engineering.linkedin.com/teams/data/artificial-intelligence/people-you-may-know)); Facebook's signals are mutual friends, shared schools/workplaces, and contacts, with ranking that includes the *recipient's* pending-request load and acceptance likelihood ([Meta](https://transparency.meta.com/features/explaining-ranking/fb-people-you-may-know/)). For us: candidate generation = triangle closing + co-membership + co-attendance (people who checked into the same events) + same section/dorm; ranking = GBDT on (common neighbors, Adamic-Adar, Jaccard over clubs, co-attendance count, same major/year, officer-of-your-club, recency of shared event); equity = LinkedIn's impression discounting so popular students are not over-recommended.

**GNNs.** GraphSAGE ([arXiv 1706.02216](https://arxiv.org/abs/1706.02216)), PinSage, and Uber Eats' weighted-edge GraphSAGE all produce embeddings that can be used both for retrieval and as ranker features. TwHIN shows a single heterogeneous embedding space over users and items. For a campus graph of ~10^4 nodes, a PyTorch Geometric GraphSAGE trains in minutes on a laptop; the operational question is not compute but whether we have enough edges to beat Pixie-style random walks — probably not until v2.

---

## 6. Feed design for a low-volume community product, and notification ranking

**The volume problem.** A campus with hundreds of clubs might produce 50–300 posts a day, most relevant to a handful of members. A TikTok-style ranked infinite feed will run dry, surface stale items, and feel wrong. Observed patterns from community products (product-level, not engineering-blog sourced): Discord and Slack have no ranked feed at all — the unit is the channel, with unread counts and mention-based prioritization; BeReal is strictly time-boxed and chronological; Strava's feed is a mostly-chronological follow feed with light ranking; Nextdoor ranks neighborhood posts but is neighborhood-scoped, which is structurally what "campus-scoped" is for us; Reddit's home is ranked by a hot score plus subscriptions, and its r/popular is recency × velocity ([audit](https://arxiv.org/html/2502.20491v1)). The Instagram "Following" chronological view and "Favorites" exist because users demand a deterministic option.

**Design implication.** Ship a *hybrid*: (a) "My clubs" is chronological, channel-like, and complete (this is the Canvas-like hub; people must trust that they see everything from clubs they joined); (b) "Discover" is ranked and can be sparse; (c) a **weekly digest** (Sunday evening, "your week on campus") is the primary distribution surface for events, ranked by the event value model with a diversity constraint across clubs; (d) home-screen *modules* (Events this week / Clubs for you / People to meet / Opportunities) are the Spotify-shelf pattern and can each be bandit-allocated.

**Notification ranking is the most important ranker at our scale** because notifications, not feeds, drive return visits when content is sparse.

- Instagram's **diversity-aware notification ranking** ([Meta, Sep 2025](https://engineering.fb.com/2025/09/02/ml-applications/a-new-ranking-framework-for-better-notification-quality-on-instagram/)): final score `= R(c) × D(c)` where `R` is the engagement model (pCTR, time spent) and `D(c) = Π_i (1 − w_i · p_i(c))` is a multiplicative demotion across dimensions (author, content, notification type, product surface) with per-dimension similarity thresholds against recent sends. Outcome: fewer notifications, higher CTR.
- Instagram's **uplift model for the daily digest** ([Meta, Oct 2022](https://engineering.fb.com/2022/10/31/ml-applications/instagram-notification-management-machine-learning/)): randomly drop 50% of digests, train a neural uplift model on the *incremental* effect of sending, then send only to users above a quantile threshold. Volume fell substantially with no engagement loss. Lesson: do not send to people who would come anyway.
- **Duolingo's Recovering Difference Softmax** ([KDD 2020](https://dl.acm.org/doi/10.1145/3394486.3403351), [PDF](https://research.duolingo.com/papers/yancey.kdd20.pdf)): a bandit over notification *templates* where arms can be ineligible ("sleeping", e.g. a streak message with no streak) and where an arm's reward *recovers* over time after being used (novelty decay), selected via softmax over difference-from-baseline scores. +2% new-user retention over a strong baseline, deployed to millions of daily reminders. Directly reusable for "which reminder copy / which event to feature in tonight's push".
- LinkedIn's Air Traffic Controller (2018; URL no longer resolves) was the original "one gatekeeper decides whether, when, and on which channel to send" design; the pattern survives in every large platform.

Guardrails: per-user daily caps, quiet hours (required by law for minors — section 9), and a "send nothing" arm that is always eligible.

---

## 7. Open-source and hosted options; a sane v1 → v2 → v3 path

| Layer | Options | Notes |
|---|---|---|
| Storage + vectors | Postgres + [pgvector](https://github.com/pgvector/pgvector) (HNSW) | One database for v1. Qdrant/Weaviate only when vectors need their own service. |
| Features | Postgres tables → [Feast](https://feast.dev/) (offline Postgres/DuckDB, online Redis/Postgres) | Feast gives point-in-time-correct training sets; adopt at v2. |
| Cache / counters | Redis | Impression logs, per-user caps, bandit state. |
| Retrieval + ranking engine | [Vespa](https://docs.vespa.ai/en/phased-ranking.html) (native phased ranking, ONNX, vectors); OpenSearch with the [LTR plugin](https://opensearch.org/blog/ltr-with-opensearch-and-metarank/) | Vespa is the single most "serious architecture" choice a small team can make; heavier to operate. |
| Turnkey recommender | [Gorse](https://github.com/gorse-io/gorse) (Go; CF, item-to-item, LLM ranker, Postgres/Redis backends, REST) ; [Recombee](https://www.recombee.com/) (hosted) | Gorse is a plausible v1 for posts; Recombee is fine but hosted and opaque. |
| Re-ranker | [Metarank](https://docs.metarank.ai/) (LambdaMART over click/impression events, 10–20ms, Redis state) | Maintenance cadence has slowed; treat as a reference design. |
| Training | LightGBM/XGBoost → PyTorch (+ PyTorch Geometric) → [TorchRec](https://github.com/pytorch/torchrec) / NVIDIA Merlin | TorchRec/Merlin exist for sharded embedding tables across GPUs; irrelevant before ~10^7 users. |
| Experiments | GrowthBook / PostHog / homegrown | Need exposure logging and guardrails from day one. |

**v1**: Postgres + pgvector + Redis, Python service, rules + embeddings + GBDT, LLM re-ranker for cold start. **v2**: Feast, a real two-tower + multi-task ranker in PyTorch, Vespa or a dedicated ANN service, bandit service. **v3**: streaming features and near-online training (Monolith-style parameter sync), GNN embeddings, possibly a small text-native foundation ranker in the 360Brew spirit.

---

## 8. Measurement

**Offline.** AUC / log-loss per head (and calibration curves), NDCG@k and recall@k for retrieval, plus *counterfactual* evaluation (inverse-propensity-scored replay) so that logged data from the old policy can evaluate the new one. Offline lifts often do not translate; treat offline as a gate, not a result.

**Online.** A/B with pre-registered primary metrics per surface: Discover → club joins and event RSVPs per user; digest → attended events per recipient; notifications → 7-day return rate, not CTR. **Guardrails**: unsubscribe/mute rates, hide/report rates, notification opt-out, small-club exposure share (Gini of impressions across clubs), session count for low-activity users (LinkedIn's PYMK work reported sessions +1% while improving equity — that is the shape of a good result).

**Long-term value.** TikTok's stated objectives are retention and time spent, not likes ([CACM](https://cacmb4.acm.org/news/257217-how-tiktok-reads-your-mind/fulltext)). Kuaishou's RLUR ([WWW 2023](https://arxiv.org/abs/2302.01724)) optimizes the *return-time interval between sessions* with RL and reports consistent DAU gains. Google's surrogate-metric study ([KDD 2022](https://dl.acm.org/doi/abs/10.1145/3534678.3539073)) found that *diversity of consumption* and *homepage revisit* behaviors predict 5-month retention (AUC 0.69) and that using them as surrogate rewards improved long-term engagement. LinkedIn's surrogate-metrics guidelines ([arXiv 2106.01421](https://arxiv.org/pdf/2106.01421)) exist because downstream conversions take months to observe. For us the north-star chain is: impressions → RSVPs → **check-ins** → repeat attendance at the same club → membership retention next semester; the ranker should be judged on the middle of that chain (attendance), with RSVP as the trainable surrogate and "distinct clubs attended" as the diversity surrogate.

---

## 9. Transparency and regulation

- **EU DSA.** Article 27 requires plain-language disclosure of the main recommender parameters and, where options exist, an easy way to change them; Article 38 requires VLOPs to offer at least one non-profiling option per recommender ([DSA Observatory](https://dsa-observatory.eu/2024/11/22/the-regulation-of-recommender-systems-under-the-dsa-a-transition-from-default-to-multiple-and-dynamic-controls/)). The July 2025 Article 28 guidelines for minors apply to *all* platforms accessible to minors (except micro/small enterprises): prefer explicit signals over behavioral profiling, let minors reset their feed, disable by default streaks, autoplay, read receipts, and push notifications ([EU Commission](https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors)).
- **New York SAFE for Kids Act.** Final rules issued July 2026, effective **January 25, 2027**: users under 18 get only content from accounts they follow/select, in chronological or similar order, unless a verified parent consents; no notifications 12am–6am without consent; certified age assurance with a non-government-ID option; $5,000 per violation. It applies to platforms where users spend ≥20% of time in addictive feeds, so a club OS that is mostly chronological and utility-shaped may fall outside it — but many freshmen are 17, so we should build the compliant mode anyway ([NY AG](https://ag.ny.gov/press-release/2026/attorney-general-james-and-governor-hochul-release-final-safe-kids-act-rules)).
- **California SB 976.** Parental consent for addictive feeds for minors, no notifications 12–6am or during school hours, defaults; feed provisions were largely upheld by the Ninth Circuit in September 2025 and remain in litigation ([Wikipedia summary](https://en.wikipedia.org/wiki/Protecting_Our_Kids_from_Social_Media_Addiction_Act)).
- **Design patterns.** A permanent chronological "Following/My clubs" mode (Instagram), a "why am I seeing this" explanation per card built from the top features (Meta transparency pages), an editable interest profile (the survey *is* the profile, so users can see and change what drives ranking), "not interested"/snooze/mute, a feed reset, quiet hours as a first-class setting, and a non-personalized Discover (popularity × recency) as a one-tap option. Because our explicit-profile approach is already close to "non-profiling", the compliant mode is cheap: rank on survey + membership only, no behavioral features.

---

## Recommended architecture for us

### v1 — day 1, one campus (≈5k students, ≈300 clubs, ≈50 events/week)

**Principle**: deterministic where users expect completeness, ranked where they expect discovery, and every ranked surface explainable. No neural ranker yet; the win is in candidate sources, features, and the value model.

```
                 Postgres (+pgvector, edge tables)          Redis
                 users, clubs, events, posts, edges,        impressions, caps,
                 survey answers, embeddings, logs           bandit state
                            │
        ┌───────────────────┴─────────────────────────────────────────┐
        │  reco-service (Python/FastAPI)                               │
        │  1. candidates (union, ~200):                                │
        │     - my_clubs (chrono, complete)                            │
        │     - embed_knn(user_interest_vec → club/event vecs)         │
        │     - graph_walk(friends', co-members' clubs & RSVPs)        │
        │     - hot(events: RSVP velocity × decay; clubs: smoothed join)│
        │     - new_club_spotlight (exposure floor)                    │
        │  2. hard filters: future events, capacity, schedule conflict,│
        │     blocked/muted, already-member, integrity                 │
        │  3. score: LightGBM per head (p_open, p_rsvp, p_join, p_hide)│
        │     or, until ~2 weeks of labels exist, LLM re-ranker over   │
        │     verbalized profile (cached per user-day, shuffled order) │
        │  4. value model: Σ w_k p_k × time_utility × social_proof     │
        │  5. re-rank: max 2 items/club per 10, MMR on club embedding, │
        │     1–2 Thompson-sampling exploration slots                  │
        │  6. log: request_id, position, features, scores              │
        └──────────────────────────────────────────────────────────────┘
```

- **Candidate sources**: my-clubs chronological; interest-embedding kNN; graph walk (2-hop over membership/RSVP/friend edges, Pixie-style with a visit-count score); popularity with decay; new-club exposure floor; officer-of-your-club for PYMK.
- **Features**: survey interests (multi-hot + embedding), major, year, dorm, free-time blocks; club category/tags/size/age/description embedding; event time features (`hours_until_start`, weekday, evening), distance, conflict flag, capacity fill rate, RSVP velocity, `n_friends_going`, `n_comembers_going`; interaction history counts (opens, RSVPs, joins per club/category, 7d/30d); position of impression.
- **Models**: LightGBM classifiers per head; text embeddings from a hosted embedding API; LLM re-ranker as the cold-start bridge; Thompson sampling with Beta priors for exploration slots and for digest/notification template choice (Duolingo pattern, with a "send nothing" arm).
- **Value model (starting weights, to be tuned)**: `1.0·p_open + 4·p_rsvp + 10·p_attend + 8·p_join + 2·p_share − 15·p_hide − 100·p_report`, multiplied by event time utility and social-proof boost; all heads calibrated with isotonic regression on a holdout.
- **Surfaces**: My clubs (chrono), Discover (ranked), weekly digest (ranked + diversity), home modules, PYMK (GBDT on graph features + impression discounting), notification gate (uplift-lite: do not push to users who opened the app in the last 12h; cap 1/day; quiet hours).
- **Serving**: single Python service, p95 < 150ms by keeping candidate sets ≤ 300 and brute-force dot products; nightly batch recompute of embeddings and "hot" scores; user-side vectors cached in Redis.
- **Measurement**: exposure logging from day one; A/B framework; guardrails on hide/report/unsubscribe and club-exposure Gini; north star = check-ins and distinct clubs attended.
- **Compliance**: non-personalized Discover toggle; chronological default for under-18; quiet hours; "why this" from top-3 features; editable interest profile.

### v2 — ~10 campuses (≈50k–100k users, ≈3k clubs)

- **Retrieval**: train a two-tower (user tower: survey + membership + recent-interaction sequence; item tower: text embedding + category + campus + host-club features) with in-batch negatives and sampling-bias correction; campus is a hard partition of the index. Serve from pgvector HNSW or a Qdrant instance; keep the graph walk and popularity sources.
- **Ranking**: replace per-head GBDTs with one PyTorch multi-task model (shared bottom → MMoE with 4–8 experts; heads: open, RSVP, attend, join, long-dwell, share, hide, report), position feature with a shallow position tower, isotonic calibration layer (LiRank). Distill it into a small two-tower ESR only if candidate counts exceed ~1k.
- **Features**: Feast feature store (offline Postgres/DuckDB, online Redis) for point-in-time-correct training; user sequence features (last 50 interactions) precomputed nightly as a cached embedding (Meta's offline-user-model pattern).
- **Graph**: GraphSAGE / PinSage-style embeddings over the heterogeneous campus graph, used as ranker features and a candidate source; PYMK becomes link prediction on GNN embeddings + GBDT re-rank; retain equity discounting.
- **Exploration & fairness**: contextual bandit (LinUCB / Thompson) over home modules and digest slots; FairRec-style minimum exposure per club per week; DualRec-style "who should see this new club" routing for club onboarding.
- **Notifications**: Instagram-style `R(c) × Π(1 − w_i p_i)` diversity demotion across (club, type, surface); uplift model trained on randomized 20% holdouts.
- **Measurement**: counterfactual (IPS) offline eval; surrogate long-term metric = 4-week return + distinct clubs attended; per-campus A/B with CUPED variance reduction.
- **Serving**: reco-service split into retrieval, ranking, and mixer services; ONNX export of the ranker; or move retrieval + phased ranking into Vespa if operating it is acceptable.

### v3 — 100+ campuses (≈10^6 users, ≈10^5 clubs, ads and opportunities)

- **Online learning**: Kafka event stream → streaming feature updates and hourly/minutely sparse-parameter sync to serving (Monolith pattern); collisionless / hashed embedding tables sized per campus; TorchRec if embedding tables exceed a single GPU.
- **Models**: a unified heavy ranker across content types (posts, events, clubs, people, opportunities, ads) with per-type towers and a cross-type second-pass ranker with calibrated scores (LinkedIn heterogeneous recs); PLE if MMoE seesaw appears; DPP re-ranking in windows; a value model with explicit *long-term* heads (predicted 4-week return, predicted membership retention) trained with surrogate-reward methods (Google KDD 2022 / Kuaishou RLUR style).
- **Text-native ranking**: a small fine-tuned LLM (7–30B) in the 360Brew spirit that scores verbalized (profile, history, candidate) triples for cold surfaces (new campuses, new clubs, opportunities), distilled into the heavy ranker for hot paths.
- **Ads and opportunities**: rank in the same funnel with their own heads (p(click), p(apply)) and mix in the value model with explicit slot caps and a revenue term, Twitter Home Mixer style; never let an ad displace a "my clubs" item.
- **Governance**: per-campus and per-jurisdiction policy config (non-profiling default, minors mode, quiet hours), model registry with calibration/normalized-entropy health checks (Meta), exposure fairness dashboards per campus.

The thread running through all three: keep the user side precomputed, keep the item side small and fresh, make every ranked list a calibrated multi-objective value model with negative weights, force distribution to small clubs, and judge the system on attendance and return, not clicks.
