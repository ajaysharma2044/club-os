// Career regimes and the person-specific exposure model.
// Pure functions, no database, no network.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/regimes.mjs
import assert from "node:assert/strict";
import {
  CAREER_PATHS,
  CAREER_PATHS_WITH_PRIORS,
  CAREER_REGIME_PRIORS,
  REGIME_CAREER_OVERLAP,
  careerRegimeIntensity,
  careerRecruitingIntensityFactor,
  classYear,
  defaultCareerRegimes,
  dominantCareerRegime,
  graduationYearToCohort,
  isCareerPath,
  regimeOverlapIsComplete,
} from "../lib/cec/context/regimes.ts";
import {
  EXPLICIT_INTEREST_SOURCES,
  EXPOSURE_MODEL_VERSION,
  computeExposure,
  explicitInterest,
  propagate,
  recruitingExposureFactor,
} from "../lib/cec/context/exposure.ts";
import { computeFactor, mayUse } from "../lib/cec/factors.ts";

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};
const throws = (fn, re, m) => {
  let got = null;
  try {
    fn();
  } catch (e) {
    got = e.message;
  }
  assert.ok(got !== null, `${m} (expected a throw, got none)`);
  assert.ok(re.test(got), `${m} — message was: ${got}`);
  checks++;
};

const T = (d) => `${d}T12:00:00Z`;

// =========================================================== cohorts & years
{
  ok(graduationYearToCohort(2028) === 2028, "a year number is its own cohort");
  ok(graduationYearToCohort("2028") === 2028, "a year string parses");
  ok(graduationYearToCohort("Class of 2028") === 2028, "a class-of string parses");
  ok(graduationYearToCohort("2028-05-24") === 2028, "a graduation date parses");
  ok(graduationYearToCohort("someday") === null, "an unreadable graduation is null, not a guess");
  ok(graduationYearToCohort(1776) === null, "an out-of-range year is refused");

  // Cohort of 2028: senior AY 2027-28, junior 2026-27, sophomore 2025-26.
  ok(classYear(2028, T("2026-03-01")) === "sophomore", `sophomore spring, got ${classYear(2028, T("2026-03-01"))}`);
  ok(classYear(2028, T("2025-10-01")) === "sophomore", "October sits in the academic year that follows it");
  ok(classYear(2028, T("2025-07-01")) === "freshman", "July is still the previous academic year");
  ok(classYear(2028, T("2026-10-01")) === "junior", "the next August turns the cohort over");
  ok(classYear(2028, T("2027-10-01")) === "senior", "senior year");
  ok(classYear(2028, T("2029-01-01")) === "alum", "past graduation is alum");
  ok(
    classYear(2028, T("2023-10-01")) === null,
    "five years out is null, not freshman — a five-year programme and a high-school student look the same from here",
  );
  ok(classYear("nonsense", T("2026-03-01")) === null, "an unreadable cohort yields null");
}

// ======================================================= definitions are data
{
  ok(CAREER_PATHS.length === 12, `twelve career paths are supported, got ${CAREER_PATHS.length}`);
  ok(isCareerPath("quant_trading") && !isCareerPath("vibes"), "the path list is closed");
  ok(
    CAREER_REGIME_PRIORS.every((p) => /stated prior/i.test(p.source)),
    "every default definition says in its own source string that it is a stated prior",
  );
  ok(
    CAREER_REGIME_PRIORS.every((p) => p.confidence > 0 && p.confidence <= 0.6),
    "no stated prior claims more than 0.6 confidence — none of these were fitted to anything",
  );
  ok(
    CAREER_REGIME_PRIORS.every((p) => p.note && p.note.length > 20),
    "every prior explains why its window sits where it does",
  );

  const defs = defaultCareerRegimes(2028);
  ok(defs.length === CAREER_REGIME_PRIORS.length, "the priors instantiate one row per window");
  ok(
    defs.every((d) => d.graduation_cohort === 2028 && d.observed_at && d.source && d.confidence > 0),
    "every instantiated row carries a cohort, an observed_at, a source and a confidence",
  );
  ok(
    defs.every((d) => Date.parse(d.effective_start) < Date.parse(d.effective_end)),
    "every window starts before it ends",
  );
  const ib = defs.filter((d) => d.career_path === "investment_banking" && d.regime_type === "applications_open");
  ok(ib.length === 1, "one IB applications window per cohort");
  ok(
    ib[0].effective_start.startsWith("2026-01") && ib[0].effective_end.startsWith("2026-04"),
    `IB applications for the class of 2028 land in sophomore spring 2026, got ${ib[0].effective_start}..${ib[0].effective_end}`,
  );
  ok(
    defaultCareerRegimes(2028, { careerPaths: ["consulting"] }).every((d) => d.career_path === "consulting"),
    "the default set can be narrowed to one path",
  );
  ok(
    CAREER_PATHS_WITH_PRIORS.length === 4,
    `four paths carry a stated timeline, got ${CAREER_PATHS_WITH_PRIORS.length}`,
  );
}

