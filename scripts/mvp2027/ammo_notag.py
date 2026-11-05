from ammo_grid import *
import itertools
bs=g('boost_shots')
res=[]
for aw,rw,st,sw,xw in itertools.product([0,0.025,0.05,0.075],[1,1.25,1.5,2],[0,1000,1500,2000,2500,3000],[1,1.5,2],[0,0.1,0.2]):
    v=base+aw*accp+rw*rec+sw*np.maximum(0,score-st)/1000+xw*rs
    wp,rr,q=evaluate(v); res.append((aw,rw,st,sw,xw,wp,rr,*q))
res=np.array(res)
ok=res[(res[:,9]>=14.5)&(res[:,9]<=15.5)&(res[:,8]>=9.5)&(res[:,8]<=11)&(res[:,10]>=19)&(res[:,10]<=21)]
print('in band',len(ok)); print('acc recip sbthr sbw resets  wp    r    P10  Q1   med  Q3   P90')
for r in ok[np.argsort(-(ok[:,5]+ok[:,6]))][:15]: print(' '.join(f'{x:5g}' if i<5 else f'{x:5.3f}' for i,x in enumerate(r)))
# relaxed band
ok2=res[(res[:,9]>=14.5)&(res[:,9]<=15.5)]
print('median-only band, top 10:')
for r in ok2[np.argsort(-(ok2[:,5]+ok2[:,6]))][:10]: print(' '.join(f'{x:5g}' if i<5 else f'{x:5.3f}' for i,x in enumerate(r)))
