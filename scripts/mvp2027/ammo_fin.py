from ammo_steps import show
from ammo_grid import *
show('N1 acc.05 recip1 score1.5/1000 from0',base+0.05*accp+rec+1.5*score/1000)
show('N2 acc.075 recip1 score1/1000 from0',base+0.075*accp+rec+1*score/1000)
show('recip only',build(0.1,0,1,3000,1,0,0))
v=base+0.05*accp+rec+1.5*score/1000
print('N1 shares: acc %.1f recip %.1f score %.1f of %.1f'%((0.05*accp).mean(),rec.mean(),(1.5*score/1000).mean(),v.mean()))
