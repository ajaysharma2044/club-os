"""Versioned club-level RSVP attendance baseline, never a portable person score."""
import math
from .store import Invalid, utc

MODEL = {
    'name': 'rsvp_attendance_beta_binomial', 'version': '1.0.0',
    'feature_version': 'closed_event_rsvp_cohort_v1',
    'target': 'attendees among current affirmative RSVPs; excludes walk-ins',
    'purpose': 'club_operations', 'prior_alpha': 1.0, 'prior_beta': 1.0,
    'assumptions': ['Exchangeable RSVP outcomes within this club',
                    'Stable conversion probability over the selected history',
                    'Explicit attendance adjudication; missing labels excluded'],
    'limitations': ['Not hierarchical across clubs', 'Not a causal model',
                    'Interval is model-based, not a validated coverage guarantee'],
}


def predictive(n, alpha, beta):
    if type(n) is not int or not 0 <= n <= 10000:
        raise Invalid('RSVP count must be an integer between 0 and 10000')
    if not all(math.isfinite(v) and v > 0 for v in (alpha, beta)):
        raise Invalid('positive finite prior parameters required')
    log_beta = lambda a, b: math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)
    logs = [math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
            + log_beta(k + alpha, n - k + beta) - log_beta(alpha, beta) for k in range(n + 1)]
    maximum = max(logs)
    weights = [math.exp(x - maximum) for x in logs]
    total = sum(weights)
    probabilities = [w / total for w in weights]
    def quantile(q):
        cumulative = 0.0
        for k, probability in enumerate(probabilities):
            cumulative += probability
            if cumulative >= q:
                return k
        return n
    return {'expected': n * alpha / (alpha + beta),
            'interval_90': [quantile(.05), quantile(.95)],
            'probabilities': probabilities}


def training_data(store, p, cutoff):
    rows = store.snapshot(p, cutoff, cutoff)
    events = [r for r in rows if r['kind'] == 'event' and r['payload']['status'] == 'closed'
              and r['payload']['starts_at'] < cutoff]
    samples, missing, lineage = [], 0, set()
    for event in events:
        # Who had RSVP'd before start, using only information known before start?
        start = event['payload']['starts_at']
        cohort = [r for r in store.snapshot(p, start, start) if r['kind'] == 'rsvp'
                  and r['object_id'] == event['object_id'] and r['payload']['status'] == 'yes']
        labels = {r['subject']: r for r in rows if r['kind'] == 'attendance' and r['object_id'] == event['object_id']}
        lineage.add(event['id'])
        for rsvp in cohort:
            lineage.add(rsvp['id'])
            label = labels.get(rsvp['subject'])
            if label is None:
                missing += 1
                continue
            lineage.add(label['id'])
            samples.append(int(label['payload']['status'] == 'present'))
    return samples, missing, lineage


def forecast(store, p, event_id, cutoff=None, persist=True):
    cutoff = utc(cutoff or store.clock())
    if cutoff > utc(store.clock()):
        raise Invalid('decision cutoff cannot be in the future')
    rows = store.snapshot(p, cutoff, cutoff)
    events = [r for r in rows if r['kind'] == 'event' and r['object_id'] == event_id]
    if len(events) != 1 or events[0]['payload']['status'] != 'published':
        raise Invalid('forecast requires one published event')
    event = events[0]
    if event['payload']['starts_at'] <= cutoff:
        raise Invalid('forecast must precede event start')
    registrations = [r for r in rows if r['kind'] == 'rsvp' and r['object_id'] == event_id
                     and r['payload']['status'] == 'yes']
    samples, missing, lineage = training_data(store, p, cutoff)
    a, b = MODEL['prior_alpha'] + sum(samples), MODEL['prior_beta'] + len(samples) - sum(samples)
    distribution = predictive(len(registrations), a, b)
    lineage.update(r['id'] for r in registrations)
    lineage.add(event['id'])
    result = {
        'model': MODEL, 'event_id': event_id, 'decision_at': cutoff,
        'features': {'current_rsvps': len(registrations), 'labeled_history': len(samples),
                     'present_history': sum(samples), 'missing_labels': missing},
        'posterior': {'alpha': a, 'beta': b, 'mean_conversion': a / (a + b)},
        'forecast': {k: distribution[k] for k in ('expected', 'interval_90')},
        'status': 'prior_only' if not samples else 'baseline_unvalidated',
        'lineage': sorted(lineage),
    }
    return store.save_prediction(p, result) if persist else result


def evaluate(store, p, ident, outcome_at=None):
    prediction = store.prediction(p, ident)
    cutoff = utc(outcome_at or store.clock())
    if cutoff <= prediction['decision_at']:
        raise Invalid('outcome cutoff must follow decision')
    rows = store.snapshot(p, cutoff, cutoff)
    event_id = prediction['event_id']
    if not any(r['kind'] == 'event' and r['object_id'] == event_id and r['payload']['status'] == 'closed' for r in rows):
        raise Invalid('event must be closed before evaluation')
    # Reconstruct the exact frozen prediction cohort, not today's registrations.
    historical = {r['id']: r for r in store.history(p, prediction['decision_at'], prediction['decision_at'])}
    cohort = [historical[i]['subject'] for i in prediction['lineage'] if i in historical
              and historical[i]['kind'] == 'rsvp' and historical[i]['object_id'] == event_id]
    labels = {r['subject']: r for r in rows if r['kind'] == 'attendance' and r['object_id'] == event_id}
    missing = [subject for subject in cohort if subject not in labels]
    if missing:
        return {'status': 'incomplete_labels', 'missing_count': len(missing)}
    outcomes = [int(labels[s]['payload']['status'] == 'present') for s in cohort]
    if not outcomes:
        return {'status': 'empty_cohort'}
    probability = prediction['posterior']['mean_conversion']
    actual = sum(outcomes)
    low, high = prediction['forecast']['interval_90']
    return {'status': 'evaluated', 'prediction_id': ident, 'outcome_at': cutoff,
            'actual': actual, 'n': len(outcomes),
            'absolute_error': abs(actual - prediction['forecast']['expected']),
            'brier': sum((probability - y) ** 2 for y in outcomes) / len(outcomes),
            'log_loss': -sum(y * math.log(probability) + (1-y) * math.log1p(-probability) for y in outcomes) / len(outcomes),
            'interval_covered': low <= actual <= high,
            'outcome_lineage': [labels[s]['id'] for s in cohort]}
