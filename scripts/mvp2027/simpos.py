"""Replay weight changes for one position. Models are dicts of {column: added weight per unit}."""
import csv, sys, numpy as np
from collections import defaultdict
def load(pos):
    return [r for r in csv.DictReader(open('full.csv',encoding='utf-8')) if r['position']==pos]
def F(r,k):
    if k=='acc_pct': return round(float(r['accuracy'])*100)
    if k=='score_k_above':  # helper: (score - T)/1000 above T, T passed via name score_k_above:T
        pass
    if k.startswith('score_above_'):
        t=float(k.split('_')[-1]); return max(0.0,float(r['score'])-t)/1000
    v=r[k]; return float(v) if v not in ('',None) else 0.0
def run(pos, models, situations=False):
    rows=load(pos)
    by=defaultdict(list)
    for r in rows:
        if r['player_id'] and r['rating']: by[r['player_id']].append(r)
    players=[p for p,g in by.items() if len(g)>=20]
    rating=np.array([float(by[p][0]['rating']) for p in players])
    games=defaultdict(lambda: defaultdict(list))
    for r in rows: games[r['game_id']][r['team_id']].append(r)
    print(f"{'model':44s} {'mean':>5s} {'P10':>5s} {'Q1':>5s} {'med':>5s} {'Q3':>5s} {'P90':>5s} {'winpick':>7s} {'r_rate':>6s}")
    for name,m in models.items():
        f=lambda r: float(r['mvp_points'])+sum(w*F(r,k) for k,w in m.items())
        v=np.array([f(r) for r in rows]); q=np.percentile(v,[10,25,50,75,90])
        tot=ok=0
        for t in games.values():
            if len(t)!=2: continue
            a,b=list(t.values())
            for x in a:
                for y in b:
                    fx,fy=f(x),f(y)
                    if fx==fy: continue
                    tot+=1; ok+=(fx>fy)==(x['win']=='1')
        pm=np.array([np.mean([f(r) for r in by[p]]) for p in players])
        print(f"{name:44s} {v.mean():5.2f} {q[0]:5.2f} {q[1]:5.2f} {q[2]:5.2f} {q[3]:5.2f} {q[4]:5.2f} {ok/tot:7.3f} {np.corrcoef(pm,rating)[0,1]:6.3f}")
        if situations:
            for sn,c in [('social',lambda r:r['is_comp']=='0'),('competition',lambda r:r['is_comp']=='1'),('won elim',lambda r:r['win']=='1' and r['outcome']=='elimination'),('won score',lambda r:r['win']=='1' and r['outcome']=='score'),('lost score',lambda r:r['win']=='0' and r['outcome']=='score'),('lost elim',lambda r:r['win']=='0' and r['outcome']=='elimination')]:
                s=np.array([f(r) for r in rows if c(r)])
                print(f"     {sn:14s} med {np.median(s):5.2f} IQR {np.percentile(s,25):5.2f}-{np.percentile(s,75):5.2f}")
