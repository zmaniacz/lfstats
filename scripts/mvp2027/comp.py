import csv, numpy as np
from collections import defaultdict
N={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp_pos.csv'))}
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8'))]
for r in rows: r['new']=N[r['id']]; r['cur']=float(r['mvp_points'])
POS={'1':'Commander','2':'Heavy','3':'Scout','4':'Ammo','5':'Medic'}
for scope,cond in [('social',lambda r:r['is_comp']=='0'),('comp',lambda r:r['is_comp']=='1')]:
    S=[r for r in rows if cond(r)]
    print(f'== {scope}: {len(set(r["game_id"] for r in S))} games')
    for p in '12345':
        c=np.array([r['cur'] for r in S if r['position']==p]); n=np.array([r['new'] for r in S if r['position']==p])
        q=lambda a: f'{np.median(a):5.2f} ({np.percentile(a,25):5.2f}-{np.percentile(a,75):5.2f}) P90 {np.percentile(a,90):5.2f}'
        # winner pick same position across teams
        gm=defaultdict(lambda: defaultdict(list))
        for r in S:
            if r['position']==p: gm[r['game_id']][r['team_id']].append(r)
        res={}
        for key in ('cur','new'):
            ok=tot=0
            for t in gm.values():
                if len(t)!=2: continue
                a,b=list(t.values())
                for x in a:
                    for y in b:
                        if x[key]==y[key]: continue
                        tot+=1; ok+=(x[key]>y[key])==(x['win']=='1')
            res[key]=ok/tot
        print(f'{POS[p]:10s} cur {q(c)} | new {q(n)} | winpick {100*res["cur"]:.1f}% -> {100*res["new"]:.1f}%')
    for key in ('cur','new'):
        games=defaultdict(list)
        for r in S: games[r['game_id']].append(r)
        cnt=defaultdict(int)
        for g in games.values(): cnt[max(g,key=lambda r:r[key])['position']]+=1
        print(f'  {key} top MVP: '+' '.join(f'{POS[p]} {100*cnt[p]/len(games):.1f}%' for p in '12345'))
