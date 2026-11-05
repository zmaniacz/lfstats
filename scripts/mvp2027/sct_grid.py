import csv, numpy as np, itertools
from collections import defaultdict
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8')) if r['position']=='3']
g=lambda k: np.array([float(r[k] or 0) for r in rows])
mvp=g('mvp_points'); accp=np.round(g('accuracy')*100); score=g('score'); h3=g('shots_hit_opponent_3hit'); rs=g('reset_opponent'); win=g('win'); med=g('shots_hit_opponent_medic')
outcome=np.array([r['outcome'] for r in rows]); comp=np.array([r['is_comp'] for r in rows])
base=mvp-0.1*accp-np.maximum(0,score-6000)/1000-0.2*h3
# cross-team scout pairs
gt=defaultdict(lambda: defaultdict(list))
for i,r in enumerate(rows): gt[r['game_id']][r['team_id']].append(i)
PA=[];PB=[]
for t in gt.values():
    if len(t)!=2: continue
    a,b=list(t.values())
    for x in a:
        for y in b: PA.append(x); PB.append(y)
PA=np.array(PA);PB=np.array(PB)
by=defaultdict(list)
for i,r in enumerate(rows):
    if r['player_id'] and r['rating']: by[r['player_id']].append(i)
P=[p for p in by if len(by[p])>=20]; rating=np.array([float(rows[by[p][0]]['rating']) for p in P])
def evaluate(v):
    d=v[PA]-v[PB]; m=d!=0; wp=((d[m]>0)==(win[PA][m]==1)).mean()
    pm=np.array([v[by[p]].mean() for p in P]); return wp,np.corrcoef(pm,rating)[0,1],np.percentile(v,[10,25,50,75,90])
def build(aw,ab,sw,st,hw,rw): return base+aw*np.maximum(0,accp-ab)+sw*np.maximum(0,score-st)/1000+hw*h3+rw*rs
if __name__=='__main__':
    print('score pct >6000: %.1f, median score %.0f'%(100*(score>6000).mean(),np.median(score)))
    print('current',evaluate(mvp)); print('S1',evaluate(mvp+0.1*rs))
    res=[]
    for aw,ab,sw,st,hw,rw in itertools.product([0,0.05,0.1,0.15],[0,40,50,60],[0,1,1.5,2],[3000,4000,5000,6000],[0.1,0.15,0.2,0.25,0.3],[0,0.1,0.15,0.2]):
        if aw==0 and ab: continue
        if aw==0.1 and ab: continue
        wp,rr,q=evaluate(build(aw,ab,sw,st,hw,rw)); res.append((aw,ab,sw,st,hw,rw,wp,rr,*q))
    res=np.array(res)
    ok=res[(res[:,10]>=14.5)&(res[:,10]<=15.5)&(res[:,9]>=9.5)&(res[:,9]<=11)&(res[:,11]>=19)&(res[:,11]<=21)]
    print('candidates',len(ok))
    print('acc_w acc_b sb_w sb_thr 3hit reset   wp     r     P10   Q1    med   Q3    P90')
    for r in ok[np.argsort(-(ok[:,6]+ok[:,7]))][:25]: print(' '.join(f'{x:5g}' if i<6 else f'{x:5.3f}' for i,x in enumerate(r)))
