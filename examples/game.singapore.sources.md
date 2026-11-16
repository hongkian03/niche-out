# Singapore Edition — author notes and sources

Upload [game.singapore.json](game.singapore.json) in the host screen. This document is author reference, not part of the uploaded pack.

Research snapshot: **16 November 2026**. Ten rounds, **170 canonical answers and 552 explicit aliases**, 39,600 bytes. Timings follow the existing examples: 3 seconds reading, 25 seconds answering, 10 seconds results. Maximum attainable score: **915**; small categories do not artificially fill every tier.

## Tier model

| Tier | Points |
|---|---:|
| Plankton | 10 |
| Too Clever | 15 |
| Schooler | 30 |
| Rare | 60 |
| Deep Cut | 85 |
| One in a Krillion | 100 |

The names and points are corroborated by independent [Krillion Answers tier documentation](https://www.krillionanswers.io/tiers) and [Krillion Game tier documentation](https://krillion-game.com/tiers/). Those are unofficial sources, not the publisher. The [official Krillion FAQ](https://krillion.io/faq) explains the underlying curation: combined reference datasets, familiarity measures where appropriate, sometimes LLM assistance and manual review. Its top tier also considers how satisfying the discovery is, and Too Clever describes a predictably obvious attempt at obscurity.

These Singapore ratings are our **qualitative editorial estimates**, informed by sampled search results and local familiarity. We did not measure per-answer internet frequencies or survey Singapore players. Search rankings favour tourism, recent news and institutional prominence, so they are imperfect proxies for what a local audience will answer. Official sources establish membership; the rationales below explain our scoring judgements. These scores are fixed in the JSON and do not change with player counts. More than one answer may share the top tier in larger categories.

## Round coverage

Each question uses a bounded, explicitly named category to make canonical-answer coverage checkable. This is not an unrestricted catalogue of Singapore food, places or culture. All canonical members of the cited sets are included; every possible typo or paraphrase is not. The game ignores case and excess whitespace but otherwise requires an explicit answer or alias.

| Round | Prompt ID | Canonical answers |
|---|---|---:|
| 1 | singapore-expressways | 10 |
| 2 | singapore-public-holidays | 10 |
| 3 | singapore-north-east-line | 17 |
| 4 | singapore-presidents | 9 |
| 5 | sg-planning-areas | 55 |
| 6 | portrait-banknote-denominations | 7 |
| 7 | sg-reservoirs | 17 |
| 8 | singapore-autonomous-universities | 6 |
| 9 | singapore-downtown-line | 35 |
| 10 | sg-nature-reserves | 4 |

## Validation and manual smoke test

Validated with the production compiler and real bounded import worker on Node 24.22.3. All canonical answers and aliases, including uppercase and padded-space variants, map to the intended answers. No cross-answer alias collisions. The upload is well below 10 MiB.

A highest-score path in round order: **KJE → Hari Raya Haji → Potong Pasir → Devan Nair → Museum → 1000 → Poyan → SUTD → Mattar → Labrador**. Total: **915**. Use a second player who waits if you want to observe the full answering timer rather than early completion.

Scope checks: Outram Park and Orchard Road are not accepted as planning-area aliases; use Outram and Orchard. Future Downtown Line stations Xilin and Sungei Bedok are excluded at this snapshot. Generic Hari Raya is ambiguous between two holidays; specify Puasa or Haji. Commemorative banknotes, acting presidents and universities outside the six autonomous institutions are outside the stated categories.

## Detailed research

# Singapore transport rounds: source and tier notes

Research date: 16 November 2026. Scores are qualitative editorial estimates informed by search prominence and route familiarity, not search-result counts, survey frequencies or measured player behaviour. Too Clever means an obvious “obscure” choice; top-tier picks include a fun-factor judgement. The per-answer rationale below describes that inference, not a claim that each station had a measured search count.

## Coverage sources

- [LTA expressways](https://www.lta.gov.sg/content/ltagov/en/getting_around/driving_in_singapore/expressways.html): official road classification/names, cross-checked against [ten-road directory](https://sgontime.com/expressways/).
- [SBS Transit first/last train directory](https://www.sbstransit.com.sg/first-train-last-train): station names/codes; [LTA North East Line](https://www.lta.gov.sg/content/ltagov/en/getting_around/public_transport/rail_network/north_east_line.html) confirms 17 operational stops. NE2 is absent, not an accepted station.
- [LTA Downtown Line map](https://www.lta.gov.sg/content/dam/ltagov/news/press/2025/250124_DTL_system_map_AnnexA.pdf): DT1–DT35, including Hume; [LTA opening announcement](https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/11/news-releases/tel5-dtl3e-passenger-service-26-dec-2026.html) schedules Xilin/Sungei Bedok for 26 December 2026, so both are excluded at the stated cutoff.

## Prominence sampling

Queries included “Singapore expressways PIE ECP CTE most busy”, “Singapore Downtown Line attractions Bugis Bayfront Chinatown Mattar”, and “Singapore North East Line attractions Chinatown Little India Clarke Quay Buangkok”. Useful results: [MOT heavier-traffic reply](https://www.mot.gov.sg/news-resources/newsroom/written-reply-to-parliamentary-questions-on-data-on-average-speed-of-vehicles-on-expressways-during-peak-hours-from-2019-to-2023/), [LTA visitor guide](https://www.lta.gov.sg/content/dam/ltagov/getting_around/public_transport/pdf/pt_guide.pdf), [STB Little India map](https://www.visitsingapore.com/content/dam/visitsingapore/neighbourhoods/little-india/Little-India_Digital-Version_Final_%281%29_%281%29.pdf), and [NEL station guide](https://linktown.com.sg/north-east-line-stations-guide/). These favour tourist districts and major interchanges; a Singaporean commuting audience may rank local stops differently. Search prominence is a weak proxy and rankings are tunable.

Closed answer sets: 10 expressways, 17 NEL stations, 35 DTL stations. Major roads that are not expressways, future stations and LRT stops are excluded. Common English station suffixes and own-line station codes are accepted; interchange codes from other lines are deliberately omitted because the prompt asks for NE/DT codes. Alias spelling variants are conveniences, not extra answers.

## Per-answer tier decisions

| Answer | Tier ID | Rationale |
|---|---|---|
| Pan Island Expressway (PIE) | plankton | Broad island-spanning route; prominent in traffic and congestion search results. |
| Central Expressway (CTE) | plankton | Repeated congestion/ERP coverage and a familiar central commuter route. |
| East Coast Parkway (ECP) | schooler | Airport/coastal route with broad public recognition. |
| Ayer Rajah Expressway (AYE) | schooler | Prominent commuter route; named in official heavier-traffic report. |
| Kallang-Paya Lebar Expressway (KPE) | too-clever | Familiar underground expressway is an obvious clever-sounding alternative. |
| Tampines Expressway (TPE) | rare | Regional northeastern route with less broad prominence in the sampled results. |
| Bukit Timah Expressway (BKE) | rare | Recognisable northern route, less prominent than PIE/CTE in sampled general coverage. |
| Marina Coastal Expressway (MCE) | deep-cut | Shorter coastal tunnel route, a more specific answer despite engineering coverage. |
| Seletar Expressway (SLE) | deep-cut | Regional route with less prominence in sampled general results. |
| Kranji Expressway (KJE) | one-in-a-krillion | Editorial top pick: short western connector is easy to overlook among larger routes. |

### North East Line

| Answer | Tier ID | Rationale |
|---|---|---|
| HarbourFront | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Outram Park | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Chinatown | plankton | High-recognition interchange or destination; central tourism/transport prominence supports a common-answer estimate. |
| Clarke Quay | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Dhoby Ghaut | plankton | High-recognition interchange or destination; central tourism/transport prominence supports a common-answer estimate. |
| Little India | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Farrer Park | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Boon Keng | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Potong Pasir | one-in-a-krillion | Editorial top pick: a valid, less obvious neighbourhood station; this is a subjective game-design choice, not measured rarity. |
| Woodleigh | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Serangoon | plankton | High-recognition interchange or destination; central tourism/transport prominence supports a common-answer estimate. |
| Kovan | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Hougang | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Buangkok | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Sengkang | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Punggol | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Punggol Coast | too-clever | An obvious unusual choice: new-station news or the line-name coincidence makes it more salient than it first seems. |

### Downtown Line

| Answer | Tier ID | Rationale |
|---|---|---|
| Bukit Panjang | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Cashew | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Hillview | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Hume | too-clever | An obvious unusual choice: new-station news or the line-name coincidence makes it more salient than it first seems. |
| Beauty World | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| King Albert Park | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Sixth Avenue | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Tan Kah Kee | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Botanic Gardens | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Stevens | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Newton | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Little India | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Rochor | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Bugis | plankton | High-recognition interchange or destination; central tourism/transport prominence supports a common-answer estimate. |
| Promenade | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Bayfront | plankton | High-recognition interchange or destination; central tourism/transport prominence supports a common-answer estimate. |
| Downtown | too-clever | An obvious unusual choice: new-station news or the line-name coincidence makes it more salient than it first seems. |
| Telok Ayer | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Chinatown | plankton | High-recognition interchange or destination; central tourism/transport prominence supports a common-answer estimate. |
| Fort Canning | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Bencoolen | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Jalan Besar | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Bendemeer | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Geylang Bahru | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Mattar | one-in-a-krillion | Editorial top pick: a valid, less obvious neighbourhood station; this is a subjective game-design choice, not measured rarity. |
| MacPherson | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Ubi | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Kaki Bukit | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Bedok North | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Bedok Reservoir | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Tampines West | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Tampines | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |
| Tampines East | rare | Locally recognisable stop; less central in the sampled broad visitor/transport results. |
| Upper Changi | deep-cut | More neighbourhood-specific stop, comparatively easy to overlook in a line-wide recall question. |
| Expo | schooler | Well-known interchange, terminus, town or visitor destination, but below the most salient picks. |


# Singapore geography research — 16 November 2026

## Coverage and boundaries

- Planning areas: 55/55 names checked against the [SLA OneMap planning-area names documentation](https://www.onemap.gov.sg/apidocs/planningarea) and [SingStat planning-area map/key](https://www.singstat.gov.sg/students-corner/geography-and-environment/geographic-distribution/population-trends). Neighbourhoods such as Chinatown, Katong and Little India are not extra planning areas. Sentosa is not an alias for the whole Southern Islands planning area.
- Reservoirs: 17/17 in PUB's [Innovation magazine reservoir map, Figure 1](https://www.pub.gov.sg/-/media/Images/Feature/Home/Resources/Publications/PUBInnovationMagazineIssue12_11042022.pdf); count cross-checked against the current [local catchment overview](https://www.pub.gov.sg/Public/WaterLoop/OurWaterStory/Local-Catchment-Water). Jurong Lake counts; service reservoirs and Johor's Linggiu Reservoir do not. Marina Barrage is a structure, not an accepted reservoir-name alias.
- Nature reserves: 4/4 on [NParks' nature-reserve overview](https://www.nparks.gov.sg/visit/when-visiting-parks/about-parks-nature-reserves-pcns/nature-park-networks-areas). Pulau Ubin, Chek Jawa, nature parks and Sisters' Islands Marine Park fall outside this explicitly bounded question.

## Estimated prominence, not measured answer frequencies

Queries included “Singapore best reservoirs MacRitchie Bedok Marina Upper Peirce Tengeh” and “Singapore neighbourhoods Orchard Chinatown Tampines Yishun Simpang Western Islands”. Broad search visibility was compared with [PUB recreation listings](https://www.pub.gov.sg/Public/Places-of-Interest/Our-Reservoirs-and-Waterways), [PUB water-activity locations](https://www.pub.gov.sg/Public/Places-of-Interest/Our-Reservoirs-and-Waterways/ABC-Waters/PUB-Water-Activities), [MacRitchie information](https://www.pub.gov.sg/Public/Places-of-Interest/Our-Reservoirs-and-Waterways/MacRitchie-Reservoir), [Central Catchment information](https://www.nparks.gov.sg/visit/parks/park-detail/central-catchment-nature-reserve), [neighbourhood search results](https://sgone.sg/neighbourhoods?intent=where-live), and [tourism nature coverage](https://www.visitsingapore.com/things-to-do/urban-wellness/green-spaces/).

Assignments below are editorial estimates for a Singapore-familiar audience. No numerical search totals or popularity probabilities were measured; broad result visibility and everyday familiarity are proxies. The four-answer reserve question deliberately does not force a 100-point answer. Aliases are author-added conveniences, not extra outcomes; case/whitespace normalization is automatic.

| Prompt | Answer | Tier | Editorial rationale |
|---|---|---|---|
| sg-planning-areas | Ang Mo Kio | schooler | Large established residential town |
| sg-planning-areas | Bedok | plankton | Familiar major residential town |
| sg-planning-areas | Bishan | schooler | Established town and interchange name |
| sg-planning-areas | Boon Lay | rare | Familiar station name but less obvious planning-area choice |
| sg-planning-areas | Bukit Batok | schooler | Established residential town |
| sg-planning-areas | Bukit Merah | rare | Known town, less immediate than headline neighbourhoods |
| sg-planning-areas | Bukit Panjang | schooler | Established residential town |
| sg-planning-areas | Bukit Timah | schooler | Well-known district and nature destination |
| sg-planning-areas | Central Water Catchment | deep-cut | Technical administrative name, easily overlooked |
| sg-planning-areas | Changi | plankton | Airport and heritage name with wide visibility |
| sg-planning-areas | Changi Bay | deep-cut | Distinct from the much better-known Changi |
| sg-planning-areas | Choa Chu Kang | schooler | Established town with common alternate spelling |
| sg-planning-areas | Clementi | schooler | Established town and transport hub |
| sg-planning-areas | Downtown Core | rare | Familiar central district under its formal planning name |
| sg-planning-areas | Geylang | schooler | Widely recognised food and heritage district |
| sg-planning-areas | Hougang | schooler | Established residential town |
| sg-planning-areas | Jurong East | schooler | Major regional centre |
| sg-planning-areas | Jurong West | schooler | Major residential town |
| sg-planning-areas | Kallang | schooler | Sports and transport visibility |
| sg-planning-areas | Lim Chu Kang | rare | Rural district less prominent than residential towns |
| sg-planning-areas | Mandai | rare | Zoo association is familiar, planning area less immediate |
| sg-planning-areas | Marina East | deep-cut | Less prominent directional planning name |
| sg-planning-areas | Marina South | rare | Central waterfront development name |
| sg-planning-areas | Marine Parade | schooler | Established coastal residential district |
| sg-planning-areas | Museum | one-in-a-krillion | Counterintuitive formal planning-area name |
| sg-planning-areas | Newton | rare | Known interchange and food-centre name |
| sg-planning-areas | North-Eastern Islands | deep-cut | Administrative island grouping rarely used in everyday directions |
| sg-planning-areas | Novena | schooler | Medical and shopping district visibility |
| sg-planning-areas | Orchard | plankton | Iconic shopping destination |
| sg-planning-areas | Outram | rare | Known transport and medical district |
| sg-planning-areas | Pasir Ris | schooler | Established residential town |
| sg-planning-areas | Paya Lebar | schooler | Familiar district and transport name |
| sg-planning-areas | Pioneer | rare | Less immediate planning-area name |
| sg-planning-areas | Punggol | plankton | Prominent newer waterfront town |
| sg-planning-areas | Queenstown | schooler | Established housing and heritage district |
| sg-planning-areas | River Valley | rare | Recognised but more specific residential district |
| sg-planning-areas | Rochor | rare | Central heritage district with less broad name recognition |
| sg-planning-areas | Seletar | rare | Airport and aerospace district |
| sg-planning-areas | Sembawang | schooler | Established residential town |
| sg-planning-areas | Sengkang | schooler | Major residential town |
| sg-planning-areas | Serangoon | schooler | Town and interchange visibility |
| sg-planning-areas | Simpang | one-in-a-krillion | Little everyday residential or visitor name exposure |
| sg-planning-areas | Singapore River | rare | Famous landmark, less obvious as a planning area |
| sg-planning-areas | Southern Islands | deep-cut | Formal grouping less familiar than individual island names |
| sg-planning-areas | Straits View | one-in-a-krillion | Small formal planning area with little everyday name exposure |
| sg-planning-areas | Sungei Kadut | deep-cut | Industrial district less prominent in general guides |
| sg-planning-areas | Tampines | plankton | Major regional centre and residential town |
| sg-planning-areas | Tanglin | rare | Recognised but specific central district |
| sg-planning-areas | Tengah | rare | New-town publicity but less entrenched than established towns |
| sg-planning-areas | Toa Payoh | schooler | Established residential town |
| sg-planning-areas | Tuas | schooler | Port and industrial-area visibility |
| sg-planning-areas | Western Islands | deep-cut | Formal industrial-island grouping |
| sg-planning-areas | Western Water Catchment | deep-cut | Technical administrative grouping |
| sg-planning-areas | Woodlands | plankton | Major northern town and border association |
| sg-planning-areas | Yishun | plankton | Large town with frequent local cultural visibility |
| sg-reservoirs | MacRitchie Reservoir | plankton | Repeatedly foregrounded in recreation and reservoir search results |
| sg-reservoirs | Marina Reservoir | plankton | Highly visible city-centre reservoir |
| sg-reservoirs | Bedok Reservoir | schooler | Common recreational reservoir result |
| sg-reservoirs | Lower Seletar Reservoir | schooler | Featured in PUB recreational-water information |
| sg-reservoirs | Upper Seletar Reservoir | rare | Known nature destination but less prominent in general results |
| sg-reservoirs | Lower Peirce Reservoir | rare | Boardwalk destination with moderate recreational prominence |
| sg-reservoirs | Upper Peirce Reservoir | rare | Recognised nature destination with moderate prominence |
| sg-reservoirs | Pandan Reservoir | rare | Featured for water activities, less immediate general recall |
| sg-reservoirs | Kranji Reservoir | rare | Recognised northern catchment name |
| sg-reservoirs | Jurong Lake | schooler | Prominent public gardens and lake destination |
| sg-reservoirs | Punggol Reservoir | rare | Public waterfront association, less immediate as reservoir name |
| sg-reservoirs | Serangoon Reservoir | rare | Recognised eastern waterway but less prominent than headline reservoirs |
| sg-reservoirs | Tengeh Reservoir | deep-cut | Specialist solar-energy and water-infrastructure coverage |
| sg-reservoirs | Sarimbun Reservoir | deep-cut | Less public recreation visibility |
| sg-reservoirs | Poyan Reservoir | one-in-a-krillion | Obscure western catchment name |
| sg-reservoirs | Murai Reservoir | one-in-a-krillion | Obscure western catchment name |
| sg-reservoirs | Tekong Reservoir | deep-cut | Offshore reservoir less immediate than mainland recreational sites |
| sg-nature-reserves | Bukit Timah Nature Reserve | plankton | Prominent hiking and primary-rainforest destination |
| sg-nature-reserves | Central Catchment Nature Reserve | schooler | Large reserve associated with MacRitchie and the TreeTop Walk |
| sg-nature-reserves | Sungei Buloh Wetland Reserve | schooler | Prominent birdwatching and wetland destination |
| sg-nature-reserves | Labrador Nature Reserve | rare | Less immediately recalled as a legally designated reserve |


## Culture, institutions and everyday Singapore — research notes

Snapshot: **16 November 2026**. These four bounded prompts contain **32 canonical answers**. Their factual membership is source-backed. Their rarity tiers are editorial estimates of likely answer salience, informed by the search observations below; they are not measured web-frequency counts, player-response rates, or official Krillion ratings. Search results vary, and no per-answer numerical hit counts were available or invented. Too Clever is used for an obvious attempt at obscurity, not as a simple numerical rarity band.

### Presidents — 9 answers

The [Istana's former-presidents list](https://www.istana.gov.sg/the-president/former-presidents/) supplies eight former officeholders; [the Istana presidency overview](https://www.istana.gov.sg/the-president/presidents-duties/the-presidency/) identifies Tharman as ninth president. The prompt explicitly excludes acting officeholders and fixes its end date. Lee Kuan Yew and other prime ministers do not qualify. Aliases include familiar short names and initials. Official full-name variants were cross-checked against [NUS's chancellor list](https://www.nus.edu.sg/commencement/pdf/2025_TOC.pdf).

Queries actually used: `site.istana.gov.sg former presidents Singapore`; `Singapore presidents Tharman Halimah Yusof Ishak Devan Nair Benjamin Sheares`.

Observed: the official chronology dominates factual results; general search also surfaced a CNA 2023 election explainer and coverage of Tharman/Halimah. Those are qualitative salience signals, not comparative counts for all nine names. [CNA's election explainer](https://www.channelnewsasia.com/cna-insider/big-read/big-read-first-time-voters-presidential-race-3695086) discusses both past and recent presidents.

| Answer | Tier | Editorial rationale |
|---|---|---|
| Yusof Ishak | Plankton | First president, also the banknote portrait; very salient introductory answer. |
| Benjamin Sheares | Deep Cut | Older officeholder likely to require historical recall. |
| Devan Nair | One in a Krillion | Shorter historical presidency; strongest less-obvious pick in this small set. |
| Wee Kim Wee | Rare | Historical recall, with broader institutional familiarity than the deepest picks. |
| Ong Teng Cheong | Schooler | Frequently remembered in discussions of the elected presidency. |
| S. R. Nathan | Schooler | Long tenure and familiar shortened name. |
| Tony Tan Keng Yam | Schooler | Recent enough for broad recognition. |
| Halimah Yacob | Plankton | Recent president and first woman to hold the office; prominent in election coverage. |
| Tharman Shanmugaratnam | Plankton | Current president, prominent in current presidency results. |

### Singapore public holidays — 10 names

The [MOM 2026 holiday announcement](https://www.mom.gov.sg/newsroom/press-releases/2025/0616-public-holidays-for-2026) and [official holiday calendar](https://www.mom.gov.sg/employment-practices/public-holidays) establish membership. There are **10 distinct names across 11 scheduled holiday days**, because Chinese New Year spans two days. Substitute days do not create new answers. The explicit calendar scope excludes school holidays and observances such as Teachers' Day and National Service Day. Generic `Hari Raya` is deliberately not accepted because it cannot identify which of two valid answers is meant.

Query actually used: `site.mom.gov.sg employment-practices public-holidays 2026 New Year Chinese New Year Hari Raya Puasa`.

Observed: official calendars and lists display the same full set; they do not establish a rarity ordering. The tiers below therefore rely more heavily on editorial likely-recall estimates than the other prompts. No inference about the importance of religions or communities is intended.

| Answer | Tier | Editorial rationale |
|---|---|---|
| New Year's Day | Schooler | Familiar but less specifically Singaporean than the first answers likely prompted by this theme. |
| Chinese New Year | Plankton | Two-day holiday and a prominent calendar anchor. |
| Hari Raya Puasa | Schooler | Widely known named celebration. |
| Good Friday | Rare | Less likely to be the first Singapore-themed recall. |
| Labour Day | Rare | Less festival-oriented answer. |
| Hari Raya Haji | Deep Cut | Easy to overlook when recalling Puasa first. |
| Vesak Day | Rare | Familiar official holiday but editorially a less immediate first answer. |
| National Day | Plankton | Most directly Singapore-specific holiday name. |
| Deepavali | Schooler | Widely recognized celebration; Diwali accepted. |
| Christmas Day | Plankton | Very broadly familiar holiday. |

### Portrait Series banknotes — 7 denominations

[MAS's circulation-note catalogue](https://www.mas.gov.sg/currency/circulation-currency/circulation-currency-notes) lists the regular Portrait Series as $2, $5, $10, $50, $100, $1,000 and $10,000. [MAS's large-note FAQ](https://ask.gov.sg/mas/questions/clx8ktis200arryoz2l7tx2ng?from=agencyhomepage) explains that new issuance of $1,000 and $10,000 ceased. They remain answers because this is a series-membership prompt, explicitly including discontinued issuance. Commemorative denominations and other historical series are excluded. Numeric, currency-prefixed, comma-separated and written-out forms are accepted.

Queries actually used: `site.mas.gov.sg Portrait Series seven denominations 2 5 10 50 100 1000 10000`; `Singapore banknotes 10000 1000 stopped issuing`.

Observed: MAS's discontinued-large-note FAQ appears prominently in the second search, alongside collectors' circulation guides. $10,000 is therefore treated as a readily found 'obscure fact', not automatically the rarest answer simply because it is the largest note.

| Answer | Tier | Editorial rationale |
|---|---|---|
| $2 | Plankton | Everyday small denomination. |
| $5 | Schooler | Familiar but less immediately iconic than $2/$10. |
| $10 | Plankton | Everyday prominent denomination. |
| $50 | Schooler | Familiar everyday larger denomination. |
| $100 | Rare | Less routine cash experience for many players. |
| $1,000 | Deep Cut | Discontinued issuance; often overlooked between everyday notes and the famous $10,000 fact. |
| $10,000 | Too Clever | Tempting 'biggest/most obscure note' response, but highly discoverable in large-note searches. |

### Autonomous universities — 6 institutions

The [National Youth Council's Inter-University Network page](https://www.nyc.gov.sg/research-engagement/youth-engagement/inter-university-network/) names all six; [MOE's post-secondary education booklet](https://www.moe.gov.sg/-/media/files/post-secondary/post-secondary-school-booklet-2021.pdf) gives full names. The game asks specifically for autonomous universities, not every institution offering degrees. UAS, LASALLE, NAFA, SIM and foreign branch campuses are excluded by this scope; obsolete predecessor names are not accepted as current institutional names.

Queries actually used: `site.moe.gov.sg six autonomous universities Singapore`; `Singapore universities NUS NTU SMU SUTD SIT SUSS ranking`; `site.moe.gov.sg "autonomous universities" "SUSS" "SUTD"`.

Observed: NUS/NTU dominate general ranking headlines, while SMU/SUTD appear in subsequent coverage and SIT/SUSS less consistently. [QS's Singapore university overview](https://www.topuniversities.com/where-study/asia/singapore/top-universities-singapore) and [SUTD's news roundup](https://www.sutd.edu.sg/news-listing/qs-asia-university-rankings-nus-and-ntu-fall-to-sixth-and-eighth-places/) illustrate that pattern. Ranking position is not being used as quality or rarity arithmetic; broad visibility informs editorial tiers.

| Answer | Tier | Editorial rationale |
|---|---|---|
| National University of Singapore | Plankton | Very prominent in general searches and ranking headlines. |
| Nanyang Technological University | Plankton | Similarly prominent and familiar. |
| Singapore Management University | Schooler | Broadly known, but usually after NUS/NTU in general coverage. |
| Singapore Institute of Technology | Rare | More specialized institutional visibility. |
| Singapore University of Technology and Design | Deep Cut | A less immediate response in this small set; acknowledges that recent ranking coverage may raise familiarity. |
| Singapore University of Social Sciences | Rare | More specialized visibility; standard abbreviation accepted. |

Aliases are deliberately explicit. Case and whitespace normalization is handled by the game. These lists cover the bounded canonical answer sets, not every conceivable misspelling or paraphrase. Recheck the date-sensitive presidents and institutions before reuse in later years.
