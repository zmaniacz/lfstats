import io,contextlib
with contextlib.redirect_stdout(io.StringIO()):
    exec(open('med_sb.py').read().split("print('other positions")[0])
asst=g('assists')
cc=lambda a,b: np.corrcoef(a,b)[0,1]
v0=build(0.1,0,1,1500,2,'bin',3,-0.4)-ebold+ebnew
pm=np.array([v0[by[p]].mean() for p in P]); pa=np.array([asst[by[p]].mean() for p in P])
res=lambda y: y-np.polyval(np.polyfit(pm,y,1),pm)
print('partial r of assists with rating, given proposed Medic MVP: %.2f'%cc(res(pa),res(rating)))
def rep(label,thr,aw,tw=-0.4,surv=3):
    v=build(0.1,0,1,thr,2,'bin',surv,tw)-ebold+ebnew+aw*asst
    wp,rr,q=evaluate(v)
    print(f'{label:40s} med {q[2]:5.2f} IQR {q[1]:5.2f}-{q[3]:5.2f} P90 {q[4]:5.2f} | soc {np.median(v[s]):5.2f} comp {np.median(v[c]):5.2f} gap {np.median(v[c])-np.median(v[s]):+.2f} | top {top(v):4.1f}% comp {top(v,"1"):4.1f}% | wp {wp:.3f} r {rr:.3f}')
rep('current proposal (score >1,500)',1500,0)
rep('score >1,250, no assists',1250,0)
for aw in (0.25,0.5,0.75):
    rep(f'+{aw}/assist, score >1,500',1500,aw)
for aw,thr in ((0.5,2000),(0.75,2000),(1.0,2500)):
    rep(f'+{aw}/assist, score >{thr:,}',thr,aw)
print('\n-- with assists, overall median 14.7-15.1, sorted by top share')
import itertools
out=[]
for aw,thr,rate,surv,rw in itertools.product([0,0.25,0.5],[1000,1250,1500,2000,2500],[1.5,2],[2,3],[0.75,1]):
    v=build(0.1,0,rw,thr,rate,'bin',surv,-0.4)-ebold+ebnew+aw*asst
    md=np.median(v)
    if 14.7<=md<=15.1:
        wp,rr,q=evaluate(v); out.append((aw,thr,rate,surv,rw,md,np.median(v[c]),top(v),top(v,'1'),wp,rr))
out.sort(key=lambda x:x[7])
for x in out[:10]: print('assist %.2f thr %5d x%.1f surv %d reach %.2f | med %.2f comp %.2f | top %.1f%% comp %.1f%% | wp %.3f r %.3f'%x)
print('\n-- detail')
for label,args,aw in [('current proposal',(0.1,0,1,1500,2,'bin',3,-0.4),0),('1,250 only',(0.1,0,1,1250,2,'bin',3,-0.4),0),('assists +0.5, reach 0.75, score 1.5/1k >1,250',(0.1,0,0.75,1250,1.5,'bin',3,-0.4),0.5),('assists +0.25, reach 0.75, score 2/1k >1,250',(0.1,0,0.75,1250,2,'bin',3,-0.4),0.25)]:
    v=build(*args)-ebold+ebnew+aw*asst; wp,rr,q=evaluate(v)
    m=lambda x: np.median(v[x])
    print(f'{label:46s} med {q[2]:5.2f} ({q[1]:5.2f}-{q[3]:5.2f}) P90 {q[4]:5.2f} soc {m(s):5.2f} comp {m(c):5.2f} top {top(v):4.1f}/{top(v,"1"):4.1f} wp {wp:.3f} r {rr:.3f} | pts: assists {(aw*asst).mean():.2f} reach {(args[2]*rec).mean():.2f} score {(args[4]*np.maximum(0,score-args[3])/1000).mean():.2f}')
