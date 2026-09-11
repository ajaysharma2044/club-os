import unittest
from club_quant.planning import simulate
from club_quant.store import Invalid

class PlanningTests(unittest.TestCase):
    def task(self,id,dependencies,days):
        return dict(id=id,dependencies=dependencies,optimistic=days,likely=days,pessimistic=days)

    def test_serial_and_parallel_dependencies(self):
        tasks=[self.task('a',[],2),self.task('b',['a'],3),self.task('c',['a'],8)]
        result=simulate(tasks,10,100)
        self.assertEqual(result['mean_days'],10)
        self.assertEqual(result['interval_90_days'],[10,10])
        self.assertEqual(result['probability_by_deadline'],1)
        self.assertEqual(simulate(tasks,9,100)['probability_by_deadline'],0)

    def test_cycles_and_missing_dependencies(self):
        for tasks in [[self.task('a',['b'],1)], [self.task('a',['b'],1),self.task('b',['a'],1)]]:
            with self.assertRaises(Invalid): simulate(tasks,2,100)

    def test_seed_reproducibility(self):
        tasks=[dict(id='a',dependencies=[],optimistic=1,likely=2,pessimistic=5)]
        self.assertEqual(simulate(tasks,3,100,12),simulate(tasks,3,100,12))
