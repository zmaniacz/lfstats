import csv, numpy as np, itertools, sys
from collections import defaultdict
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8')) if r['position']=='2']
g=lambda k: np.array([float(r[k] or 0) for r in rows])
mvp=g('mvp_points'); accp=np.round(g('accuracy')*100); score=g('score'); mis=g('missiles_hit_opponent'); rs=g('reset_opponent'); win=g('win'); med=g('shots_hit_opponent_medic'); hd=g('hit_diff'); sf=g('shots_fired'); sho=g('shots_hit_opponent'); th=g('times_hit')
outcome=np.array([r['outcome'] for r in rows]); comp=np.array([r['is_comp'] for r in rows])
base=mvp-0.1*accp-np.maximum(0,score-7000)/1000-2*mis
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
def build(aw,ab,sw,st,mw,rw,hw=0): return base+aw*np.maximum(0,accp-ab)+sw*np.maximum(0,score-st)/1000+mw*mis+rw*rs+hw*hd
if __name__=='__main__':
    c=lambda a,b: np.corrcoef(a,b)[0,1]
    print('acc corr shots_fired %.2f opp hits %.2f score %.2f; score corr opp hits %.2f; pct score>7000 %.1f med score %.0f'%(c(accp,sf),c(accp,sho),c(accp,score),c(score,sho),100*(score>7000).mean(),np.median(score)))
    qs=np.percentile(accp,[20,40,60,80]); b=np.digitize(accp,qs,right=True)
    for i in range(5):
        m=b==i; print(f'  Q{i+1} {accp[m].min():.0f}-{accp[m].max():.0f}%  shots {sf[m].mean():.0f} opp hits {sho[m].mean():.1f} missiles {mis[m].mean():.2f} score {score[m].mean():.0f} times hit {th[m].mean():.0f} win {100*win[m].mean():.1f}%')
    print('missile hits dist: P10 %.0f med %.0f P90 %.0f max %.0f, pct zero %.1f'%(*np.percentile(mis,[10,50,90]),mis.max(),100*(mis==0).mean()))
    print('current',evaluate(mvp))
    res=[]
    for aw,ab,sw,st,mw,rw,hw in itertools.product([0,0.05,0.1,0.15,0.2],[0,50,60,70],[0,1,1.5],[5000,6000,7000],[1,1.5,2],[0,0.1],[0,1,2]):
        if aw in (0,0.1) and ab: continue
        if sw==0 and st!=7000: continue
        wp,rr,q=evaluate(build(aw,ab,sw,st,mw,rw,hw)); res.append((aw,ab,sw,st,mw,rw,hw,wp,rr,*q))
    res=np.array(res)
    ok=res[(res[:,11]>=14.5)&(res[:,11]<=15.5)&(res[:,10]>=9.5)&(res[:,10]<=11)&(res[:,12]>=19)&(res[:,12]<=21)]
    print('candidates',len(ok))
    print('acc_w acc_b sb_w sb_thr miss reset hdiff  wp    r     P10   Q1    med   Q3    P90')
    for r in ok[np.argsort(-(ok[:,7]+ok[:,8]))][:25]: print(' '.join(f'{x:5g}' if i<7 else f'{x:5.3f}' for i,x in enumerate(r)))
