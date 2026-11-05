from simpos import run
M='shots_hit_opponent_medic'
run('1',{'C1+C8':{M:-0.5,'score_above_9000':1,'score_above_10000':-1},'C1+C8+acc80':{M:-0.5,'score_above_9000':1,'score_above_10000':-1}},situations=True)
import csv,numpy as np
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8')) if r['position']=='1']
s=np.array([float(r['score']) for r in rows]); print('pct>10000 %.1f  pct>9000 %.1f  median score %.0f'%(100*(s>10000).mean(),100*(s>9000).mean(),np.median(s)))
