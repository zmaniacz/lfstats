import csv, numpy as np
from collections import defaultdict
MX={'1':60,'2':40,'3':60,'5':30}
rows=list(csv.DictReader(open('tags_raw.csv')))
fr=np.array([float(r['before'])/MX[r['tpos']] for r in rows if r['before']])
print('target shots before tag as share of max: P10 %.2f P25 %.2f med %.2f P75 %.2f P90 %.2f'%tuple(np.percentile(fr,[10,25,50,75,90])))
for t in (0.25,0.5,0.75,0.9): print(f'  share of tags with target at or below {int(t*100)}% of max: {100*(fr<=t).mean():.1f}%')
agg=defaultdict(lambda: defaultdict(float)); last={}
for r in sorted(rows,key=lambda r:(r['ammo'],int(r['time']))):
    if not r['before']: continue
    f=float(r['before'])/MX[r['tpos']]; a=agg[r['ammo']]
    a['tags']+=1
    for t in (25,50,75): a[f'need{t}']+= f<=t/100
    key=(r['ammo'],r['tpos'])
