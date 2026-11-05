from simpos import run
M='shots_hit_opponent_medic'; N='nukes_detonated'
run('1',{'current':{},'C1 only':{M:-0.5}},situations=True)
run('1',{'alt medic .25 nuke 1.5':{M:-0.75,N:0.5},'C1 + score>8000':{M:-0.5,'score_above_8000':1,'score_above_10000':-1},'C1 + acc .08':{M:-0.5,'acc_pct':-0.02}})
