import csv
from collections import defaultdict
B=defaultdict(lambda:[0,0,0])
for r in csv.DictReader(open('medboosts.csv')):
    b=B[r['medic']]; b[0]+=1; b[1]+=int(r['recipients']); b[2]+=float(r['lives_added'])
E={r['id']:r for r in csv.DictReader(open('medend.csv'))}
rows=[r for r in csv.DictReader(open('full.csv',encoding='utf-8')) if r['position']=='5']
for r in rows:
    b=B.get(r['id'],[0,0,0]); e=E[r['id']]
    r['boost_recipients']=b[1]; r['boost_lives']=b[2]
    dur=float(e['actual_duration']); et=float(e['end_time'] or dur)
    r['survival_frac']=min(1.0, et/dur) if r['elim']=='1' else 1.0
    r['surv_min']=r['survival_frac']*float(r['mins'])
w=csv.DictWriter(open('full_med.csv','w',newline='',encoding='utf-8'),fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
