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
# A1-A4: accuracy 0.05, +1 per teammate reached, +2/1k above 1,500, +0.25 per assist
for r,x in zip(A.rows,A.base+0.05*A.accp+A.rec+2*np.maximum(0,A.score-1500)/1000+0.25*A.g('assists')): new[r['id']]=x
import med_grid as M
# M1-M5: boosts +0.75 per teammate reached, score +2/1k above 1,000, survival +2, times reset -0.4, assists +0.25
for r,x in zip(M.rows,M.build(0.1,0,0.75,1000,2,'bin',2,-0.4)+0.25*M.g('assists')): new[r['id']]=x
# Position recommendations with today's elimination bonus (used by the elimination-bonus analysis)
with open('new_mvp_pos.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['id','new_mvp']); [w.writerow([k,v]) for k,v in new.items()]
# U3: elimination bonus = +1 + 0.75 per minute of scheduled time remaining (replaces +4 + 1/min beyond 3 min)
dur={r['game_id']:(float(r['scheduled_duration']),float(r['actual_duration'])) for r in csv.DictReader(open('gdur.csv'))}
for r in csv.DictReader(open('full.csv',encoding='utf-8')):
    eb=float(r['c_elim_bonus'] or 0)
    if eb>0:
        sch,act=dur[r['game_id']]
        new[r['id']]+= -eb + 1 + 0.75*max(0,(sch-act)/60000)
with open('new_mvp.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['id','new_mvp']); [w.writerow([k,v]) for k,v in new.items()]
print(len(new))
