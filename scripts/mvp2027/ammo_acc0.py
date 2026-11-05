from ammo_grid import *
best=None
for rw in (1,1.25,1.5):
  for tw in (0.1,0.125,0.15,0.2):
    for st in (0,1000,2000,3000):
      for sw in (1,1.5):
        v=base+rw*rec+tw*rsp+sw*np.maximum(0,score-st)/1000
        wp,rr,q=evaluate(v)
        if 14.5<=q[2]<=15.5 and 9.5<=q[1]<=11 and 19<=q[3]<=21:
          if best is None or wp+rr>best[0]: best=(wp+rr,rw,tw,st,sw,wp,rr,q)
print('acc 0 best:',best)
