from sct_grid import *
sf=g('shots_fired'); sho=g('shots_hit_opponent'); rf=g('rapid_fire')
c=lambda a,b: np.corrcoef(a,b)[0,1]
print('scout accuracy corr: shots_fired %.2f, opp hits %.2f, resets %.2f, 3hit %.2f, rapid uses %.2f, score %.2f'%(c(accp,sf),c(accp,sho),c(accp,rs),c(accp,h3),c(accp,rf),c(accp,score)))
qs=np.percentile(accp,[20,40,60,80]); b=np.digitize(accp,qs,right=True)
for i in range(5):
    m=b==i; print(f'  Q{i+1} {accp[m].min():.0f}-{accp[m].max():.0f}%  shots {sf[m].mean():.0f} opp hits {sho[m].mean():.1f} 3hit {h3[m].mean():.1f} resets {rs[m].mean():.1f} score {score[m].mean():.0f} rapid {rf[m].mean():.2f} win {100*win[m].mean():.1f}%')
opts={'current':(0.1,0,1,6000,0.2,0),'S1':(0.1,0,1,6000,0.2,0.1),
 'O2 acc.05 nosb 3hit.3 rs.2':(0.05,0,0,6000,0.3,0.2),
 'O3 acc.05 sb>6000 3hit.3 rs.15':(0.05,0,1,6000,0.3,0.15),
 'O4 acc.05 sb>6000 3hit.25 rs.2':(0.05,0,1,6000,0.25,0.2),
 'O5 acc.1 sb>5000 3hit.25 rs0':(0.1,0,1,5000,0.25,0),
 'O6 acc0 sb>6000 3hit.35 rs.25':(0,0,1,6000,0.35,0.25)}
for n,p in opts.items():
    v=build(*p); wp,rr,q=evaluate(v)
    sit=lambda m: f'{np.median(v[m]):5.2f} ({np.percentile(v[m],25):5.2f}-{np.percentile(v[m],75):5.2f})'
    accshare=(p[0]*np.maximum(0,accp-p[1])).mean()/v.mean()
    print(f'{n:32s} mean {v.mean():5.2f} wp {wp:.3f} r {rr:.3f} P10 {q[0]:.2f} Q1 {q[1]:.2f} med {q[2]:.2f} Q3 {q[3]:.2f} P90 {q[4]:.2f} accshare {100*accshare:.0f}%')
    print('     social',sit(comp=='0'),' comp',sit(comp=='1'),' wonE',sit((win==1)&(outcome=='elimination')),' wonS',sit((win==1)&(outcome=='score')),' lostS',sit((win==0)&(outcome=='score')),' lostE',sit((win==0)&(outcome=='elimination')))
