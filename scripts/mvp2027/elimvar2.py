import io,contextlib
with contextlib.redirect_stdout(io.StringIO()):
    exec(open('elimvar.py').read().split("print(f\"{'variant'")[0])
rating={}
for r in rows:
    if r['player_id'] and r['rating']: rating[r['player_id']]=float(r['rating'])
def extra(label):
    out=[]
    for p in '12345':
        by=defaultdict(list)
        for r in rows:
            if r['position']==p and r['player_id'] in rating: by[r['player_id']].append(r['v'])
        P=[k for k,v in by.items() if len(v)>=20]
        out.append(np.corrcoef([np.mean(by[k]) for k in P],[rating[k] for k in P])[0,1])
    cnt=defaultdict(int)
    for g in gm.values(): cnt[max(g,key=lambda r:r['v'])['position']]+=1
    n=len(gm); comp_g=[g for g in gm.values() if g[0]['is_comp']=='1']; cc=defaultdict(int)
    for g in comp_g: cc[max(g,key=lambda r:r['v'])['position']]+=1
    soc=[r['v'] for r in rows if r['is_comp']=='0']; cp=[r['v'] for r in rows if r['is_comp']=='1']
    print(f"{label:32s} r C/H/S/A/M {' '.join(f'{x:.3f}' for x in out)} | top all {' '.join(f'{100*cnt[p]/n:4.1f}' for p in '12345')} | top comp {' '.join(f'{100*cc[p]/len(comp_g):4.1f}' for p in '12345')} | mean soc {np.mean(soc):.2f} comp {np.mean(cp):.2f}")
for name,a in [('current: 4 + 1/min',(4,1)),('2 + 0.5/min',(2,0.5)),('2 + 0.5/min, +1 score win',(2,0.5,1)),('3 + 0.5/min',(3,0.5))]:
    variant(*a); extra(name)
