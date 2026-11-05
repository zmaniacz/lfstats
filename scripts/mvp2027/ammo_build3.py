import csv
from collections import defaultdict
MX={'1':60,'2':40,'3':60,'5':30}
A=defaultdict(lambda: defaultdict(float))
for r in csv.DictReader(open('tags_raw.csv')):
    if not r['before']: continue
    f=float(r['before'])/MX[r['tpos']]
    for t in (25,50,75): A[r['ammo']][f'need{t}']+= f<=t/100
rows=list(csv.DictReader(open('full_ammo.csv',encoding='utf-8')))
for r in rows:
    for t in (25,50,75): r[f'need{t}']=A[r['id']][f'need{t}']
    r['tags_capped30']=min(float(r['resupplies_given']),30)
    r['tags_per_min_capped']=min(float(r['resupplies_given'])/float(r['mins']),3)*float(r['mins'])
w=csv.DictWriter(open('full_ammo.csv','w',newline='',encoding='utf-8'),fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
