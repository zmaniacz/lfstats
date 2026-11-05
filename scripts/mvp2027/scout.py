import csv, sys, numpy as np
from collections import defaultdict
rows=[r for r in csv.DictReader(open('sc.csv')) if r['position']=='3']
def f(r,k):
    v=r[k]; return float(v) if v not in ('',None) else np.nan
stats=['mvp_points','accuracy','shots_fired','shots_hit_opponent','shots_hit_opponent_3hit','shots_hit_opponent_medic','deactivated_opponent','eliminated_opponent','eliminated_opponent_medic','reset_opponent','assists','times_hit','times_reset','times_hit_by_missile','up_frac','lives_left','elim','rapid_fire','shots_hit_opponent_during_rapid','sp_earned','score','shots_hit_team','resupplies_received_ammo']
rate_ok={'accuracy','up_frac','elim','lives_left','mvp_points'}
# player-level
by=defaultdict(list)
for r in rows:
    if r['player_id']: by[r['player_id']].append(r)
MIN=20
players=[p for p,g in by.items() if len(g)>=MIN and g[0]['rating']]
print('players with >=%d scout games and a rating:'%MIN, len(players))
rating=np.array([float(by[p][0]['rating']) for p in players])
print(f"{'stat':34s} {'r_rating':>8s} {'r_rating/min':>12s} {'split-half':>10s}")
out=[]
for s in stats:
    m=[];mm=[];a=[];b=[]
    for p in players:
        g=by[p]
        v=np.array([f(r,s) for r in g]); mins=np.array([f(r,'mins') for r in g])
        m.append(np.nanmean(v)); mm.append(np.nanmean(v/mins))
        a.append(np.nanmean(v[0::2])); b.append(np.nanmean(v[1::2]))
    m=np.array(m);mm=np.array(mm)
    c1=np.corrcoef(m,rating)[0,1]; c2=np.corrcoef(mm,rating)[0,1]; sh=np.corrcoef(a,b)[0,1]
    out.append((s,c1,c2,sh))
for s,c1,c2,sh in sorted(out,key=lambda x:-abs(x[1])):
    print(f"{s:34s} {c1:8.3f} {c2:12.3f} {sh:10.3f}")
