import csv
T={r['ammo']:r for r in csv.DictReader(open('tags2.csv'))}
rows=list(csv.DictReader(open('full_ammo.csv',encoding='utf-8')))
for r in rows:
    t=T.get(r['id']); n=float(t['tags']) if t else 0
    r['full_tag_frac']=float(t['full_tags'])/n if n else ''
    r['low_tags']=float(t['low_tags']) if t else 0
    r['full_tags']=float(t['full_tags']) if t else 0
w=csv.DictWriter(open('full_ammo.csv','w',newline='',encoding='utf-8'),fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
