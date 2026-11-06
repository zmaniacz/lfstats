exec(open('elimbonus.py').read().split("POS={")[0].split("games={}")[0])
POS={'1':'Commander','2':'Heavy','3':'Scout','4':'Ammo','5':'Medic'}
from collections import defaultdict
gm=defaultdict(list)
for r in rows: gm[r['game_id']].append(r)
def variant(base,rate,winb=0):
    for r in rows:
        b=(base+rate*r['xmin']) if r['eb']>0 else 0
        if r['win']=='1' and r['outcome']=='score': b=winb
        r['v']=r['own']+b
def stats():
    med={p:np.median([r['v'] for r in rows if r['position']==p]) for p in '12345'}
    cmed={p:np.median([r['v'] for r in rows if r['position']==p and r['is_comp']=='1']) for p in '12345'}
    we=np.median([r['v'] for r in rows if r['win']=='1' and r['outcome']=='elimination'])
    ws=np.median([r['v'] for r in rows if r['win']=='1' and r['outcome']=='score'])
    ls=np.median([r['v'] for r in rows if r['win']=='0' and r['outcome']=='score'])
    soc=np.median([r['v'] for r in rows if r['is_comp']=='0']); cp=np.median([r['v'] for r in rows if r['is_comp']=='1'])
    # game top MVP from winning team
    top=np.mean([max(g,key=lambda r:r['v'])['win']=='1' for g in gm.values() if g[0]['outcome'] in ('elimination','score')])
    return med,cmed,we,ws,ls,soc,cp,top
print(f"{'variant':34s} {'medians C/H/S/A/M':30s} {'comp medians':30s} elimW scoreW scoreL | soc  comp | topMVP on winners")
for name,a in [('current: 4 + 1/min',(4,1)),('4 flat',(4,0)),('3 + 1/min',(3,1)),('3 + 0.5/min',(3,0.5)),('2 + 1/min',(2,1)),('2 + 0.5/min',(2,0.5)),('2 flat',(2,0)),('0 + 1/min',(0,1)),('none',(0,0)),('2 + 0.5/min, +1 any score win',(2,0.5,1))]:
    variant(*a); med,cmed,we,ws,ls,soc,cp,top=stats()
    print(f"{name:34s} {' '.join(f'{med[p]:5.2f}' for p in '12345'):30s} {' '.join(f'{cmed[p]:5.2f}' for p in '12345'):30s} {we:5.2f} {ws:5.2f} {ls:5.2f} | {soc:5.2f} {cp:5.2f} | {100*top:.1f}%")
