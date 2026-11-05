import csv, numpy as np, itertools
from collections import defaultdict
rows=list(csv.DictReader(open('full_med.csv',encoding='utf-8')))
g=lambda k: np.array([float(r[k] or 0) for r in rows])
mvp=g('mvp_points'); accp=np.round(g('accuracy')*100); score=g('score'); lb=g('life_boost'); rec=g('boost_recipients'); win=g('win'); elim=g('elim'); sf=g('survival_frac'); tr=g('times_reset'); mins=g('mins')
outcome=np.array([r['outcome'] for r in rows]); comp=np.array([r['is_comp'] for r in rows])
base=mvp-0.1*accp-2*np.maximum(0,score-2000)/1000-3*lb-2*(1-elim)
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
def build(aw,bw,rw,st,sw,surv,sk,tw): 
    s = sk*(1-elim) if surv=='bin' else sk*sf
    return base+aw*accp+bw*lb+rw*rec+sw*np.maximum(0,score-st)/1000+s+tw*tr
def show(n,v):
    wp,rr,q=evaluate(v); sit=lambda m: f'{np.median(v[m]):5.2f} ({np.percentile(v[m],25):5.2f}-{np.percentile(v[m],75):5.2f})'
    print(f'{n:46s} mean {v.mean():5.2f} sd {v.std():.2f} wp {wp:.3f} r {rr:.3f} P10 {q[0]:.2f} Q1 {q[1]:.2f} med {q[2]:.2f} Q3 {q[3]:.2f} P90 {q[4]:.2f}')
    print('     social',sit(comp=='0'),' comp',sit(comp=='1'),' wonE',sit((win==1)&(outcome=='elimination')),' wonS',sit((win==1)&(outcome=='score')),' lostS',sit((win==0)&(outcome=='score')),' lostE',sit((win==0)&(outcome=='elimination')))
if __name__=='__main__':
    c=lambda a,b: np.corrcoef(a,b)[0,1]
    print('medic accuracy corr shots_fired %.2f; survival_frac dist P10 %.2f P25 %.2f med %.2f; eliminated %.1f%%; score>2000 %.1f%% med score %.0f'%(c(accp,g('shots_fired')),*np.percentile(sf,[10,25,50]),100*elim.mean(),100*(score>2000).mean(),np.median(score)))
    v0=base+0.1*accp+rec+2*np.maximum(0,score-2000)/1000; pm=np.array([v0[by[p]].mean() for p in P])
    resid=lambda y: y-np.polyval(np.polyfit(pm,y,1),pm)
    for k,arr in [('times_reset',tr),('survival_frac',sf),('eliminated',elim)]:
        pa=np.array([arr[by[p]].mean() for p in P]); print(f'  partial r with rating: {k} {c(resid(pa),resid(rating)):.2f}')
    print('current',evaluate(mvp))
    res=[]
    for aw,(bw,rw),st,sw,(surv,sk),tw in itertools.product([0,0.025,0.05,0.075,0.1],[(3,0),(0,1),(0,1.25),(0,1.5)],[0,1000,1500,2000],[1,2,3],[('bin',0),('bin',2),('bin',3),('frac',2),('frac',3),('frac',4),('frac',5)],[0,-0.25,-0.5]):
        wp,rr,q=evaluate(build(aw,bw,rw,st,sw,surv,sk,tw)); res.append((aw,bw,rw,st,sw,1 if surv=='bin' else 2,sk,tw,wp,rr,*q))
    res=np.array(res); np.save('med_res.npy',res)
    ok=res[(res[:,12]>=14.5)&(res[:,12]<=15.5)&(res[:,11]>=9.5)&(res[:,11]<=11)&(res[:,13]>=19)&(res[:,13]<=21)]
    print('in band',len(ok)); print('acc boost recip sbthr sbw surv(1bin2frac) sk treset  wp   r   P10 Q1 med Q3 P90')
    for r in ok[np.argsort(-(ok[:,8]+ok[:,9]))][:25]: print(' '.join(f'{x:5g}' if i<8 else f'{x:5.3f}' for i,x in enumerate(r)))
