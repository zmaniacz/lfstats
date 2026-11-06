"""All section 5 figures (and the 4.6 elimination table) for the final proposal in new_mvp.csv."""
import csv, numpy as np
from collections import defaultdict
N={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp.csv'))}
NP={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp_pos.csv'))}
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8'))]
for r in rows:
    r['new']=N[r['id']]; r['cur']=float(r['mvp_points']); r['own']=NP[r['id']]-float(r['c_elim_bonus'] or 0); r['bonus']=r['new']-r['own']
POS={'1':'Commander','2':'Heavy','3':'Scout','4':'Ammo','5':'Medic'}
rating={r['player_id']:float(r['rating']) for r in rows if r['player_id'] and r['rating']}
we=lambda r:r['win']=='1' and r['outcome']=='elimination'; ws=lambda r:r['win']=='1' and r['outcome']=='score'; ls=lambda r:r['win']=='0' and r['outcome']=='score'
def winpick(S,p,key):
    gm=defaultdict(lambda: defaultdict(list))
    for r in S:
        if r['position']==p: gm[r['game_id']][r['team_id']].append(r)
    ok=tot=0
    for t in gm.values():
        if len(t)!=2: continue
        a,b=list(t.values())
        for x in a:
            for y in b:
                if x[key]==y[key]: continue
                tot+=1; ok+=(x[key]>y[key])==(x['win']=='1')
    return 100*ok/tot
def rr(p,key):
    by=defaultdict(list)
    for r in rows:
        if r['position']==p and r['player_id'] in rating: by[r['player_id']].append(r[key])
    P=[k for k,v in by.items() if len(v)>=20]
    return np.corrcoef([np.mean(by[k]) for k in P],[rating[k] for k in P])[0,1]
def top(S,key):
    gm=defaultdict(list)
    for r in S: gm[r['game_id']].append(r)
    c=defaultdict(int)
    for g in gm.values(): c[max(g,key=lambda r:r[key])['position']]+=1
    return {p:100*c[p]/len(gm) for p in '12345'}
b=np.array([r['bonus'] for r in rows if we(r)])
print('bonus when paid: mean %.2f P50 %.2f P90 %.2f max %.2f'%(b.mean(),np.median(b),np.percentile(b,90),b.max()))
print('== distribution, all games')
for p in '12345':
    a=np.array([r['new'] for r in rows if r['position']==p]); q=np.percentile(a,[10,25,50,75,90])
    print(f'{POS[p]:10s} {q[2]:.2f} ({q[1]:.2f}-{q[3]:.2f}) P10-P90 {q[0]:.2f}-{q[4]:.2f} | winpick {winpick(rows,p,"cur"):.1f} -> {winpick(rows,p,"new"):.1f} | r {rr(p,"cur"):.3f} -> {rr(p,"new"):.3f}')
t=top(rows,'new'); print('top all', {POS[p]:round(v,1) for p,v in t.items()})
print('== elim table (won by elim | without bonus | won on score | lost on score)')
for p in '12345':
    f=lambda c,k: np.median([r[k] for r in rows if r['position']==p and c(r)])
    print(f'{POS[p]:10s} {f(we,"new"):.2f} | {f(we,"own"):.2f} | {f(ws,"new"):.2f} | {f(ls,"new"):.2f}')
ew=np.array([r['new'] for r in rows if we(r)]); allv=np.array([r['new'] for r in rows])
print('elim winners median %.2f (pct %.0f), share >20 %.0f%%; score winners %.2f, score losers %.2f'%(np.median(ew),100*(allv<np.median(ew)).mean(),100*(ew>20).mean(),np.median([r['new'] for r in rows if ws(r)]),np.median([r['new'] for r in rows if ls(r)])))
for scope,flag in (('social','0'),('comp','1')):
    S=[r for r in rows if r['is_comp']==flag]
    print(f'== {scope}')
    for p in '12345':
        cm=np.median([r['cur'] for r in S if r['position']==p]); nm=np.median([r['new'] for r in S if r['position']==p])
        print(f'{POS[p]:10s} median {cm:.2f} -> {nm:.2f} | winpick {winpick(S,p,"cur"):.1f} -> {winpick(S,p,"new"):.1f}')
    print('top', {POS[p]:round(v,1) for p,v in top(S,'new').items()})
    print('overall median %.2f mean %.2f'%(np.median([r['new'] for r in S]),np.mean([r['new'] for r in S])))
