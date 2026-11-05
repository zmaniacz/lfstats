from ammo_grid import *
import itertools, csv
N={r['id']:float(r['new_mvp']) for r in csv.DictReader(open('new_mvp.csv'))}
allr=list(csv.DictReader(open('full.csv',encoding='utf-8')))
# best non-ammo MVP per game
best=defaultdict(lambda:-1e9)
for r in allr:
    if r['position']!='4': best[r['game_id']]=max(best[r['game_id']],N[r['id']])
gids=np.array([r['game_id'] for r in rows]); bo=np.array([best[gg] for gg in gids])
ngames=len(set(gids))
def topshare(v):
    # an ammo tops the game if it beats every non-ammo and the other ammo
    top=0
    for a,b in zip(A,B):
        m=max(v[a],v[b])
        if m>bo[a]: top+=1
    return top/len(A)
print('current proposal A1-A3 top share %.3f'%topshare(base+0.075*accp+rec+score/1000))
res=[]
for aw,rw,sw,st,xw in itertools.product([0,0.025,0.05,0.075],[1,1.25,1.5,2],[1,1.5,2,2.5],[0,1000,2000],[0,0.1,0.2]):
    v=base+aw*accp+rw*rec+sw*np.maximum(0,score-st)/1000+xw*rs
    q=np.percentile(v,[10,25,50,75,90])
    if not (14.5<=q[2]<=15.5 and 9.5<=q[1]<=11 and 19<=q[3]<=21.5): continue
    wp,rr,_=evaluate(v); res.append((aw,rw,sw,st,xw,wp,rr,topshare(v),*q))
res=np.array(res); print('in band',len(res))
print('acc recip sbw sbthr resets  wp    r    top   P10  Q1   med  Q3   P90')
for r in res[np.argsort(-res[:,7])][:20]: print(' '.join(f'{x:5g}' if i<5 else f'{x:5.3f}' for i,x in enumerate(r)))
print('-- best wp+r with top>=0.13')
ok=res[res[:,7]>=0.13]
for r in ok[np.argsort(-(ok[:,5]+ok[:,6]))][:10]: print(' '.join(f'{x:5g}' if i<5 else f'{x:5.3f}' for i,x in enumerate(r)))
