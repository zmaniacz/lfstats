"""Apply every position recommendation and write new_mvp per scorecard id."""
import csv, numpy as np, importlib
new={}
import cmd_grid as C   # commander arrays
v=C.base+C.cur_acc+np.maximum(0,C.score-9000)/1000+0.5*C.med
for r,x in zip(C.rows,v): new[r['id']]=x
import hvy_grid as H
for r,x in zip(H.rows,H.build(0.1,0,1,3500,1,0,0)): new[r['id']]=x
import sct_grid as S
for r,x in zip(S.rows,S.build(0.05,0,0,6000,0.3,0.2)): new[r['id']]=x
import ammo_grid as A
for r,x in zip(A.rows,A.base+0.05*A.accp+A.rec+2*np.maximum(0,A.score-1000)/1000+0.1*A.rs): new[r['id']]=x
import med_grid as M
for r,x in zip(M.rows,M.build(0.1,0,1,1500,2,'bin',3,-0.5)): new[r['id']]=x
with open('new_mvp.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['id','new_mvp']); [w.writerow([k,v]) for k,v in new.items()]
print(len(new))
