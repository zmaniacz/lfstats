from ammo_grid import *
res=np.load('ammo_res.npy')
ok=res[(res[:,5]==0)&(res[:,11]>=14.5)&(res[:,11]<=15.5)&(res[:,10]>=9.5)&(res[:,10]<=11)&(res[:,12]>=19)&(res[:,12]<=21)]
print('best without resupplies:')
for r in ok[np.argsort(-(ok[:,7]+ok[:,8]))][:8]: print(' '.join(f'{x:5g}' if i<7 else f'{x:5.3f}' for i,x in enumerate(r)))
def show(n,v):
    wp,rr,q=evaluate(v); sit=lambda m: f'{np.median(v[m]):5.2f} ({np.percentile(v[m],25):5.2f}-{np.percentile(v[m],75):5.2f})'
    print(f'{n:44s} mean {v.mean():5.2f} sd {v.std():.2f} wp {wp:.3f} r {rr:.3f} P10 {q[0]:.2f} Q1 {q[1]:.2f} med {q[2]:.2f} Q3 {q[3]:.2f} P90 {q[4]:.2f}')
    print('     social',sit(comp=='0'),' comp',sit(comp=='1'),' wonE',sit((win==1)&(outcome=='elimination')),' wonS',sit((win==1)&(outcome=='score')),' lostS',sit((win==0)&(outcome=='score')),' lostE',sit((win==0)&(outcome=='elimination')))
show('current',mvp)
show('accuracy 0.05 only (+level)',build(0.05,3,0,3000,1,0,0))
show('boost->1/recipient only',build(0.1,0,1,3000,1,0,0))
show('acc .05 + 1/recipient',build(0.05,0,1,3000,1,0,0))
show('acc .05 + 1/recip + sb>1500 x1.5',build(0.05,0,1,1500,1.5,0,0))
show('acc .05 + 1/recip + resup .1',build(0.05,0,1,3000,1,0.1,0))
show('acc .05 + 1/recip + resup .1, sb>2500',build(0.05,0,1,2500,1,0.1,0))
show('acc .05 + 1/recip + double resup .2',base+0.05*accp+rec+np.maximum(0,score-3000)/1000+0.2*dbl)
show('acc 0 + 1/recip + resup .1, sb>1500',build(0,0,1,1500,1,0.1,0))
c=lambda a,b: np.corrcoef(a,b)[0,1]
v0=build(0.05,0,1,3000,1,0,0); pm=np.array([v0[by[p]].mean() for p in P])
resid=lambda y: y-np.polyval(np.polyfit(pm,y,1),pm)
for k,arr in [('resupplies',rsp),('doubles',dbl),('hit_diff',hd)]:
    pa=np.array([arr[by[p]].mean() for p in P]); print(f'partial r with rating | MVP(acc.05,recip): {k} {c(resid(pa),resid(rating)):.2f}')
print('resupplies per game: mean %.1f P10 %.0f med %.0f P90 %.0f; corr with team mins %.2f'%(rsp.mean(),*np.percentile(rsp,[10,50,90]),c(rsp,g('mins'))))
print('accuracy points share current %.0f%%'%(100*(0.1*accp).mean()/mvp.mean()))
