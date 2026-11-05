"""Four-test analysis for one position. usage: tests.py POS stat1 stat2 ..."""
import csv, sys, numpy as np
from collections import defaultdict
POS=sys.argv[1]
RATIO={'full_tag_frac','avg_recip','team_dry_frac','team_low_frac','accuracy','up_frac','hit_diff','elim','lives_left','nuke_success'}
rows=[r for r in csv.DictReader(open('full_ammo.csv',encoding='utf-8')) if r['position']==POS]
def F(r,k):
    if k=='nuke_success':
        a=float(r['nukes_activated'] or 0); return float(r['nukes_detonated'])/a if a else np.nan
    if k=='hits_on_3hit_or_medic': return float(r['shots_hit_opponent_3hit'])+float(r['shots_hit_opponent_medic'])
    v=r[k]; return float(v) if v not in ('',None) else 0.0
def per(r,k): return F(r,k) if k in RATIO else F(r,k)/float(r['mins'])
stats=sys.argv[2:]
games=defaultdict(lambda: defaultdict(list))
for r in rows: games[r['game_id']][r['team_id']].append(r)
pairs=[list(t.values()) for t in games.values() if len(t)==2]
def logit_acc(x,y):
    x=(x-x.mean())/x.std(); Xb=np.c_[np.ones(len(x)),x]; w=np.zeros(2)
    for _ in range(50):
        p=1/(1+np.exp(-Xb@w)); H=Xb.T@(Xb*(p*(1-p))[:,None]); w+=np.linalg.solve(H+1e-9*np.eye(2),Xb.T@(y-p))
    p=1/(1+np.exp(-Xb@w)); return ((p>.5)==y).mean(), w[1]
by=defaultdict(list)
for r in rows:
    if r['player_id'] and r['rating']: by[r['player_id']].append(r)
players=[p for p,g in by.items() if len(g)>=20]
rating=np.array([float(by[p][0]['rating']) for p in players])
print(f"pos {POS}: {len(rows)} scorecards, {len(pairs)} games, {len(players)} players")
print(f"{'stat':32s} {'avg':>7s} {'won%':>6s} {'dir':>4s} {'r_rate':>7s} {'consist':>7s}")
for s in stats:
    d=[];y=[]
    for a,b in pairs:
        xa=np.nansum([per(r,s) for r in a]); xb=np.nansum([per(r,s) for r in b])
        d.append(xa-xb); y.append(int(a[0]['win']))
    acc,c=logit_acc(np.array(d),np.array(y))
    m=[];h1=[];h2=[]
    for p in players:
        v=np.array([F(r,s) for r in by[p]]); m.append(np.nanmean(v)); h1.append(np.nanmean(v[0::2])); h2.append(np.nanmean(v[1::2]))
    avg=np.nanmean([F(r,s) for r in rows])
    print(f"{s:32s} {avg:7.2f} {100*acc:6.1f} {'+' if c>0 else '-':>4s} {np.corrcoef(m,rating)[0,1]:7.2f} {np.corrcoef(h1,h2)[0,1]:7.2f}")
