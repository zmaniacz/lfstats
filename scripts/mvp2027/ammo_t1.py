import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    from ammo_steps import show
from ammo_top import topshare
from ammo_grid import *
T1=base+0.05*accp+rec+2*np.maximum(0,score-1000)/1000+0.1*rs
show('T1',T1); print('top',topshare(T1))
NR=base+0.075*accp+1.5*rec+np.maximum(0,score-2000)/1000
show('no-reset (acc.075 recip1.5 sb1>2000)',NR); print('top',topshare(NR))
print('T1 pts: acc %.2f recip %.2f score %.2f resets %.2f'%((0.05*accp).mean(),rec.mean(),(2*np.maximum(0,score-1000)/1000).mean(),(0.1*rs).mean()))
print('score>1000 %.1f%%'%(100*(score>1000).mean()))
