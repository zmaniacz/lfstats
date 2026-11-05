exec(open('cmd_grid.py').read().split('res=[]')[0])
rs=g('reset_opponent'); sho=g('shots_hit_opponent'); sp=g('sp_earned'); nd=g('nukes_detonated'); mins=g('mins')
c=lambda a,b: np.corrcoef(a,b)[0,1]
prop=base+cur_acc+np.maximum(0,score-9000)/1000+0.5*med
print('resets avg %.2f; corr with: score %.2f  opp hits %.2f  sp %.2f  nukes %.2f  proposed MVP %.2f'%(rs.mean(),c(rs,score),c(rs,sho),c(rs,sp),c(rs,nd),c(rs,prop)))
# game-level logistic: does reset diff add to proposed-MVP diff?
d_m=prop[A]-prop[B]; d_r=(rs[A]-rs[B])/mins[A]; y=win[A]
def logit(X,y):
    X=(X-X.mean(0))/X.std(0); Xb=np.c_[np.ones(len(X)),X]; w=np.zeros(Xb.shape[1])
    for _ in range(50):
        p=1/(1+np.exp(-Xb@w)); w+=np.linalg.solve(Xb.T@(Xb*(p*(1-p))[:,None]),Xb.T@(y-p))
    p=1/(1+np.exp(-Xb@w)); se=np.sqrt(np.diag(np.linalg.inv(Xb.T@(Xb*(p*(1-p))[:,None]))))
    ll=(y*np.log(p)+(1-y)*np.log(1-p)).sum(); return w,se,((p>.5)==y).mean(),ll
for name,X in [('proposed MVP diff',np.c_[d_m]),('resets/min diff',np.c_[d_r]),('both',np.c_[d_m,d_r])]:
    w,se,acc,ll=logit(X,y); print(f'{name:20s} acc {acc:.3f} loglik {ll:.0f} coefs',' '.join(f'{a:.2f}(z={a/s:.1f})' for a,s in zip(w[1:],se[1:])))
# skill: partial corr of career resets with rating controlling career proposed MVP
pm=np.array([prop[by[p]].mean() for p in P]); pr=np.array([rs[by[p]].mean() for p in P])
res_r=pr-np.polyval(np.polyfit(pm,pr,1),pm); res_rt=rating-np.polyval(np.polyfit(pm,rating,1),pm)
print('player-level: r(resets,rating) %.2f; partial r given proposed MVP %.2f'%(c(pr,rating),c(res_r,res_rt)))
def show(name,v):
    wp,rr,q=evaluate(v); print(f'{name:50s} wp {wp:.3f} r {rr:.3f} | P10 {q[0]:5.2f} Q1 {q[1]:5.2f} med {q[2]:5.2f} Q3 {q[3]:5.2f} P90 {q[4]:5.2f}')
show('C1+C2',prop)
show('C1+C2 + 0.1/reset',prop+0.1*rs)
show('C1+C2 + 0.1/reset - offset 1.43 (level only)',prop+0.1*rs-1.43)
show('C1+C2 + 0.1/reset, medic .25',prop+0.1*rs-0.25*med)
show('C1+C2 + 0.05/reset',prop+0.05*rs)
show('C1+C2 + 0.1/reset, score thr 10000',base+cur_acc+cur_sb+0.5*med+0.1*rs)