// ============================================ IB peaks in sophomore spring
{
  const at = (d) => careerRegimeIntensity("investment_banking", 2028, T(d));
  const peak = at("2026-03-01"); // sophomore spring
  ok(peak !== null, "we hold an IB timeline for the class of 2028");
  ok(peak.class_year === "sophomore", `the peak is read as sophomore, got ${peak.class_year}`);
  ok(peak.intensity > 0.85, `IB peaks hard in sophomore spring, got ${peak.intensity}`);
  ok(
    peak.regime_type === "applications_open" || peak.regime_type === "interviews",
    `the dominant window is named, got ${peak.regime_type}`,
  );
  ok(peak.drivers.length >= 2, "overlapping windows are each named as a driver");
  ok(/prior/i.test(peak.reading), "the reading says out loud that the dates are a stated prior");
  ok(peak.prior_only === true, "and flags it structurally too");

  const sophFall = at("2025-10-01");
  const juniorSpring = at("2027-03-01");
  ok(
    sophFall.intensity < peak.intensity,
    `sophomore fall networking is lighter than sophomore spring: ${sophFall.intensity} vs ${peak.intensity}`,
  );
  ok(
    juniorSpring.intensity < 0.2,
    `junior spring is quiet on the accelerated calendar, got ${juniorSpring.intensity}`,
  );
  ok(
    juniorSpring.intensity === 0 || juniorSpring.intensity > 0,
    "a quiet week still returns a reading rather than null — zero means quiet, null means unknown",
  );
  ok(
    juniorSpring.confidence > 0,
    "confidence in a quiet week is confidence in the calendar that said so",
  );

  // The run-up: pressure starts before the window formally opens.
  const before = at("2026-01-04"); // ~6 days before the Jan 10 open
  const wellBefore = at("2025-12-01");
  ok(
    before.intensity > wellBefore.intensity,
    `the fortnight before applications open already counts: ${before.intensity} vs ${wellBefore.intensity}`,
  );
}

// ====================================== a freshman pre-med is not in that regime
{
  // Same date, a different person: class of 2029, medicine.
  const at = T("2026-03-01");
  ok(classYear(2029, at) === "freshman", "the class of 2029 are freshmen in spring 2026");

  const ibForFreshman = careerRegimeIntensity("investment_banking", 2029, at);
  ok(ibForFreshman !== null, "we do hold an IB timeline for that cohort");
  ok(
    ibForFreshman.intensity < 0.05,
    `a freshman is not inside the sophomore-spring IB window, got ${ibForFreshman.intensity}`,
  );

  // And the path they actually named has no stated timeline at all.
  ok(
    careerRegimeIntensity("medicine", 2029, at) === null,
    "medicine has no stated timeline, so the answer is null rather than a fabricated zero",
  );
}

