from hvy_grid import *
c=lambda a,b: np.corrcoef(a,b)[0,1]
print('hit_diff: mean %.2f P10 %.2f med %.2f P90 %.2f P99 %.2f max %.2f; corr times_hit %.2f opp hits %.2f shots_fired %.2f'%(hd.mean(),*np.percentile(hd,[10,50,90,99]),hd.max(),c(hd,th),c(hd,sho),c(hd,sf)))
print('resets corr score %.2f opp hits %.2f'%(c(rs,score),c(rs,sho)))
opts={'current':(0.1,0,1,7000,2,0,0),
 'missiles 1 only':(0.1,0,1,7000,1,0,0),
 'HA miss1 sb>5000 rs.1':(0.1,0,1,5000,1,0.1,0),
 'HA without resets (sb>4000)':(0.1,0,1,4000,1,0,0),
 'HB miss1 sb>6000 rs.1 hd1':(0.1,0,1,6000,1,0.1,1),
 'HC miss1 sb>7000 rs.1 hd1':(0.1,0,1,7000,1,0.1,1),
 'HD miss1 sb>5000 hd1':(0.1,0,1,5000,1,0,1)}
for n,p in opts.items():
    v=build(*p); wp,rr,q=evaluate(v)
    sit=lambda m: f'{np.median(v[m]):5.2f} ({np.percentile(v[m],25):5.2f}-{np.percentile(v[m],75):5.2f})'
    print(f'{n:30s} mean {v.mean():5.2f} wp {wp:.3f} r {rr:.3f} P10 {q[0]:.2f} Q1 {q[1]:.2f} med {q[2]:.2f} Q3 {q[3]:.2f} P90 {q[4]:.2f} sd {v.std():.2f}')
    print('     social',sit(comp=='0'),' comp',sit(comp=='1'),' wonE',sit((win==1)&(outcome=='elimination')),' wonS',sit((win==1)&(outcome=='score')),' lostS',sit((win==0)&(outcome=='score')),' lostE',sit((win==0)&(outcome=='elimination')))
# partial skill of resets given HA-without-resets
v0=build(0.1,0,1,5000,1,0,0)
pm=np.array([v0[by[p]].mean() for p in P]); prs=np.array([rs[by[p]].mean() for p in P]); phd=np.array([hd[by[p]].mean() for p in P])
res=lambda y: y-np.polyval(np.polyfit(pm,y,1),pm)
print('partial r with rating given MVP(no resets): resets %.2f, hit_diff %.2f'%(c(res(prs),res(rating)),c(res(phd),res(rating))))
