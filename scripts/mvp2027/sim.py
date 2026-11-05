import csv, numpy as np
from collections import defaultdict
rows=[r for r in csv.DictReader(open('sc.csv')) if r['position']=='3']
F=lambda r,k: float(r[k]) if r[k] else 0.0
cur_acc=lambda r: round(F(r,'accuracy')*100)*0.1
def model(acc_w=0.1, h3=0.2, reset=0.0, times_reset=0.0, assists=0.0, medic=1.0):
    def f(r):
        v=F(r,'mvp_points')-cur_acc(r)-0.2*F(r,'shots_hit_opponent_3hit')-F(r,'shots_hit_opponent_medic')
        v+=round(F(r,'accuracy')*100)*acc_w+h3*F(r,'shots_hit_opponent_3hit')+medic*F(r,'shots_hit_opponent_medic')
        v+=reset*F(r,'reset_opponent')+times_reset*F(r,'times_reset')+assists*F(r,'assists')
        return v
    return f
models={
 'current':model(),
 'A +0.1/reset':model(reset=0.1),
 'B +0.1/reset, acc 0.08':model(reset=0.1,acc_w=0.08),
 'C +0.15/reset, acc 0.05, 3hit .2':model(reset=0.15,acc_w=0.05),
 'D +0.2/reset, acc 0.05, 3hit .15':model(reset=0.2,acc_w=0.05,h3=0.15),
 'E +0.1/reset, +0.1/assist':model(reset=0.1,assists=0.1, acc_w=0.08),
}
by=defaultdict(list)
for r in rows:
    if r['player_id'] and r['rating']: by[r['player_id']].append(r)
players=[p for p,g in by.items() if len(g)>=20]
rating=np.array([float(by[p][0]['rating']) for p in players])
games=defaultdict(lambda: defaultdict(list))
for r in rows: games[r['game_id']][r['team_id']].append(r)
print(f"{'model':36s} {'mean':>5s} {'P10':>5s} {'Q1':>5s} {'med':>5s} {'Q3':>5s} {'P90':>5s} {'winpick':>7s} {'r_win':>6s} {'r_rate':>6s}")
for name,f in models.items():
    v=np.array([f(r) for r in rows]); w=np.array([F(r,'win') for r in rows])
    q=np.percentile(v,[10,25,50,75,90])
    # pairwise: across-team scout pairs, how often higher MVP is on winning team
    tot=0;ok=0
    for g,t in games.items():
        if len(t)!=2: continue
        a,b=list(t.values())
        for x in a:
            for y in b:
                fx,fy=f(x),f(y)
                if fx==fy: continue
                tot+=1; ok+= (fx>fy)==(F(x,'win')==1)
    pm=np.array([np.mean([f(r) for r in by[p]]) for p in players])
    print(f"{name:36s} {v.mean():5.2f} {q[0]:5.2f} {q[1]:5.2f} {q[2]:5.2f} {q[3]:5.2f} {q[4]:5.2f} {ok/tot:7.3f} {np.corrcoef(v,w)[0,1]:6.3f} {np.corrcoef(pm,rating)[0,1]:6.3f}")
