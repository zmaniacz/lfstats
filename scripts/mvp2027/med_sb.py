"""Medic score bonus threshold variants, with the final elimination bonus (U3) applied."""
import io, contextlib, csv
with contextlib.redirect_stdout(io.StringIO()):
    from med_grid import *
from collections import defaultdict
dur={r['game_id']:(float(r['scheduled_duration']),float(r['actual_duration'])) for r in csv.DictReader(open('gdur.csv'))}
ebold=g('c_elim_bonus')
ebnew=np.array([1+0.75*max(0,(dur[r['game_id']][0]-dur[r['game_id']][1])/60000) if float(r['c_elim_bonus'] or 0)>0 else 0 for r in rows])
N={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp.csv'))}
allr=list(csv.DictReader(open('full.csv',encoding='utf-8')))
mid=[r['id'] for r in rows]
c=comp=='1'; s=comp=='0'
def top(vals,flag=None):
    V=dict(N); V.update(zip(mid,vals))
    gm=defaultdict(list)
    for r in allr:
        if flag is None or r['is_comp']==flag: gm[r['game_id']].append(r)
    return 100*np.mean([max(gg,key=lambda r:V[r['id']])['position']=='5' for gg in gm.values()])
def rep(label,thr,rate=2,tw=-0.4):
    v=build(0.1,0,1,thr,rate,'bin',3,tw)-ebold+ebnew
    wp,rr,q=evaluate(v)
    print(f'{label:34s} med {q[2]:5.2f} IQR {q[1]:5.2f}-{q[3]:5.2f} | social {np.median(v[s]):5.2f} comp {np.median(v[c]):5.2f} | top all {top(v):4.1f}% comp {top(v,"1"):4.1f}% | wp {wp:.3f} r {rr:.3f}')
    return v
print('other positions, final: medians 14.76-14.90 overall; comp 15.17-15.76')
rep('current proposal (above 1,500)',1500)
for t in (1000,500,0): rep(f'score bonus above {t:,}',t)
rep('above 1,000, times reset -0.5',1000,tw=-0.5)
print('pct of medics scoring above 1000: %.1f%%, above 1500: %.1f%%'%(100*(score>1000).mean(),100*(score>1500).mean()))
print('avg score bonus pts: >1500 %.2f, >1000 %.2f'%((2*np.maximum(0,score-1500)/1000).mean(),(2*np.maximum(0,score-1000)/1000).mean()))

print('\n-- combinations: target overall ~14.8, competition ~15.2-15.5, top share ~17%')
import itertools
res=[]
for thr,rate,surv,tw,rw in itertools.product([1000,1250,1500],[1.5,2],[2,3],[-0.4,-0.5],[0.75,1]):
    v=build(0.1,0,rw,thr,rate,'bin',surv,tw)-ebold+ebnew
    md,mc=np.median(v),np.median(v[c])
    if 14.6<=md<=15.1 and mc>=14.9:
        wp,rr,q=evaluate(v); res.append((thr,rate,surv,tw,rw,md,np.median(v[s]),mc,top(v),top(v,'1'),wp,rr))
res.sort(key=lambda x:(abs(x[8]-16.7)+abs(x[9]-16.7)))
for x in res[:12]: print('thr %5d x%.1f surv %d treset %.1f reach %.2f | med %.2f soc %.2f comp %.2f | top %.1f%% comp %.1f%% | wp %.3f r %.3f'%x)
