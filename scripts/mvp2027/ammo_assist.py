"""Ammo assists, tested with the final elimination bonus (U3) and every other final recommendation."""
import io, contextlib, csv, itertools
with contextlib.redirect_stdout(io.StringIO()):
    from ammo_grid import *
from collections import defaultdict
asst=g('assists')
dur={r['game_id']:(float(r['scheduled_duration']),float(r['actual_duration'])) for r in csv.DictReader(open('gdur.csv'))}
ebold=g('c_elim_bonus')
ebnew=np.array([1+0.75*max(0,(dur[r['game_id']][0]-dur[r['game_id']][1])/60000) if float(r['c_elim_bonus'] or 0)>0 else 0 for r in rows])
N={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp.csv'))}
allr=list(csv.DictReader(open('full.csv',encoding='utf-8')))
gm_all=defaultdict(list); gm_comp=defaultdict(list)
for r in allr:
    gm_all[r['game_id']].append(r)
    if r['is_comp']=='1': gm_comp[r['game_id']].append(r)
aid=[r['id'] for r in rows]
c=comp=='1'; s=comp=='0'
def top(vals,comp_only=False):
    V=dict(N); V.update(zip(aid,vals))
    G=gm_comp if comp_only else gm_all
    return 100*np.mean([max(gg,key=lambda r:V[r['id']])['position']=='4' for gg in G.values()])
def ammo(aw,rw,thr,rate,xw,accw=0.05): return base+accw*accp+rw*rec+rate*np.maximum(0,score-thr)/1000+xw*rs+aw*asst-ebold+ebnew
def rep(label,*a):
    v=ammo(*a); wp,rr,q=evaluate(v)
    print(f'{label:46s} med {q[2]:5.2f} ({q[1]:5.2f}-{q[3]:5.2f}) P90 {q[4]:5.2f} | soc {np.median(v[s]):5.2f} comp {np.median(v[c]):5.2f} | top {top(v):4.1f}% comp {top(v,True):4.1f}% | wp {wp:.3f} r {rr:.3f} | assists pts {(a[0]*asst).mean():.2f}')
if __name__=='__main__':
    rep('final A1-A4 (no assists)',0,1,1000,2,0.1)
    rep('A1-A4 + 0.25/assist',0.25,1,1000,2,0.1)
    rep('A1-A4, assists 0.25 replace resets',0.25,1,1000,2,0)
    print('\n-- re-tuned, median 14.7-15.1, sorted by distance from fair top share')
    out=[]
    for aw,rw,thr,rate,xw in itertools.product([0.1,0.2,0.25,0.3],[0.75,1],[1000,1500,2000],[1.5,2],[0,0.1]):
        v=ammo(aw,rw,thr,rate,xw); md=np.median(v)
        if 14.7<=md<=15.1:
            t=top(v); wp,rr,q=evaluate(v); out.append((abs(t-16.7),aw,rw,thr,rate,xw,md,np.median(v[c]),t,top(v,True),wp,rr))
    out.sort()
    for x in out[:10]: print('  assists %.2f reach %.2f score %.1f/1k>%d resets %.1f | med %.2f comp %.2f | top %.1f%% comp %.1f%% | wp %.3f r %.3f'%(x[1],x[2],x[4],x[3],x[5],x[6],x[7],x[8],x[9],x[10],x[11]))

def own_wp(*a):
    v=ammo(*a)-ebnew
    return evaluate(v)[0]
if __name__=='__main__':
    print('\n-- own-play winner picks (no elimination bonus) and details')
    for label,a in [('final A1-A4',(0,1,1000,2,0.1)),('assists +0.25 replace resets, score >1,500',(0.25,1,1500,2,0)),('assists +0.25, resets kept, score 1.5/1k >1,000',(0.25,1,1000,1.5,0.1)),('assists +0.1 replace resets',(0.1,1,1000,2,0)),('assists +0.2, reach .75, resets kept',(0.2,0.75,1000,2,0.1))]:
        v=ammo(*a); wp,rr,q=evaluate(v)
        print(f'{label:50s} med {q[2]:5.2f} ({q[1]:5.2f}-{q[3]:5.2f}) comp {np.median(v[c]):5.2f} top {top(v):4.1f}/{top(v,True):4.1f} | wp bonus {100*wp:.1f}% own {100*own_wp(*a):.1f}% | r {rr:.3f}')
