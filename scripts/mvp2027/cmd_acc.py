import csv, numpy as np
from collections import defaultdict
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8')) if r['position']=='1']
g=lambda k: np.array([float(r[k] or 0) for r in rows])
acc=g('accuracy')*100; sf=g('shots_fired'); sh=g('shots_hit'); sho=g('shots_hit_opponent'); sp=g('sp_earned'); nd=g('nukes_detonated'); na=g('nukes_activated'); mins=g('mins'); score=g('score'); win=g('win')
c=lambda a,b: np.corrcoef(a,b)[0,1]
print('corr accuracy vs: sp_earned %.2f  sp/min %.2f  nukes_det %.2f  nukes/min %.2f  score %.2f  shots_fired %.2f'%(c(acc,sp),c(acc,sp/mins),c(acc,nd),c(acc,nd/mins),c(acc,score),c(acc,sf)))
print('corr hits_opp vs sp %.2f, nukes %.2f'%(c(sho,sp),c(sho,nd)))
# partial: accuracy -> nukes/min controlling shots fired/min
X=np.c_[np.ones(len(rows)),(acc-acc.mean())/acc.std(),(sf/mins-(sf/mins).mean())/(sf/mins).std()]
for name,y in [('nukes/min',nd/mins),('sp/min',sp/mins),('score/min',score/mins)]:
    b=np.linalg.lstsq(X,(y-y.mean())/y.std(),rcond=None)[0]; print(f'std effect on {name}: accuracy {b[1]:.2f}, shots fired/min {b[2]:.2f}')
# accuracy quintiles
qs=np.percentile(acc,[20,40,60,80])
bins=np.digitize(acc,qs)
print('accuracy quintile: acc range, nukes det, sp, score, win%')
for i in range(5):
    m=bins==i
    print(f'  Q{i+1} {acc[m].min():.0f}-{acc[m].max():.0f}%  nukes {nd[m].mean():.2f}  sp {sp[m].mean():.1f}  score {score[m].mean():.0f}  win {100*win[m].mean():.1f}%  shots {sf[m].mean():.0f}')
# within-game: commander with higher accuracy wins?
games=defaultdict(list)
for r in rows: games[r['game_id']].append(r)
t=ok=0
for gm in games.values():
    if len(gm)!=2: continue
    a,b=gm; 
    if a['accuracy']==b['accuracy']: continue
    t+=1; ok+=(float(a['accuracy'])>float(b['accuracy']))==(a['win']=='1')
print('higher-accuracy commander won %.1f%% of %d games'%(100*ok/t,t))
# player-level: accuracy vs career nukes/sp
by=defaultdict(list)
for r in rows:
    if r['player_id']: by[r['player_id']].append(r)
P=[p for p in by if len(by[p])>=20]
pa=np.array([np.mean([float(r['accuracy']) for r in by[p]]) for p in P]); pn=np.array([np.mean([float(r['nukes_detonated']) for r in by[p]]) for p in P]); ps=np.array([np.mean([float(r['sp_earned'] or 0) for r in by[p]]) for p in P])
print('player-level (%d players >=20 cmd games): career accuracy vs nukes %.2f, vs sp %.2f'%(len(P),c(pa,pn),c(pa,ps)))