// ============================================== unknown career returns null
{
  ok(
    careerRegimeIntensity("underwater_basket_weaving", 2028, T("2026-03-01")) === null,
    "a career path we have never heard of returns null, not a guess",
  );
  ok(
    careerRegimeIntensity("law", 2028, T("2026-03-01")) === null,
    "a real path with no stated timeline also returns null — a supported value is not a modelled one",
  );
  ok(
    careerRegimeIntensity("investment_banking", 2028, "not-a-date") === null,
    "an unreadable date returns null",
  );
  ok(
    careerRegimeIntensity("investment_banking", 2028, T("2026-03-01"), []) === null,
    "an empty definition set returns null rather than zero",
  );
  ok(
    careerRegimeIntensity("investment_banking", 2028, T("2026-03-01"), defaultCareerRegimes(2031)) ===
      null,
    "definitions for the wrong cohort do not silently apply to this one",
  );
}

// ========================================================= bounded 0..1
{
  let min = 1;
  let max = 0;
  let samples = 0;
  for (const path of CAREER_PATHS_WITH_PRIORS) {
    for (const cohort of [2027, 2028, 2029]) {
      for (let d = new Date("2023-06-01T12:00:00Z"); d < new Date("2031-06-01T12:00:00Z"); ) {
        const r = careerRegimeIntensity(path, cohort, d.toISOString());
        if (r) {
          ok(
            Number.isFinite(r.intensity) && r.intensity >= 0 && r.intensity <= 1,
            `intensity is bounded 0..1 (${path}/${cohort} at ${d.toISOString()}: ${r.intensity})`,
          );
          // One assertion per sample would drown the count; fold the sweep instead.
          checks--;
          min = Math.min(min, r.intensity);
          max = Math.max(max, r.intensity);
          samples++;
        }
        d = new Date(d.getTime() + 5 * 86400e3);
      }
    }
  }
  checks++; // the sweep above, counted once
  ok(samples > 1000, `the sweep actually ran (${samples} samples)`);
  ok(min === 0, `some weeks are genuinely quiet, got a minimum of ${min}`);
  ok(max <= 1 && max > 0.9, `overlapping windows saturate toward 1 without exceeding it, got ${max}`);
}

// ============================================== institution-specific overrides
{
  const cornellOnly = defaultCareerRegimes(2028, { institution: "cornell" });
  ok(
    careerRegimeIntensity("investment_banking", 2028, T("2026-03-01"), cornellOnly) === null,
    "a Cornell-specific timeline is not applied to an unnamed school",
  );
  const withSchool = careerRegimeIntensity("investment_banking", 2028, T("2026-03-01"), cornellOnly, {
    institution: "cornell",
  });
  ok(withSchool !== null && withSchool.intensity > 0.85, "naming the school applies its timeline");
}

// ==================================================== the dominant regime
{
  const at = T("2026-10-01"); // junior fall for the class of 2028
  const d = dominantCareerRegime(["consulting", "investment_banking"], 2028, at);
  ok(d !== null && d.career_path === "consulting", `junior fall belongs to consulting, got ${d?.career_path}`);
  ok(dominantCareerRegime(["law", "medicine"], 2028, at) === null, "no timeline, no dominant regime");
}

// =========================================================== overlap priors
{
  ok(regimeOverlapIsComplete(), "every academic regime carries a career-overlap prior");
  ok(
    REGIME_CAREER_OVERLAP.prelims > REGIME_CAREER_OVERLAP.finals,
    "case prep on top of prelims collides worse than finals, when recruiting is largely over",
  );
  ok(
    REGIME_CAREER_OVERLAP.break > 0.5,
    "recruiting does not observe the academic calendar; winter break is a working window",
  );
}

