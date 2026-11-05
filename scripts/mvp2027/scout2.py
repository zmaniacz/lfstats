import csv, numpy as np
from collections import defaultdict
rows=[r for r in csv.DictReader(open('sc.csv')) if r['position']=='3']
F=lambda r,k: float(r[k]) if r[k] else 0.0
def derived(r):
    m=F(r,'mins')
    return {
     'accuracy':F(r,'accuracy')*100,
     'hits_other_per_min':(F(r,'shots_hit_opponent')-F(r,'shots_hit_opponent_3hit')-F(r,'shots_hit_opponent_medic'))/m,
     '3hit_per_min':F(r,'shots_hit_opponent_3hit')/m,
     'medic_hits_per_min':F(r,'shots_hit_opponent_medic')/m,
     'resets_per_min':F(r,'reset_opponent')/m,
     'elims_per_min':F(r,'eliminated_opponent')/m,
     'times_reset_per_min':F(r,'times_reset')/m,
     'times_missiled_per_min':F(r,'times_hit_by_missile')/m,
     'shots_fired_per_min':F(r,'shots_fired')/m,
     'team_hits_per_min':F(r,'shots_hit_team')/m,
    }
games=defaultdict(lambda: defaultdict(list))
for r in rows: games[r['game_id']][r['team_id']].append((r,derived(r)))
keys=list(derived(rows[0]).keys())
X=[];y=[]
for g,teams in games.items():
    if len(teams)!=2: continue
    (ta,a),(tb,b)=list(teams.items())
    if len(a)!=2 or len(b)!=2: continue
    xa=np.array([[d[k] for k in keys] for _,d in a]).sum(0)
    xb=np.array([[d[k] for k in keys] for _,d in b]).sum(0)
    X.append(xa-xb); y.append(int(a[0][0]['win']))
X=np.array(X);y=np.array(y)
X=(X-X.mean(0))/X.std(0)
def logit(X,y):
    Xb=np.c_[np.ones(len(X)),X]; w=np.zeros(Xb.shape[1])
    for _ in range(50):
        p=1/(1+np.exp(-Xb@w)); W=p*(1-p)
        H=Xb.T@(Xb*W[:,None]); w+=np.linalg.solve(H,Xb.T@(y-p))
    p=1/(1+np.exp(-Xb@w)); se=np.sqrt(np.diag(np.linalg.inv(Xb.T@(Xb*(p*(1-p))[:,None]))))
    acc=((p>.5)==y).mean(); return w,se,acc
print('games',len(y))
w,se,acc=logit(X,y)
print('multivariate (std coef, z), acc=%.3f'%acc)
for k,c,s in sorted(zip(keys,w[1:],se[1:]),key=lambda t:-abs(t[1])): print(f"  {k:26s} {c:7.3f} z={c/s:6.1f}")
print('univariate acc:')
for i,k in enumerate(keys):
    w,se,acc=logit(X[:,[i]],y); print(f"  {k:26s} coef {w[1]:6.3f} acc {acc:.3f}")
