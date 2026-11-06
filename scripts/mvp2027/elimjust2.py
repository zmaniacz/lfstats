import io,contextlib
with contextlib.redirect_stdout(io.StringIO()):
    exec(open('elimjust.py').read())
gm=defaultdict(list)
for r in rows: gm[r['game_id']].append(r)
rating={r['player_id']:float(r['rating']) for r in rows if r['player_id'] and r['rating']}
def apply(prem,perm,posrate=False,winb=0,cur=False):
    for r in rows:
        if cur: b=r['eb']
        elif we(r): b=prem+(rate[r['position']] if posrate else perm)*r['rem']
        elif ws(r): b=winb
        else: b=0
        r['v']=r['own']+b
def report(label):
    pos=[]
    for p in '12345':
        a=np.array([r['v'] for r in rows if r['position']==p]); pos.append(np.percentile(a,[25,50,75]))
    allv=np.array([r['v'] for r in rows])
    ew=np.array([r['v'] for r in rows if we(r)]); sw=np.array([r['v'] for r in rows if ws(r)]); sl=np.array([r['v'] for r in rows if r['win']=='0' and r['outcome']=='score'])
    above20=100*(ew>20).mean()
    pct=100*(allv<np.median(ew)).mean()
    rr=[]
    for p in '12345':
        by=defaultdict(list)
        for r in rows:
            if r['position']==p and r['player_id'] in rating: by[r['player_id']].append(r['v'])
        P=[k for k,v in by.items() if len(v)>=20]; rr.append(np.corrcoef([np.mean(by[k]) for k in P],[rating[k] for k in P])[0,1])
    soc=np.median([r['v'] for r in rows if r['is_comp']=='0']); cp=np.median([r['v'] for r in rows if r['is_comp']=='1'])
    print(f"{label:40s} med C/H/S/A/M {' '.join(f'{q[1]:5.2f}' for q in pos)} | Q1 {min(q[0] for q in pos):4.1f}-{max(q[0] for q in pos):4.1f} Q3 {min(q[2] for q in pos):4.1f}-{max(q[2] for q in pos):4.1f} | elimW {np.median(ew):5.2f} (P{pct:.0f}, {above20:.0f}% >20) scoreW {np.median(sw):5.2f} scoreL {np.median(sl):5.2f} | comp-soc {cp-soc:+.2f} | r avg {np.mean(rr):.3f}")
apply(0,0,cur=True); report('current: 4 + 1/min beyond 3')
for prem in (0,1,2,3):
    apply(prem,0.75); report(f'premium {prem} + 0.75/min remaining')
for prem in (1,2):
    apply(prem,0,posrate=True); report(f'premium {prem} + position rate/min')
for prem in (1,2):
    apply(prem,0.75,winb=1); report(f'premium {prem}+1 + 0.75/min, +1 score win')
apply(2,0.5); 
for r in rows:
    if we(r): r['v']=r['own']+2+0.5*max(0,r['rem']-3)
    elif ws(r): r['v']=r['own']+1
report('earlier option: 2 + 0.5/min beyond 3, +1 score win')