// ================================================ EXPLICIT INTEREST ONLY
{
  ok(
    EXPLICIT_INTEREST_SOURCES.length === 5 &&
      EXPLICIT_INTEREST_SOURCES.every((s) =>
        ["stated_preference", "application", "saved_opportunity", "joined_program", "declined"].includes(s),
      ),
    "the only interest sources are four affirmative acts and an explicit decline",
  );

  const at = T("2026-03-01");
  const none = explicitInterest([], "investment_banking", at);
  ok(none.status === "unstated" && none.value === 0, "silence is unstated, worth zero");
  ok(none.confidence === 0, "and carries zero confidence, not a confident zero");
  ok(/do not infer/i.test(none.reason), "the reason states the rule rather than implying a preference");

  const applied = explicitInterest(
    [{ career_path: "investment_banking", source: "application", stated_at: T("2025-09-01") }],
    "investment_banking",
    at,
  );
  const saved = explicitInterest(
    [{ career_path: "investment_banking", source: "saved_opportunity", stated_at: T("2025-09-01") }],
    "investment_banking",
    at,
  );
  ok(applied.value > saved.value, `an application outweighs a bookmark: ${applied.value} vs ${saved.value}`);
  ok(applied.confidence > saved.confidence, "and is believed more");

  const fresh = explicitInterest(
    [{ career_path: "investment_banking", source: "stated_preference", stated_at: T("2026-02-01") }],
    "investment_banking",
    at,
  );
  const stale = explicitInterest(
    [{ career_path: "investment_banking", source: "stated_preference", stated_at: T("2023-02-01") }],
    "investment_banking",
    at,
  );
  ok(fresh.value > stale.value, `a fresh statement outweighs a three-year-old one: ${fresh.value} vs ${stale.value}`);
  ok(stale.value > 0, "but a real past statement never decays to nothing");

  const future = explicitInterest(
    [{ career_path: "investment_banking", source: "application", stated_at: T("2027-01-01") }],
    "investment_banking",
    at,
  );
  ok(future.status === "unstated", "a signal given later than the as-of date was not knowable then");

  const withdrawn = explicitInterest(
    [
      {
        career_path: "investment_banking",
        source: "application",
        stated_at: T("2025-09-01"),
        withdrawn_at: T("2026-01-01"),
      },
    ],
    "investment_banking",
    at,
  );
  ok(withdrawn.status === "unstated", "a withdrawn signal stops counting from its own date");

  const declined = explicitInterest(
    [
      { career_path: "investment_banking", source: "stated_preference", stated_at: T("2025-09-01") },
      { career_path: "investment_banking", source: "declined", stated_at: T("2026-01-01") },
    ],
    "investment_banking",
    at,
  );
  ok(declined.status === "declined" && declined.value === 0, "an explicit decline overrides everything else");

  const other = explicitInterest(
    [{ career_path: "consulting", source: "application", stated_at: T("2025-09-01") }],
    "investment_banking",
    at,
  );
  ok(other.status === "unstated", "interest in one path says nothing about another");
}

// ================================================ fixtures for the exposure model
const at = T("2026-03-01");
const ibRegime = {
  regime_id: "ib_soph_spring_2028",
  label: "investment banking sophomore-spring recruiting",
  scope: "career",
  career_path: "investment_banking",
  intensity: careerRegimeIntensity("investment_banking", 2028, at).intensity,
  intensity_confidence: 0.45,
  target_class_years: ["sophomore"],
  regime_type: "applications_open",
};
const finalsRegime = {
  regime_id: "finals_sp26",
  label: "spring finals",
  scope: "universal",
  career_path: null,
  intensity: 0.9,
  intensity_confidence: 0.9,
  regime_type: "academic",
};

const person = (id, cohort, interests = [], enrolled = true) => ({
  person_id: id,
  graduation_cohort: cohort,
  enrolled,
  interests,
});
const statedIB = [
  { career_path: "investment_banking", source: "application", stated_at: T("2025-09-01") },
];

