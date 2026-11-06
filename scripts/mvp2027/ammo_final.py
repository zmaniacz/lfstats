"""Ammo final recommendation (A1-A4 with assists): figures under today's elimination bonus, as in the other position sections."""
import io, contextlib, csv
with contextlib.redirect_stdout(io.StringIO()):
    from ammo_steps import show
    from ammo_grid import *
from collections import defaultdict
asst=g('assists')
NP={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp_pos.csv'))}
allr=list(csv.DictReader(open('full.csv',encoding='utf-8')))
gm=defaultdict(list); gc=defaultdict(list)
for r in allr:
    gm[r['game_id']].append(r)
    if r['is_comp']=='1': gc[r['game_id']].append(r)
aid=[r['id'] for r in rows]
def top(vals,G):
    V=dict(NP); V.update(zip(aid,vals))
    return 100*np.mean([max(gg,key=lambda r:V[r['id']])['position']=='4' for gg in G.values()])
prev=base+0.05*accp+rec+2*np.maximum(0,score-1000)/1000+0.1*rs
new=base+0.05*accp+rec+2*np.maximum(0,score-1500)/1000+0.25*asst
for n,v in (('previous A1-A4',prev),('new A1-A4',new)):
    show(n,v); print('   top %.1f%% comp %.1f%%'%(top(v,gm),top(v,gc)))
print('pts new: acc %.2f reach %.2f score %.2f assists %.2f; score>1500 %.1f%%'%((0.05*accp).mean(),rec.mean(),(2*np.maximum(0,score-1500)/1000).mean(),(0.25*asst).mean(),100*(score>1500).mean()))
