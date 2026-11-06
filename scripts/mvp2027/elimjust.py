import csv, numpy as np
from collections import defaultdict
D={r['game_id']:(float(r['scheduled_duration'])/60000,float(r['actual_duration'])/60000) for r in csv.DictReader(open('gdur.csv'))}
N={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp_pos.csv'))}
med={r['id']:r for r in csv.DictReader(open('full_med.csv',encoding='utf-8'))}
amm={r['id']:r for r in csv.DictReader(open('full_ammo.csv',encoding='utf-8'))}
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8'))]
F=lambda r,k: float(r.get(k) or 0)
def timepart(r):
    """Own-play MVP components that accumulate with time played."""
    p=r['position']; s=F(r,'score')
    common=F(r,'shots_hit_opponent_medic')*(0.5 if p=='1' else 1)-F(r,'times_hit_by_missile')
    if p=='1': t=max(0,s-9000)/1000+F(r,'missiles_hit_opponent')+F(r,'nukes_detonated')
    if p=='2': t=max(0,s-3500)/1000+F(r,'missiles_hit_opponent')
    if p=='3': t=0.3*F(r,'shots_hit_opponent_3hit')+0.2*F(r,'reset_opponent')
    if p=='4': t=F(amm[r['id']],'boost_recipients')+2*max(0,s-1500)/1000+0.25*F(r,'assists')
    if p=='5': t=0.75*F(med[r['id']],'boost_recipients')+2*max(0,s-1000)/1000-0.4*F(r,'times_reset')+0.25*F(r,'assists')
    return t+common
for r in rows:
    r['sch'],r['act']=D[r['game_id']]; r['rem']=max(0,r['sch']-r['act'])
    r['eb']=F(r,'c_elim_bonus'); r['own']=N[r['id']]-r['eb']; r['tp']=timepart(r)
POS={'1':'Commander','2':'Heavy','3':'Scout','4':'Ammo','5':'Medic'}
we=lambda r:r['win']=='1' and r['outcome']=='elimination'
ws=lambda r:r['win']=='1' and r['outcome']=='score'
print('A. Time-scaling MVP per minute, measured on WINNERS of full-length score games')
rate={}
for p in '12345':
    x=[r['tp']/r['act'] for r in rows if r['position']==p and ws(r)]
    rate[p]=np.mean(x); print(f'   {POS[p]:10s} {rate[p]:.2f} per minute')
allrate=np.mean([rate[p]*(2 if p=='3' else 1) for p in '12345'])/6*1  # weight scouts x2 over 6 players
print(f'   team average (per player) {allrate:.2f} per minute')
W=[r for r in rows if we(r)]
rem=np.array([r['rem'] for r in W]); lost=np.array([rate[r['position']]*r['rem'] for r in W]); eb=np.array([r['eb'] for r in W])
print('B. Elimination wins: minutes remaining P25 %.1f P50 %.1f P75 %.1f P90 %.1f'%tuple(np.percentile(rem,[25,50,75,90])))
print('   MVP lost to the shorter game (rate x minutes remaining): mean %.2f P50 %.2f P90 %.2f'%(lost.mean(),np.median(lost),np.percentile(lost,90)))
print('   current bonus paid: mean %.2f  -> premium beyond lost MVP: mean %.2f'%(eb.mean(),(eb-lost).mean()))
# C. empirical check: own-play vs minutes remaining among elim winners (regression slope)
o=np.array([r['own'] for r in W]); b=np.polyfit(rem,o,1); print('C. Empirical: elim winners own-play MVP falls %.2f per minute remaining (regression)'%(-b[0]))
# D. projected full-game own-play for elim winners vs score winners
proj=np.array([r['own']+rate[r['position']]*r['rem'] for r in W])
print('D. Projected full-length own-play, by position (elim winners projected | score winners actual)')
for p in '12345':
    pj=[r['own']+rate[p]*r['rem'] for r in W if r['position']==p]; sw=[r['own'] for r in rows if r['position']==p and ws(r)]
    print(f'   {POS[p]:10s} {np.median(pj):5.2f} | {np.median(sw):5.2f}')
pj=[r['own']+rate[r['position']]*r['rem'] for r in W]; sw=[r['own'] for r in rows if ws(r)]
print(f'   all        {np.median(pj):5.2f} | {np.median(sw):5.2f}')
import pickle; pickle.dump((rate,),open('rate.pkl','wb'))