// ===================================== THE PRIVACY RULE, AS AN ASSERTION
{
  // Two sophomores, identical in every respect the model can see, except that
  // one of them told us. There is nothing else in PersonContext to tell them
  // apart with, and that is the point.
  const told = computeExposure(person("p_told", 2028, statedIB), ibRegime, at);
  const silent = computeExposure(person("p_silent", 2028, []), ibRegime, at);

  ok(told.exposure > 0.6, `a sophomore who applied is squarely exposed, got ${told.exposure}`);
  ok(silent.exposure < 0.001, `a sophomore who said nothing is not, got ${silent.exposure}`);
  ok(silent.interest_status === "unstated", "and the reading says why: unstated");
  ok(silent.confidence === 0, "with zero confidence, so nothing downstream can treat it as a finding");
  ok(
    /do not guess|do not infer/i.test(silent.reason),
    `the reason refuses out loud, got: ${silent.reason}`,
  );
  ok(silent.known === true, "this is a known zero — we know we were not told, which is itself a fact");

  // The decline case is different again and must not be confused with silence.
  const declined = computeExposure(
    person("p_no", 2028, [
      { career_path: "investment_banking", source: "declined", stated_at: T("2025-09-01") },
    ]),
    ibRegime,
    at,
  );
  ok(declined.exposure === 0 && declined.interest_status === "declined", "an explicit no is zero and says so");

  // And the structural half of the rule: there is nowhere to put behaviour.
  const fields = Object.keys(person("p", 2028, statedIB));
  ok(
    !fields.some((f) => /attend|engage|behav|infer|predict|peer|similar|graph/i.test(f)),
    `PersonContext has no field for behavioural or inferred interest, got ${fields.join(", ")}`,
  );
}

// ============================== a universal shock lands on nearly everyone
{
  const cohorts = [2026, 2027, 2028, 2029];
  const people = cohorts.map((c) => person(`p_${c}`, c, []));
  const finals = people.map((p) => computeExposure(p, finalsRegime, at));
  ok(
    finals.every((r) => r.exposure > 0.8),
    `finals reaches every enrolled student regardless of what they have stated: ${finals.map((r) => r.exposure).join(", ")}`,
  );
  ok(
    finals.every((r) => r.interest_status === "stated" && r.known),
    "nobody opts into finals, so the interest gate does not apply to it",
  );

  // The same four people against a career shock: selective by construction.
  const career = people.map((p) => computeExposure(p, ibRegime, at));
  ok(
    career.every((r) => r.exposure < 0.001),
    `a career regime reaches none of them, because none of them said anything: ${career.map((r) => r.exposure).join(", ")}`,
  );

  const ibSoph = computeExposure(person("p_soph", 2028, statedIB), ibRegime, at);
  const ibJunior = computeExposure(person("p_junior", 2027, statedIB), ibRegime, at);
  const ibFresh = computeExposure(person("p_fresh", 2029, statedIB), ibRegime, at);
  ok(
    ibSoph.exposure > ibJunior.exposure && ibJunior.exposure > ibFresh.exposure,
    `lifecycle relevance orders them sophomore > junior > freshman: ${ibSoph.exposure}, ${ibJunior.exposure}, ${ibFresh.exposure}`,
  );
  ok(ibFresh.exposure < 0.15, `a freshman two years out is barely in it, got ${ibFresh.exposure}`);
  ok(
    computeExposure(person("p_alum", 2024, statedIB), ibRegime, at).exposure === 0,
    "an alum is out of an undergraduate recruiting window entirely",
  );
  ok(
    computeExposure(person("p_left", 2028, statedIB, false), finalsRegime, at).exposure === 0,
    "somebody not enrolled is not in finals",
  );
}

// ========================================= unknown is not the same as zero
{
  const unknownEnrolment = computeExposure(
    { person_id: "p_?", graduation_cohort: 2028, enrolled: null, interests: statedIB },
    ibRegime,
    at,
  );
  ok(unknownEnrolment.exposure === 0, "an unknown term takes the product to zero");
  ok(unknownEnrolment.known === false, "but it is marked unknown rather than unaffected");
  ok(/cannot say/i.test(unknownEnrolment.reason), "and the reason says so in those words");
  ok(unknownEnrolment.confidence === 0, "with no confidence attached");

  ok(
    computeExposure(person("p", 2028, statedIB), { ...ibRegime, intensity: null }, at) === null,
    "a regime whose intensity could not be established yields null, not zero",
  );
  ok(
    computeExposure(person("p", 2028, statedIB), ibRegime, "not-a-date") === null,
    "an unreadable as-of yields null",
  );

  // The components are named individually, so the zero can be argued with.
  const s = computeExposure(person("p_silent", 2028, []), ibRegime, at);
  ok(s.components.length === 4, "all four terms of the product are reported");
  ok(
    ["regime_intensity", "eligibility", "explicit_interest", "lifecycle_relevance"].every((n) =>
      s.components.some((c) => c.name === n),
    ),
    "and they are the four the formula names",
  );
  ok(s.components.every((c) => c.basis && c.basis.length > 10), "each one says why it is what it is");
}

