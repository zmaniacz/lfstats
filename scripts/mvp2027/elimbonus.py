import csv, numpy as np
from collections import defaultdict
N={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp_pos.csv'))}
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8'))]
for r in rows:
    r['new']=N[r['id']]; r['eb']=float(r['c_elim_bonus'] or 0); r['own']=r['new']-r['eb']
    r['xmin']=(r['eb']-4) if r['eb']>0 else 0   # minutes beyond 3 remaining
games={}
for r in rows: games.setdefault(r['game_id'],r)
g=list(games.values())
dur=np.array([float(r['mins']) for r in g]); out=np.array([r['outcome'] for r in g])
print('elimination games: %.1f%%; length median %.1f min (score games %.1f)'%(100*(out=='elimination').mean(),np.median(dur[out=='elimination']),np.median(dur[out=='score'])))
eb=np.array([r['eb'] for r in rows if r['eb']>0]); xm=eb-4
print('bonus when paid: mean %.2f; base 4 + time part mean %.2f; time part zero in %.0f%%; P50 %.1f P75 %.1f P90 %.1f P99 %.1f max %.1f'%(eb.mean(),xm.mean(),100*(xm<=0.001).mean(),*np.percentile(eb,[50,75,90,99]),eb.max()))
# eliminations finishing time: minutes remaining at elimination
rem=np.array([float(r['mins']) for r in g if r['outcome']=='elimination'])
print('elimination game length P10 %.1f P25 %.1f P50 %.1f P75 %.1f P90 %.1f min'%tuple(np.percentile(rem,[10,25,50,75,90])))
POS={'1':'Commander','2':'Heavy','3':'Scout','4':'Ammo','5':'Medic'}
we=lambda r:r['win']=='1' and r['outcome']=='elimination'; ws=lambda r:r['win']=='1' and r['outcome']=='score'; ls=lambda r:r['win']=='0' and r['outcome']=='score'
print('position: own-play medians (no bonus) | elim win, score win, score loss')
for p in '12345':
    f=lambda c: np.median([r['own'] for r in rows if r['position']==p and c(r)])
    print(f'  {POS[p]:10s} {f(we):5.2f} {f(ws):5.2f} {f(ls):5.2f}')
# own-play vs time remaining in elim wins: does a faster elimination mean lower own stats?
W=[r for r in rows if we(r)]
x=np.array([r['xmin'] for r in W]); o=np.array([r['own'] for r in W]); m=np.array([float(r['mins']) for r in W])
print('elim winners: corr(own-play MVP, game length) %.2f'%np.corrcoef(o,m)[0,1])
bins=np.percentile(m,[25,50,75]); b=np.digitize(m,bins)
for i in range(4): print(f'   length quartile {i+1} ({m[b==i].min():.1f}-{m[b==i].max():.1f} min): own-play median {np.median(o[b==i]):5.2f}, bonus mean {np.array([r["eb"] for r in W])[b==i].mean():.2f}')
