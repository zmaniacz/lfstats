import csv, numpy as np
from collections import defaultdict
B=defaultdict(lambda:[0,0,0,0])  # boosts, recipients, shots, big(>=4)
for r in csv.DictReader(open('boosts.csv')):
    b=B[r['ammo']]; b[0]+=1; b[1]+=int(r['recipients']); b[2]+=float(r['shots_added']); b[3]+=int(r['recipients'])>=4
D={r['team_id']:(float(r['dry_ms']),float(r['low_ms'])) for r in csv.DictReader(open('dry.csv'))}
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8'))]
out=[]
for r in rows:
    if r['position']!='4': 
        out.append(r); continue
    b=B.get(r['id'],[0,0,0,0]); d=D.get(r['team_id'],(0,0)); m=float(r['mins'])
    r.update(boost_recipients=b[1], boost_shots=b[2], big_boosts=b[3], avg_recip=(b[1]/b[0] if b[0] else ''),
             team_dry_min=d[0]/60000/5, team_low_min=d[1]/60000/5, team_dry_frac=d[0]/60000/5/m, team_low_frac=d[1]/60000/5/m,
             single_resupplies=float(r['resupplies_given'])-float(r['double_resupplies_given']))
    out.append(r)
keys=list(out[[i for i,r in enumerate(out) if r['position']=='4'][0]].keys())
w=csv.DictWriter(open('full_ammo.csv','w',newline='',encoding='utf-8'),fieldnames=keys,extrasaction='ignore'); w.writeheader()
for r in out:
    if r['position']=='4': w.writerow(r)