// ================================ a career regime cannot masquerade as universal
{
  throws(
    () => computeExposure(person("p", 2028, statedIB), { ...ibRegime, scope: "universal" }, at),
    /universal/i,
    "a regime with a career path may not declare itself universal and skip the interest gate",
  );
  throws(
    () =>
      computeExposure(person("p", 2028, statedIB), { ...finalsRegime, scope: "career" }, at),
    /career_path/i,
    "a career-scoped regime must name the path its interest gate checks against",
  );
}

// ================================================ propagation: FIRST ORDER ONLY
{
  const shock = {
    shock_id: "shk_ib_accel_2026",
    kind: "career",
    label: "investment banking accelerated recruiting opens",
    occurred_at: at,
    observed_at: at,
    magnitude: 0.9,
    scope: "career",
    career_path: "investment_banking",
    target_class_years: ["sophomore"],
    source: "stated prior — published recruiting calendar",
    confidence: 0.45,
  };

  const out = propagate(shock, [
    { entity_type: "person", entity_id: "p_told", person: person("p_told", 2028, statedIB) },
    { entity_type: "person", entity_id: "p_silent", person: person("p_silent", 2028, []) },
    { entity_type: "person", entity_id: "p_premed", person: person("p_premed", 2029, []) },
    {
      entity_type: "club",
      entity_id: "c_finance",
      club: { club_id: "c_finance", declared_career_focus: ["investment_banking"] },
    },
    {
      entity_type: "club",
      entity_id: "c_chess",
      club: { club_id: "c_chess", declared_career_focus: [] },
    },
  ]);

  ok(out.order === 1, "the order is literally one and is reported as such");
  ok(out.exposures.length === 5, "one row per entity");
  ok(
    out.exposures.every(
      (e) => e.shock_id && e.entity_type && e.entity_id && e.computed_at && e.model_version && typeof e.exposure === "number" && e.reason,
    ),
    "every row carries the full EntityExposure shape: shock, entity, exposure, reason, computed_at, model_version",
  );
  ok(
    out.exposures.every((e) => e.model_version === EXPOSURE_MODEL_VERSION),
    "and a model version that names what it is",
  );

  const by = Object.fromEntries(out.exposures.map((e) => [e.entity_id, e]));
  ok(by.p_told.exposure > 0.5, `the sophomore who applied is exposed, got ${by.p_told.exposure}`);
  ok(by.p_silent.exposure < 0.001, "the one who said nothing is not");
  ok(by.p_premed.exposure < 0.001, "and neither is the freshman who named a different path");
  ok(by.c_finance.exposure > 0.5, "a club whose officers declared a finance focus is first-order exposed");
  ok(by.c_chess.exposure === 0, "a chess club is not");
  ok(
    /second order/i.test(by.c_chess.reason),
    `and the reason names the channel it is deliberately not walking: ${by.c_chess.reason}`,
  );

  ok(out.not_estimated.length >= 4, "the unestimated effects are listed, not summarised away");
  ok(
    out.not_estimated.some((s) => /second order/i.test(s)) &&
      out.not_estimated.some((s) => /third order/i.test(s)),
    "second and third order are each named",
  );
  ok(
    out.not_estimated.some((s) => /causal/i.test(s)),
    "and the absence of causal identification is stated, not implied",
  );
  ok(/first-order only/i.test(out.reading), `the reading says it out loud: ${out.reading}`);

  // A universal shock reaches every club, which is the contrast that makes the
  // career case's selectivity meaningful rather than an artefact.
  const universal = propagate(
    {
      shock_id: "shk_finals",
      kind: "academic",
      label: "finals week",
      occurred_at: at,
      observed_at: at,
      magnitude: 0.9,
      scope: "universal",
      source: "academic calendar",
      confidence: 0.9,
    },
    [
      { entity_type: "person", entity_id: "p_silent", person: person("p_silent", 2028, []) },
      {
        entity_type: "club",
        entity_id: "c_chess",
        club: { club_id: "c_chess", declared_career_focus: [] },
      },
    ],
  );
  ok(
    universal.exposures.every((e) => e.exposure > 0.8),
    `finals reaches everybody, stated interests or not: ${universal.exposures.map((e) => e.exposure).join(", ")}`,
  );
  ok(universal.order === 1, "still first order, and still says so");
}

