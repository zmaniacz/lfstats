import csv, numpy as np, itertools
from collections import defaultdict
rows=list(csv.DictReader(open('full_ammo.csv',encoding='utf-8')))
g=lambda k: np.array([float(r[k] or 0) for r in rows])
mvp=g('mvp_points'); accp=np.round(g('accuracy')*100); score=g('score'); boost=g('ammo_boost'); rec=g('boost_recipients'); win=g('win'); rsp=g('resupplies_given'); hd=g('hit_diff'); dbl=g('double_resupplies_given'); sho=g('shots_hit_opponent'); rs=g('reset_opponent')
outcome=np.array([r['outcome'] for r in rows]); comp=np.array([r['is_comp'] for r in rows])
base=mvp-0.1*accp-np.maximum(0,score-3000)/1000-3*boost
gid=defaultdict(list)
for i,r in enumerate(rows): gid[r['game_id']].append(i)
pr=np.array([v for v in gid.values() if len(v)==2]); A,B=pr[:,0],pr[:,1]
by=defaultdict(list)
for i,r in enumerate(rows):
    if r['player_id'] and r['rating']: by[r['player_id']].append(i)
P=[p for p in by if len(by[p])>=20]; rating=np.array([float(rows[by[p][0]]['rating']) for p in P])
def evaluate(v):
    d=v[A]-v[B]; m=d!=0; wp=((d[m]>0)==(win[A][m]==1)).mean()
    pm=np.array([v[by[p]].mean() for p in P]); return wp,np.corrcoef(pm,rating)[0,1],np.percentile(v,[10,25,50,75,90])
def build(aw,bw,rw,st,sw,tw,hw): return base+aw*accp+bw*boost+rw*rec+sw*np.maximum(0,score-st)/1000+tw*rsp+hw*hd
if __name__=='__main__':
    c=lambda a,b: np.corrcoef(a,b)[0,1]
    print('accuracy corr: shots_fired %.2f opp hits %.2f score %.2f boosts %.2f'%(c(accp,g('shots_fired')),c(accp,sho),c(accp,score),c(accp,boost)))
    print('boost recipients per boost dist (from boosts.csv) handled separately; recipients corr boosts %.2f'%c(rec,boost))
    print('current',evaluate(mvp))
    res=[]
    for aw,(bw,rw),st,sw,tw,hw in itertools.product([0,0.025,0.05,0.1],[(3,0),(0,1),(0,1.25),(0,1.5),(1,0.75),(1.5,0.5)],[1000,1500,2000,2500,3000],[1,1.5,2],[0,0.05,0.1],[0,1,2]):
        wp,rr,q=evaluate(build(aw,bw,rw,st,sw,tw,hw)); res.append((aw,bw,rw,st,sw,tw,hw,wp,rr,*q))
    res=np.array(res); np.save('ammo_res.npy',res)
    ok=res[(res[:,11]>=14.5)&(res[:,11]<=15.5)&(res[:,10]>=9.5)&(res[:,10]<=11)&(res[:,12]>=19)&(res[:,12]<=21)]
    print('candidates',len(ok))
    print('acc  boost recip sbthr sbw  resup hdiff  wp    r     P10   Q1    med   Q3    P90')
    for r in ok[np.argsort(-(ok[:,7]+ok[:,8]))][:30]: print(' '.join(f'{x:5g}' if i<7 else f'{x:5.3f}' for i,x in enumerate(r)))
