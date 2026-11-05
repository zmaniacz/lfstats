import csv, numpy as np
exec(open('sim.py').read().split("models={")[0])
cur=model(); A=model(reset=0.1)
res=np.array([F(r,'reset_opponent') for r in rows])
print('resets per scout game: mean %.1f P10 %.0f med %.0f P90 %.0f P99 %.0f max %.0f'%(res.mean(),*np.percentile(res,[10,50,90,99]),res.max()))
def grp(name,cond):
    s=[r for r in rows if cond(r)]
    c=np.array([cur(r) for r in s]); a=np.array([A(r) for r in s])
    print(f"{name:28s} n={len(s):6d} current med {np.median(c):5.2f} IQR {np.percentile(c,25):5.2f}-{np.percentile(c,75):5.2f} | A med {np.median(a):5.2f} IQR {np.percentile(a,25):5.2f}-{np.percentile(a,75):5.2f}")
grp('all',lambda r:True)
grp('social',lambda r:r['comp']=='0'); grp('competition',lambda r:r['comp']=='1')
grp('won',lambda r:r['win']=='1'); grp('lost',lambda r:r['win']=='0')
grp('won by elimination',lambda r:r['win']=='1' and r['outcome']=='elimination')
grp('lost by elimination',lambda r:r['win']=='0' and r['outcome']=='elimination')
grp('won on score',lambda r:r['win']=='1' and r['outcome']=='score')
grp('lost on score',lambda r:r['win']=='0' and r['outcome']=='score')
# individual-only discriminative power (exclude elimination bonus and eliminated)