// ============================================================ the factors
{
  const campus = computeFactor(
    careerRecruitingIntensityFactor,
    "cornell",
    { career_path: "investment_banking", graduation_cohort: 2028 },
    at,
  );
  ok(campus.status === "ok", `the campus factor computes, got ${campus.status}`);
  ok(campus.value > 0.85, `and reports the sophomore-spring peak, got ${campus.value}`);
  ok(campus.entityType === "campus", "it is campus-scoped: a cohort's calendar is a fact about the world");
  ok(campus.drivers.length >= 2, "with its windows named");
  ok(/prior/i.test(campus.reading), "and a reading that admits the dates are a prior");

  const unknown = computeFactor(
    careerRecruitingIntensityFactor,
    "cornell",
    { career_path: "medicine", graduation_cohort: 2028 },
    at,
  );
  ok(unknown.status === "not_computable" && unknown.value === null, "an unmodelled path refuses rather than zeroes");
  ok(/gap, not a quiet week/i.test(unknown.reading), `and explains the difference: ${unknown.reading}`);

  const missing = computeFactor(careerRecruitingIntensityFactor, "cornell", { career_path: "consulting" }, at);
  ok(missing.status === "missing_input", "a missing declared input is an error, not a silent zero");

  // The person-scoped factor and the privacy rules defineFactor enforces.
  ok(recruitingExposureFactor.entity === "person", "recruiting_exposure is person-scoped");
  ok(recruitingExposureFactor.privacy === "person_private", "and person-private");
  ok(
    recruitingExposureFactor.permittedUses.includes("person_self"),
    "the subject sees it first, or it is not computed",
  );
  ok(
    !recruitingExposureFactor.permittedUses.includes("employer_evidence") &&
      !recruitingExposureFactor.permittedUses.includes("sponsor_ranking"),
    "it is never employer or sponsor evidence — docs/10 §6, docs/11 §7",
  );
  ok(
    !mayUse(recruitingExposureFactor, "employer_evidence").allowed,
    "and mayUse refuses that at the gate, not at the display layer",
  );
  ok(typeof recruitingExposureFactor.explain === "function", "and it can be explained to the person it is about");

  const told = computeFactor(
    recruitingExposureFactor,
    "p_told",
    { person: person("p_told", 2028, statedIB), regime: ibRegime },
    at,
  );
  ok(told.status === "ok" && told.value > 0.6, `a stated interest computes, got ${told.status}/${told.value}`);
  ok(told.drivers.length === 4, "with all four components as drivers");

  const silent = computeFactor(
    recruitingExposureFactor,
    "p_silent",
    { person: person("p_silent", 2028, []), regime: ibRegime },
    at,
  );
  ok(
    silent.status === "insufficient_data" && silent.value === null,
    `no stated interest, no number — the registry's own refusal rule enforces the privacy rule, got ${silent.status}`,
  );

  const finalsForSilent = computeFactor(
    recruitingExposureFactor,
    "p_silent",
    { person: person("p_silent", 2028, []), regime: finalsRegime },
    at,
  );
  ok(
    finalsForSilent.status === "ok" && finalsForSilent.value > 0.8,
    "a universal regime still computes for somebody who has stated nothing, because nothing is being inferred about them",
  );

  ok(
    /not been told|do not/i.test(recruitingExposureFactor.explain(null, null)),
    "the null explanation is written to the person, and tells them how to change it",
  );
}

console.log(`${checks} career-regime and exposure assertions passed.`);
