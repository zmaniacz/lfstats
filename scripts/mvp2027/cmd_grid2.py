exec(open('cmd_grid.py').read().split('res=[]')[0])
sb9=np.maximum(0,score-9000)/1000
def show(name,v):
    wp,rr,q=evaluate(v); 
    we=np.median(v[(win==1)&(outcome=='elimination')]); ws=np.median(v[(win==1)&(outcome=='score')]); ls=np.median(v[(win==0)&(outcome=='score')]); le=np.median(v[(win==0)&(outcome=='elimination')])
    print(f'{name:52s} wp {wp:.3f} r {rr:.3f} | P10 {q[0]:5.2f} Q1 {q[1]:5.2f} med {q[2]:5.2f} Q3 {q[3]:5.2f} P90 {q[4]:5.2f} | wonE {we:5.2f} wonS {ws:5.2f} lostS {ls:5.2f} lostE {le:5.2f}')
show('current',mvp)
show('C1 (medic .5)',base+cur_acc+cur_sb+0.5*med)
show('C1 + score 1/1000 above 9000',base+cur_acc+sb9+0.5*med)
for x,fl in [(0.1,75),(0.2,75),(0.2,72),(0.3,72)]:
    show(f'C1 + sb9000 + extra {x}/pt below {fl}%',base+cur_acc+sb9+0.5*med+x*np.minimum(0,accp-fl))
for x in [0.05,0.1]:
    show(f'C1 + sb9000 + extra {x}/pt above 80%',base+cur_acc+sb9+0.5*med+x*np.maximum(0,accp-80))
show('C1 + sb9000, acc 0.15 (no base)',base+0.15*accp+sb9+0.5*med-4)
