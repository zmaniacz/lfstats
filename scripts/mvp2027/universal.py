import csv, numpy as np
from collections import defaultdict
N={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp_pos.csv'))}
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8'))]
for r in rows: r['new']=N[r['id']]; r['cur']=float(r['mvp_points']); r['eb']=float(r['c_elim_bonus'] or 0)
POS={'1':'Commander','2':'Heavy','3':'Scout','4':'Ammo','5':'Medic'}
print('== distributions current -> proposed')
for p in '12345':
    c=np.array([r['cur'] for r in rows if r['position']==p]); n=np.array([r['new'] for r in rows if r['position']==p])
    f=lambda a: ' '.join(f'{x:5.2f}' for x in [a.mean(),*np.percentile(a,[10,25,50,75,90])])
    print(f'{POS[p]:10s} cur {f(c)} | new {f(n)}')
# game top MVP share
for key in ('cur','new'):
    games=defaultdict(list)
    for r in rows: games[r['game_id']].append(r)
    cnt=defaultdict(float); tot=0
    cntw=defaultdict(float)
    for gm in games.values():
        top=max(gm,key=lambda r:r[key]); cnt[top['position']]+=1; tot+=1
        # top on each team
        for t in set(r['team_id'] for r in gm):
            tm=[r for r in gm if r['team_id']==t]; tt=max(tm,key=lambda r:r[key]); cntw[tt['position']]+=1
    print(f'{key}: game top MVP by position ',' '.join(f"{POS[p]} {100*cnt[p]/tot:.1f}%" for p in '12345'))
    print(f'{key}: team top MVP by position ',' '.join(f"{POS[p]} {100*cntw[p]/(2*tot):.1f}%" for p in '12345'))
print('fair share: Commander/Heavy/Ammo/Medic 16.7% each, Scout 33.3% (two per team)')
# elimination bonus
eb=np.array([r['eb'] for r in rows]); won_e=np.array([r['win']=='1' and r['outcome']=='elimination' for r in rows]); won_s=np.array([r['win']=='1' and r['outcome']=='score' for r in rows])
print('== elimination bonus: paid to %.1f%% of scorecards; when paid mean %.2f, P10 %.1f med %.1f P90 %.1f max %.1f'%(100*(eb>0).mean(),eb[eb>0].mean(),*np.percentile(eb[eb>0],[10,50,90]),eb.max()))
mins=np.array([float(r['mins']) for r in rows])
print('elim-win game length: med %.1f min; score-win %.1f min'%(np.median(mins[won_e]),np.median(mins[won_s])))
for p in '12345':
    m=np.array([r['position']==p for r in rows]); n=np.array([r['new'] for r in rows])
    print(f'{POS[p]:10s} new MVP won-by-elim {np.median(n[m&won_e]):5.2f} | same without bonus {np.median((n-eb)[m&won_e]):5.2f} | won on score {np.median(n[m&won_s]):5.2f}')
