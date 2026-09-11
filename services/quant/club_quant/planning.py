"""Reproducible project-duration scenarios using declared estimates, not person scores."""
import math
import random
from .store import Invalid


def simulate(tasks, deadline_days, draws=2000, seed=0):
    """Precedence-only schedule; unlimited parallel capacity, independent durations."""
    if type(draws) is not int or not 100 <= draws <= 20000:
        raise Invalid('draws must be an integer between 100 and 20000')
    if type(seed) is not int:
        raise Invalid('seed must be integer')
    if type(deadline_days) not in (int, float) or not math.isfinite(deadline_days) or deadline_days < 0:
        raise Invalid('deadline_days must be finite and nonnegative')
    if not isinstance(tasks, list) or not 1 <= len(tasks) <= 200:
        raise Invalid('provide between 1 and 200 tasks')
    graph = {}
    for task in tasks:
        if not isinstance(task, dict) or set(task) != {'id','dependencies','optimistic','likely','pessimistic'}:
            raise Invalid('invalid task schema')
        ident = task['id']
        if not isinstance(ident,str) or not ident or ident in graph:
            raise Invalid('task IDs must be unique strings')
        deps = task['dependencies']
        if not isinstance(deps,list) or any(not isinstance(d,str) for d in deps) or len(set(deps)) != len(deps):
            raise Invalid('dependencies must be distinct task IDs')
        values = [task[k] for k in ('optimistic','likely','pessimistic')]
        if any(type(v) not in (int,float) or not math.isfinite(v) for v in values) or not 0 <= values[0] <= values[1] <= values[2] <= 3650:
            raise Invalid('duration estimates must satisfy 0 <= optimistic <= likely <= pessimistic <= 3650')
        graph[ident] = task
    if any(d not in graph for task in tasks for d in task['dependencies']):
        raise Invalid('unknown dependency')
    ordered=[]
    remaining=set(graph)
    while remaining:
        ready=sorted(i for i in remaining if not (set(graph[i]['dependencies']) & remaining))
        if not ready:
            raise Invalid('dependency cycle')
        ordered.extend(ready)
        remaining.difference_update(ready)
    rng=random.Random(seed)
    durations=[]
    for _ in range(draws):
        finish={}
        for ident in ordered:
            task=graph[ident]
            duration=rng.triangular(task['optimistic'],task['pessimistic'],task['likely'])
            finish[ident]=max((finish[d] for d in task['dependencies']),default=0)+duration
        durations.append(max(finish.values()))
    durations.sort()
    return {'model':'declared_duration_dag_v1','seed':seed,'draws':draws,
            'mean_days':sum(durations)/draws,
            'interval_90_days':[durations[int(.05*(draws-1))],durations[int(.95*(draws-1))]],
            'probability_by_deadline':sum(v <= deadline_days for v in durations)/draws,
            'assumptions':['User-declared triangular duration estimates',
                           'Independent task durations', 'Unlimited parallel capacity',
                           'Elapsed days; no working-hours calendar'],
            'status':'scenario_not_empirically_calibrated'}
