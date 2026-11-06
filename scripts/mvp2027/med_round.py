import io,contextlib
with contextlib.redirect_stdout(io.StringIO()):
    exec(open('med_assist.py').read().split("rep('current proposal")[0])
import itertools
for thr in (1000,1500):
    out=[]
    for aw,rate,rw,surv in itertools.product([0.25,0.5,0.75],[1,1.5,2],[0.5,0.75,1],[2,3]):
        v=build(0.1,0,rw,thr,rate,'bin',surv,-0.4)-ebold+ebnew+aw*asst
        q=np.percentile(v,[10,25,50,75,90])
        if 14.8<=q[2]<=15.2:
            t=top(v); wp,rr,_=evaluate(v); out.append((abs(t-16.7),aw,rate,rw,surv,q[2],q[1],q[3],q[4],np.median(v[s]),np.median(v[c]),t,top(v,'1'),wp,rr))
    out.sort()
    print(f'== score bonus above {thr:,}')
    for x in out[:5]: print('  assists %.2f, %.1f per 1k, reach %.2f, survival %d | med %.2f (%.2f-%.2f) P90 %.2f soc %.2f comp %.2f | top %.1f%% comp %.1f%% | wp %.3f r %.3f'%x[1:])
v=build(0.1,0,0.75,1250,1.5,'bin',3,-0.4)-ebold+ebnew+0.5*asst; wp,rr,q=evaluate(v)
print('reference 1,250 version: med %.2f top %.1f%% comp %.1f%% wp %.3f r %.3f'%(q[2],top(v),top(v,'1'),wp,rr))
