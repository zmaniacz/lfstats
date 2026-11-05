import csv, numpy as np, itertools
from collections import defaultdict
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8')) if r['position']=='1']
g=lambda k: np.array([float(r[k] or 0) for r in rows])
mvp=g('mvp_points'); accp=np.round(g('accuracy')*100); score=g('score'); med=g('shots_hit_opponent_medic'); win=g('win')
cur_acc=accp*0.1; cur_sb=np.maximum(0,score-10000)/1000
base=mvp-cur_acc-cur_sb-med  # everything else
# game pairing
gid=[r['game_id'] for r in rows]; idx=defaultdict(list)
for i,x in enumerate(gid): idx[x].append(i)
pairs=np.array([v for v in idx.values() if len(v)==2]); A,B=pairs[:,0],pairs[:,1]
# players
pid=[r['player_id'] for r in rows]; by=defaultdict(list)
for i,r in enumerate(rows):
    if r['player_id'] and r['rating']: by[r['player_id']].append(i)
P=[p for p in by if len(by[p])>=20]; rating=np.array([float(rows[by[p][0]]['rating']) for p in P])
outcome=np.array([r['outcome'] for r in rows])
def evaluate(v):
    d=v[A]-v[B]; m=d!=0; wp=((d[m]>0)==(win[A][m]==1)).mean()
    pm=np.array([v[by[p]].mean() for p in P]); rr=np.corrcoef(pm,rating)[0,1]
    q=np.percentile(v,[10,25,50,75,90]); return wp,rr,q
res=[]
for aw,ab,sw,st,mw in itertools.product([0.1,0.15,0.2,0.25,0.3],[0,50,60,70],[0,1,1.5,2],[6000,7000,8000,9000,10000],[0.5,0.75,1.0]):
    if aw==0.1 and ab!=0: continue
    v=base+aw*np.maximum(0,accp-ab)+sw*np.maximum(0,score-st)/1000+mw*med
    wp,rr,q=evaluate(v)
    res.append((aw,ab,sw,st,mw,wp,rr,*q))
res=np.array(res)
print('current:',evaluate(mvp))
ok=res[(res[:,9]>=14.5)&(res[:,9]<=15.5)]
print('candidates with median 14.5-15.5:',len(ok))
hdr='acc_w acc_base sb_w sb_thr medic  winpick r_rate  P10   Q1   med   Q3   P90'
print(hdr)
for r in ok[np.argsort(-(ok[:,5]+ok[:,6]))][:25]: print(' '.join(f'{x:6g}' if i<5 else f'{x:6.3f}' for i,x in enumerate(r)))
print('\n--- constrained: median 14.5-15.5, Q1 9.5-11, Q3 19-21 ---')
ok=res[(res[:,9]>=14.5)&(res[:,9]<=15.5)&(res[:,8]>=9.5)&(res[:,8]<=11)&(res[:,10]>=19)&(res[:,10]<=21)]
print(hdr)
for r in ok[np.argsort(-(ok[:,5]+ok[:,6]))][:20]: print(' '.join(f'{x:6g}' if i<5 else f'{x:6.3f}' for i,x in enumerate(r)))
