from simpos import run
M='shots_hit_opponent_medic'; N='nukes_detonated'; C='nukes_canceled_by_opp'; X='missiles_hit_opponent'
run('1',{
 'current':{},
 'K1 medic 0.5':{M:-0.5},
 'K2 medic 0.5, drop canceled-by-opp':{M:-0.5,C:1},
 'K3 K2 + nuke 1.5':{M:-0.5,C:1,N:0.5},
 'K4 medic 0.5, nuke 1.25, drop cbo':{M:-0.5,C:1,N:0.25},
 'K5 medic 0.25, nuke 1.5, drop cbo':{M:-0.75,C:1,N:0.5},
 'K6 medic 0.5, drop cbo, score>8000':{M:-0.5,C:1,'score_above_8000':1,'score_above_10000':-1},
 'K7 medic 0.5, drop cbo, acc 0.08':{M:-0.5,C:1,'acc_pct':-0.02},
})
