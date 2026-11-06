"""Medic final recommendation (M1-M5): figures under today's elimination bonus, as in the other position sections."""
import io,contextlib
with contextlib.redirect_stdout(io.StringIO()):
    from med_grid import *
asst=g('assists')
def final(): return build(0.1,0,0.75,1000,2,'bin',2,-0.4)+0.25*asst
v=final()
print('pts: acc %.2f reach %.2f (was lb3 %.2f) score %.2f (was %.2f) surv %.2f treset %.2f assists %.2f'%((0.1*accp).mean(),(0.75*rec).mean(),(3*lb).mean(),(2*np.maximum(0,score-1000)/1000).mean(),(2*np.maximum(0,score-2000)/1000).mean(),(2*(1-elim)).mean(),(-0.4*tr).mean(),(0.25*asst).mean()))
print('score>1000 %.1f%%'%(100*(score>1000).mean()))
show('M1-M5 final (today elim bonus)',v)
print('sd %.2f'%v.std())
show('previous M1-M4 (-0.4)',build(0.1,0,1,1500,2,'bin',3,-0.4))

print('\n-- alternatives under today\'s elimination bonus')
for label,args,aw in [('previous: +1 reach, 2/1k>1500, surv 3, no assists',(0.1,0,1,1500,2,'bin',3,-0.4),0),
 ('score from 1,000 only (previous otherwise)',(0.1,0,1,1000,2,'bin',3,-0.4),0),
 ('score from 1,250 only',(0.1,0,1,1250,2,'bin',3,-0.4),0),
 ('assists 0.5, reach .75, 1.5/1k>1250, surv 3',(0.1,0,0.75,1250,1.5,'bin',3,-0.4),0.5),
 ('1,500 A: assists .75, reach .5, 2/1k>1500, surv 3',(0.1,0,0.5,1500,2,'bin',3,-0.4),0.75),
 ('1,500 B: assists .5, reach .75, 2/1k>1500, surv 2',(0.1,0,0.75,1500,2,'bin',2,-0.4),0.5),
 ('FINAL: assists .25, reach .75, 2/1k>1000, surv 2',(0.1,0,0.75,1000,2,'bin',2,-0.4),0.25)]:
    v=build(*args)+aw*asst; wp,rr,q=evaluate(v)
    print(f'{label:52s} {q[2]:5.2f} ({q[1]:5.2f}-{q[3]:5.2f}) wp {100*wp:.1f}% r {rr:.3f}')
